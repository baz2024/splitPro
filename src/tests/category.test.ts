import arCategories from '../../public/locales/ar/categories.json';
import enCategories from '../../public/locales/en/categories.json';

import { CATEGORIES, type CategorySection } from '~/lib/category';
import { RECEIPT_CATEGORY_KEYS, mapReceiptCategory } from '~/lib/receiptScan';
import { CategoryIcons } from '~/components/ui/categoryIcons';

interface CategoryLocale {
  categories_list: Record<string, { name: string; items: Record<string, string> }>;
}

const SECTIONS = Object.keys(CATEGORIES) as CategorySection[];

const expectTranslated = (locale: CategoryLocale, section: CategorySection) => {
  const translated = locale.categories_list[section];
  expect(translated?.name).toBeTruthy();
  CATEGORIES[section].forEach((item: string) => {
    expect(translated?.items[item]).toBeTruthy();
  });
};

describe('CATEGORIES', () => {
  describe('tech section', () => {
    it('should list the Tech & AI items in order', () => {
      expect(CATEGORIES.tech).toEqual([
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
      ]);
    });

    it('should expose the tech keys to the receipt scanner', () => {
      expect(RECEIPT_CATEGORY_KEYS).toEqual(
        expect.arrayContaining(['tech', 'aiApis', 'codingAgents', 'saas']),
      );
    });

    it('should map vendor names to tech categories', () => {
      expect(mapReceiptCategory('OpenAI')).toBe('aiApis');
      expect(mapReceiptCategory('Fly.io')).toBe('cloudHosting');
      expect(mapReceiptCategory('GitHub Copilot')).toBe('codingAgents');
      expect(mapReceiptCategory('codingAgents')).toBe('codingAgents');
    });
  });

  describe('translations', () => {
    it.each(SECTIONS)('should have English names for every %s key', (section) => {
      expectTranslated(enCategories, section);
    });

    it('should have Arabic names for the tech section', () => {
      expectTranslated(arCategories, 'tech');
    });
  });

  describe('icons', () => {
    it('should have an icon for every stored category key', () => {
      RECEIPT_CATEGORY_KEYS.forEach((key) => {
        expect(CategoryIcons[key]).toBeDefined();
      });
    });
  });
});
