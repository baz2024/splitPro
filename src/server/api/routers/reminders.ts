import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { MAX_REMIND_DAYS_BEFORE } from '~/server/reminders/dueDate';

const daysBeforeSchema = z.number().int().min(1).max(MAX_REMIND_DAYS_BEFORE).nullable();

const setReminderSchema = z.union([
  z.object({ expenseId: z.string().uuid(), daysBefore: daysBeforeSchema }),
  z.object({ recurrenceId: z.number().int().positive(), daysBefore: daysBeforeSchema }),
]);

/** Expenses the user can see: they paid or share it, and it is not deleted. */
const visibleTo = (userId: number) => ({
  deletedBy: null,
  OR: [{ paidBy: userId }, { expenseParticipants: { some: { userId } } }],
});

export const remindersRouter = createTRPCRouter({
  /** Renewal reminder settings for the user's recurring expenses (for the Subscriptions bells). */
  list: protectedProcedure.query(async ({ ctx }) =>
    ctx.db.expenseRecurrence.findMany({
      where: { expense: { some: visibleTo(ctx.session.user.id) } },
      select: { id: true, remindDaysBefore: true },
    }),
  ),

  /**
   * Turn the renewal reminder on (daysBefore) or off (null) for a recurring expense. The setting
   * belongs to the recurrence, so it applies to everyone who shares the subscription.
   */
  setReminder: protectedProcedure.input(setReminderSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const recurrence =
      'expenseId' in input
        ? await ctx.db.expense
            .findFirst({
              where: { id: input.expenseId, ...visibleTo(userId) },
              select: { recurrenceId: true },
            })
            .then((expense) => expense?.recurrenceId ?? null)
        : await ctx.db.expenseRecurrence
            .findFirst({
              where: { id: input.recurrenceId, expense: { some: visibleTo(userId) } },
              select: { id: true },
            })
            .then((found) => found?.id ?? null);

    if (null === recurrence) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recurring expense not found' });
    }

    return ctx.db.expenseRecurrence.update({
      where: { id: recurrence },
      data: { remindDaysBefore: input.daysBefore },
      select: { id: true, remindDaysBefore: true },
    });
  }),
});
