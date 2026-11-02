import { gzipSync } from 'node:zlib';

import { cadenceCron } from '~/server/statementScan/cron';

import { db } from './database';
import { testUser } from './factories';
import { callerFor } from './trpc';

const DAY_MS = 24 * 60 * 60 * 1000;

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** `months` calendar months before `date` (UTC), keeping the day where possible. */
const monthsBefore = (date: Date, months: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, date.getUTCDate()));

const upload = (csv: string) => ({
  name: 'statement.csv',
  gzipBase64: gzipSync(Buffer.from(csv, 'utf8')).toString('base64'),
});

/** A small statement: Spotify and Notion monthly, JetBrains yearly, plus noise. */
const statementCsv = () => {
  const lastMonthly = new Date(Date.now() - 20 * DAY_MS);
  const lastNotion = new Date(Date.now() - 12 * DAY_MS);
  const lastYearly = new Date(Date.now() - 300 * DAY_MS);
  const lines = [
    ...[0, 1, 2, 3].map(
      (months) => `${iso(monthsBefore(lastMonthly, months))},SPOTIFY P2F8A1 STOCKHOLM,10.99`,
    ),
    ...[0, 1, 2, 3].map(
      (months) => `${iso(monthsBefore(lastNotion, months))},NOTION LABS INC,8.00`,
    ),
    ...[0, 12].map(
      (months) => `${iso(monthsBefore(lastYearly, months))},JETBRAINS AMERICAS INC,249.00`,
    ),
    `${iso(new Date(Date.now() - 5 * DAY_MS))},TESCO STORES 3021,42.17`,
    `${iso(new Date(Date.now() - 9 * DAY_MS))},SHELL FUEL 88,61.02`,
  ];
  return ['Date,Description,Amount', ...lines].join('\n');
};

const scanOptions = {
  mapping: { date: 0, description: 1, amount: 2 },
  dateFormat: 'ISO' as const,
  defaultCurrency: 'EUR',
  amountSign: 'positive' as const,
  timeZone: 'UTC',
};

const byDescription = <T extends { rawDescriptions: string[] }>(items: T[], needle: string) => {
  const item = items.find((entry) =>
    entry.rawDescriptions.some((description) => description.includes(needle)),
  );
  if (!item) {
    throw new Error(`No scan item for ${needle}`);
  }
  return item;
};

describe('statement scan', () => {
  it('stores detected subscriptions, rescans without duplicates and confirms decisions', async () => {
    const user = await testUser('Scanner');
    const caller = callerFor(user.id);
    const file = upload(statementCsv());

    const inspected = await caller.statementScan.inspect({ file });
    expect(inspected.kind).toBe('statement');
    expect(inspected.mappingComplete).toBe(true);

    const first = await caller.statementScan.scan({ file, options: scanOptions });
    const spotify = byDescription(first.items, 'SPOTIFY');
    const notion = byDescription(first.items, 'NOTION');
    const jetbrains = byDescription(first.items, 'JETBRAINS');
    expect(spotify).toMatchObject({ cadence: 'monthly', amountMinor: 1099n, status: 'PENDING' });
    expect(notion).toMatchObject({ cadence: 'monthly', status: 'PENDING' });
    expect(jetbrains).toMatchObject({ cadence: 'yearly', amountMinor: 24900n, status: 'PENDING' });

    const stored = await db.detectedSubscription.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(first.items.length);
    expect(stored.every((row) => 'statement' === row.agent && 'PENDING' === row.status)).toBe(true);
    expect(stored.every((row) => first.scanId === row.scanId)).toBe(true);

    // The agents' inbox still lists them as pending detected subscriptions.
    const inbox = await caller.agent.listDetectedSubscriptions({ status: 'PENDING' });
    expect(inbox.map((row) => row.id).sort()).toEqual(stored.map((row) => row.id).sort());
    expect(inbox.find((row) => row.id === jetbrains.id)?.estimatedMonthlyCost).toEqual({
      amount: '20.75',
      currency: 'EUR',
    });

    const second = await caller.statementScan.scan({ file, options: scanOptions });
    expect(second.scanId).not.toBe(first.scanId);
    expect(await db.detectedSubscription.count({ where: { userId: user.id } })).toBe(
      first.items.length,
    );
    expect(byDescription(second.items, 'SPOTIFY').id).toBe(spotify.id);

    const latest = await caller.statementScan.latest();
    expect(latest?.scanId).toBe(second.scanId);
    expect(latest?.items).toHaveLength(second.items.length);
    expect(latest?.totals[0]?.currency).toBe('EUR');

    const result = await caller.statementScan.confirm({
      decisions: [
        { id: spotify.id, decision: 'using' },
        { id: notion.id, decision: 'not_subscription' },
        { id: jetbrains.id, decision: 'not_sure' },
        { id: 'missing-row', decision: 'using' },
      ],
    });
    expect(result.dismissed).toBe(1);
    expect(result.errors).toEqual([{ id: 'missing-row', code: 'not_found' }]);
    expect(result.created).toEqual([
      { id: spotify.id, expenseId: expect.any(String), remindDaysBefore: null },
      { id: jetbrains.id, expenseId: expect.any(String), remindDaysBefore: 14 },
    ]);

    const expenses = await db.expense.findMany({
      where: { id: { in: result.created.map((entry) => entry.expenseId) } },
      include: { expenseParticipants: true, recurrence: { include: { job: true } } },
    });
    const spotifyExpense = expenses.find((expense) => 1099n === expense.amount);
    const jetbrainsExpense = expenses.find((expense) => 24900n === expense.amount);
    expect(spotifyExpense).toMatchObject({
      groupId: null,
      paidBy: user.id,
      currency: 'EUR',
      splitType: 'EQUAL',
      expenseParticipants: [expect.objectContaining({ userId: user.id, amount: 1099n })],
    });
    expect(spotifyExpense?.recurrence?.remindDaysBefore).toBeNull();
    expect(spotifyExpense?.recurrence?.lastConfirmedUsedAt).toBeInstanceOf(Date);
    expect(spotifyExpense?.recurrence?.job.schedule).toBe(
      cadenceCron('monthly', spotify.nextRenewal!),
    );
    expect(jetbrainsExpense?.recurrence?.remindDaysBefore).toBe(14);
    expect(jetbrainsExpense?.recurrence?.lastConfirmedUsedAt).toBeNull();
    expect(jetbrainsExpense?.recurrence?.job.schedule).toBe(
      cadenceCron('yearly', jetbrains.nextRenewal!),
    );

    const rows = await db.detectedSubscription.findMany({
      where: { id: { in: [spotify.id, notion.id, jetbrains.id] } },
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));
    expect(rowById.get(spotify.id)).toMatchObject({ status: 'ADDED', decision: 'using' });
    expect(rowById.get(notion.id)).toMatchObject({
      status: 'DISMISSED',
      decision: 'not_subscription',
    });
    expect(rowById.get(jetbrains.id)).toMatchObject({
      status: 'ADDED',
      decision: 'not_sure',
      expenseId: jetbrainsExpense?.id,
    });

    // Confirming again is a no-op per item; rescanning keeps decided statuses.
    const again = await caller.statementScan.confirm({
      decisions: [{ id: spotify.id, decision: 'using' }],
    });
    expect(again).toEqual({
      created: [],
      dismissed: 0,
      errors: [{ id: spotify.id, code: 'not_found' }],
    });
    const third = await caller.statementScan.scan({ file, options: scanOptions });
    expect(byDescription(third.items, 'NOTION').status).toBe('DISMISSED');
    expect(byDescription(third.items, 'SPOTIFY').status).toBe('ADDED');
    expect(await db.expense.count()).toBe(2);
  });

  it('remembers a typed trial price and new name, through a rescan too', async () => {
    const user = await testUser('Owner');
    const caller = callerFor(user.id);
    const csv = [
      'Date,Description,Amount',
      `${iso(new Date(Date.now() - 6 * DAY_MS))},"CURSOR, AI POWERED IDE",0.92`,
    ].join('\n');

    const scan = await caller.statementScan.scan({ file: upload(csv), options: scanOptions });
    const trial = byDescription(scan.items, 'CURSOR');
    expect(trial.flags).toContain('trial');
    expect(trial.amountMinor).toBe(0n);

    await caller.statementScan.confirm({
      decisions: [{ id: trial.id, decision: 'not_sure', amountMinor: 2000n, name: 'Cursor Pro' }],
    });

    const latest = await caller.statementScan.latest();
    expect(latest?.items.find((item) => item.id === trial.id)).toMatchObject({
      status: 'ADDED',
      amountMinor: 2000n,
      cadence: 'monthly',
      vendor: { name: 'Cursor Pro' },
    });

    const rescan = await caller.statementScan.scan({ file: upload(csv), options: scanOptions });
    expect(rescan.items.find((item) => item.id === trial.id)).toMatchObject({
      status: 'ADDED',
      amountMinor: 2000n,
      cadence: 'monthly',
    });
    expect(await db.expense.count()).toBe(1);
  });

  it('rejects a zero amount per item and keeps other users out', async () => {
    const user = await testUser('Owner');
    const other = await testUser('Other');
    const row = await db.detectedSubscription.create({
      data: {
        userId: user.id,
        fingerprint: 'statement:trial-app:EUR:trial',
        service: 'Trial App',
        agent: 'statement',
        source: 'statement',
        flags: ['trial'],
        estimatedAmount: 0n,
        estimatedCurrency: 'EUR',
        scanId: 'c000000001',
      },
    });

    expect(
      await callerFor(other.id).statementScan.confirm({
        decisions: [{ id: row.id, decision: 'using' }],
      }),
    ).toEqual({ created: [], dismissed: 0, errors: [{ id: row.id, code: 'not_found' }] });

    const caller = callerFor(user.id);
    expect(
      await caller.statementScan.confirm({ decisions: [{ id: row.id, decision: 'cancel' }] }),
    ).toEqual({ created: [], dismissed: 0, errors: [{ id: row.id, code: 'amount_required' }] });
    expect(await db.detectedSubscription.findUnique({ where: { id: row.id } })).toMatchObject({
      status: 'PENDING',
      decision: null,
    });

    const result = await caller.statementScan.confirm({
      decisions: [{ id: row.id, decision: 'cancel', amountMinor: 1500n }],
    });
    expect(result.created).toEqual([
      { id: row.id, expenseId: expect.any(String), remindDaysBefore: 2 },
    ]);
    const expense = await db.expense.findUniqueOrThrow({
      where: { id: result.created[0]!.expenseId },
      include: { recurrence: { include: { job: true } } },
    });
    expect(expense).toMatchObject({
      amount: 1500n,
      needsReview: true,
      reviewReasons: ['note:Planned to cancel'],
    });
    expect(expense.recurrence?.job.schedule).toMatch(/^0 0 (\d+|\$) \* \*$/);
  });

  it('dates a trial a cycle before its first charge, so that month is not counted twice', async () => {
    const user = await testUser('Owner');
    const trialEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const row = await db.detectedSubscription.create({
      data: {
        userId: user.id,
        fingerprint: 'statement:trial-date:EUR:trial',
        service: 'Trial Date',
        agent: 'statement',
        source: 'statement',
        flags: ['trial'],
        estimatedAmount: 2000n,
        estimatedCurrency: 'EUR',
        nextRenewalAt: trialEnd,
        scanId: 'c000000002',
      },
    });

    const result = await callerFor(user.id).statementScan.confirm({
      decisions: [{ id: row.id, decision: 'not_sure' }],
    });
    const expense = await db.expense.findUniqueOrThrow({
      where: { id: result.created[0]!.expenseId },
    });

    expect(expense.expenseDate.getTime()).toBeLessThan(Date.now());
    const monthsApart =
      12 * (trialEnd.getUTCFullYear() - expense.expenseDate.getUTCFullYear()) +
      trialEnd.getUTCMonth() -
      expense.expenseDate.getUTCMonth();
    expect(monthsApart).toBe(1);
  });
});
