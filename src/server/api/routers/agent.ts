import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { MAX_ACTIVE_API_KEYS, createApiKeyRecord } from '~/server/agent/apiKeys';
import {
  listDetectedSubscriptions,
  serializeDetectedSubscription,
} from '~/server/agent/detectedSubscriptions';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';

const DETECTED_STATUSES = ['PENDING', 'ADDED', 'DISMISSED'] as const;

export const agentRouter = createTRPCRouter({
  listApiKeys: protectedProcedure.query(async ({ ctx }) =>
    ctx.db.apiKey.findMany({
      where: { userId: ctx.session.user.id },
      select: {
        id: true,
        name: true,
        prefix: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ),

  createApiKey: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const activeCount = await ctx.db.apiKey.count({ where: { userId, revokedAt: null } });
      if (activeCount >= MAX_ACTIVE_API_KEYS) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `You can have at most ${MAX_ACTIVE_API_KEYS} active API keys`,
        });
      }

      const { token, prefix, hashedKey } = createApiKeyRecord();
      const apiKey = await ctx.db.apiKey.create({
        data: { userId, name: input.name, prefix, hashedKey },
        select: { id: true, name: true, prefix: true, createdAt: true },
      });

      // The raw token is returned exactly once; only its hash is stored.
      return { ...apiKey, token };
    }),

  revokeApiKey: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const apiKey = await ctx.db.apiKey.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        select: { id: true, revokedAt: true },
      });
      if (!apiKey) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'API key not found' });
      }
      if (apiKey.revokedAt) {
        return { id: apiKey.id, revokedAt: apiKey.revokedAt };
      }
      return ctx.db.apiKey.update({
        where: { id: apiKey.id },
        data: { revokedAt: new Date() },
        select: { id: true, revokedAt: true },
      });
    }),

  listDetectedSubscriptions: protectedProcedure
    .input(z.object({ status: z.enum(DETECTED_STATUSES).optional() }).optional())
    .query(async ({ ctx, input }) =>
      listDetectedSubscriptions(ctx.db, ctx.session.user.id, input?.status),
    ),

  dismissDetectedSubscription: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.detectedSubscription.updateMany({
        where: { id: input.id, userId: ctx.session.user.id },
        data: { status: 'DISMISSED' },
      });
      if (0 === count) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Detected subscription not found' });
      }
      const row = await ctx.db.detectedSubscription.findUniqueOrThrow({ where: { id: input.id } });
      return serializeDetectedSubscription(row);
    }),

  markDetectedSubscriptionAdded: protectedProcedure
    .input(z.object({ id: z.string().min(1), expenseId: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.detectedSubscription.updateMany({
        where: { id: input.id, userId: ctx.session.user.id },
        data: { status: 'ADDED', ...(input.expenseId ? { expenseId: input.expenseId } : {}) },
      });
      if (0 === count) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Detected subscription not found' });
      }
      const row = await ctx.db.detectedSubscription.findUniqueOrThrow({ where: { id: input.id } });
      return serializeDetectedSubscription(row);
    }),
});
