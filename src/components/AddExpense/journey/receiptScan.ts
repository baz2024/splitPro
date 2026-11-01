import { CATEGORIES } from '~/lib/category';
import { type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import { type ReviewField, parseReviewReasons } from '~/lib/expenseReview';
import { api } from '~/utils/api';

export const SCAN_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export type ScanMimeType = (typeof SCAN_MIME_TYPES)[number];

export const SCAN_FIELDS = ['merchant', 'amount', 'currency', 'date', 'category'] as const;
export type ScanField = (typeof SCAN_FIELDS)[number];

export interface ReceiptScanResult {
  merchant: string | null;
  amount: string | null;
  currency: string | null;
  date: string | null;
  category: string | null;
  tax: string | null;
  lowConfidenceFields: ScanField[];
  /** Model-reported confidence per field (0–1), null when not reported. */
  confidence: Record<ScanField | 'tax', number | null>;
  /** Reason codes saved on the expense as the "Review" flag (see ~/lib/expenseReview). */
  reviewReasons: string[];
  note: string | null;
}

/** Client hook for the `receipt.scan` tRPC procedure (src/server/api/routers/receipt.ts). */
export const useReceiptScanMutation = () => api.receipt.scan.useMutation();

export const toScanMimeType = (type: string): ScanMimeType | null => {
  const normalized =
    'image/jpg' === type ? 'image/jpeg' : 'image/heif' === type ? 'image/heic' : type;
  return SCAN_MIME_TYPES.find((mime) => mime === normalized) ?? null;
};

export const fileToBase64 = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = 'string' === typeof reader.result ? reader.result : '';
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });

const CATEGORY_KEYS: readonly string[] = Object.entries(CATEGORIES).flatMap(([section, items]) =>
  [section].concat(items.filter((item) => 'other' !== item)),
);

export const parseScanCategory = (category: string | null): string | null =>
  category && CATEGORY_KEYS.includes(category) ? category : null;

export const parseScanCurrency = (currency: string | null): CurrencyCode | null => {
  const upper = currency?.trim().toUpperCase();
  return isCurrencyCode(upper) ? upper : null;
};

/** Parses a YYYY-MM-DD string into a local date; returns null for invalid dates. */
export const parseScanDate = (date: string | null): Date | null => {
  const match = date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
  if (!match) {
    return null;
  }
  const [, year, month, day] = match.map(Number);
  if (undefined === year || undefined === month || undefined === day) {
    return null;
  }
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime()) || parsed.getMonth() !== month - 1) {
    return null;
  }
  return parsed;
};

const REVIEW_FIELD_TO_SCAN_FIELD: Partial<Record<ReviewField, ScanField>> = {
  merchant: 'merchant',
  total: 'amount',
  currency: 'currency',
  date: 'date',
  category: 'category',
};

/**
 * Fields the scan confirmation card highlights in amber: the ones the scan flagged or could not
 * read, plus any the stored review reasons name (confidence below the threshold).
 */
export const confirmationFlags = (
  fields: readonly ScanField[],
  reviewReasons: readonly string[],
): Set<ScanField> =>
  new Set([
    ...fields,
    ...parseReviewReasons(reviewReasons).flatMap((reason) => {
      const field = 'field' === reason.kind ? REVIEW_FIELD_TO_SCAN_FIELD[reason.field] : undefined;
      return field ? [field] : [];
    }),
  ]);

/** Parses the decimal string returned by the scan ("20.00") into a JS number, or null. */
export const parseScanAmount = (amount: string | null): number | null => {
  if (!amount || !/^\d+(\.\d+)?$/.test(amount.trim())) {
    return null;
  }
  const value = parseFloat(amount);
  return Number.isFinite(value) && 0 < value ? value : null;
};
