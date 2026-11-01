import { SERVICE_CATALOG, type ServiceInfo, findService } from '~/lib/serviceCatalog';

import { planPriceInput, servicePlans } from './addCost';

const plansOf = (id: string) =>
  servicePlans(findService(id)).map((plan) => [plan.name, plan.monthlyUsd]);

describe('plan chips', () => {
  describe('catalog plans', () => {
    it('should list the Claude, ChatGPT and dev tool plans at their list prices', () => {
      expect(plansOf('anthropic')).toEqual([
        ['Claude Pro', 2000n],
        ['Claude Max', 10000n],
        ['Claude Max 20x', 20000n],
      ]);
      expect(plansOf('openai')).toEqual([
        ['ChatGPT Plus', 2000n],
        ['ChatGPT Pro', 20000n],
        ['ChatGPT Team', 3000n],
      ]);
      expect(plansOf('cursor')).toEqual([
        ['Pro', 2000n],
        ['Business', 4000n],
      ]);
      expect(plansOf('github-copilot')).toEqual([
        ['Copilot Pro', 1000n],
        ['Copilot Business', 1900n],
      ]);
      expect(plansOf('vercel')).toEqual([['Pro', 2000n]]);
      expect(plansOf('supabase')).toEqual([['Pro', 2500n]]);
      expect(plansOf('figma')).toEqual([['Professional', 1500n]]);
    });

    it('should mark per-seat plans', () => {
      const team = servicePlans(findService('openai')).find((plan) => 'ChatGPT Team' === plan.name);
      expect(team?.perSeat).toBe(true);
    });

    it('should only have positive prices and unique plan names per service', () => {
      SERVICE_CATALOG.forEach((service: ServiceInfo) => {
        const plans = service.plans ?? [];
        expect(plans.every((plan) => 0n < plan.monthlyUsd)).toBe(true);
        expect(new Set(plans.map((plan) => plan.name)).size).toBe(plans.length);
      });
    });

    it('should have no plans for Other or services without known plans', () => {
      expect(servicePlans(undefined)).toEqual([]);
      expect(servicePlans(findService('twilio'))).toEqual([]);
    });
  });

  describe('planPriceInput', () => {
    it('should give the plain decimal for the price field', () => {
      expect(planPriceInput({ name: 'Pro', monthlyUsd: 2000n })).toBe('20');
      expect(planPriceInput({ name: 'Odd', monthlyUsd: 1999n })).toBe('19.99');
      expect(planPriceInput({ name: 'Dime', monthlyUsd: 1005n })).toBe('10.05');
    });
  });
});
