import { useTranslation } from 'next-i18next';

import arReview from '@/public/locales/ar/review.json';
import enReview from '@/public/locales/en/review.json';

export const REVIEW_NS = 'review';

const BUNDLES: Record<string, Record<string, unknown>> = { en: enReview, ar: arReview };

/**
 * `t` for the small `review` namespace. The chip and reasons card appear on many pages
 * (groups, balances, projects, expense details, add), so instead of adding the namespace to
 * every page's server-side translations, the en/ar catalogues ship with this component and are
 * registered on the active i18next instance once. Other languages fall back to English until
 * Weblate adds `review.json` for them (then add it to the pages that need it).
 */
export const useReviewTranslation = () => {
  const { i18n } = useTranslation();

  Object.entries(BUNDLES).forEach(([lng, bundle]) => {
    if (!i18n.hasResourceBundle(lng, REVIEW_NS)) {
      i18n.addResourceBundle(lng, REVIEW_NS, bundle, true, false);
    }
  });

  const lng = i18n.hasResourceBundle(i18n.language, REVIEW_NS) ? i18n.language : 'en';
  return { t: i18n.getFixedT(lng, REVIEW_NS), i18n };
};
