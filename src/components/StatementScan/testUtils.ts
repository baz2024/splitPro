import { createInstance } from 'i18next';

import common from '../../../public/locales/en/common.json';
import statementscan from '../../../public/locales/en/statementscan.json';
import config from '../../../next-i18next.config.js';
import { type ScanListItem } from './types';

/** English translator with ICU plurals, matching the app's real message format. */
export const scanTestI18n = createInstance();
config.onPreInitI18next?.(scanTestI18n);
void scanTestI18n.init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['statementscan', 'common'],
  defaultNS: 'statementscan',
  initAsync: false,
  interpolation: { escapeValue: false },
  resources: { en: { common, statementscan } },
  i18nFormat: config.i18nFormat,
});

export const useScanTestTranslation = (namespace: string | string[] = 'statementscan') => ({
  t: scanTestI18n.getFixedT('en', namespace),
  ready: true,
  i18n: scanTestI18n,
});

/** Text without the Unicode isolates that wrap amounts and dates inside sentences. */
export const plainText = (element: Element | null) =>
  (element?.textContent ?? '').replace(/[⁦-⁩]/g, '');

export const makeScanItem = (overrides: Partial<ScanListItem> = {}): ScanListItem => ({
  id: 'item-1',
  status: 'PENDING',
  fingerprint: 'statement:figma:USD:monthly',
  vendor: { vendorId: 'figma', name: 'Figma', category: 'software', known: true },
  rawDescriptions: ['FIGMA.COM SAN FRANCISCO'],
  currency: 'USD',
  cadence: 'monthly',
  amountMinor: 2000n,
  previousAmountMinor: null,
  firstSeen: { year: 2025, month: 3, day: 4 },
  lastCharged: { year: 2026, month: 10, day: 4 },
  nextRenewal: { year: 2026, month: 12, day: 4 },
  chargeCount: 20,
  yearlyMinor: 24000n,
  atRiskYearlyMinor: 0n,
  flags: [],
  duplicateOf: null,
  confidence: 'high',
  source: 'statement',
  ...overrides,
});
