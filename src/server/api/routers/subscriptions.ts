import { z } from 'zod';

import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { listSubscriptions } from '~/server/subscriptions/listSubscriptions';

export const subscriptionsRouter = createTRPCRouter({
  /** Recurring expenses as subscriptions, usage-based spend this month and the monthly run-rate. */
  list: protectedProcedure
    .input(z.object({ groupId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) =>
      listSubscriptions(ctx.db, { userId: ctx.session.user.id, groupId: input?.groupId }),
    ),
});
