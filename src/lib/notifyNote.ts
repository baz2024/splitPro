/**
 * Who a new shared cost notifies. Mirrors the server rule in
 * `sendExpensePushNotification`: every participant except the person adding it, and only when
 * the cost changes their balance (participant amount ≠ 0).
 */
export const notifiedParticipants = <P extends { id: number; amount?: bigint | null }>(
  participants: readonly P[],
  currentUserId: number | undefined,
): P[] => participants.filter((p) => p.id !== currentUserId && 0n !== (p.amount ?? 0n));
