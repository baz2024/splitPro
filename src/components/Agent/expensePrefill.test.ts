import { useAddExpenseStore } from '~/store/addStore';

import {
  type DetectedSubscriptionItem,
  holdExpensePrefill,
  releaseExpensePrefill,
  toExpensePrefill,
  toTechCategory,
} from './expensePrefill';

const ITEM: DetectedSubscriptionItem = {
  id: 'det_1',
  fingerprint: 'openai',
  service: 'OpenAI API',
  vendor: 'OpenAI',
  category: 'aiApis',
  status: 'pending',
  detectedIn: 'acme/web',
  evidence: ['package.json: openai@^4.52.0'],
  estimatedMonthlyCost: { amount: '20.00', currency: 'USD' },
  pricingUrl: 'https://openai.com/pricing',
  agent: 'claude-code',
  expenseId: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const formatAmount = (amount: bigint) => amount.toString();

describe('expensePrefill', () => {
  afterEach(() => {
    releaseExpensePrefill();
    useAddExpenseStore.getState().actions.resetState();
  });

  describe('toTechCategory', () => {
    it('should keep known tech keys and fall back to saas', () => {
      expect(toTechCategory('codingAgents')).toBe('codingAgents');
      expect(toTechCategory('other')).toBe('saas');
      expect(toTechCategory('groceries')).toBe('saas');
    });
  });

  describe('toExpensePrefill', () => {
    it('should convert the estimated cost to minor units', () => {
      expect(toExpensePrefill(ITEM)).toEqual({
        description: 'OpenAI API',
        category: 'aiApis',
        cost: { amount: 2000n, currency: 'USD' },
      });
    });

    it('should use whole units for zero-decimal currencies', () => {
      expect(
        toExpensePrefill({ ...ITEM, estimatedMonthlyCost: { amount: '500', currency: 'JPY' } })
          .cost,
      ).toEqual({ amount: 500n, currency: 'JPY' });
    });

    it('should drop missing or unusable costs', () => {
      expect(toExpensePrefill({ ...ITEM, estimatedMonthlyCost: null }).cost).toBeNull();
      expect(
        toExpensePrefill({ ...ITEM, estimatedMonthlyCost: { amount: '1', currency: 'XXX' } }).cost,
      ).toBeNull();
    });
  });

  describe('holdExpensePrefill', () => {
    it('should write description, category, currency and amount into the store', () => {
      holdExpensePrefill(toExpensePrefill(ITEM), formatAmount);
      const state = useAddExpenseStore.getState();
      expect(state.description).toBe('OpenAI API');
      expect(state.category).toBe('aiApis');
      expect(state.currency).toBe('USD');
      expect(state.amount).toBe(2000n);
      expect(state.amountStr).toBe('2000');
    });

    it('should survive the add page resetting the store and picking a currency', () => {
      holdExpensePrefill(toExpensePrefill(ITEM), formatAmount);
      const { actions } = useAddExpenseStore.getState();
      actions.resetState();
      actions.setCurrency('EUR');

      const state = useAddExpenseStore.getState();
      expect(state.description).toBe('OpenAI API');
      expect(state.category).toBe('aiApis');
      expect(state.currency).toBe('USD');
      expect(state.amount).toBe(2000n);
    });

    it('should leave the store alone once released', () => {
      const release = holdExpensePrefill(toExpensePrefill(ITEM), formatAmount);
      release();
      useAddExpenseStore.getState().actions.setDescription('Edited');
      expect(useAddExpenseStore.getState().description).toBe('Edited');
    });

    it('should keep the currency picked by the add page when there is no cost', () => {
      holdExpensePrefill(toExpensePrefill({ ...ITEM, estimatedMonthlyCost: null }), formatAmount);
      useAddExpenseStore.getState().actions.setCurrency('EUR');
      expect(useAddExpenseStore.getState().currency).toBe('EUR');
    });
  });
});
