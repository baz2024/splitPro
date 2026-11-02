import { type PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';

/** Sets lastConfirmedUsedAt on a recurrence the user takes part in. */
export const markSubscriptionStillUsed = async (
  db: PrismaClient,
  { userId, recurrenceId, now = new Date() }: { userId: number; recurrenceId: number; now?: Date },
): Promise<{ recurrenceId: number; lastConfirmedUsedAt: Date }> => {
  const recurrence = await db.expenseRecurrence.findFirst({
    where: {
      id: recurrenceId,
      expense: { some: { deletedBy: null, expenseParticipants: { some: { userId } } } },
    },
    select: { id: true },
  });

  if (!recurrence) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });
  }

  const updated = await db.expenseRecurrence.update({
    where: { id: recurrence.id },
    data: { lastConfirmedUsedAt: now },
    select: { id: true, lastConfirmedUsedAt: true },
  });

  return { recurrenceId: updated.id, lastConfirmedUsedAt: updated.lastConfirmedUsedAt ?? now };
};
