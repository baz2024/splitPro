import { type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import {
  DEFAULT_TECH_CATEGORY,
  TECH_CATEGORY_KEYS,
  type TechCategoryKey,
  parseAmountToMinorUnits,
} from '~/server/agent/validation';
import { useAddExpenseStore } from '~/store/addStore';
import { type RouterOutputs } from '~/utils/api';

export type DetectedSubscriptionItem = RouterOutputs['agent']['listDetectedSubscriptions'][number];

export interface ExpensePrefill {
  description: string;
  category: TechCategoryKey;
  cost: { amount: bigint; currency: CurrencyCode } | null;
}

/** How long the add page's own initialisation is kept from overwriting the prefill. */
export const PREFILL_GUARD_MS = 1500;

export const isTechCategoryKey = (value: string): value is TechCategoryKey =>
  (TECH_CATEGORY_KEYS as readonly string[]).includes(value);

export const toTechCategory = (value: string): TechCategoryKey =>
  isTechCategoryKey(value) ? value : DEFAULT_TECH_CATEGORY;

export const toExpensePrefill = (
  item: Pick<DetectedSubscriptionItem, 'service' | 'category' | 'estimatedMonthlyCost'>,
): ExpensePrefill => {
  const description = item.service.trim();
  const category = toTechCategory(item.category);
  const estimate = item.estimatedMonthlyCost;
  if (!estimate || !isCurrencyCode(estimate.currency)) {
    return { description, category, cost: null };
  }

  const amount = parseAmountToMinorUnits(estimate.amount, estimate.currency);
  return {
    description,
    category,
    cost: null === amount ? null : { amount, currency: estimate.currency },
  };
};

const matchesPrefill = (prefill: ExpensePrefill) => {
  const state = useAddExpenseStore.getState();
  if (prefill.description !== state.description || prefill.category !== state.category) {
    return false;
  }
  if (!prefill.cost) {
    return true;
  }
  return prefill.cost.currency === state.currency && prefill.cost.amount === state.amount;
};

let releaseActiveHold: (() => void) | null = null;

/** Stops keeping the current prefill in the store (a newer hold or the timeout calls this). */
export const releaseExpensePrefill = () => {
  releaseActiveHold?.();
  releaseActiveHold = null;
};

/**
 * Writes the prefill into the add-expense store and keeps it there while the add page mounts.
 * The add page resets the store (and picks the user's preferred currency) when it mounts, so the
 * values are re-applied whenever they diverge until the returned release function is called.
 */
export const holdExpensePrefill = (
  prefill: ExpensePrefill,
  formatAmount: (amount: bigint, currency: CurrencyCode) => string,
) => {
  const write = () => {
    const { actions } = useAddExpenseStore.getState();
    actions.setDescription(prefill.description);
    actions.setCategory(prefill.category);
    if (!prefill.cost) {
      return;
    }
    actions.setCurrency(prefill.cost.currency);
    actions.setAmount(prefill.cost.amount);
    actions.setAmountStr(formatAmount(prefill.cost.amount, prefill.cost.currency));
  };

  let writing = false;
  const guardedWrite = () => {
    // Each setter notifies subscribers synchronously; skip re-entry while writing.
    if (writing) {
      return;
    }
    writing = true;
    try {
      write();
    } finally {
      writing = false;
    }
  };

  releaseExpensePrefill();
  guardedWrite();
  const unsubscribe = useAddExpenseStore.subscribe(() => {
    if (!matchesPrefill(prefill)) {
      guardedWrite();
    }
  });
  releaseActiveHold = unsubscribe;

  return () => {
    if (releaseActiveHold === unsubscribe) {
      releaseExpensePrefill();
    }
  };
};
