import { CATEGORIES, type CategoryItem, type CategorySection } from '~/lib/category';

export const RECEIPT_FIELDS = ['merchant', 'amount', 'currency', 'date', 'category'] as const;

export type ReceiptField = (typeof RECEIPT_FIELDS)[number];

export interface ReceiptScanResult {
  merchant: string | null;
  /** Decimal string such as "20.00" */
  amount: string | null;
  /** ISO 4217 code */
  currency: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  /** One of the app's category keys when possible */
  category: string | null;
  lowConfidenceFields: ReceiptField[];
  /** Short human warning, e.g. "Tax looked blurry" */
  note: string | null;
}

const isCategorySection = (key: string): key is CategorySection => key in CATEGORIES;

const SECTIONS: CategorySection[] = Object.keys(CATEGORIES).filter(isCategorySection);

/** Every category key the app stores on an expense: section names plus non-"other" items. */
export const RECEIPT_CATEGORY_KEYS: CategoryItem[] = [
  ...SECTIONS,
  ...SECTIONS.flatMap((section) =>
    CATEGORIES[section].filter((item): item is Exclude<typeof item, 'other'> => 'other' !== item),
  ),
];

/** Loose synonyms the model may return instead of the exact key. */
const CATEGORY_SYNONYMS: Record<string, CategoryItem> = {
  restaurant: 'diningOut',
  restaurants: 'diningOut',
  dining: 'diningOut',
  cafe: 'diningOut',
  coffee: 'diningOut',
  bar: 'diningOut',
  takeaway: 'diningOut',
  grocery: 'groceries',
  supermarket: 'groceries',
  alcohol: 'liquor',
  pharmacy: 'medical',
  health: 'medical',
  taxi: 'taxi',
  rideshare: 'taxi',
  uber: 'taxi',
  petrol: 'fuel',
  gasoline: 'fuel',
  flight: 'plane',
  airline: 'plane',
  lodging: 'hotel',
  accommodation: 'hotel',
  cinema: 'movies',
  transport: 'travel',
  transportation: 'travel',
  shopping: 'general',
  misc: 'general',
  miscellaneous: 'general',
  other: 'general',
};

const normaliseKey = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');

const CATEGORY_LOOKUP = new Map<string, CategoryItem>([
  ...Object.entries(CATEGORY_SYNONYMS).map(([key, item]) => [normaliseKey(key), item] as const),
  ...RECEIPT_CATEGORY_KEYS.map((item) => [normaliseKey(item), item] as const),
]);

export const mapReceiptCategory = (value: unknown): CategoryItem | null => {
  if ('string' !== typeof value) {
    return null;
  }
  return CATEGORY_LOOKUP.get(normaliseKey(value)) ?? null;
};

const cleanString = (value: unknown, maxLength: number): string | null => {
  if ('string' !== typeof value) {
    return null;
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if ('' === trimmed || 'null' === trimmed.toLowerCase()) {
    return null;
  }
  return trimmed.slice(0, maxLength);
};

/**
 * Turns "1.234,56", "$20", "20.5" or 20.5 into a two-decimal string ("1234.56", "20.00", "20.50").
 * Uses string arithmetic only, so no floating point rounding creeps in.
 */
export const normaliseReceiptAmount = (value: unknown): string | null => {
  const raw = 'number' === typeof value && Number.isFinite(value) ? String(value) : value;
  if ('string' !== typeof raw) {
    return null;
  }

  let digits = raw.replace(/[^\d.,]/g, '');
  if ('' === digits) {
    return null;
  }

  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');
  const decimalIndex = Math.max(lastDot, lastComma);
  const decimalsAfter = -1 === decimalIndex ? 0 : digits.length - decimalIndex - 1;

  // A separator followed by exactly three digits with no other separator is a thousands mark.
  const separatorCount = (digits.match(/[.,]/g) ?? []).length;
  const isThousandsOnly = 1 === separatorCount && 3 === decimalsAfter;

  if (-1 === decimalIndex || isThousandsOnly || 0 === decimalsAfter) {
    digits = digits.replace(/[.,]/g, '');
    return /^\d+$/.test(digits) ? `${BigInt(digits).toString()}.00` : null;
  }

  const whole = digits.slice(0, decimalIndex).replace(/[.,]/g, '') || '0';
  const fraction = digits.slice(decimalIndex + 1);
  if (!/^\d+$/.test(whole) || !/^\d+$/.test(fraction)) {
    return null;
  }

  const cents = `${fraction}00`.slice(0, 2);
  return `${BigInt(whole).toString()}.${cents}`;
};

export const normaliseReceiptCurrency = (value: unknown): string | null => {
  const cleaned = cleanString(value, 8)?.toUpperCase();
  return cleaned && /^[A-Z]{3}$/.test(cleaned) ? cleaned : null;
};

export const normaliseReceiptDate = (value: unknown): string | null => {
  const cleaned = cleanString(value, 32);
  if (!cleaned) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(cleaned);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
    return null;
  }
  return iso;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  null !== value && 'object' === typeof value && !Array.isArray(value);

const isReceiptField = (value: unknown): value is ReceiptField =>
  'string' === typeof value && (RECEIPT_FIELDS as readonly string[]).includes(value);

/**
 * Normalises the model's raw JSON into the receipt.scan contract. Accepts anything; never throws.
 * A field the model returned but we could not parse is dropped to null and flagged low confidence.
 */
export const normaliseReceiptScan = (raw: unknown): ReceiptScanResult => {
  const input: Record<string, unknown> = isRecord(raw) ? raw : {};

  const merchant = cleanString(input.merchant, 120);
  const amount = normaliseReceiptAmount(input.amount);
  const currency = normaliseReceiptCurrency(input.currency);
  const date = normaliseReceiptDate(input.date);
  const category = mapReceiptCategory(input.category);

  const parsed: Record<ReceiptField, string | null> = {
    merchant,
    amount,
    currency,
    date,
    category,
  };

  const reported = Array.isArray(input.lowConfidenceFields)
    ? input.lowConfidenceFields.filter(isReceiptField)
    : [];
  const unparsed = RECEIPT_FIELDS.filter(
    (field) =>
      null === parsed[field] &&
      null !== input[field] &&
      undefined !== input[field] &&
      // An unknown category is not a reading problem; it just falls back to the default.
      'category' !== field,
  );
  const flagged = new Set<ReceiptField>([...reported, ...unparsed]);

  return {
    ...parsed,
    lowConfidenceFields: RECEIPT_FIELDS.filter((field) => flagged.has(field)),
    note: cleanString(input.note, 160),
  };
};

/** Parses the model's text block (JSON, optionally wrapped in a code fence) and normalises it. */
export const parseReceiptScanText = (text: string): ReceiptScanResult => {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return normaliseReceiptScan(JSON.parse(unfenced));
  } catch {
    return normaliseReceiptScan(null);
  }
};
