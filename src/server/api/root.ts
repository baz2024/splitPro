import { groupRouter } from '~/server/api/routers/group';
import { createTRPCRouter } from '~/server/api/trpc';

import { agentRouter } from './routers/agent';
import { billingRouter } from './routers/billing';
import { userRouter } from './routers/user';
import { projectRouter } from './routers/project';
import { bankTransactionsRouter } from './routers/bankTransactions';
import { expenseRouter } from './routers/expense';
import { receiptRouter } from './routers/receipt';
import { remindersRouter } from './routers/reminders';
import { subscriptionsRouter } from './routers/subscriptions';

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  group: groupRouter,
  user: userRouter,
  bankTransactions: bankTransactionsRouter,
  expense: expenseRouter,
  receipt: receiptRouter,
  agent: agentRouter,
  project: projectRouter,
  subscriptions: subscriptionsRouter,
  reminders: remindersRouter,
  billing: billingRouter,
});

// Export type definition of API
export type AppRouter = typeof appRouter;
