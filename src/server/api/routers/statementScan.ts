import { z } from 'zod';

import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { importFileSchema, importOptionsSchema } from '~/server/dataio/types';
import {
  MAX_SCAN_DECISIONS,
  confirmScanDecisions,
  inspectStatement,
  isRealCalendarDate,
  latestScan,
  scanStatement,
} from '~/server/statementScan/service';
import { SCAN_DECISIONS } from '~/server/statementScan/types';

const scanOptionsSchema = importOptionsSchema.pick({
  mapping: true,
  dateFormat: true,
  defaultCurrency: true,
  amountSign: true,
  timeZone: true,
});

const calendarDateSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  })
  .refine(isRealCalendarDate, { message: 'invalid_date' });

const decisionSchema = z.object({
  id: z.string().min(1).max(64),
  decision: z.enum(SCAN_DECISIONS),
  amountMinor: z.bigint().optional(),
  cadence: z.enum(['weekly', 'monthly', 'yearly']).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  nextRenewal: calendarDateSchema.optional(),
});

/**
 * Statement scan: upload a bank / card statement or a SaaS invoice export, find the
 * subscriptions in it, and turn the ones the user confirms into recurring expenses.
 */
export const statementScanRouter = createTRPCRouter({
  /** Step 1: read the upload, tell statements from invoice exports and guess the columns. */
  inspect: protectedProcedure
    .input(z.object({ file: importFileSchema }))
    .mutation(({ input }) => inspectStatement(input.file)),

  /** Step 2: detect subscriptions and store them as pending detected subscriptions. */
  scan: protectedProcedure
    .input(z.object({ file: importFileSchema, options: scanOptionsSchema }))
    .mutation(({ input, ctx }) =>
      scanStatement(ctx.db, ctx.session.user.id, input.file, input.options),
    ),

  /** The newest scan's items with totals recomputed from the current decisions, or null. */
  latest: protectedProcedure.query(({ ctx }) => latestScan(ctx.db, ctx.session.user.id)),

  /** Step 3: apply the user's decisions; per-item failures are returned, not thrown. */
  confirm: protectedProcedure
    .input(z.object({ decisions: z.array(decisionSchema).min(1).max(MAX_SCAN_DECISIONS) }))
    .mutation(({ input, ctx }) =>
      confirmScanDecisions(ctx.db, ctx.session.user.id, input.decisions),
    ),
});
