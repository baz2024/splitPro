import { type PrismaClient } from '@prisma/client';

import {
  type UsageExpense,
  aggregateUsage,
  loadUsage,
  nextMonthUtc,
  startOfMonthUtc,
  userShareOf,
} from './usage';

const USER = 1;
const FRIEND = 2;

const expense = (overrides: Partial<UsageExpense>): UsageExpense => ({
  id: 'e1',
  name: 'Anthropic API',
  category: 'aiApis',
  currency: 'USD',
  amount: 10000n,
  paidBy: USER,
  participantAmount: null,
  ...overrides,
});

describe('userShareOf', () => {
  describe('Personal expense', () => {
    it('should count the full amount when the payer has no participant row', () => {
      expect(userShareOf(expense({}), USER)).toBe(10000n);
    });
  });

  describe('Shared expense', () => {
    it('should count only the payer share when split equally', () => {
      expect(userShareOf(expense({ participantAmount: 5000n }), USER)).toBe(5000n);
    });

    it('should count the participant share when someone else paid', () => {
      expect(userShareOf(expense({ paidBy: FRIEND, participantAmount: -2500n }), USER)).toBe(2500n);
    });
  });
});

describe('aggregateUsage', () => {
  describe('Totals', () => {
    it('should sum user shares and group rows by catalog service', () => {
      const result = aggregateUsage({
        userId: USER,
        expenses: [
          expense({ id: 'a', name: 'Anthropic API', amount: 20000n }),
          expense({ id: 'b', name: 'anthropic', amount: 5000n }),
          expense({ id: 'c', name: 'OpenAI', amount: 8000n, participantAmount: 4000n }),
        ],
      });

      expect(result.currency).toBe('USD');
      expect(result.total).toBe(29000n);
      expect(result.rows.map((row) => [row.key, row.name, row.amount])).toEqual([
        ['service:anthropic', 'Anthropic', 25000n],
        ['service:openai', 'OpenAI', 4000n],
      ]);
    });

    it('should fall back to the category when the service is unknown', () => {
      const result = aggregateUsage({
        userId: USER,
        expenses: [expense({ name: 'Some obscure tool', category: 'monitoring' })],
      });

      expect(result.rows[0]).toMatchObject({
        key: 'category:monitoring',
        kind: 'service',
        name: 'monitoring',
      });
    });

    it('should ignore expenses where the user has no positive share', () => {
      const result = aggregateUsage({
        userId: USER,
        expenses: [expense({ participantAmount: 10000n })],
      });

      expect(result.total).toBe(0n);
      expect(result.rows).toEqual([]);
    });
  });

  describe('Agents', () => {
    it('should group agent-reported expenses under the agent and list its services', () => {
      const result = aggregateUsage({
        userId: USER,
        agentByExpenseId: new Map([
          ['a', 'Growth agent'],
          ['b', 'Growth agent'],
        ]),
        expenses: [
          expense({ id: 'a', name: 'Anthropic', amount: 3000n }),
          expense({ id: 'b', name: 'Vercel', category: 'cloudHosting', amount: 2000n }),
          expense({ id: 'c', name: 'Anthropic', amount: 1000n }),
        ],
      });

      expect(result.total).toBe(6000n);
      expect(result.rows).toEqual([
        expect.objectContaining({
          key: 'agent:Growth agent',
          kind: 'agent',
          amount: 5000n,
          services: ['Anthropic', 'Vercel'],
        }),
        expect.objectContaining({ key: 'service:anthropic', amount: 1000n }),
      ]);
    });
  });

  describe('Currencies', () => {
    it('should pick the currency with the most spend and list the others', () => {
      const result = aggregateUsage({
        userId: USER,
        expenses: [
          expense({ id: 'a', currency: 'EUR', amount: 100n }),
          expense({ id: 'b', currency: 'USD', amount: 900n }),
          expense({ id: 'c', currency: 'GBP', amount: 50n }),
        ],
      });

      expect(result.currency).toBe('USD');
      expect(result.total).toBe(900n);
      expect(result.otherCurrencies).toEqual(['EUR', 'GBP']);
    });

    it('should use the preferred currency even when it has no spend', () => {
      const result = aggregateUsage({
        userId: USER,
        preferredCurrency: 'EUR',
        expenses: [expense({ currency: 'USD' })],
      });

      expect(result.currency).toBe('EUR');
      expect(result.total).toBe(0n);
      expect(result.rows).toEqual([]);
      expect(result.otherCurrencies).toEqual(['USD']);
    });

    it('should return no currency when there is no spend and no preference', () => {
      expect(aggregateUsage({ userId: USER, expenses: [] })).toEqual({
        currency: null,
        total: 0n,
        rows: [],
        otherCurrencies: [],
      });
    });
  });
});

describe('month bounds', () => {
  it('should cover the current UTC calendar month', () => {
    const now = new Date('2026-11-15T10:00:00Z');
    expect(startOfMonthUtc(now).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(nextMonthUtc(now).toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });
});

describe('loadUsage', () => {
  const makeDb = ({
    group = null,
    expenses = [],
    detections = [],
  }: {
    group?: Record<string, unknown> | null;
    expenses?: unknown[];
    detections?: unknown[];
  }) => {
    const db = {
      group: { findFirst: jest.fn().mockResolvedValue(group) },
      expense: { findMany: jest.fn().mockResolvedValue(expenses) },
      detectedSubscription: { findMany: jest.fn().mockResolvedValue(detections) },
    };
    return { db, client: db as unknown as PrismaClient };
  };

  const dbExpense = {
    id: 'a',
    name: 'Anthropic API',
    category: 'aiApis',
    currency: 'USD',
    amount: 50000n,
    paidBy: USER,
    expenseParticipants: [],
  };

  it('should report no cap and no Kafo AI source without a budgeted project', async () => {
    const { db, client } = makeDb({ expenses: [dbExpense] });
    const result = await loadUsage(client, USER, { now: new Date('2026-11-15T00:00:00Z') });

    expect(db.group.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ archivedAt: null, budgetAmount: { gt: 0n } }),
        orderBy: { updatedAt: 'desc' },
      }),
    );
    expect(result.total).toBe(50000n);
    expect(result.cap).toBeNull();
    expect(result.project).toBeNull();
    expect(result.sources).toEqual({
      kafoAi: 'not_connected',
      vercel: 'not_connected',
      supabase: 'not_connected',
    });
  });

  it('should default the cap to the latest budgeted project without a groupId', async () => {
    const { db, client } = makeDb({
      group: { id: 3, name: 'Kafo AI', defaultCurrency: 'USD', budgetAmount: 200000n },
      expenses: [dbExpense],
    });
    const result = await loadUsage(client, USER, { now: new Date('2026-11-15T00:00:00Z') });

    // Spend still covers every expense; only the cap comes from the project.
    expect(db.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ groupId: 3 }) }),
    );
    expect(result.cap).toBe(200000n);
    expect(result.project).toEqual({ id: 3, name: 'Kafo AI' });
    expect(result.sources.kafoAi).toBe('budget_source');
  });

  it('should use the project budget as the cap when the field exists', async () => {
    const { db, client } = makeDb({
      group: { id: 7, name: 'Launch', defaultCurrency: 'USD', budgetAmount: 200000n },
      expenses: [dbExpense],
      detections: [{ expenseId: 'a', agent: 'Growth agent' }],
    });
    const result = await loadUsage(client, USER, { groupId: 7 });

    expect(db.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ groupId: 7 }) }),
    );
    expect(result.cap).toBe(200000n);
    expect(result.project).toEqual({ id: 7, name: 'Launch' });
    expect(result.sources.kafoAi).toBe('budget_source');
    expect(result.rows[0]).toMatchObject({ kind: 'agent', name: 'Growth agent' });
  });

  it('should leave the cap empty when the project has no budget field', async () => {
    const { client } = makeDb({
      group: { id: 7, name: 'Launch', defaultCurrency: 'USD' },
      expenses: [dbExpense],
    });
    const result = await loadUsage(client, USER, { groupId: 7 });

    expect(result.cap).toBeNull();
    expect(result.project).toEqual({ id: 7, name: 'Launch' });
    expect(result.sources.kafoAi).toBe('not_connected');
  });
});
