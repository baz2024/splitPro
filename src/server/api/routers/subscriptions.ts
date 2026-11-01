import { z } from 'zod';

import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { listSubscriptions } from '~/server/subscriptions/listSubscriptions';
import { markSubscriptionStillUsed } from '~/server/subscriptions/markStillUsing';

export const subscriptionsRouter = createTRPCRouter({
  /**
   * Recurring expenses as subscriptions (each flagged when unused 30+ days), usage-based spend this
   * month and the monthly run-rate.
   */
  list: protectedProcedure
    .input(z.object({ groupId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) =>
      listSubscriptions(ctx.db, { userId: ctx.session.user.id, groupId: input?.groupId }),
    ),

  /** "Still using": records that the user still uses this subscription, clearing the unused flag. */
  markStillUsing: protectedProcedure
    .input(z.object({ recurrenceId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) =>
      markSubscriptionStillUsed(ctx.db, {
        userId: ctx.session.user.id,
        recurrenceId: input.recurrenceId,
      }),
    ),
});
