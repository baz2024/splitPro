import { z } from 'zod';

/** Limits shared by the client (early checks) and the server (authoritative checks). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_COLUMNS = 60;
/** Gzipped + base64 upload must fit under the 4 MB tRPC body limit (with JSON overhead). */
export const MAX_UPLOAD_BASE64_LENGTH = 3_800_000;
export const MAX_EXPORT_ROWS = 20_000;
export const IMPORT_BATCH_SIZE = 250;

export const EXPORT_COLUMNS = [
  'date',
  'description',
  'category',
  'categoryKey',
  'amount',
  'currency',
  'paidBy',
  'yourShare',
  'splitType',
  'project',
  'participants',
  'recurring',
  'notes',
  'needsReview',
  'expenseId',
] as const;
export type ExportColumn = (typeof EXPORT_COLUMNS)[number];

/** Columns the importer can read. The rest of an export (paid by, share, …) is informational. */
export const IMPORT_FIELDS = [
  'date',
  'description',
  'amount',
  'currency',
  'category',
  'categoryKey',
  'notes',
  'needsReview',
  'expenseId',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export const REQUIRED_IMPORT_FIELDS = ['date', 'description', 'amount'] as const;

export type ImportMapping = Partial<Record<ImportField, number | null>>;

export const IMPORT_FORMATS = ['safi', 'splitwise', 'generic'] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const DATE_FORMATS = ['DMY', 'MDY', 'ISO'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** `negative`: bank style, spending is negative and credits are income (skipped). */
export const AMOUNT_SIGNS = ['positive', 'negative'] as const;
export type AmountSign = (typeof AMOUNT_SIGNS)[number];

export const ISSUE_CODES = [
  'missing_date',
  'invalid_date',
  'missing_description',
  'description_too_long',
  'missing_amount',
  'invalid_amount',
  'too_many_decimals',
  'zero_amount',
  'refund',
  'income',
  'invalid_currency',
  'settlement',
  'summary_row',
  'duplicate_id',
  'duplicate_details',
  'not_selected',
  'database_error',
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

export type DuplicateKind = 'duplicate_id' | 'duplicate_details';

export interface PreviewRow {
  /** 0-based index among data rows (header excluded). */
  index: number;
  /** 1-based row number in the file, header included, for the error report. */
  line: number;
  date: string | null;
  description: string;
  amount: string | null;
  currency: string;
  category: string;
  notes: string | null;
  status: 'ok' | 'skip' | 'error';
  issues: IssueCode[];
  duplicate: DuplicateKind | null;
}

export interface ImportOutcomeRow {
  line: number;
  description: string;
  reason: IssueCode;
}

export interface ImportResult {
  imported: number;
  skipped: ImportOutcomeRow[];
  failed: ImportOutcomeRow[];
}

const columnIndex = z.number().int().min(0).max(MAX_IMPORT_COLUMNS).nullable().optional();

export const importMappingSchema = z.object({
  date: columnIndex,
  description: columnIndex,
  amount: columnIndex,
  currency: columnIndex,
  category: columnIndex,
  categoryKey: columnIndex,
  notes: columnIndex,
  needsReview: columnIndex,
  expenseId: columnIndex,
}) satisfies z.ZodType<ImportMapping>;

export const importTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('personal') }),
  z.object({
    type: z.literal('group'),
    groupId: z.number().int().positive(),
    split: z.enum(['equal', 'me']),
  }),
]);
export type ImportTarget = z.infer<typeof importTargetSchema>;

export const importFileSchema = z.object({
  name: z.string().min(1).max(200),
  gzipBase64: z.string().min(1).max(MAX_UPLOAD_BASE64_LENGTH),
});

export const importOptionsSchema = z.object({
  mapping: importMappingSchema,
  dateFormat: z.enum(DATE_FORMATS),
  defaultCurrency: z.string().length(3),
  amountSign: z.enum(AMOUNT_SIGNS),
  target: importTargetSchema,
  timeZone: z.string().min(1).max(64),
});
export type ImportOptions = z.infer<typeof importOptionsSchema>;

export const exportScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('group'), groupId: z.number().int().positive() }),
  z.object({ type: z.literal('friend'), friendId: z.number().int().positive() }),
]);
export type ExportScope = z.infer<typeof exportScopeSchema>;

export const exportInputSchema = z.object({
  scope: exportScopeSchema,
  from: z.date().nullable(),
  to: z.date().nullable(),
  format: z.enum(['csv', 'xlsx']),
  locale: z.string().max(20),
  timeZone: z.string().min(1).max(64),
});
export type ExportInput = z.infer<typeof exportInputSchema>;
