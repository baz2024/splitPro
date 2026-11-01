import arDataio from '@/public/locales/ar/dataio.json';
import enDataio from '@/public/locales/en/dataio.json';

import { normaliseText } from './labels';
import { IMPORT_FIELDS, type ImportField, type ImportFormat, type ImportMapping } from './types';

/** Extra header names seen in bank statements, Splitwise and spreadsheets (en + ar). */
const EXTRA_SYNONYMS: Record<ImportField, readonly string[]> = {
  date: [
    'transaction date',
    'booking date',
    'posted date',
    'posting date',
    'value date',
    'expense date',
    'تاريخ',
    'تاريخ العملية',
    'تاريخ المعاملة',
    'تاريخ الحركة',
  ],
  description: [
    'name',
    'details',
    'memo',
    'narrative',
    'payee',
    'merchant',
    'title',
    'transaction',
    'البيان',
    'التفاصيل',
    'الاسم',
    'التاجر',
  ],
  amount: [
    'cost',
    'value',
    'total',
    'price',
    'debit',
    'sum',
    'القيمه',
    'الاجمالي',
    'التكلفه',
    'مدين',
  ],
  currency: ['ccy', 'currency code'],
  category: ['type', 'التصنيف'],
  categoryKey: [],
  notes: ['note', 'comment', 'comments', 'ملاحظه'],
  needsReview: [],
  expenseId: ['id'],
};

/** Fields with longer names first so "category key" is not taken by "category". */
const MATCH_ORDER: readonly ImportField[] = [
  'categoryKey',
  'expenseId',
  'needsReview',
  'date',
  'description',
  'amount',
  'currency',
  'category',
  'notes',
];

const SYNONYMS = new Map<ImportField, readonly string[]>(
  IMPORT_FIELDS.map((field) => [
    field,
    [
      ...new Set(
        [enDataio.columns[field], arDataio.columns[field], ...EXTRA_SYNONYMS[field]].map(
          normaliseText,
        ),
      ),
    ],
  ]),
);

const containsWord = (header: string, word: string) =>
  ` ${header} `.includes(` ${word} `) && 2 < word.length;

/** Guess which column holds each field from header names (English or Arabic). */
export const guessMapping = (headers: readonly string[]): ImportMapping => {
  const normalised = headers.map(normaliseText);
  const taken = new Set<number>();
  const pick = (
    predicate: (header: string, synonyms: readonly string[]) => boolean,
    start: ImportMapping,
  ) =>
    MATCH_ORDER.reduce<ImportMapping>(
      (acc, field) => {
        if (undefined !== acc[field]) {
          return acc;
        }
        const index = normalised.findIndex(
          (header, i) => !taken.has(i) && predicate(header, SYNONYMS.get(field) ?? []),
        );
        if (-1 !== index) {
          taken.add(index);
          acc[field] = index;
        }
        return acc;
      },
      { ...start },
    );
  const exact = pick((header, synonyms) => synonyms.includes(header), {});
  const loose = pick(
    (header, synonyms) =>
      synonyms.some((synonym) => 'id' !== synonym && containsWord(header, synonym)),
    exact,
  );
  return IMPORT_FIELDS.reduce<ImportMapping>((acc, field) => {
    acc[field] = loose[field] ?? null;
    return acc;
  }, {});
};

const SPLITWISE_HEADERS = ['date', 'description', 'category', 'cost', 'currency'];

const SAFI_ID_HEADERS = new Set(
  [enDataio.columns.expenseId, arDataio.columns.expenseId].map(normaliseText),
);
const SAFI_KEY_HEADERS = new Set(
  [enDataio.columns.categoryKey, arDataio.columns.categoryKey].map(normaliseText),
);

export const detectFormat = (headers: readonly string[]): ImportFormat => {
  const normalised = headers.map(normaliseText);
  if (
    normalised.some((header) => SAFI_ID_HEADERS.has(header)) &&
    normalised.some((header) => SAFI_KEY_HEADERS.has(header))
  ) {
    return 'safi';
  }
  if (SPLITWISE_HEADERS.every((header, index) => normalised[index] === header)) {
    return 'splitwise';
  }
  return 'generic';
};
