/**
 * "Review" flag on expenses: turns receipt-scan confidence into short reason codes that are
 * stored on `Expense.reviewReasons` and rendered (translated) on the expense detail screen.
 *
 * Stored reason formats (stable, so old rows keep rendering):
 * - `field:<ReviewField>`  a receipt field the AI was unsure about
 * - `scan:skipped`         the user left the reading screen before the AI finished
 * - `note:<text>`          the AI's own short warning, e.g. "Tax looked blurry"
 */

export const REVIEW_FIELDS = ['merchant', 'total', 'date', 'category', 'currency', 'tax'] as const;
export type ReviewField = (typeof REVIEW_FIELDS)[number];

/** Confidence (0–1) below this is treated as "unsure" and flags the expense for review. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.8;

export const MAX_REVIEW_REASONS = 12;
export const MAX_REVIEW_NOTE_LENGTH = 160;

export const REVIEW_SCAN_SKIPPED = 'scan:skipped';

export type FieldConfidence = Partial<Record<ReviewField, number | null>>;

export type ReviewReason =
  | { kind: 'field'; field: ReviewField }
  | { kind: 'skipped' }
  | { kind: 'note'; text: string };

const isReviewField = (value: string): value is ReviewField =>
  (REVIEW_FIELDS as readonly string[]).includes(value);

/** Clamps a model-reported confidence into 0–1; anything non-numeric is "not reported". */
export const normaliseConfidence = (value: unknown): number | null => {
  if ('number' !== typeof value || !Number.isFinite(value)) {
    return null;
  }
  // Some models answer in percent.
  const scaled = 1 < value && 100 >= value ? value / 100 : value;
  return Math.min(1, Math.max(0, scaled));
};

/** Fields whose reported confidence is below the threshold, in canonical order. */
export const lowConfidenceReviewFields = (
  confidence: FieldConfidence,
  threshold: number = REVIEW_CONFIDENCE_THRESHOLD,
): ReviewField[] =>
  REVIEW_FIELDS.filter((field) => {
    const value = confidence[field];
    return null !== value && undefined !== value && value < threshold;
  });

/**
 * Builds the stored reason list from per-field confidence, fields the model or parser flagged
 * directly, the model's note, and whether the user skipped the reading screen. De-duplicated,
 * canonical order, capped.
 */
export const buildReviewReasons = ({
  confidence = {},
  flaggedFields = [],
  note = null,
  skipped = false,
  threshold = REVIEW_CONFIDENCE_THRESHOLD,
}: {
  confidence?: FieldConfidence;
  flaggedFields?: readonly ReviewField[];
  note?: string | null;
  skipped?: boolean;
  threshold?: number;
}): string[] => {
  const unsure = new Set<ReviewField>([
    ...lowConfidenceReviewFields(confidence, threshold),
    ...flaggedFields,
  ]);
  const cleanNote = note?.trim().replace(/\s+/g, ' ').slice(0, MAX_REVIEW_NOTE_LENGTH) ?? '';

  return [
    ...(skipped ? [REVIEW_SCAN_SKIPPED] : []),
    ...REVIEW_FIELDS.filter((field) => unsure.has(field)).map((field) => `field:${field}`),
    ...('' === cleanNote ? [] : [`note:${cleanNote}`]),
  ].slice(0, MAX_REVIEW_REASONS);
};

/** Parses one stored reason; unknown formats return null so the UI can skip them. */
export const parseReviewReason = (reason: string): ReviewReason | null => {
  if (REVIEW_SCAN_SKIPPED === reason) {
    return { kind: 'skipped' };
  }
  if (reason.startsWith('field:')) {
    const field = reason.slice('field:'.length);
    return isReviewField(field) ? { kind: 'field', field } : null;
  }
  if (reason.startsWith('note:')) {
    const text = reason.slice('note:'.length).trim();
    return '' === text ? null : { kind: 'note', text };
  }
  return null;
};

export const parseReviewReasons = (reasons: readonly string[]): ReviewReason[] =>
  reasons.map(parseReviewReason).filter((reason): reason is ReviewReason => null !== reason);

/** Server-side guard for client-supplied reasons: keeps only well-formed ones. */
export const sanitizeReviewReasons = (reasons: readonly string[] | undefined): string[] =>
  [
    ...new Set(
      (reasons ?? [])
        .map((reason) => reason.trim())
        .filter((reason) => null !== parseReviewReason(reason))
        .map((reason) =>
          reason.startsWith('note:')
            ? reason.slice(0, 'note:'.length + MAX_REVIEW_NOTE_LENGTH)
            : reason,
        ),
    ),
  ].slice(0, MAX_REVIEW_REASONS);
