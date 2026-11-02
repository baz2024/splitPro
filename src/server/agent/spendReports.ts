import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { checkAllowList } from '~/lib/agentControls';
import { isCurrencyCode } from '~/lib/currency';
import { findService } from '~/lib/serviceCatalog';

import {
  AGENT_KEY_SELECT,
  type AgentKeyRow,
  type AgentSpend,
  type PauseReason,
  buildAgentSpend,
  loadKeyMonthSpend,
} from './caps';
import { formatMinorUnits, parseAmountToMinorUnits } from './validation';

export const DEFAULT_SPEND_CATEGORY = 'aiApis';
export const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
export const MAX_EXPENSE_NAME_LENGTH = 200;

const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9._:-]+$/;
const DECIMAL_AMOUNT_REGEX = /^\d{1,12}(\.\d{1,6})?$/;

const isoDate = z
  .string()
  .trim()
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'must be an ISO 8601 date' })
  .transform((value) => new Date(value));

export const spendReportSchema = z
  .object({
    service: z.string().trim().min(1).max(100),
    amount: z.string().regex(DECIMAL_AMOUNT_REGEX, 'amount must be a decimal string like "12.50"'),
    currency: z
      .string()
      .transform((value) => value.trim().toUpperCase())
      .refine((value) => isCurrencyCode(value), { message: 'currency must be an ISO 4217 code' }),
    model: z.string().trim().min(1).max(100).optional(),
    periodStart: isoDate.optional(),
    periodEnd: isoDate.optional(),
    description: z.string().trim().min(1).max(MAX_EXPENSE_NAME_LENGTH).optional(),
    idempotencyKey: z
      .string()
      .trim()
      .min(1)
      .max(MAX_IDEMPOTENCY_KEY_LENGTH)
      .regex(IDEMPOTENCY_KEY_REGEX, 'idempotencyKey may only use letters, digits and . _ : -'),
  })
  .superRefine((value, ctx) => {
    const minor = parseAmountToMinorUnits(value.amount, value.currency);
    if (null === minor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: 'amount has more decimal places than the currency allows',
      });
    } else if (0n >= minor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: 'amount must be greater than zero',
      });
    }
    if (value.periodStart && value.periodEnd && value.periodStart > value.periodEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodEnd'],
        message: 'periodEnd must not be before periodStart',
      });
    }
  });

export type SpendReport = z.infer<typeof spendReportSchema>;

/** The expense date: the end of the reported period (never in the future), else now. */
export const spendExpenseDate = (report: Pick<SpendReport, 'periodEnd'>, now: Date): Date =>
  report.periodEnd && report.periodEnd < now ? report.periodEnd : now;

export const spendExpenseName = (
  report: Pick<SpendReport, 'service' | 'description'>,
  model: string | null,
): string => {
  if (report.description) {
    return report.description;
  }
  const serviceName = findService(report.service)?.name ?? report.service;
  return (model ? `${serviceName} · ${model}` : serviceName).slice(0, MAX_EXPENSE_NAME_LENGTH);
};

export const spendCategory = (service: string): string =>
  findService(service)?.category ?? DEFAULT_SPEND_CATEGORY;

const periodNote = (report: Pick<SpendReport, 'periodStart' | 'periodEnd'>): string | null => {
  if (!report.periodStart && !report.periodEnd) {
    return null;
  }
  const from = report.periodStart?.toISOString() ?? '…';
  const to = report.periodEnd?.toISOString() ?? '…';
  return `Agent-reported usage period: ${from} – ${to}`;
};

export interface SpendStatusResponse {
  apiKeyId: string;
  label: string;
  model: string | null;
  project: { id: number; name: string } | null;
  currency: string | null;
  monthToDate: string;
  cap: string | null;
  capRemaining: string | null;
  percent: number;
  overCap: boolean;
  shouldPause: boolean;
  projectedToHitCap: boolean;
  otherCurrencies: string[];
  /** The owner paused this agent in Safi. */
  paused: boolean;
  /** Why shouldPause is true: "paused", "cap_reached" or "not_allowed"; null otherwise. */
  pauseReason: PauseReason | null;
  /** Providers or models this agent may report for; empty means anything. */
  allowList: string[];
  /** Human-readable explanation when shouldPause is true. */
  message: string | null;
}

const pauseMessage = (spend: AgentSpend): string | null => {
  if ('paused' === spend.pauseReason) {
    return 'This agent was paused in Safi. Stop spending until the owner resumes it.';
  }
  if ('cap_reached' === spend.pauseReason) {
    return 'This agent has reached its monthly cap. Stop spending until next month or a higher cap.';
  }
  return null;
};

/** JSON-safe view of a key's spend: amounts as decimal strings in `currency`. */
export const serializeAgentSpend = (spend: AgentSpend): SpendStatusResponse => {
  const currency = spend.currency ?? 'USD';
  const format = (amount: bigint | null) =>
    null === amount ? null : formatMinorUnits(amount, currency);
  return {
    apiKeyId: spend.apiKeyId,
    label: spend.label,
    model: spend.model,
    project: spend.project,
    currency: spend.currency,
    monthToDate: formatMinorUnits(spend.monthToDate, currency),
    cap: format(spend.cap),
    capRemaining: format(spend.capRemaining),
    percent: spend.percent,
    overCap: spend.overCap,
    shouldPause: spend.shouldPause,
    projectedToHitCap: spend.projectedToHitCap,
    otherCurrencies: spend.otherCurrencies,
    paused: spend.paused,
    pauseReason: spend.pauseReason,
    allowList: spend.allowList,
    message: pauseMessage(spend),
  };
};

/**
 * A report for a provider/model outside the key's allow-list is still recorded (the money is
 * spent), but the agent is told to pause with the reason. Paused / over-cap reasons win.
 */
export const applyAllowList = (
  status: AgentSpend,
  report: Pick<SpendReport, 'service' | 'model'>,
  keyModel: string | null,
): { status: AgentSpend; allowListReason: string | null } => {
  const check = checkAllowList(status.allowList, {
    service: report.service,
    model: report.model ?? keyModel,
  });
  if (check.allowed) {
    return { status, allowListReason: null };
  }
  return {
    status: {
      ...status,
      shouldPause: true,
      pauseReason: status.pauseReason ?? 'not_allowed',
    },
    allowListReason: check.reason,
  };
};

const loadKey = async (db: PrismaClient, apiKeyId: string) =>
  db.apiKey.findUniqueOrThrow({
    where: { id: apiKeyId },
    select: { ...AGENT_KEY_SELECT, userId: true, groupId: true },
  });

/** Month-to-date spend + cap for one key (GET /api/agent/v1/usage). */
export const loadKeySpendStatus = async (
  db: PrismaClient,
  apiKeyId: string,
  { now = new Date(), currency = null }: { now?: Date; currency?: string | null } = {},
): Promise<AgentSpend> => {
  const key: AgentKeyRow = await loadKey(db, apiKeyId);
  const spend = await loadKeyMonthSpend(db, [apiKeyId], now);
  return buildAgentSpend(key, spend.get(apiKeyId), now, currency);
};

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && 'P2002' === error.code;

const findExisting = async (db: PrismaClient, apiKeyId: string, idempotencyKey: string) =>
  db.expense.findUnique({
    where: {
      reportedByApiKeyId_agentIdempotencyKey: {
        reportedByApiKeyId: apiKeyId,
        agentIdempotencyKey: idempotencyKey,
      },
    },
    select: { id: true, currency: true },
  });

/**
 * Records an agent's own spend as a one-off expense paid by (and owned only by) the key owner,
 * in the key's project when the owner still belongs to it, else as a personal expense.
 * Idempotent on (apiKeyId, idempotencyKey): a repeat returns the first expense.
 */
export const recordSpendReport = async (
  db: PrismaClient,
  { userId, apiKeyId }: { userId: number; apiKeyId: string },
  report: SpendReport,
  now = new Date(),
): Promise<{
  expenseId: string;
  duplicate: boolean;
  status: AgentSpend;
  allowListReason: string | null;
}> => {
  const key = await loadKey(db, apiKeyId);
  const withAllowList = (status: AgentSpend) => applyAllowList(status, report, key.model);

  const existing = await findExisting(db, apiKeyId, report.idempotencyKey);
  if (existing) {
    return {
      expenseId: existing.id,
      duplicate: true,
      ...withAllowList(
        await loadKeySpendStatus(db, apiKeyId, { now, currency: existing.currency }),
      ),
    };
  }

  const membership = key.groupId
    ? await db.groupUser.findFirst({
        where: { groupId: key.groupId, userId },
        select: { groupId: true },
      })
    : null;
  const groupId = membership?.groupId ?? null;
  const amount = parseAmountToMinorUnits(report.amount, report.currency);
  if (null === amount) {
    throw new Error('Invalid amount');
  }
  const model = report.model ?? key.model;
  const note = periodNote(report);

  try {
    const expense = await db.expense.create({
      data: {
        name: spendExpenseName(report, model),
        category: spendCategory(report.service),
        amount,
        currency: report.currency,
        splitType: 'EQUAL',
        groupId,
        paidBy: userId,
        addedBy: userId,
        expenseDate: spendExpenseDate(report, now),
        reportedByApiKeyId: apiKeyId,
        agentIdempotencyKey: report.idempotencyKey,
        // The owner is the only participant: payer net = amount - full share = 0.
        expenseParticipants: { create: [{ userId, amount: 0n }] },
        ...(note ? { expenseNotes: { create: [{ note, createdById: userId }] } } : {}),
      },
      select: { id: true },
    });

    return {
      expenseId: expense.id,
      duplicate: false,
      ...withAllowList(await loadKeySpendStatus(db, apiKeyId, { now, currency: report.currency })),
    };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    // A concurrent request with the same idempotency key won the race.
    const winner = await findExisting(db, apiKeyId, report.idempotencyKey);
    if (!winner) {
      throw error;
    }
    return {
      expenseId: winner.id,
      duplicate: true,
      ...withAllowList(await loadKeySpendStatus(db, apiKeyId, { now, currency: winner.currency })),
    };
  }
};
