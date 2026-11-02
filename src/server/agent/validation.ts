import { z } from 'zod';

import { CURRENCIES, isCurrencyCode } from '~/lib/currency';

/** Category keys for the `tech` section; other agents (UI, skill) depend on these exact keys. */
export const TECH_CATEGORY_KEYS = [
  'aiApis',
  'codingAgents',
  'cloudHosting',
  'databases',
  'devTools',
  'domains',
  'monitoring',
  'messagingApis',
  'saas',
] as const;

export type TechCategoryKey = (typeof TECH_CATEGORY_KEYS)[number];

export const DEFAULT_TECH_CATEGORY: TechCategoryKey = 'saas';

export const MAX_EVIDENCE_ITEMS = 20;
export const MAX_EVIDENCE_LENGTH = 300;
export const MAX_REQUEST_BYTES = 32 * 1024;

const DECIMAL_AMOUNT_REGEX = /^\d{1,12}(\.\d{1,6})?$/;

const httpsUrl = z
  .string()
  .max(2000)
  .url()
  .refine((value) => value.startsWith('https://'), { message: 'pricingUrl must use https' });

export const estimatedMonthlyCostSchema = z.object({
  amount: z.string().regex(DECIMAL_AMOUNT_REGEX, 'amount must be a decimal string like "20.00"'),
  currency: z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .refine((value) => isCurrencyCode(value), { message: 'currency must be an ISO 4217 code' }),
});

export const detectedSubscriptionReportSchema = z
  .object({
    fingerprint: z.string().trim().min(1).max(100),
    service: z.string().trim().min(1).max(100),
    vendor: z.string().trim().max(100).optional(),
    category: z.enum(TECH_CATEGORY_KEYS).default(DEFAULT_TECH_CATEGORY),
    detectedIn: z.string().trim().max(200).optional(),
    evidence: z
      .array(z.string().trim().min(1).max(MAX_EVIDENCE_LENGTH))
      .max(MAX_EVIDENCE_ITEMS)
      .optional(),
    estimatedMonthlyCost: estimatedMonthlyCostSchema.optional(),
    pricingUrl: httpsUrl.optional(),
    agent: z.string().trim().max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.estimatedMonthlyCost) {
      return;
    }
    const { amount, currency } = value.estimatedMonthlyCost;
    if (null === parseAmountToMinorUnits(amount, currency)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['estimatedMonthlyCost', 'amount'],
        message: 'amount has more decimal places than the currency allows',
      });
    }
  });

export type DetectedSubscriptionReport = z.infer<typeof detectedSubscriptionReportSchema>;

const getDecimalDigits = (currency: string): number | null =>
  isCurrencyCode(currency) ? CURRENCIES[currency].decimalDigits : null;

/**
 * Converts a decimal string ("20.00") into BigInt minor units using the currency's decimal digits.
 * Returns null when the string is malformed, the currency is unknown, or the fraction has more
 * non-zero digits than the currency supports.
 */
export const parseAmountToMinorUnits = (amount: string, currency: string): bigint | null => {
  const digits = getDecimalDigits(currency.toUpperCase());
  if (null === digits || !DECIMAL_AMOUNT_REGEX.test(amount)) {
    return null;
  }

  const [whole = '0', rawFraction = ''] = amount.split('.');
  const fraction = rawFraction.replace(/0+$/, '');
  if (fraction.length > digits) {
    return null;
  }

  return BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0') || '0');
};

/** Converts BigInt minor units back to a fixed decimal string ("2000n" USD → "20.00"). */
export const formatMinorUnits = (amount: bigint, currency: string): string => {
  const digits = getDecimalDigits(currency.toUpperCase()) ?? 2;
  const negative = 0n > amount;
  const abs = negative ? -amount : amount;
  const raw = abs.toString().padStart(digits + 1, '0');
  const whole = raw.slice(0, raw.length - digits);
  const fraction = raw.slice(raw.length - digits);
  return `${negative ? '-' : ''}${whole}${0 < digits ? `.${fraction}` : ''}`;
};

/** Merges new evidence into existing evidence, keeping order, removing duplicates, capped at 20. */
export const mergeEvidence = (existing: string[], incoming: string[] = []): string[] =>
  [...new Set([...existing, ...incoming])].slice(0, MAX_EVIDENCE_ITEMS);
