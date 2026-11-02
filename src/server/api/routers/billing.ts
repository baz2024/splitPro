import { randomUUID } from 'node:crypto';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { getIntegrationKey } from '~/server/billing/config';
import { encryptToken, tokenAad, tokenLast4 } from '~/server/billing/crypto';
import { notifyBillingSyncBlocked } from '~/server/billing/notify';
import { BillingProviderError, checkVercelToken } from '~/server/billing/providers/vercel';
import { resolveTargetGroup, syncBillingConnection } from '~/server/billing/sync';

const SYNC_COOLDOWN_MS = 30_000;

/** Columns safe to send to the client. The sealed token is never selected. */
const CONNECTION_SELECT = {
  id: true,
  provider: true,
  label: true,
  groupId: true,
  externalAccountId: true,
  tokenLast4: true,
  status: true,
  lastSyncedAt: true,
  lastError: true,
  createdAt: true,
  _count: { select: { imports: true } },
} as const;

const requireKey = () => {
  const key = getIntegrationKey();
  if (!key) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'sync_disabled' });
  }
  return key;
};

const providerErrorToTRPC = (error: unknown) => {
  if (!(error instanceof BillingProviderError)) {
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'unknown' });
  }
  // BAD_REQUEST rather than UNAUTHORIZED: the Safi session is fine, the pasted token is not.
  return new TRPCError({ code: 'BAD_REQUEST', message: error.code });
};

export const billingRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const enabled = null !== getIntegrationKey();
    const connections = await ctx.db.billingConnection.findMany({
      where: { userId: ctx.session.user.id },
      select: CONNECTION_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    const groupIds = connections.flatMap((c) => (null === c.groupId ? [] : [c.groupId]));
    const groups = groupIds.length
      ? await ctx.db.group.findMany({
          where: { id: { in: groupIds }, groupUsers: { some: { userId: ctx.session.user.id } } },
          select: { id: true, name: true },
        })
      : [];
    const groupNames = new Map(groups.map((g) => [g.id, g.name]));

    return {
      enabled,
      connections: connections.map(({ _count, ...connection }) =>
        Object.assign(connection, {
          groupName:
            null === connection.groupId ? null : (groupNames.get(connection.groupId) ?? null),
          importCount: _count.imports,
        }),
      ),
    };
  }),

  connect: protectedProcedure
    .input(
      z.object({
        provider: z.enum(['VERCEL', 'SUPABASE']),
        token: z.string().trim().min(10).max(512).regex(/^\S+$/, 'token_format'),
        groupId: z.number().int().positive().nullish(),
        teamId: z
          .string()
          .trim()
          .max(64)
          .regex(/^[A-Za-z0-9_-]*$/, 'team_format')
          .nullish()
          .transform((value) => (value ? value : null)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = requireKey();
      const userId = ctx.session.user.id;

      if ('VERCEL' !== input.provider) {
        // Supabase's Management API exposes no billed amounts, so there is nothing to import.
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'provider_unsupported' });
      }

      const groupId = input.groupId ?? null;
      if (null !== groupId && null === (await resolveTargetGroup(ctx.db, { userId, groupId }))) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'project_not_found' });
      }

      try {
        await checkVercelToken({ token: input.token, teamId: input.teamId });
      } catch (error) {
        throw providerErrorToTRPC(error);
      }

      const existing = await ctx.db.billingConnection.findFirst({
        where: { userId, provider: input.provider, externalAccountId: input.teamId },
        select: { id: true },
      });
      const id = existing?.id ?? randomUUID();
      const data = {
        groupId,
        encryptedToken: encryptToken(input.token, key, tokenAad(input.provider, id)),
        tokenLast4: tokenLast4(input.token),
        status: 'active',
        lastError: null,
      };

      const connection = existing
        ? await ctx.db.billingConnection.update({
            where: { id },
            data,
            select: { ...CONNECTION_SELECT, userId: true, encryptedToken: true },
          })
        : await ctx.db.billingConnection.create({
            data: {
              ...data,
              id,
              userId,
              provider: input.provider,
              externalAccountId: input.teamId,
              label: 'Vercel',
            },
            select: { ...CONNECTION_SELECT, userId: true, encryptedToken: true },
          });

      // First import right away; a failure here is recorded on the connection, not thrown.
      const sync = await syncBillingConnection(ctx.db, connection, {
        key,
        onBlocked: notifyBillingSyncBlocked,
      });

      return { id: connection.id, sync };
    }),

  disconnect: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Imported expenses stay; only the connection and its import ledger are removed.
      const { count } = await ctx.db.billingConnection.deleteMany({
        where: { id: input.id, userId: ctx.session.user.id },
      });
      if (0 === count) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'connection_not_found' });
      }
      return { ok: true };
    }),

  syncNow: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const key = requireKey();
      const connection = await ctx.db.billingConnection.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        select: {
          id: true,
          userId: true,
          provider: true,
          groupId: true,
          externalAccountId: true,
          encryptedToken: true,
          status: true,
          updatedAt: true,
        },
      });
      if (!connection) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'connection_not_found' });
      }
      if (Date.now() - connection.updatedAt.getTime() < SYNC_COOLDOWN_MS) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'sync_too_soon' });
      }
      return syncBillingConnection(ctx.db, connection, { key });
    }),
});
