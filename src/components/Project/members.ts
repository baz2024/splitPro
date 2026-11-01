import { BigMath } from '~/utils/numbers';

export interface BalanceLike {
  userId: number;
  friendId: number;
  currency: string;
  amount: bigint;
}

/** True when any balance in the group (or only `userId`'s, when given) is not settled. */
export const hasOpenBalances = (balances: readonly BalanceLike[], userId?: number): boolean =>
  balances.some(
    (balance) => 0n !== balance.amount && (undefined === userId || userId === balance.userId),
  );

export interface MemberBalance {
  currency: string;
  /** Positive: the member is owed this much. Negative: the member owes it. */
  amount: bigint;
}

/**
 * Each member's net position in the group per currency (positive = is owed, negative = owes),
 * largest first; members who are settled get an empty list.
 */
export const memberBalances = (
  balances: readonly BalanceLike[],
  memberIds: readonly number[],
): Map<number, MemberBalance[]> => {
  const totals = balances
    .filter((balance) => balance.userId !== balance.friendId && 0n !== balance.amount)
    .reduce<Map<number, Map<string, bigint>>>((acc, balance) => {
      const perCurrency = acc.get(balance.userId) ?? new Map<string, bigint>();
      perCurrency.set(balance.currency, (perCurrency.get(balance.currency) ?? 0n) + balance.amount);
      return acc.set(balance.userId, perCurrency);
    }, new Map());

  return new Map(
    memberIds.map((id) => [
      id,
      [...(totals.get(id) ?? new Map<string, bigint>()).entries()]
        .filter(([, amount]) => 0n !== amount)
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => {
          const diff = BigMath.abs(b.amount) - BigMath.abs(a.amount);
          return 0n === diff ? a.currency.localeCompare(b.currency) : 0n < diff ? 1 : -1;
        }),
    ]),
  );
};

interface ExpenseLike {
  paidBy: number;
  amount: bigint;
  expenseParticipants: readonly { userId: number; amount: bigint }[];
}

/**
 * What the viewer lent (positive) or owes (negative) on one expense, from the participant row
 * that stores (paid − share). Zero means the expense does not change their balance: either they
 * are not part of it, or they paid exactly their own share.
 */
export const viewerBalanceOn = (expense: ExpenseLike, userId: number): bigint => {
  const row = expense.expenseParticipants.find((participant) => participant.userId === userId);
  if (!row) {
    return 0n;
  }
  return row.amount;
};

/** True when the viewer neither paid nor has a share in the expense. */
export const isViewerInvolved = (expense: ExpenseLike, userId: number): boolean => {
  if (expense.paidBy === userId) {
    return true;
  }
  return 0n !== viewerBalanceOn(expense, userId);
};
