import arCategories from '@/public/locales/ar/categories.json';
import arDataio from '@/public/locales/ar/dataio.json';
import enCategories from '@/public/locales/en/categories.json';
import enDataio from '@/public/locales/en/dataio.json';

import {
  CATEGORIES,
  type CategoryItem,
  type CategorySection,
  DEFAULT_CATEGORY,
} from '~/lib/category';
import { findService } from '~/lib/serviceCatalog';

import { type ExportColumn } from './types';

/** Locales that ship export labels; others fall back to English. */
export type DataioLocale = 'en' | 'ar';

export const toDataioLocale = (locale: string | undefined): DataioLocale =>
  locale?.toLowerCase().startsWith('ar') ? 'ar' : 'en';

interface CategoryCatalog {
  categories_list: Record<string, { name: string; items: Record<string, string> }>;
}

const CATEGORY_CATALOGS: Record<DataioLocale, CategoryCatalog> = {
  en: enCategories,
  ar: arCategories,
};

const DATAIO_CATALOGS = { en: enDataio, ar: arDataio } as const;

export interface ExportLabels {
  locale: DataioLocale;
  columns: Record<ExportColumn, string>;
  yes: string;
  no: string;
  you: string;
  cadence: Record<'weekly' | 'monthly' | 'yearly' | 'other', string>;
  summary: (typeof enDataio)['summary'];
}

export const getExportLabels = (locale: DataioLocale): ExportLabels => {
  const catalog = DATAIO_CATALOGS[locale];
  return {
    locale,
    columns: catalog.columns,
    yes: catalog.values.yes,
    no: catalog.values.no,
    you: catalog.values.you,
    cadence: catalog.cadence,
    summary: catalog.summary,
  };
};

const SECTIONS = Object.keys(CATEGORIES).filter((key): key is CategorySection =>
  Object.hasOwn(CATEGORIES, key),
);

/** Every stored category key: section names plus their items (except the generic "other"). */
export const CATEGORY_KEYS: ReadonlySet<string> = new Set<string>([
  ...SECTIONS,
  ...SECTIONS.flatMap((section) => CATEGORIES[section].filter((item: string) => 'other' !== item)),
]);

const isCategoryItem = (value: string): value is CategoryItem => CATEGORY_KEYS.has(value);

const sectionOf = (key: string): CategorySection | undefined =>
  SECTIONS.find((section) => (CATEGORIES[section] as readonly string[]).includes(key));

/** Localised category label, matching what the app shows. */
export const categoryLabel = (key: string, locale: DataioLocale): string => {
  const list = CATEGORY_CATALOGS[locale].categories_list;
  const fallback = CATEGORY_CATALOGS.en.categories_list;
  if (Object.hasOwn(CATEGORIES, key)) {
    return list[key]?.items.other ?? list[key]?.name ?? fallback[key]?.name ?? key;
  }
  const section = sectionOf(key);
  if (!section) {
    return key;
  }
  return list[section]?.items[key] ?? fallback[section]?.items[key] ?? key;
};

/** Lowercase, strip Arabic diacritics/tatweel, unify alef/yaa/taa marbuta, collapse spaces. */
export const normaliseText = (value: string): string =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u064b-\u0652\u0670\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\u0649/g, '\u064a')
    .replace(/\u0629/g, '\u0647')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Normalised label (en + ar, item and section names) → category key. */
const LABEL_TO_KEY: ReadonlyMap<string, CategoryItem> = new Map(
  Object.values(CATEGORY_CATALOGS).flatMap((catalog) =>
    SECTIONS.flatMap((section) => {
      const entry = catalog.categories_list[section];
      if (!entry) {
        return [];
      }
      const sectionEntry: [string, CategoryItem] = [normaliseText(entry.name), section];
      return Object.entries(entry.items).reduce<[string, CategoryItem][]>(
        (acc, [item, label]) => {
          acc.push([
            normaliseText(label),
            'other' === item || !isCategoryItem(item) ? section : item,
          ]);
          return acc;
        },
        [sectionEntry],
      );
    }),
  ),
);

/**
 * Resolve an imported category: by stored key, then by localised label (English or Arabic),
 * then by a known service name in the label or description, else the default category.
 */
export const resolveCategory = ({
  key,
  label,
  description,
}: {
  key?: string | null;
  label?: string | null;
  description?: string | null;
}): CategoryItem => {
  const trimmedKey = key?.trim() ?? '';
  if (isCategoryItem(trimmedKey)) {
    return trimmedKey;
  }
  const rawLabel = label?.trim() ?? '';
  if (isCategoryItem(rawLabel)) {
    return rawLabel;
  }
  const byLabel = '' === rawLabel ? undefined : LABEL_TO_KEY.get(normaliseText(rawLabel));
  if (byLabel) {
    return byLabel;
  }
  const service = findService(rawLabel) ?? findService(description);
  return service?.category ?? DEFAULT_CATEGORY;
};
