import { CATEGORIES } from '~/lib/category';
import { SERVICE_CATALOG } from '~/lib/serviceCatalog';

import {
  VENDOR_COUNT,
  isNonSubscriptionMerchant,
  matchVendor,
  normaliseMerchant,
  vendorKey,
  vendorMonthlyUsd,
} from './vendors';

const VALID_CATEGORIES = new Set<string>([
  ...Object.keys(CATEGORIES),
  ...Object.values(CATEGORIES).flatMap((items) => [...items]),
]);

describe('matchVendor', () => {
  describe('messy statement descriptions', () => {
    const cases: [string, string, string | undefined][] = [
      ['PADDLE.NET* RAYCAST 8445 IE', 'raycast', 'paddle'],
      ['Paddle.net* Raycast', 'raycast', 'paddle'],
      ['PADDLE *SETAPP', 'setapp', 'paddle'],
      ['GOOGLE *GSUITE_safi', 'google-workspace', undefined],
      ['GOOGLE *Google One', 'google-one', undefined],
      ['GOOGLE *CLOUD 9XK2LM', 'google-cloud', undefined],
      ['APPLE.COM/BILL', 'apple', undefined],
      ['APPLE.COM/BILL ITUNES.COM', 'apple', undefined],
      ['APPLE.COM/BILL 866-712-7753 CA', 'apple', undefined],
      ['APPLE.COM/BILL ICLOUD', 'icloud', undefined],
      ['GITHUB, INC.             SAN FRANCISCO', 'github', undefined],
      ['VDP-GITHUB, INC.', 'github', undefined],
      ['GitHub Copilot', 'github-copilot', undefined],
      ['VERCEL INC.              COVINA', 'vercel', undefined],
      ['OPENAI *CHATGPT SUBSCR   SAN FRANCISCO', 'chatgpt', undefined],
      ['VDP-OPENAI *CHATGPT SUBSCR USD 20.00@0.9280', 'chatgpt', undefined],
      ['OPENAI', 'openai', undefined],
      ['CLAUDE.AI SUBSCRIPTION ANTHROPIC.COM', 'claude', undefined],
      ['ANTHROPIC PBC', 'anthropic', undefined],
      ['NOTION LABS, INC.', 'notion', undefined],
      ['CURSOR, AI POWERED IDE', 'cursor', undefined],
      ['Linear.app', 'linear', undefined],
      ['STRIPE *LOOM', 'loom', 'stripe'],
      ['STR*ZAPIER.COM/CHARGE', 'zapier', 'stripe'],
      ['FS *SKETCH JETBRAINS', 'jetbrains', 'fastspring'],
      ['FASTSPRING* 1PASSWORD', '1password', 'fastspring'],
      ['2CO.COM*SETAPP', 'setapp', '2checkout'],
      ['PAYPAL *MIDJOURNEY', 'midjourney', 'paypal'],
      ['LEMSQZY* SUPERHUMAN', 'superhuman', 'lemonsqueezy'],
      ['SQ *FRAMER', 'framer', 'square'],
      ['AWS EMEA aws.amazon.co', 'aws', undefined],
      ['AMAZON WEB SERVICES', 'aws', undefined],
      ['DIGITALOCEAN.COM', 'digitalocean', undefined],
      ['FLY.IO', 'fly', undefined],
      ['HTTPS://SUPABASE.COM', 'supabase', undefined],
      ['MSFT *MICROSOFT 365', 'microsoft-365', undefined],
      ['ATLASSIAN JIRA SOFTWARE', 'atlassian', undefined],
      ['FIGMA MONTHLY RENEWAL', 'figma', undefined],
      ['SENTRY FUNCTIONAL SOFTWARE', 'sentry', undefined],
      ['HUGGINGFACE.CO', 'huggingface', undefined],
      ['ELEVENLABS.IO', 'elevenlabs', undefined],
      ['STRIPE PAYMENTS UK FEES', 'stripe', undefined],
    ];

    it.each(cases)('%s → %s', (description, vendorId, via) => {
      const match = matchVendor(description);
      expect(match.vendorId).toBe(vendorId);
      expect(match.known).toBe(true);
      expect(match.via).toBe(via);
    });
  });

  describe('Unknown merchants', () => {
    it('should title-case the normalised merchant and use the general category', () => {
      expect(matchVendor('FLYEFIT')).toEqual({
        vendorId: null,
        name: 'Flyefit',
        category: 'general',
        known: false,
      });
      expect(matchVendor('VDC-TESCO STORES 3245').name).toBe('Tesco Stores');
      expect(matchVendor('D/D FLYEFIT LTD').name).toBe('Flyefit');
    });

    it('should not treat groceries, taxis or food delivery as SaaS', () => {
      [
        'Tesco',
        'UBER *TRIP HELP.UBER.COM',
        'DELIVEROO',
        'AMAZON.IE*2K4L91 AMAZON.IE',
        'VDP-AMZN MKTP IE*X1Y2Z3',
        'Circle K',
        'Insomnia Coffee',
        'FLYEFIT',
        'Railway station cafe',
      ].forEach((description) => {
        expect(matchVendor(description).known).toBe(false);
      });
    });

    it('should keep the reseller as via for unknown merchants', () => {
      expect(matchVendor('PAYPAL *SOMESHOP')).toMatchObject({ known: false, via: 'paypal' });
    });

    it('should name an empty description', () => {
      expect(matchVendor('12345').name).toBe('Unknown merchant');
    });
  });

  describe('Vendor list', () => {
    it('should have about a hundred vendors with valid categories and catalog ids', () => {
      expect(VENDOR_COUNT).toBeGreaterThanOrEqual(100);
      const catalogIds = new Set<string>(SERVICE_CATALOG.map((service) => service.id));
      [
        'GITHUB',
        'VERCEL',
        'NOTION',
        'FIGMA',
        'CURSOR',
        'CHATGPT',
        'SUPABASE',
        'RESEND',
        'ZAPIER',
      ].forEach((description) => {
        const match = matchVendor(description);
        expect(VALID_CATEGORIES.has(match.category)).toBe(true);
        if (match.catalogId) {
          expect(catalogIds.has(match.catalogId)).toBe(true);
        }
      });
    });

    it('should know trial lengths and list prices', () => {
      expect(matchVendor('CURSOR').trialDays).toBe(14);
      expect(matchVendor('CURSOR').catalogId).toBe('cursor');
      expect(vendorMonthlyUsd('cursor')).toBe(2000n);
      expect(vendorMonthlyUsd('raycast')).toBe(800n);
      expect(vendorMonthlyUsd('figma')).toBe(1500n);
      expect(vendorMonthlyUsd(null)).toBeNull();
      expect(vendorMonthlyUsd('nope')).toBeNull();
    });
  });
});

describe('normaliseMerchant', () => {
  it('should strip processors, places, reference codes and legal suffixes', () => {
    expect(normaliseMerchant('PADDLE.NET* RAYCAST 8445 IE')).toBe('raycast');
    expect(normaliseMerchant('NOTION LABS, INC.        SAN FRANCISCO')).toBe('notion labs');
    expect(normaliseMerchant('VDP-OPENAI *CHATGPT SUBSCR USD 20.00@0.9280')).toBe('openai chatgpt');
    expect(normaliseMerchant('AMAZON.IE*2K4L91 AMAZON.IE')).toBe('amazon amazon');
    expect(normaliseMerchant('HTTPS://WWW.EXAMPLE.COM')).toBe('example');
    expect(normaliseMerchant('APPLE.COM/BILL')).toBe('');
  });
});

describe('vendorKey', () => {
  it('should use the vendor id, else a slug of the name', () => {
    expect(vendorKey(matchVendor('GITHUB'))).toBe('github');
    expect(vendorKey(matchVendor('Tesco Stores 3245'))).toBe('tesco-stores');
  });
});

describe('isNonSubscriptionMerchant', () => {
  it('should flag rent, transfers, cash and card repayments', () => {
    expect(isNonSubscriptionMerchant('To Landlord Property Ltd')).toBe(true);
    expect(isNonSubscriptionMerchant('D/D SAFEHOME RENT')).toBe(true);
    expect(isNonSubscriptionMerchant('ATM AIB GRAFTON ST')).toBe(true);
    expect(isNonSubscriptionMerchant('PAYMENT RECEIVED - THANK YOU')).toBe(true);
    expect(isNonSubscriptionMerchant('FLYEFIT')).toBe(false);
    expect(isNonSubscriptionMerchant('Toggl')).toBe(false);
  });
});
