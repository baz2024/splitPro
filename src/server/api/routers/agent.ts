import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { isCurrencyCode } from '~/lib/currency';
import { MAX_ACTIVE_API_KEYS, createApiKeyRecord } from '~/server/agent/apiKeys';
import { loadAgentSpends } from '~/server/agent/caps';
import {
  listDetectedSubscriptions,
  serializeDetectedSubscription,
} from '~/server/agent/detectedSubscriptions';
import { loadUsage } from '~/server/agent/usage';
import { parseAmountToMinorUnits } from '~/server/agent/validation';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';

const DETECTED_STATUSES = ['PENDING', 'ADDED', 'DISMISSED'] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value && '' !== value ? value : null));

const capInputSchema = z
  .object({
    amount: z.string().trim(),
    currency: z
      .string()
      .transform((value) => value.trim().toUpperCase())
      .refine((value) => isCurrencyCode(value), { message: 'Unknown currency' }),
  })
  .nullable();

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
        agentLabel: true,
        model: true,
        groupId: true,
        monthlyCapAmount: true,
        capCurrency: true,
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

  updateApiKey: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        agentLabel: optionalText(100),
        model: optionalText(100),
        groupId: z.number().int().positive().nullable(),
        /** Monthly cap as a decimal string in `currency`; null removes the cap. */
        cap: capInputSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const apiKey = await ctx.db.apiKey.findFirst({
        where: { id: input.id, userId },
        select: { id: true },
      });
      if (!apiKey) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'API key not found' });
      }

      if (null !== input.groupId) {
        const membership = await ctx.db.groupUser.findFirst({
          where: { groupId: input.groupId, userId },
          select: { groupId: true },
        });
        if (!membership) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
      }

      const capAmount = input.cap
        ? parseAmountToMinorUnits(input.cap.amount.replace(',', '.'), input.cap.currency)
        : null;
      if (input.cap && (null === capAmount || 0n >= capAmount)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Enter a cap greater than zero' });
      }

      return ctx.db.apiKey.update({
        where: { id: apiKey.id },
        data: {
          agentLabel: input.agentLabel,
          model: input.model,
          groupId: input.groupId,
          monthlyCapAmount: capAmount,
          capCurrency: input.cap ? input.cap.currency : null,
        },
        select: {
          id: true,
          agentLabel: true,
          model: true,
          groupId: true,
          monthlyCapAmount: true,
          capCurrency: true,
        },
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

  usage: protectedProcedure
    .input(z.object({ groupId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const [usage, agents] = await Promise.all([
        loadUsage(ctx.db, ctx.session.user.id, { groupId: input?.groupId }),
        loadAgentSpends(ctx.db, ctx.session.user.id),
      ]);
      // Per-key spend with cap + percent; scoped to the project when one is picked.
      const scopedAgents = input?.groupId
        ? agents.filter((agent) => agent.project?.id === input.groupId)
        : agents;
      return { ...usage, agents: scopedAgents };
    }),
});
