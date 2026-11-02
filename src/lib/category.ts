export const CATEGORIES = {
  entertainment: ['games', 'movies', 'music', 'sports', 'other'],
  food: ['diningOut', 'groceries', 'liquor', 'other'],
  home: [
    'electronics',
    'furniture',
    'supplies',
    'maintenance',
    'mortgage',
    'pets',
    'rent',
    'services',
    'other',
  ],
  life: ['childcare', 'clothing', 'education', 'gifts', 'insurance', 'medical', 'taxes', 'other'],
  travel: ['bicycle', 'bus', 'train', 'car', 'fuel', 'hotel', 'parking', 'plane', 'taxi', 'other'],
  utilities: ['cleaning', 'electricity', 'gas', 'internet', 'trash', 'phone', 'water', 'other'],
  tech: [
    'aiApis',
    'codingAgents',
    'cloudHosting',
    'databases',
    'devTools',
    'domains',
    'monitoring',
    'messagingApis',
    'saas',
    'other',
  ],
  general: ['other'],
} as const satisfies Record<string, string[]>;

export const DEFAULT_CATEGORY = 'general';

export type CategorySection = keyof typeof CATEGORIES;

type CategoryValues = (typeof CATEGORIES)[CategorySection][number];
type CategoryWithoutOther = Exclude<CategoryValues, 'other'>;

export type CategoryItem = CategoryWithoutOther | CategorySection;

const CATEGORY_SECTIONS = Object.keys(CATEGORIES).filter((key): key is CategorySection =>
  Object.hasOwn(CATEGORIES, key),
);

/**
 * Translation key (in the `categories` namespace) for a stored category value: a section name
 * ("food") reads as its "other" item, an item ("groceries") as itself; unknown values get null.
 */
export const getCategoryLabelKey = (category: string): string | null => {
  if (Object.hasOwn(CATEGORIES, category)) {
    return `categories_list.${category}.items.other`;
  }
  if ('other' === category) {
    return null;
  }
  const section = CATEGORY_SECTIONS.find((entry) =>
    (CATEGORIES[entry] as readonly string[]).includes(category),
  );
  return section ? `categories_list.${section}.items.${category}` : null;
};
