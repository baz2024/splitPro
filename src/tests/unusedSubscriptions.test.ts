import { type PrismaClient } from '@prisma/client';

import { heartbeatSchema, recordHeartbeat } from '~/server/agent/heartbeat';
import {
  UNUSED_AFTER_DAYS,
  type UsageSignals,
  getUsageStatus,
  lastExpenseByServiceKey,
  lastSeenByServiceKey,
} from '~/server/subscriptions/unused';

const NOW = new Date('2026-11-01T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const signals = (overrides: Partial<UsageSignals> = {}): UsageSignals => ({
  startedAt: daysAgo(90),
  lastConfirmedUsedAt: null,
  lastSeenInRepoAt: null,
  lastUsageExpenseAt: null,
  ...overrides,
});

describe('getUsageStatus', () => {
  describe('unused rule', () => {
    it('should flag a subscription older than 30 days with no usage signal', () => {
      expect(getUsageStatus(signals(), NOW)).toEqual({
        unused: true,
        lastUsedAt: null,
        lastUsedSignal: null,
      });
    });

    it('should never flag a subscription that started less than 30 days ago', () => {
      expect(getUsageStatus(signals({ startedAt: daysAgo(29) }), NOW).unused).toBe(false);
    });

    it('should not flag when the start date is unknown', () => {
      expect(getUsageStatus(signals({ startedAt: null }), NOW).unused).toBe(false);
    });

    it('should flag a subscription that started exactly 30 days ago', () => {
      expect(UNUSED_AFTER_DAYS).toBe(30);
      expect(getUsageStatus(signals({ startedAt: daysAgo(30) }), NOW).unused).toBe(true);
    });

    it('should flag when every signal is older than 30 days', () => {
      const status = getUsageStatus(
        signals({
          lastConfirmedUsedAt: daysAgo(45),
          lastSeenInRepoAt: daysAgo(31),
          lastUsageExpenseAt: daysAgo(60),
        }),
        NOW,
      );
      expect(status).toEqual({
        unused: true,
        lastUsedAt: daysAgo(31),
        lastUsedSignal: 'seen_in_repo',
      });
    });
  });

  describe('in use', () => {
    it.each([
      ['confirmed', { lastConfirmedUsedAt: daysAgo(3) }],
      ['seen_in_repo', { lastSeenInRepoAt: daysAgo(10) }],
      ['usage_expense', { lastUsageExpenseAt: daysAgo(29) }],
    ] as const)('should treat a recent %s signal as in use', (kind, override) => {
      const status = getUsageStatus(signals(override), NOW);
      expect(status.unused).toBe(false);
      expect(status.lastUsedSignal).toBe(kind);
    });

    it('should report the newest signal', () => {
      const status = getUsageStatus(
        signals({ lastConfirmedUsedAt: daysAgo(20), lastUsageExpenseAt: daysAgo(2) }),
        NOW,
      );
      expect(status).toEqual({
        unused: false,
        lastUsedAt: daysAgo(2),
        lastUsedSignal: 'usage_expense',
      });
    });
  });
});

describe('service key maps', () => {
  it('should index heartbeats by service name and catalog id, keeping the newest', () => {
    const map = lastSeenByServiceKey([
      { fingerprint: 'openai', service: 'OpenAI API', lastSeenAt: daysAgo(5) },
      { fingerprint: 'openai-2', service: 'OpenAI API', lastSeenAt: daysAgo(1) },
      { fingerprint: 'stripe', service: 'Stripe', lastSeenAt: null },
    ]);
    expect(map.get('openai')).toEqual(daysAgo(1));
    expect(map.has('stripe')).toBe(false);
  });

  it('should keep the newest usage expense per service', () => {
    const map = lastExpenseByServiceKey([
      { name: 'Coffee beans', expenseDate: daysAgo(4) },
      { name: 'coffee  beans', expenseDate: daysAgo(1) },
    ]);
    expect(map.get('coffee beans')).toEqual(daysAgo(1));
  });
});

describe('recordHeartbeat', () => {
  const makeDb = (known: string[]) => {
    const updateMany = jest.fn().mockResolvedValue({ count: known.length });
    const findMany = jest.fn().mockResolvedValue(known.map((fingerprint) => ({ fingerprint })));
    const db = { detectedSubscription: { findMany, updateMany } } as unknown as PrismaClient;
    return { db, findMany, updateMany };
  };

  it('should refresh lastSeenAt only on known fingerprints and ignore the rest', async () => {
    const { db, findMany, updateMany } = makeDb(['openai']);
    const report = heartbeatSchema.parse({
      fingerprints: [{ fingerprint: 'openai', service: 'OpenAI API' }, { fingerprint: 'mystery' }],
      detectedIn: 'acme/app',
    });

    const result = await recordHeartbeat(db, 7, report, NOW);

    expect(result).toEqual({ seen: ['openai'], ignored: ['mystery'] });
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 7, fingerprint: { in: ['openai', 'mystery'] } },
      select: { fingerprint: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 7, fingerprint: { in: ['openai'] } },
      data: { lastSeenAt: NOW },
    });
  });

  it('should not write anything when no fingerprint is known', async () => {
    const { db, updateMany } = makeDb([]);
    const result = await recordHeartbeat(
      db,
      7,
      heartbeatSchema.parse({ fingerprints: [{ fingerprint: 'mystery' }] }),
      NOW,
    );
    expect(result).toEqual({ seen: [], ignored: ['mystery'] });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('should reject oversized heartbeats', () => {
    const fingerprints = Array.from({ length: 201 }, (_, index) => ({ fingerprint: `f${index}` }));
    expect(heartbeatSchema.safeParse({ fingerprints }).success).toBe(false);
  });
});
