import { randomBytes } from 'node:crypto';

import { type PrismaClient } from '@prisma/client';

import {
  TokenCryptoError,
  decryptToken,
  encryptToken,
  parseEncryptionKey,
  tokenAad,
  tokenLast4,
} from './crypto';
import {
  BillingProviderError,
  aggregateCharges,
  checkVercelToken,
  decimalToMicros,
  fetchVercelCharges,
  parseChargeLine,
  syncWindow,
  vercelExpenseName,
} from './providers/vercel';
import { applyImports, syncBillingConnection } from './sync';

const KEY = randomBytes(32);

// Shaped like the documented FOCUS v1.3 JSONL response of GET /v1/billing/charges.
const charge = (overrides: Record<string, unknown>) =>
  JSON.stringify({
    BilledCost: 0,
    EffectiveCost: 0,
    BillingCurrency: 'USD',
    ChargeCategory: 'Usage',
    ChargePeriodStart: '2026-11-01T00:00:00.000Z',
    ChargePeriodEnd: '2026-11-02T00:00:00.000Z',
    ConsumedQuantity: 1,
    ConsumedUnit: 'Invocations',
    PricingCategory: 'Standard',
    PricingCurrency: 'USD',
    PricingQuantity: 1,
    PricingUnit: 'Invocations',
    ServiceName: 'Function Invocations',
    ServiceProviderName: 'Vercel',
    ServiceCategory: 'Compute',
    SkuId: 'sku_fn',
    Tags: { ProjectId: 'prj_1', ProjectName: 'safi' },
    ...overrides,
  });

const FIXTURE = [
  charge({ BilledCost: '0.1234565' }),
  charge({ BilledCost: 0.25, ChargePeriodStart: '2026-11-02T00:00:00.000Z' }),
  charge({ BilledCost: '1.10', Tags: { ProjectId: 'prj_2', ProjectName: 'site' } }),
  charge({
    BilledCost: '4.5',
    ServiceName: 'AI Gateway',
    ServiceCategory: 'AI and Machine Learning',
  }),
  charge({ BilledCost: '20', ChargeCategory: 'Purchase', ServiceName: 'Pro Plan' }),
  charge({ BilledCost: '12', ChargeCategory: 'Purchase', ServiceName: 'Domain Registration' }),
  charge({ BilledCost: '3', ChargeCategory: 'Tax' }),
  charge({ BilledCost: '-5', ChargeCategory: 'Credit' }),
  charge({ BilledCost: '2.005', ChargePeriodStart: '2026-10-31T00:00:00.000Z' }),
  '',
  'not json',
].join('\n');

describe('billing crypto', () => {
  it('should round-trip a token', () => {
    const aad = tokenAad('VERCEL', 'conn_1');
    const sealed = encryptToken('vcp_secret_token_1234', KEY, aad);
    expect(sealed).not.toContain('vcp_secret');
    expect(sealed.startsWith('v1:')).toBe(true);
    expect(decryptToken(sealed, KEY, aad)).toBe('vcp_secret_token_1234');
  });

  it('should use a fresh IV per encryption', () => {
    const aad = tokenAad('VERCEL', 'conn_1');
    expect(encryptToken('same', KEY, aad)).not.toBe(encryptToken('same', KEY, aad));
  });

  it('should reject a ciphertext moved to another row', () => {
    const sealed = encryptToken('vcp_x', KEY, tokenAad('VERCEL', 'conn_1'));
    expect(() => decryptToken(sealed, KEY, tokenAad('VERCEL', 'conn_2'))).toThrow(TokenCryptoError);
  });

  it('should reject a wrong key or tampered data', () => {
    const aad = tokenAad('VERCEL', 'conn_1');
    const sealed = encryptToken('vcp_x', KEY, aad);
    expect(() => decryptToken(sealed, randomBytes(32), aad)).toThrow(TokenCryptoError);
    const parts = sealed.split(':');
    const tampered = [...parts.slice(0, 3), Buffer.from('other').toString('base64')].join(':');
    expect(() => decryptToken(tampered, KEY, aad)).toThrow(TokenCryptoError);
    expect(() => decryptToken('garbage', KEY, aad)).toThrow(TokenCryptoError);
  });

  it('should only accept 32-byte base64 keys', () => {
    expect(parseEncryptionKey(undefined)).toBeNull();
    expect(parseEncryptionKey('')).toBeNull();
    expect(parseEncryptionKey(randomBytes(16).toString('base64'))).toBeNull();
    expect(parseEncryptionKey('not base64 !!')).toBeNull();
    expect(parseEncryptionKey(KEY.toString('base64'))?.equals(KEY)).toBe(true);
  });

  it('should keep only the last four characters for display', () => {
    expect(tokenLast4('vcp_abcdef1234')).toBe('1234');
  });
});

describe('vercel provider', () => {
  describe('decimalToMicros', () => {
    it('should parse strings and numbers without float sums', () => {
      expect(decimalToMicros('123')).toBe(123_000_000n);
      expect(decimalToMicros('0.1234565')).toBe(123_457n);
      expect(decimalToMicros(0.25)).toBe(250_000n);
      expect(decimalToMicros(1e-7)).toBe(0n);
      expect(decimalToMicros('-1.5')).toBe(-1_500_000n);
      expect(decimalToMicros('1e2')).toBe(100_000_000n);
      expect(decimalToMicros('abc')).toBeNull();
      expect(decimalToMicros('.')).toBeNull();
    });
  });

  it('should skip malformed lines', () => {
    expect(parseChargeLine('')).toBeNull();
    expect(parseChargeLine('{')).toBeNull();
    expect(parseChargeLine(JSON.stringify({ BilledCost: 1 }))).toBeNull();
    expect(parseChargeLine(charge({ BilledCost: '1' }))?.serviceName).toBe('Function Invocations');
  });

  it('should map the documented response to one import row per month and service', () => {
    const charges = FIXTURE.split('\n').flatMap((line) => parseChargeLine(line) ?? []);
    const { rows, skipped } = aggregateCharges(charges);

    expect(skipped).toBe(2); // Tax and Credit
    expect(rows).toEqual([
      {
        periodKey: '2026-10:function-invocations',
        month: '2026-10',
        serviceName: 'Function Invocations',
        category: 'cloudHosting',
        amount: 200n, // 200.5 cents: BigMath.roundDiv rounds half to even
        currency: 'USD',
        lastChargeDay: '2026-10-31',
      },
      {
        periodKey: '2026-11:ai-gateway',
        month: '2026-11',
        serviceName: 'AI Gateway',
        category: 'aiApis',
        amount: 450n,
        currency: 'USD',
        lastChargeDay: '2026-11-01',
      },
      {
        periodKey: '2026-11:domain-registration',
        month: '2026-11',
        serviceName: 'Domain Registration',
        category: 'domains',
        amount: 1200n,
        currency: 'USD',
        lastChargeDay: '2026-11-01',
      },
      {
        periodKey: '2026-11:function-invocations',
        month: '2026-11',
        serviceName: 'Function Invocations',
        category: 'cloudHosting',
        // 0.123457 + 0.25 + 1.10 = 1.473457 -> 147 cents
        amount: 147n,
        currency: 'USD',
        lastChargeDay: '2026-11-02',
      },
      {
        periodKey: '2026-11:pro-plan',
        month: '2026-11',
        serviceName: 'Pro Plan',
        category: 'cloudHosting',
        amount: 2000n,
        currency: 'USD',
        lastChargeDay: '2026-11-01',
      },
    ]);
  });

  it('should name expenses with service and month', () => {
    expect(vercelExpenseName({ serviceName: 'Function Invocations', month: '2026-11' })).toBe(
      'Vercel · Function Invocations · Nov 2026',
    );
  });

  it('should re-read the previous month up to today', () => {
    const { from, to } = syncWindow(new Date('2026-11-15T09:30:00Z'));
    expect(from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(syncWindow(new Date('2026-01-03T00:00:00Z')).from.toISOString()).toBe(
      '2025-12-01T00:00:00.000Z',
    );
  });

  it('should stream JSONL split across chunks', async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(FIXTURE);
    const fetchImpl = jest.fn(async (url: URL) => {
      expect(url.href).toContain('/v1/billing/charges?from=');
      return new Response(
        new ReadableStream({
          start: (controller) => {
            controller.enqueue(bytes.slice(0, 37));
            controller.enqueue(bytes.slice(37, 400));
            controller.enqueue(bytes.slice(400));
            controller.close();
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/jsonl' } },
      );
    }) as unknown as typeof fetch;

    const charges = await fetchVercelCharges({
      token: 'vcp_x',
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-11-03T00:00:00Z'),
      fetchImpl,
    });
    expect(charges).toHaveLength(9);
  });

  it('should map 401 and 403 to specific errors', async () => {
    const respond = (status: number) =>
      (async () => new Response('{}', { status })) as unknown as typeof fetch;
    await expect(checkVercelToken({ token: 'bad', fetchImpl: respond(401) })).rejects.toEqual(
      new BillingProviderError('unauthorized', 401),
    );
    await expect(checkVercelToken({ token: 'proj', fetchImpl: respond(403) })).rejects.toEqual(
      new BillingProviderError('forbidden', 403),
    );
    await expect(checkVercelToken({ token: 'ok', fetchImpl: respond(200) })).resolves.toBe(
      undefined,
    );
  });
});

interface FakeImport {
  id: string;
  connectionId: string;
  periodKey: string;
  expenseId: string | null;
  amount: bigint;
  currency: string;
}

interface FakeExpense {
  id: string;
  amount: bigint;
  name: string;
  groupId: number | null;
  deletedAt: Date | null;
}

/** In-memory stand-in for the Prisma calls applyImports and syncBillingConnection make. */
const createFakeDb = () => {
  const imports: FakeImport[] = [];
  const expenses: FakeExpense[] = [];
  const connectionUpdates: Record<string, unknown>[] = [];
  let seq = 0;

  const client = {
    billingImport: {
      findMany: async ({
        where,
      }: {
        where: { connectionId: string; periodKey: { in: string[] } };
      }) =>
        imports.filter(
          (item) =>
            item.connectionId === where.connectionId && where.periodKey.in.includes(item.periodKey),
        ),
      update: async ({ where, data }: { where: { id: string }; data: { amount: bigint } }) => {
        const item = imports.find((i) => i.id === where.id)!;
        item.amount = data.amount;
        return item;
      },
      create: async ({ data }: { data: Omit<FakeImport, 'id'> }) => {
        if (
          imports.some(
            (i) => i.connectionId === data.connectionId && i.periodKey === data.periodKey,
          )
        ) {
          throw new Error('unique');
        }
        const item = { id: `imp_${++seq}`, ...data };
        imports.push(item);
        return item;
      },
    },
    expense: {
      create: async ({
        data,
      }: {
        data: { name: string; amount: bigint; groupId: number | null };
      }) => {
        const expense = { id: `exp_${++seq}`, ...data, deletedAt: null };
        expenses.push(expense);
        return { id: expense.id };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; deletedAt: null };
        data: { amount: bigint };
      }) => {
        const matched = expenses.filter((e) => e.id === where.id && null === e.deletedAt);
        matched.forEach((e) => {
          e.amount = data.amount;
        });
        return { count: matched.length };
      },
    },
    groupUser: {
      findFirst: async () => null,
    },
    billingConnection: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        connectionUpdates.push(data);
        return data;
      },
    },
    $transaction: async (arg: unknown) => {
      if ('function' === typeof arg) {
        return (arg as (tx: unknown) => Promise<unknown>)(client);
      }
      return Promise.all(arg as Promise<unknown>[]);
    },
  };

  return { db: client as unknown as PrismaClient, imports, expenses, connectionUpdates };
};

const ROWS = aggregateCharges(
  FIXTURE.split('\n').flatMap((line) => parseChargeLine(line) ?? []),
).rows;

describe('applyImports', () => {
  const connection = { id: 'conn_1', userId: 7 };

  it('should create one expense per row and do nothing on a re-run', async () => {
    const { db, imports, expenses } = createFakeDb();

    const first = await applyImports(db, { connection, rows: ROWS, groupId: null });
    expect(first).toEqual({ created: 5, updated: 0, unchanged: 0 });
    expect(expenses.map((e) => e.name)).toContain('Vercel · Function Invocations · Nov 2026');
    expect(imports).toHaveLength(5);

    const second = await applyImports(db, { connection, rows: ROWS, groupId: null });
    expect(second).toEqual({ created: 0, updated: 0, unchanged: 5 });
    expect(expenses).toHaveLength(5);
  });

  it('should update the amount in place as the month progresses', async () => {
    const { db, expenses, imports } = createFakeDb();
    await applyImports(db, { connection, rows: ROWS, groupId: 3 });

    const grown = ROWS.map((row) =>
      '2026-11:function-invocations' === row.periodKey ? { ...row, amount: 999n } : row,
    );
    const result = await applyImports(db, { connection, rows: grown, groupId: 3 });

    expect(result).toEqual({ created: 0, updated: 1, unchanged: 4 });
    expect(expenses).toHaveLength(5);
    const fn = imports.find((i) => '2026-11:function-invocations' === i.periodKey)!;
    expect(fn.amount).toBe(999n);
    expect(expenses.find((e) => e.id === fn.expenseId)?.amount).toBe(999n);
  });

  it('should not bring back an expense the user deleted', async () => {
    const { db, expenses } = createFakeDb();
    await applyImports(db, { connection, rows: ROWS, groupId: null });
    expenses.forEach((e) => {
      e.deletedAt = new Date();
    });

    const grown = ROWS.map((row) => ({ ...row, amount: row.amount + 1n }));
    const result = await applyImports(db, { connection, rows: grown, groupId: null });

    expect(result.updated).toBe(5);
    expect(expenses).toHaveLength(5);
    expect(expenses.every((e) => null !== e.deletedAt)).toBe(true);
  });
});

describe('syncBillingConnection', () => {
  const baseConnection = {
    id: 'conn_1',
    userId: 7,
    provider: 'VERCEL' as const,
    groupId: null,
    externalAccountId: null,
    status: 'active',
  };

  it('should import charges end to end and be idempotent', async () => {
    const { db, expenses, connectionUpdates } = createFakeDb();
    const connection = {
      ...baseConnection,
      encryptedToken: encryptToken('vcp_good', KEY, tokenAad('VERCEL', 'conn_1')),
    };
    const fetchImpl = jest.fn(async (_url: URL, init: RequestInit) => {
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer vcp_good');
      return new Response(FIXTURE, { status: 200 });
    }) as unknown as typeof fetch;
    const now = new Date('2026-11-03T06:30:00Z');

    const first = await syncBillingConnection(db, connection, { key: KEY, now, fetchImpl });
    const second = await syncBillingConnection(db, connection, { key: KEY, now, fetchImpl });

    expect(first).toEqual({ ok: true, skippedLines: 2, created: 5, updated: 0, unchanged: 0 });
    expect(second).toEqual({ ok: true, skippedLines: 2, created: 0, updated: 0, unchanged: 5 });
    expect(expenses).toHaveLength(5);
    expect(connectionUpdates.at(-1)).toEqual({
      status: 'active',
      lastSyncedAt: now,
      lastError: null,
    });
  });

  it('should mark the connection as error and notify once on 401', async () => {
    const { db, connectionUpdates } = createFakeDb();
    const connection = {
      ...baseConnection,
      encryptedToken: encryptToken('vcp_revoked', KEY, tokenAad('VERCEL', 'conn_1')),
    };
    const onBlocked = jest.fn(async () => undefined);
    const fetchImpl = (async () => new Response('', { status: 401 })) as unknown as typeof fetch;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await syncBillingConnection(db, connection, { key: KEY, fetchImpl, onBlocked });

    expect(result).toEqual({ ok: false, error: 'unauthorized' });
    expect(connectionUpdates.at(-1)).toEqual({ lastError: 'unauthorized', status: 'error' });
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('vcp_revoked');
    errorSpy.mockRestore();
  });

  it('should report an unreadable token without calling Vercel', async () => {
    const { db } = createFakeDb();
    const connection = {
      ...baseConnection,
      encryptedToken: encryptToken('vcp_x', KEY, tokenAad('VERCEL', 'other_row')),
    };
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await syncBillingConnection(db, connection, { key: KEY, fetchImpl });

    expect(result).toEqual({ ok: false, error: 'token_unreadable' });
    expect(fetchImpl).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
