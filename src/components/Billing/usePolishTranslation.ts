import { useTranslation } from 'next-i18next';

import arPolish from '@/public/locales/ar/polish.json';
import enPolish from '@/public/locales/en/polish.json';

export const POLISH_NS = 'polish';

const BUNDLES: Record<string, Record<string, unknown>> = { en: enPolish, ar: arPolish };

/**
 * `t` for the small `polish` namespace. The synced marker shows on expense pages that only load
 * `common`, so the en/ar catalogues ship with the component (same approach as
 * `useReviewTranslation`). Other languages fall back to English.
 */
export const usePolishTranslation = () => {
  const { i18n } = useTranslation();

  Object.entries(BUNDLES).forEach(([lng, bundle]) => {
    if (!i18n.hasResourceBundle(lng, POLISH_NS)) {
      i18n.addResourceBundle(lng, POLISH_NS, bundle, true, false);
    }
  });

  const lng = i18n.hasResourceBundle(i18n.language, POLISH_NS) ? i18n.language : 'en';
  return { t: i18n.getFixedT(lng, POLISH_NS), i18n };
};
