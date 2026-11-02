import { z } from 'zod';

import { BigMath } from '~/utils/numbers';

/**
 * Vercel billing: `GET /v1/billing/charges` returns FOCUS v1.3 charges as JSON Lines, one
 * charge per service, project and day. Docs:
 * https://vercel.com/docs/rest-api/billing/list-focus-billing-charges
 */

export const VERCEL_API_BASE = 'https://api.vercel.com';
export const VERCEL_TOKENS_URL = 'https://vercel.com/account/tokens';
const REQUEST_TIMEOUT_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Amounts are summed at 6 decimal places, then rounded once to cents. */
const MICROS_PER_UNIT = 1_000_000n;
const MICROS_PER_CENT = 10_000n;
const MICRO_DIGITS = 6;

export const IMPORTED_CHARGE_CATEGORIES = ['Usage', 'Purchase'] as const;

export type BillingErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'unavailable'
  | 'bad_response'
  | 'network';

export class BillingProviderError extends Error {
  readonly code: BillingErrorCode;
  readonly status: number | null;

  constructor(code: BillingErrorCode, status: number | null) {
    super(`Billing provider request failed: ${code}${null === status ? '' : ` (${status})`}`);
    this.name = 'BillingProviderError';
    this.code = code;
    this.status = status;
  }
}

const safeJsonParse = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

const statusToCode = (status: number): BillingErrorCode => {
  if (401 === status) {
    return 'unauthorized';
  }
  if (403 === status) {
    return 'forbidden';
  }
  if (404 === status || 410 === status) {
    return 'not_found';
  }
  if (429 === status) {
    return 'rate_limited';
  }
  return 500 <= status ? 'unavailable' : 'bad_response';
};

// The schema says numbers; the docs' example shows strings. Accept both.
const costSchema = z.union([z.number().finite(), z.string().trim().min(1)]);

const focusChargeSchema = z.object({
  BilledCost: costSchema,
  BillingCurrency: z.string(),
  ChargeCategory: z.string(),
  ChargePeriodStart: z.string(),
  ServiceName: z.string().trim().min(1),
  ServiceCategory: z.string().nullish(),
});

export interface FocusCharge {
  billedCost: number | string;
  currency: string;
  chargeCategory: string;
  chargePeriodStart: Date;
  serviceName: string;
  serviceCategory: string | null;
}

/** Parses one JSONL line; returns null for blank or malformed lines. */
export const parseChargeLine = (line: string): FocusCharge | null => {
  const trimmed = line.trim();
  if ('' === trimmed) {
    return null;
  }
  const parsed = focusChargeSchema.safeParse(safeJsonParse(trimmed));
  if (!parsed.success) {
    return null;
  }
  const start = new Date(parsed.data.ChargePeriodStart);
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  return {
    billedCost: parsed.data.BilledCost,
    currency: parsed.data.BillingCurrency,
    chargeCategory: parsed.data.ChargeCategory,
    chargePeriodStart: start,
    serviceName: parsed.data.ServiceName,
    serviceCategory: parsed.data.ServiceCategory ?? null,
  };
};

const DECIMAL_PATTERN = /^([+-])?(\d*)(?:\.(\d*))?$/;

/**
 * Decimal amount -> integer millionths, without float addition. Digits past the sixth are
 * rounded half away from zero. Returns null for values that are not plain decimals.
 */
export const decimalToMicros = (value: number | string): bigint | null => {
  // Numbers are formatted once (exponent forms such as 1e-7 included); sums stay in BigInt.
  const text = 'number' === typeof value ? value.toFixed(MICRO_DIGITS + 2) : value.trim();
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) {
    const asNumber = Number(text);
    return Number.isFinite(asNumber) && '' !== text ? decimalToMicros(asNumber) : null;
  }
  const [, sign, whole = '', fraction = ''] = match;
  if ('' === whole && '' === fraction) {
    return null;
  }
  const kept = fraction.slice(0, MICRO_DIGITS).padEnd(MICRO_DIGITS, '0');
  const roundUp = '5' <= (fraction[MICRO_DIGITS] ?? '0');
  const magnitude = BigInt(whole || '0') * MICROS_PER_UNIT + BigInt(kept) + (roundUp ? 1n : 0n);
  return '-' === sign ? -magnitude : magnitude;
};

export const microsToCents = (micros: bigint) => BigMath.roundDiv(micros, MICROS_PER_CENT);

const monthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export const serviceKeyOf = (serviceName: string) =>
  serviceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'other';

/** Tech category for a charge (keys from CATEGORIES.tech). */
export const categoryForCharge = (
  serviceName: string,
  serviceCategory: string | null,
  chargeCategory: string,
): string => {
  // Unconfirmed against real data: domain purchases are assumed to mention "Domain".
  if ('Purchase' === chargeCategory && /domain/i.test(serviceName)) {
    return 'domains';
  }
  switch (serviceCategory) {
    case 'AI and Machine Learning':
      return 'aiApis';
    case 'Databases':
    case 'Storage':
      return 'databases';
    case 'Management and Governance':
    case 'Analytics':
      return 'monitoring';
    case 'Developer Tools':
      return 'devTools';
    default:
      return 'cloudHosting';
  }
};

export interface BillingImportRow {
  /** `<YYYY-MM>:<service key>`, the BillingImport idempotency key. */
  periodKey: string;
  month: string;
  serviceName: string;
  category: string;
  /** Cents (USD). */
  amount: bigint;
  currency: 'USD';
  /** Latest charge day in the group, `YYYY-MM-DD`. */
  lastChargeDay: string;
}

export interface AggregateResult {
  rows: BillingImportRow[];
  /** Lines left out: other charge categories, non-USD or malformed amounts. */
  skipped: number;
}

/**
 * Groups charges by (month, service) and sums them in micro-units. Only Usage and Purchase
 * charges are imported; Tax, Credit and Adjustment lines are left out.
 */
export const aggregateCharges = (charges: Iterable<FocusCharge>): AggregateResult => {
  const groups = new Map<string, Omit<BillingImportRow, 'amount'> & { micros: bigint }>();
  let skipped = 0;

  Array.from(charges).forEach((charge) => {
    const micros = decimalToMicros(charge.billedCost);
    const imported = (IMPORTED_CHARGE_CATEGORIES as readonly string[]).includes(
      charge.chargeCategory,
    );
    if (!imported || 'USD' !== charge.currency || null === micros) {
      skipped += 1;
      return;
    }
    const month = monthKey(charge.chargePeriodStart);
    const periodKey = `${month}:${serviceKeyOf(charge.serviceName)}`;
    const day = dayKey(charge.chargePeriodStart);
    const existing = groups.get(periodKey);
    if (existing) {
      existing.micros += micros;
      if (day > existing.lastChargeDay) {
        existing.lastChargeDay = day;
      }
      return;
    }
    groups.set(periodKey, {
      periodKey,
      month,
      serviceName: charge.serviceName,
      category: categoryForCharge(
        charge.serviceName,
        charge.serviceCategory,
        charge.chargeCategory,
      ),
      currency: 'USD',
      lastChargeDay: day,
      micros,
    });
  });

  const rows = Array.from(groups.values())
    .map(
      ({ micros, ...row }): BillingImportRow =>
        Object.assign(row, { amount: microsToCents(micros) }),
    )
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));

  return { rows, skipped };
};

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `Vercel · Function Invocations · Nov 2026`. */
export const vercelExpenseName = (row: Pick<BillingImportRow, 'serviceName' | 'month'>) =>
  `Vercel · ${row.serviceName} · ${MONTH_LABEL.format(new Date(`${row.month}-15T12:00:00Z`))}`;

const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/**
 * Sync window: first day of the previous month (Vercel revises late charges) up to today
 * 00:00 UTC (exclusive), so the current month is month-to-date through yesterday.
 */
export const syncWindow = (now: Date) => ({
  from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
  to: startOfUtcDay(now),
});

type FetchLike = typeof fetch;

const chargesUrl = ({ from, to, teamId }: { from: Date; to: Date; teamId?: string | null }) => {
  const url = new URL('/v1/billing/charges', VERCEL_API_BASE);
  url.searchParams.set('from', from.toISOString());
  url.searchParams.set('to', to.toISOString());
  if (teamId) {
    url.searchParams.set('teamId', teamId);
  }
  return url;
};

const requestCharges = async ({
  token,
  teamId,
  from,
  to,
  fetchImpl = fetch,
}: {
  token: string;
  teamId?: string | null;
  from: Date;
  to: Date;
  fetchImpl?: FetchLike;
}) => {
  const response = await fetchImpl(chargesUrl({ from, to, teamId }), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/jsonl' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => {
    throw new BillingProviderError('network', null);
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new BillingProviderError(statusToCode(response.status), response.status);
  }
  return response;
};

/** Splits a byte stream into lines without buffering the whole response. */
export async function* readLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  try {
    while (true) {
      // Stream chunks arrive in order, so reads are sequential by nature.
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      yield* lines;
    }
    buffered += decoder.decode();
    if ('' !== buffered) {
      yield buffered;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Fetches and parses every charge in [from, to). Malformed lines are skipped. */
export const fetchVercelCharges = async (params: {
  token: string;
  teamId?: string | null;
  from: Date;
  to: Date;
  fetchImpl?: FetchLike;
}): Promise<FocusCharge[]> => {
  const response = await requestCharges(params);
  if (!response.body) {
    return [];
  }
  const charges: FocusCharge[] = [];
  try {
    for await (const line of readLines(response.body)) {
      const charge = parseChargeLine(line);
      if (charge) {
        charges.push(charge);
      }
    }
  } catch {
    throw new BillingProviderError('bad_response', response.status);
  }
  return charges;
};

/**
 * Cheap token check: one day of charges. 401 means a bad token; 403 usually means a
 * project-scoped token or a role without billing access. Throws BillingProviderError.
 */
export const checkVercelToken = async ({
  token,
  teamId,
  now = new Date(),
  fetchImpl,
}: {
  token: string;
  teamId?: string | null;
  now?: Date;
  fetchImpl?: FetchLike;
}): Promise<void> => {
  const to = startOfUtcDay(now);
  const from = new Date(to.getTime() - DAY_MS);
  const response = await requestCharges({ token, teamId, from, to, fetchImpl });
  await response.body?.cancel().catch(() => undefined);
};
