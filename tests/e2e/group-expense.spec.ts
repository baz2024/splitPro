import { expect, test } from './fixtures';

test('creates a group through the UI', async ({ page, uniqueName, scenario, db }) => {
  // The scenario owner already has a group, so this is the path once the empty state is gone.
  await page.goto('/en/projects');
  await page.getByRole('button', { name: 'Create a group', exact: true }).click();
  await page.getByPlaceholder(/group name/i).fill(`${uniqueName} created`);
  await page.getByRole('button', { name: /submit/i }).click();
  // A new group opens on its project page, where the name is the page heading.
  await page.waitForURL(/\/projects\/\d+$/);
  await expect(
    page.getByRole('heading', { level: 1, name: `${uniqueName} created`, exact: true }),
  ).toBeVisible();
  const group = await db.group.findFirst({
    where: { userId: scenario.owner.id, name: `${uniqueName} created` },
  });
  expect(group).toMatchObject({ userId: scenario.owner.id });
  expect(page.url()).toMatch(new RegExp(`/projects/${group?.id}$`));
});

test('records a two-member expense with exact persisted shares and debt', async ({
  page,
  scenario,
  uniqueName,
  db,
}) => {
  // Start from the project page: saving returns the user to wherever they came from.
  const projectPath = `/en/projects/${scenario.group.id}`;
  await page.goto(projectPath);
  await page.getByRole('link', { name: 'Add cost', exact: true }).click();
  await page.getByPlaceholder(/description/i).fill(`${uniqueName} expense`);
  const keypad = page.getByRole('group', { name: 'Number pad' });
  for (const key of ['1', '2', 'Decimal point', '3', '4']) {
    await keypad.getByRole('button', { name: key, exact: true }).click();
  }
  await expect(page.getByText('$12.34', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next: split', exact: true }).click();
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  const saved = page.getByRole('dialog', { name: /saved/i });
  await expect(saved.getByText(`$12.34 · ${uniqueName} expense`, { exact: true })).toBeVisible();
  await saved.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForURL(new RegExp(`${projectPath}$`));
  // The expense is listed on the project page and its details open from there.
  await page.getByRole('link', { name: new RegExp(`${uniqueName} expense`) }).click();
  await page.waitForURL(/\/groups\/\d+\/expenses\//);
  await expect(page.getByText(`${uniqueName} expense`, { exact: true })).toBeVisible();
  const expense = await db.expense.findFirstOrThrow({
    where: { groupId: scenario.group.id },
    include: { expenseParticipants: true },
  });
  expect(expense.amount).toBe(1234n);
  expect(expense.expenseParticipants).toHaveLength(2);
  expect(expense.expenseParticipants).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ userId: scenario.owner.id, amount: 617n }),
      expect.objectContaining({ userId: scenario.member.id, amount: -617n }),
    ]),
  );
  expect(
    await db.balanceView.findFirst({
      where: { groupId: scenario.group.id, userId: scenario.owner.id },
    }),
  ).toMatchObject({ amount: 617n, currency: 'USD' });
});
