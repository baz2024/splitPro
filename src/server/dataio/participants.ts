export interface ParticipantAmount {
  userId: number;
  amount: bigint;
}

/**
 * Double-entry participant rows for an imported expense paid by `payerId`, using the same
 * convention as the add-expense flow: each entry is (paid - share), so a split sums to zero.
 *
 * - personal (no project): a single entry for the payer, like a personal cost in Add cost.
 * - project, only me: the payer owes their own full share, so nothing moves between people.
 * - project, equal: the amount is split across members; leftover minor units go one each to
 *   the other members in ascending user-id order (never to the payer), so totals are exact.
 */
export const buildParticipants = ({
  amount,
  payerId,
  memberIds,
  mode,
}: {
  amount: bigint;
  payerId: number;
  memberIds: readonly number[];
  mode: 'personal' | 'me' | 'equal';
}): ParticipantAmount[] => {
  if ('personal' === mode) {
    return [{ userId: payerId, amount }];
  }
  const others = [...new Set(memberIds)].filter((id) => id !== payerId).sort((a, b) => a - b);
  if ('me' === mode || 0 === others.length) {
    return [{ userId: payerId, amount: 0n }];
  }
  const count = BigInt(others.length + 1);
  const base = amount / count;
  const remainder = amount - base * count;
  const otherShares = others.map((userId, index) => ({
    userId,
    share: base + (BigInt(index) < remainder ? 1n : 0n),
  }));
  return [
    { userId: payerId, amount: amount - base },
    ...otherShares.map(({ userId, share }) => ({ userId, amount: -share })),
  ];
};
