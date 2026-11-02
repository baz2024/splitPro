import { z } from 'zod';

import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { commitImport, inspectUpload, previewImport, runExport } from '~/server/dataio/service';
import {
  MAX_IMPORT_ROWS,
  exportInputSchema,
  importFileSchema,
  importOptionsSchema,
} from '~/server/dataio/types';

/** CSV / Excel export and import of expenses ("Import & export" page). */
export const dataioRouter = createTRPCRouter({
  /** Builds the file on the server and returns it gzipped + base64 for the browser to save. */
  exportExpenses: protectedProcedure
    .input(exportInputSchema)
    .mutation(({ input, ctx }) => runExport(ctx.session.user.id, input)),

  /** Step 1: read the upload, detect its format and guess the column mapping. */
  inspectImport: protectedProcedure
    .input(z.object({ file: importFileSchema }))
    .mutation(({ input }) => inspectUpload(input.file)),

  /** Step 3: validate every row and flag likely duplicates. Nothing is written. */
  previewImport: protectedProcedure
    .input(z.object({ file: importFileSchema, options: importOptionsSchema }))
    .mutation(({ input, ctx }) => previewImport(ctx.session.user.id, input.file, input.options)),

  /** Step 4: re-validate on the server and write the selected rows in batched transactions. */
  commitImport: protectedProcedure
    .input(
      z.object({
        file: importFileSchema,
        options: importOptionsSchema,
        include: z.array(z.number().int().min(0).max(MAX_IMPORT_ROWS)).max(MAX_IMPORT_ROWS),
      }),
    )
    .mutation(({ input, ctx }) =>
      commitImport(ctx.session.user.id, input.file, input.options, input.include),
    ),
});
