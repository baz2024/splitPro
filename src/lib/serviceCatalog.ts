import { type CategoryItem } from '~/lib/category';

export type ServiceBilling = 'subscription' | 'usage';

/** A known plan with its public list price, offered as a chip on Add cost. */
export interface ServicePlan {
  name: string;
  /** Monthly list price in USD cents. A list price only: users should check their own plan. */
  monthlyUsd: bigint;
  /** Billed per seat (the price is for one seat). */
  perSeat?: boolean;
}

/** Currency of every plan's `monthlyUsd`. */
export const PLAN_PRICE_CURRENCY = 'USD';

const CLAUDE_PLANS = [
  { name: 'Claude Pro', monthlyUsd: 2000n },
  { name: 'Claude Max', monthlyUsd: 10000n },
  { name: 'Claude Max 20x', monthlyUsd: 20000n },
] as const satisfies readonly ServicePlan[];

export interface ServiceInfo {
  /** Same id the subscription-monitor skill reports as `fingerprint`. */
  id: string;
  name: string;
  /** Two-letter badge text; `▲` for Vercel to echo its logo. */
  initials: string;
  /** Badge background (hex). Kept in the 600-800 range so white initials pass contrast. */
  color: string;
  category: CategoryItem;
  billing: ServiceBilling;
  /** Show as a quick pick on the Add cost service grid. */
  featured?: boolean;
  /** Common plans with list prices, shown as chips after picking the service. */
  plans?: readonly ServicePlan[];
}

export const SERVICE_CATALOG = [
  {
    id: 'vercel',
    name: 'Vercel',
    initials: '▲',
    color: '#111827',
    category: 'cloudHosting',
    billing: 'subscription',
    featured: true,
    plans: [{ name: 'Pro', monthlyUsd: 2000n, perSeat: true }],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    initials: 'SB',
    color: '#166534',
    category: 'databases',
    billing: 'subscription',
    featured: true,
    plans: [{ name: 'Pro', monthlyUsd: 2500n }],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    initials: 'AN',
    color: '#9a3412',
    category: 'aiApis',
    billing: 'usage',
    featured: true,
    plans: CLAUDE_PLANS,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    initials: 'OA',
    color: '#065f46',
    category: 'aiApis',
    billing: 'usage',
    featured: true,
    plans: [
      { name: 'ChatGPT Plus', monthlyUsd: 2000n },
      { name: 'ChatGPT Pro', monthlyUsd: 20000n },
      { name: 'ChatGPT Team', monthlyUsd: 3000n, perSeat: true },
    ],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    initials: 'CU',
    color: '#1f2937',
    category: 'codingAgents',
    billing: 'subscription',
    featured: true,
    plans: [
      { name: 'Pro', monthlyUsd: 2000n },
      { name: 'Business', monthlyUsd: 4000n, perSeat: true },
    ],
  },
  {
    id: 'github-copilot',
    name: 'GitHub',
    initials: 'GH',
    color: '#3730a3',
    category: 'devTools',
    billing: 'subscription',
    featured: true,
    plans: [
      { name: 'Copilot Pro', monthlyUsd: 1000n },
      { name: 'Copilot Business', monthlyUsd: 1900n, perSeat: true },
    ],
  },
  {
    id: 'figma',
    name: 'Figma',
    initials: 'FG',
    color: '#9d174d',
    category: 'devTools',
    billing: 'subscription',
    featured: true,
    plans: [{ name: 'Professional', monthlyUsd: 1500n, perSeat: true }],
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    initials: 'CC',
    color: '#9a3412',
    category: 'codingAgents',
    billing: 'subscription',
    plans: CLAUDE_PLANS,
  },
  {
    id: 'google-gemini',
    name: 'Google Gemini',
    initials: 'GE',
    color: '#1e40af',
    category: 'aiApis',
    billing: 'usage',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    initials: 'CF',
    color: '#c2410c',
    category: 'domains',
    billing: 'subscription',
  },
  {
    id: 'aws',
    name: 'AWS',
    initials: 'AW',
    color: '#92400e',
    category: 'cloudHosting',
    billing: 'usage',
  },
  {
    id: 'neon',
    name: 'Neon',
    initials: 'NE',
    color: '#047857',
    category: 'databases',
    billing: 'usage',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    initials: 'SE',
    color: '#5b21b6',
    category: 'monitoring',
    billing: 'subscription',
  },
  {
    id: 'posthog',
    name: 'PostHog',
    initials: 'PH',
    color: '#1d4ed8',
    category: 'monitoring',
    billing: 'usage',
  },
  {
    id: 'twilio',
    name: 'Twilio',
    initials: 'TW',
    color: '#b91c1c',
    category: 'messagingApis',
    billing: 'usage',
  },
  {
    id: 'resend',
    name: 'Resend',
    initials: 'RE',
    color: '#111827',
    category: 'messagingApis',
    billing: 'subscription',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    initials: 'ST',
    color: '#4338ca',
    category: 'saas',
    billing: 'usage',
  },
] as const satisfies readonly ServiceInfo[];

export type ServiceId = (typeof SERVICE_CATALOG)[number]['id'];

export const FEATURED_SERVICES: readonly ServiceInfo[] = SERVICE_CATALOG.filter(
  (service: ServiceInfo) => true === service.featured,
);

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Find a catalog entry by id or by a free-text name such as an expense description. */
export const findService = (idOrName: string | null | undefined): ServiceInfo | undefined => {
  if (!idOrName) {
    return undefined;
  }
  const key = normalise(idOrName);
  if ('' === key) {
    return undefined;
  }
  return SERVICE_CATALOG.find(
    (service: ServiceInfo) =>
      normalise(service.id) === key ||
      key.startsWith(normalise(service.name)) ||
      key.startsWith(normalise(service.id)),
  );
};

/** Badge text for any name, using the catalog when it knows the service. */
export const serviceInitials = (name: string): string => {
  const known = findService(name);
  if (known) {
    return known.initials;
  }
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    1 < words.length ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : name.trim().slice(0, 2);
  return letters.toUpperCase() || '?';
};

/** Badge colours for services outside the catalog; all dark enough for white initials. */
const FALLBACK_BADGE_COLORS = [
  '#334155',
  '#1e40af',
  '#065f46',
  '#7c2d12',
  '#5b21b6',
  '#9d174d',
  '#155e75',
  '#3f6212',
] as const;

/** Brand colour for a catalog service, else a stable colour picked from the name. */
export const serviceColor = (name: string): string => {
  const known = findService(name);
  if (known) {
    return known.color;
  }
  const key = normalise(name);
  const hash = key.split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 1_000_003, 7);
  return FALLBACK_BADGE_COLORS[hash % FALLBACK_BADGE_COLORS.length] ?? '#334155';
};
