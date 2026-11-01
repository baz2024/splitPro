import { type CategoryItem } from '~/lib/category';

export type ServiceBilling = 'subscription' | 'usage';

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
  },
  {
    id: 'supabase',
    name: 'Supabase',
    initials: 'SB',
    color: '#166534',
    category: 'databases',
    billing: 'subscription',
    featured: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    initials: 'AN',
    color: '#9a3412',
    category: 'aiApis',
    billing: 'usage',
    featured: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    initials: 'OA',
    color: '#065f46',
    category: 'aiApis',
    billing: 'usage',
    featured: true,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    initials: 'CU',
    color: '#1f2937',
    category: 'codingAgents',
    billing: 'subscription',
    featured: true,
  },
  {
    id: 'github-copilot',
    name: 'GitHub',
    initials: 'GH',
    color: '#3730a3',
    category: 'devTools',
    billing: 'subscription',
    featured: true,
  },
  {
    id: 'figma',
    name: 'Figma',
    initials: 'FG',
    color: '#9d174d',
    category: 'devTools',
    billing: 'subscription',
    featured: true,
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    initials: 'CC',
    color: '#9a3412',
    category: 'codingAgents',
    billing: 'subscription',
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
