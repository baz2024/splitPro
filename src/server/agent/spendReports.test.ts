import { Prisma, type PrismaClient } from '@prisma/client';

import {
  type SpendReport,
  recordSpendReport,
  serializeAgentSpend,
  spendCategory,
  spendExpenseDate,
  spendExpenseName,
  spendReportSchema,
} from './spendReports';

const USER = 1;
const KEY = 'key_1';
const NOW = new Date('2026-11-16T00:00:00Z');

const validBody = {
  service: 'anthropic',
  amount: '12.50',
  currency: 'usd',
  idempotencyKey: 'run-2026-11-16:abc',
};

const parse = (body: Record<string, unknown>) => spendReportSchema.safeParse(body);

const parsed = (body: Record<string, unknown> = validBody): SpendReport => {
  const result = parse(body);
  if (!result.success) {
    throw new Error(JSON.stringify(result.error.issues));
  }
  return result.data;
};

describe('spendReportSchema', () => {
  describe('Valid input', () => {
    it('should accept the minimal body and normalise the currency', () => {
      const result = parsed();
      expect(result.currency).toBe('USD');
      expect(result.amount).toBe('12.50');
    });

    it('should parse period dates', () => {
      const result = parsed({
        ...validBody,
        periodStart: '2026-11-01T00:00:00Z',
        periodEnd: '2026-11-15T00:00:00Z',
      });
      expect(result.periodEnd?.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    });
  });

  describe('Invalid input', () => {
    it.each([
      ['missing idempotencyKey', { ...validBody, idempotencyKey: undefined }],
      ['blank idempotencyKey', { ...validBody, idempotencyKey: '  ' }],
      ['idempotencyKey with spaces', { ...validBody, idempotencyKey: 'a b' }],
      ['numeric amount', { ...validBody, amount: 12.5 }],
      ['negative amount', { ...validBody, amount: '-1' }],
      ['zero amount', { ...validBody, amount: '0.00' }],
      ['too many decimals for JPY', { ...validBody, amount: '1.5', currency: 'JPY' }],
      ['unknown currency', { ...validBody, currency: 'XXX1' }],
      ['missing service', { ...validBody, service: '' }],
      ['bad date', { ...validBody, periodEnd: 'yesterday' }],
      [
        'period ending before it starts',
        { ...validBody, periodStart: '2026-11-10T00:00:00Z', periodEnd: '2026-11-01T00:00:00Z' },
      ],
    ])('should reject %s', (_label, body) => {
      expect(parse(body).success).toBe(false);
    });
  });
});

describe('expense mapping', () => {
  it('should name the expense after the catalog service and model', () => {
    expect(spendExpenseName({ service: 'anthropic' }, 'claude-sonnet')).toBe(
      'Anthropic · claude-sonnet',
    );
    expect(spendExpenseName({ service: 'my-llm' }, null)).toBe('my-llm');
    expect(spendExpenseName({ service: 'anthropic', description: 'Nightly run' }, 'x')).toBe(
      'Nightly run',
    );
  });

  it('should take the category from the catalog, defaulting to AI APIs', () => {
    expect(spendCategory('vercel')).toBe('cloudHosting');
    expect(spendCategory('unknown-thing')).toBe('aiApis');
  });

  it('should date the expense at the period end but never in the future', () => {
    const past = new Date('2026-11-10T00:00:00Z');
    const future = new Date('2026-12-10T00:00:00Z');
    expect(spendExpenseDate({ periodEnd: past }, NOW)).toBe(past);
    expect(spendExpenseDate({ periodEnd: future }, NOW)).toBe(NOW);
    expect(spendExpenseDate({}, NOW)).toBe(NOW);
  });
});

describe('recordSpendReport', () => {
  const keyRow = {
    id: KEY,
    userId: USER,
    name: 'growth-key',
    agentLabel: 'Growth agent',
    model: 'claude-sonnet',
    monthlyCapAmount: 30000n,
    capCurrency: 'USD',
    groupId: 7,
    group: { id: 7, name: 'Safi' },
  };

  const makeDb = ({
    existing = null,
    membership = { groupId: 7 },
    monthSpend = 0n,
    createError = null,
    keyOverrides = {},
  }: {
    existing?: { id: string; currency: string } | null;
    membership?: { groupId: number } | null;
    monthSpend?: bigint;
    createError?: unknown;
    keyOverrides?: Record<string, unknown>;
  } = {}) => {
    const db = {
      apiKey: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...keyRow, ...keyOverrides }),
      },
      groupUser: { findFirst: jest.fn().mockResolvedValue(membership) },
      expense: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: createError
          ? jest.fn().mockRejectedValue(createError)
          : jest.fn().mockResolvedValue({ id: 'exp_new' }),
        groupBy: jest
          .fn()
          .mockResolvedValue([
            { reportedByApiKeyId: KEY, currency: 'USD', _sum: { amount: monthSpend } },
          ]),
      },
    };
    return { db, client: db as unknown as PrismaClient };
  };

  it('should create a one-off project expense paid and owned by the key owner', async () => {
    const { db, client } = makeDb({ monthSpend: 1250n });
    const result = await recordSpendReport(client, { userId: USER, apiKeyId: KEY }, parsed(), NOW);

    expect(result.duplicate).toBe(false);
    expect(result.expenseId).toBe('exp_new');
    expect(db.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Anthropic · claude-sonnet',
        category: 'aiApis',
        amount: 1250n,
        currency: 'USD',
        groupId: 7,
        paidBy: USER,
        addedBy: USER,
        expenseDate: NOW,
        reportedByApiKeyId: KEY,
        agentIdempotencyKey: 'run-2026-11-16:abc',
        expenseParticipants: { create: [{ userId: USER, amount: 0n }] },
      }),
      select: { id: true },
    });
    expect(serializeAgentSpend(result.status)).toMatchObject({
      currency: 'USD',
      monthToDate: '12.50',
      cap: '300.00',
      capRemaining: '287.50',
      overCap: false,
      shouldPause: false,
    });
  });

  it('should fall back to a personal expense when the owner left the project', async () => {
    const { db, client } = makeDb({ membership: null });
    await recordSpendReport(client, { userId: USER, apiKeyId: KEY }, parsed(), NOW);
    expect(db.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ groupId: null }) }),
    );
  });

  it('should return the first expense for a repeated idempotency key', async () => {
    const { db, client } = makeDb({
      existing: { id: 'exp_first', currency: 'USD' },
      monthSpend: 30000n,
    });
    const result = await recordSpendReport(client, { userId: USER, apiKeyId: KEY }, parsed(), NOW);

    expect(result).toMatchObject({ expenseId: 'exp_first', duplicate: true });
    expect(db.expense.create).not.toHaveBeenCalled();
    expect(db.expense.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          reportedByApiKeyId_agentIdempotencyKey: {
            reportedByApiKeyId: KEY,
            agentIdempotencyKey: 'run-2026-11-16:abc',
          },
        },
      }),
    );
    expect(result.status.shouldPause).toBe(true);
  });

  it('should resolve a concurrent duplicate after a unique violation', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { db, client } = makeDb({ createError: conflict });
    db.expense.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'exp_winner', currency: 'USD' });

    const result = await recordSpendReport(client, { userId: USER, apiKeyId: KEY }, parsed(), NOW);
    expect(result).toMatchObject({ expenseId: 'exp_winner', duplicate: true });
  });

  describe('allow-list', () => {
    it('should record a report inside the allow-list without pausing', async () => {
      const { db, client } = makeDb({
        monthSpend: 1250n,
        keyOverrides: { allowList: ['anthropic'] },
      });
      const result = await recordSpendReport(
        client,
        { userId: USER, apiKeyId: KEY },
        parsed(),
        NOW,
      );
      expect(db.expense.create).toHaveBeenCalled();
      expect(result.allowListReason).toBeNull();
      expect(serializeAgentSpend(result.status)).toMatchObject({
        shouldPause: false,
        pauseReason: null,
        allowList: ['anthropic'],
      });
    });

    it('should record a report outside the allow-list but tell the agent to pause', async () => {
      const { db, client } = makeDb({ monthSpend: 1250n, keyOverrides: { allowList: ['openai'] } });
      const result = await recordSpendReport(
        client,
        { userId: USER, apiKeyId: KEY },
        parsed(),
        NOW,
      );
      expect(db.expense.create).toHaveBeenCalled();
      expect(result.allowListReason).toContain('anthropic / claude-sonnet');
      expect(serializeAgentSpend(result.status)).toMatchObject({
        shouldPause: true,
        pauseReason: 'not_allowed',
        overCap: false,
      });
    });

    it('should keep cap_reached as the reason when both apply', async () => {
      const { client } = makeDb({ monthSpend: 30500n, keyOverrides: { allowList: ['openai'] } });
      const result = await recordSpendReport(
        client,
        { userId: USER, apiKeyId: KEY },
        parsed(),
        NOW,
      );
      expect(result.status.pauseReason).toBe('cap_reached');
      expect(result.allowListReason).not.toBeNull();
    });
  });

  it('should report a paused key as paused with shouldPause', async () => {
    const pausedAt = new Date('2026-11-15T00:00:00Z');
    const { client } = makeDb({ monthSpend: 100n, keyOverrides: { pausedAt } });
    const result = await recordSpendReport(client, { userId: USER, apiKeyId: KEY }, parsed(), NOW);
    expect(serializeAgentSpend(result.status)).toMatchObject({
      paused: true,
      shouldPause: true,
      pauseReason: 'paused',
      overCap: false,
    });
    expect(serializeAgentSpend(result.status).message).toContain('paused');
  });

  it('should tell the agent to pause at or over its cap', async () => {
    const { client } = makeDb({ monthSpend: 30500n });
    const result = await recordSpendReport(client, { userId: USER, apiKeyId: KEY }, parsed(), NOW);
    expect(serializeAgentSpend(result.status)).toMatchObject({
      monthToDate: '305.00',
      capRemaining: '0.00',
      overCap: true,
      shouldPause: true,
    });
  });
});
