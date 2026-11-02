/**
 * Turn a messy bank / card description ("PADDLE.NET* RAYCAST 8445 IE") into a vendor:
 * strip the reseller or payment processor, strip card-network noise, then match ~100 dev,
 * SaaS and productivity vendors. Pure: no database access, safe to unit test.
 */
import { SERVICE_CATALOG } from '~/lib/serviceCatalog';

import { type VendorMatch } from './types';

/** Category keys from src/lib/category.ts used by the vendor list. */
type VendorCategory =
  | 'aiApis'
  | 'codingAgents'
  | 'cloudHosting'
  | 'databases'
  | 'devTools'
  | 'domains'
  | 'monitoring'
  | 'messagingApis'
  | 'saas'
  | 'general';

interface VendorDef {
  id: string;
  name: string;
  category: VendorCategory;
  patterns: readonly RegExp[];
  trialDays?: number;
  /** Usual monthly list price in USD cents, when the catalog has none. */
  monthlyUsd?: bigint;
  catalogId?: string;
  /** Company that owns the vendor; a matching `via` is dropped ("Google Workspace" via google). */
  company?: string;
}

/** Category for merchants that are not on the vendor list. */
export const UNKNOWN_VENDOR_CATEGORY = 'general';

const v = (
  id: string,
  name: string,
  category: VendorCategory,
  patterns: readonly RegExp[],
  extra: Partial<Omit<VendorDef, 'id' | 'name' | 'category' | 'patterns'>> = {},
): VendorDef => ({ id, name, category, patterns, ...extra });

/** Order matters: more specific vendors (GitHub Copilot, ChatGPT) come before broader ones. */
const VENDORS: readonly VendorDef[] = [
  // Code hosting and CI
  v('github-copilot', 'GitHub Copilot', 'codingAgents', [/GITHUB\s*COPILOT/], {
    trialDays: 30,
    catalogId: 'github-copilot',
    monthlyUsd: 1000n,
  }),
  v('github', 'GitHub', 'devTools', [/\bGITHUB\b/, /\bGITHUB\.COM\b/], {
    catalogId: 'github-copilot',
    monthlyUsd: 400n,
  }),
  v('gitlab', 'GitLab', 'devTools', [/\bGITLAB\b/], { trialDays: 30, monthlyUsd: 2900n }),
  v('bitbucket', 'Bitbucket', 'devTools', [/\bBITBUCKET\b/], { company: 'atlassian' }),
  v('circleci', 'CircleCI', 'devTools', [/\bCIRCLE\s?CI\b/], { monthlyUsd: 1500n }),
  v('docker', 'Docker', 'devTools', [/\bDOCKER\b/], { monthlyUsd: 900n }),
  v('npm', 'npm', 'devTools', [/\bNPM\b/, /\bNPMJS\b/], { monthlyUsd: 700n }),
  v('postman', 'Postman', 'devTools', [/\bPOSTMAN\b/], { monthlyUsd: 1400n }),
  v('jetbrains', 'JetBrains', 'devTools', [/\bJETBRAINS\b/, /\bJET BRAINS\b/], {
    trialDays: 30,
    monthlyUsd: 2490n,
  }),
  v('expo', 'Expo', 'devTools', [/\bEXPO\.DEV\b/, /\bEXPO DEV\b/, /650 INDUSTRIES/, /^EXPO\b/], {
    monthlyUsd: 1900n,
  }),
  v(
    'apple-developer',
    'Apple Developer Program',
    'devTools',
    [/APPLE\s+DEVELOPER/, /DEVELOPER\s+PROGRAM/],
    { company: 'apple', monthlyUsd: 825n },
  ),
  v(
    'google-play-console',
    'Google Play Console',
    'devTools',
    [/PLAY\s+CONSOLE/, /GOOGLE\s+PLAY\s+DEV/, /PLAY\s+DEVELOPER/],
    { company: 'google' },
  ),
  v('ngrok', 'ngrok', 'devTools', [/\bNGROK\b/], { monthlyUsd: 800n }),
  v('tailscale', 'Tailscale', 'devTools', [/\bTAILSCALE\b/], { monthlyUsd: 600n }),
  v('raycast', 'Raycast', 'devTools', [/\bRAYCAST\b/], { trialDays: 14, monthlyUsd: 800n }),
  v('setapp', 'Setapp', 'saas', [/\bSETAPP\b/], { trialDays: 7, monthlyUsd: 999n }),
  v('figma', 'Figma', 'devTools', [/\bFIGMA\b/], { catalogId: 'figma' }),
  v('framer', 'Framer', 'saas', [/\bFRAMER\b/], { trialDays: 14, monthlyUsd: 1500n }),
  v('webflow', 'Webflow', 'saas', [/\bWEBFLOW\b/], { monthlyUsd: 1800n }),
  v('canva', 'Canva', 'saas', [/\bCANVA\b/], { trialDays: 30, monthlyUsd: 1500n }),
  v('adobe', 'Adobe', 'saas', [/\bADOBE\b/], { trialDays: 7, monthlyUsd: 2299n }),
  v('miro', 'Miro', 'saas', [/\bMIRO\b/, /\bREALTIMEBOARD\b/], { monthlyUsd: 1000n }),
  // Hosting and cloud
  v('vercel', 'Vercel', 'cloudHosting', [/\bVERCEL\b/], { trialDays: 14, catalogId: 'vercel' }),
  v('netlify', 'Netlify', 'cloudHosting', [/\bNETLIFY\b/], { monthlyUsd: 1900n }),
  v('cloudflare', 'Cloudflare', 'domains', [/\bCLOUDFLARE\b/], {
    catalogId: 'cloudflare',
    monthlyUsd: 2000n,
  }),
  v('aws', 'AWS', 'cloudHosting', [/\bAWS\b/, /AMAZON\s+WEB\s+SERVICES/, /AMZN\s+WEB\s+SERV/], {
    catalogId: 'aws',
    company: 'amazon',
  }),
  v(
    'google-cloud',
    'Google Cloud',
    'cloudHosting',
    [/GOOGLE\s*CLOUD/, /\bGCP\b/, /CLOUD\s+PLATFORM/],
    { company: 'google' },
  ),
  v(
    'google-workspace',
    'Google Workspace',
    'saas',
    [/\bG\s?SUITE/, /GOOGLE\s*WORKSPACE/, /GOOGLE\s+APPS/],
    { trialDays: 14, monthlyUsd: 700n, company: 'google' },
  ),
  v('google-one', 'Google One', 'saas', [/GOOGLE\s*ONE\b/, /GOOGLE\s+STORAGE/], {
    company: 'google',
    monthlyUsd: 299n,
  }),
  v('firebase', 'Firebase', 'databases', [/\bFIREBASE\b/], { company: 'google' }),
  v(
    'microsoft-365',
    'Microsoft 365',
    'saas',
    [/MICROSOFT\s*365/, /OFFICE\s*365/, /\bM365\b/, /MSFT.*365/],
    { trialDays: 30, monthlyUsd: 1000n, company: 'microsoft' },
  ),
  v('azure', 'Microsoft Azure', 'cloudHosting', [/\bAZURE\b/], { company: 'microsoft' }),
  v('digitalocean', 'DigitalOcean', 'cloudHosting', [/DIGITAL\s?OCEAN/], { monthlyUsd: 600n }),
  v('linode', 'Linode (Akamai)', 'cloudHosting', [/\bLINODE\b/, /\bAKAMAI\b/], {
    monthlyUsd: 500n,
  }),
  v('hetzner', 'Hetzner', 'cloudHosting', [/\bHETZNER\b/], { monthlyUsd: 500n }),
  v('vultr', 'Vultr', 'cloudHosting', [/\bVULTR\b/], { monthlyUsd: 600n }),
  v('ovh', 'OVHcloud', 'cloudHosting', [/\bOVH\b/, /\bOVHCLOUD\b/]),
  v('fly', 'Fly.io', 'cloudHosting', [/\bFLY\.?\s?IO\b/]),
  v('render', 'Render', 'cloudHosting', [/\bRENDER\.COM\b/, /\bRENDER\s+(COM|SERVICES|INC)\b/], {
    monthlyUsd: 1900n,
  }),
  v('railway', 'Railway', 'cloudHosting', [/\bRAILWAY\.APP\b/, /^RAILWAY\b(?!\s+STATION)/], {
    monthlyUsd: 500n,
  }),
  v('heroku', 'Heroku', 'cloudHosting', [/\bHEROKU\b/], { monthlyUsd: 700n }),
  v('cloudinary', 'Cloudinary', 'cloudHosting', [/\bCLOUDINARY\b/], { monthlyUsd: 8900n }),
  // Databases
  v('supabase', 'Supabase', 'databases', [/\bSUPABASE\b/], { catalogId: 'supabase' }),
  v(
    'neon',
    'Neon',
    'databases',
    [/\bNEON\.TECH\b/, /\bNEON\s+(INC|TECH|DB|DATABASE)\b/, /\bNEONDB\b/],
    {
      catalogId: 'neon',
      monthlyUsd: 1900n,
    },
  ),
  v('planetscale', 'PlanetScale', 'databases', [/PLANET\s?SCALE/], { monthlyUsd: 3900n }),
  v('mongodb', 'MongoDB Atlas', 'databases', [/\bMONGO\s?DB\b/, /\bMONGODB/], { monthlyUsd: 900n }),
  v('upstash', 'Upstash', 'databases', [/\bUPSTASH\b/], { monthlyUsd: 1000n }),
  v('redis', 'Redis Cloud', 'databases', [/\bREDIS\b/], { monthlyUsd: 700n }),
  v('algolia', 'Algolia', 'databases', [/\bALGOLIA\b/]),
  // AI
  v('chatgpt', 'ChatGPT', 'aiApis', [/CHAT\s?GPT/, /OPENAI.*SUBSCR/], {
    catalogId: 'openai',
    monthlyUsd: 2000n,
  }),
  v('openai', 'OpenAI API', 'aiApis', [/\bOPEN\s?AI\b/], { catalogId: 'openai' }),
  v('claude', 'Claude', 'aiApis', [/\bCLAUDE\b/, /CLAUDE\.AI/], {
    catalogId: 'anthropic',
    monthlyUsd: 2000n,
  }),
  v('anthropic', 'Anthropic API', 'aiApis', [/\bANTHROPIC\b/], { catalogId: 'anthropic' }),
  v('cursor', 'Cursor', 'codingAgents', [/\bCURSOR\b/, /\bANYSPHERE\b/], {
    trialDays: 14,
    catalogId: 'cursor',
  }),
  v('windsurf', 'Windsurf', 'codingAgents', [/\bWINDSURF\b/, /\bCODEIUM\b/], {
    trialDays: 14,
    monthlyUsd: 1500n,
  }),
  v('perplexity', 'Perplexity', 'aiApis', [/\bPERPLEXITY\b/], { monthlyUsd: 2000n }),
  v('midjourney', 'Midjourney', 'aiApis', [/\bMIDJOURNEY\b/], { monthlyUsd: 1000n }),
  v('replicate', 'Replicate', 'aiApis', [/\bREPLICATE\b/]),
  v('huggingface', 'Hugging Face', 'aiApis', [/HUGGING\s?FACE/, /\bHF\.CO\b/], {
    monthlyUsd: 900n,
  }),
  v('elevenlabs', 'ElevenLabs', 'aiApis', [/ELEVEN\s?LABS/], { monthlyUsd: 500n }),
  v('gemini', 'Google Gemini', 'aiApis', [/\bGEMINI\b/], {
    catalogId: 'google-gemini',
    company: 'google',
    monthlyUsd: 2000n,
  }),
  // Productivity
  v('notion', 'Notion', 'saas', [/\bNOTION\b/], { monthlyUsd: 1000n }),
  v('linear', 'Linear', 'saas', [/\bLINEAR\.APP\b/, /\bLINEAR\b/], { monthlyUsd: 800n }),
  v(
    'atlassian',
    'Atlassian (Jira / Confluence)',
    'devTools',
    [/ATLASSIAN/, /\bJIRA\b/, /CONFLUENCE/],
    {
      trialDays: 7,
      monthlyUsd: 800n,
    },
  ),
  v('trello', 'Trello', 'saas', [/\bTRELLO\b/], { company: 'atlassian', monthlyUsd: 500n }),
  v('asana', 'Asana', 'saas', [/\bASANA\b/], { trialDays: 30, monthlyUsd: 1100n }),
  v('clickup', 'ClickUp', 'saas', [/CLICK\s?UP/], { monthlyUsd: 700n }),
  v('monday', 'monday.com', 'saas', [/\bMONDAY\.COM\b/, /\bMONDAY\s+COM\b/], {
    trialDays: 14,
    monthlyUsd: 900n,
  }),
  v('slack', 'Slack', 'saas', [/\bSLACK\b/], { monthlyUsd: 875n }),
  v('zoom', 'Zoom', 'saas', [/\bZOOM\b/], { monthlyUsd: 1333n }),
  v('loom', 'Loom', 'saas', [/\bLOOM\b/], { trialDays: 14, monthlyUsd: 1500n }),
  v('1password', '1Password', 'saas', [/\b1\s?PASSWORD\b/, /\bAGILEBITS\b/], {
    trialDays: 14,
    monthlyUsd: 299n,
  }),
  v('bitwarden', 'Bitwarden', 'saas', [/\bBITWARDEN\b/], { trialDays: 7, monthlyUsd: 100n }),
  v('lastpass', 'LastPass', 'saas', [/\bLASTPASS\b/], { trialDays: 30, monthlyUsd: 300n }),
  v('dropbox', 'Dropbox', 'saas', [/\bDROPBOX\b/], { trialDays: 30, monthlyUsd: 1199n }),
  v('icloud', 'iCloud+', 'saas', [/\bICLOUD\b/], { company: 'apple', monthlyUsd: 99n }),
  v('grammarly', 'Grammarly', 'saas', [/\bGRAMMARLY\b/], { trialDays: 7, monthlyUsd: 1200n }),
  v('superhuman', 'Superhuman', 'saas', [/\bSUPERHUMAN\b/], { trialDays: 14, monthlyUsd: 3000n }),
  v('calendly', 'Calendly', 'saas', [/\bCALENDLY\b/], { trialDays: 14, monthlyUsd: 1000n }),
  v('typeform', 'Typeform', 'saas', [/\bTYPEFORM\b/], { monthlyUsd: 2500n }),
  v('tally', 'Tally', 'saas', [/\bTALLY\.SO\b/, /\bTALLY\s+FORMS?\b/], { monthlyUsd: 2900n }),
  v('airtable', 'Airtable', 'saas', [/\bAIRTABLE\b/], { trialDays: 14, monthlyUsd: 2000n }),
  v('zapier', 'Zapier', 'saas', [/\bZAPIER\b/], { trialDays: 14, monthlyUsd: 1999n }),
  v('make', 'Make', 'saas', [/\bMAKE\.COM\b/, /\bCELONIS\b/, /\bINTEGROMAT\b/], {
    monthlyUsd: 900n,
  }),
  v('n8n', 'n8n', 'saas', [/\bN8N\b/], { trialDays: 14, monthlyUsd: 2400n }),
  v('retool', 'Retool', 'devTools', [/\bRETOOL\b/], { trialDays: 14, monthlyUsd: 1000n }),
  v('bubble', 'Bubble', 'devTools', [/\bBUBBLE\.IO\b/, /\bBUBBLE\s+(GROUP|IO)\b/], {
    monthlyUsd: 2900n,
  }),
  v('intercom', 'Intercom', 'saas', [/\bINTERCOM\b/], { trialDays: 14, monthlyUsd: 3900n }),
  v('zendesk', 'Zendesk', 'saas', [/\bZENDESK\b/], { trialDays: 14, monthlyUsd: 1900n }),
  v('hubspot', 'HubSpot', 'saas', [/\bHUBSPOT\b/], { trialDays: 14, monthlyUsd: 2000n }),
  // Monitoring and analytics
  v('sentry', 'Sentry', 'monitoring', [/\bSENTRY\b/, /FUNCTIONAL\s+SOFTWARE/], {
    trialDays: 14,
    catalogId: 'sentry',
    monthlyUsd: 2600n,
  }),
  v('datadog', 'Datadog', 'monitoring', [/\bDATADOG\b/], { trialDays: 14 }),
  v('newrelic', 'New Relic', 'monitoring', [/NEW\s?RELIC/]),
  v('posthog', 'PostHog', 'monitoring', [/\bPOSTHOG\b/], { catalogId: 'posthog' }),
  v('mixpanel', 'Mixpanel', 'monitoring', [/\bMIXPANEL\b/], { monthlyUsd: 2000n }),
  v('amplitude', 'Amplitude', 'monitoring', [/\bAMPLITUDE\b/], { monthlyUsd: 4900n }),
  v('hotjar', 'Hotjar', 'monitoring', [/\bHOTJAR\b/], { trialDays: 14, monthlyUsd: 3900n }),
  v('logrocket', 'LogRocket', 'monitoring', [/\bLOG\s?ROCKET\b/], {
    trialDays: 14,
    monthlyUsd: 6900n,
  }),
  v('betterstack', 'Better Stack', 'monitoring', [/BETTER\s?STACK/, /BETTER\s?UPTIME/], {
    monthlyUsd: 2900n,
  }),
  // Messaging and email
  v('twilio', 'Twilio', 'messagingApis', [/\bTWILIO\b/], { catalogId: 'twilio' }),
  v('sendgrid', 'SendGrid', 'messagingApis', [/\bSENDGRID\b/], { monthlyUsd: 1995n }),
  v('resend', 'Resend', 'messagingApis', [/\bRESEND\b/], {
    catalogId: 'resend',
    monthlyUsd: 2000n,
  }),
  v('mailgun', 'Mailgun', 'messagingApis', [/\bMAILGUN\b/], { monthlyUsd: 1500n }),
  v('postmark', 'Postmark', 'messagingApis', [/\bPOSTMARK/], { monthlyUsd: 1500n }),
  v('mailchimp', 'Mailchimp', 'messagingApis', [/\bMAILCHIMP\b/], { monthlyUsd: 1300n }),
  v('convertkit', 'Kit (ConvertKit)', 'messagingApis', [/\bCONVERTKIT\b/, /\bKIT\.COM\b/], {
    trialDays: 14,
    monthlyUsd: 2900n,
  }),
  v('beehiiv', 'beehiiv', 'messagingApis', [/\bBEEHIIV\b/], { trialDays: 14, monthlyUsd: 4300n }),
  v('auth0', 'Auth0', 'devTools', [/\bAUTH0\b/], { monthlyUsd: 3500n }),
  v('clerk', 'Clerk', 'devTools', [/\bCLERK\.(COM|DEV)\b/, /\bCLERK\s+(INC|DEV)\b/], {
    monthlyUsd: 2500n,
  }),
  v('mapbox', 'Mapbox', 'devTools', [/\bMAPBOX\b/]),
  // Domains
  v('namecheap', 'Namecheap', 'domains', [/\bNAMECHEAP\b/]),
  v('godaddy', 'GoDaddy', 'domains', [/\bGODADDY\b/, /\bGO\s+DADDY\b/]),
  v('porkbun', 'Porkbun', 'domains', [/\bPORKBUN\b/]),
  // Payments as a vendor (fees), only when Stripe itself is the merchant.
  v('stripe', 'Stripe', 'saas', [/^STRIPE\b/], { catalogId: 'stripe' }),
  // Bare "APPLE.COM/BILL" with nothing after it: App Store / iCloud subscriptions.
  v('apple', 'Apple (App Store / iCloud)', 'saas', [/^APPLE\s*$/, /^ITUNES\b/], {
    company: 'apple',
  }),
];

const CATALOG_IDS = new Set<string>(SERVICE_CATALOG.map((service) => service.id));

const BY_ID = new Map(VENDORS.map((vendor) => [vendor.id, vendor]));

/** Bank-specific prefixes (AIB "VDP-", direct debits, POS) that are never part of the name. */
const BANK_PREFIX =
  /^(?:VDP|VDC|VDA|VDE|POS|CNC|D\/D|DD|SEPA\s+DD|SEPA\s+DIRECT\s+DEBIT|CARD\s+PAYMENT(?:\s+TO)?|PURCHASE)[-:\s]+/;

/** Resellers and processors that front the real vendor on a statement line. */
const PROCESSORS: readonly { via: string; pattern: RegExp }[] = [
  { via: 'paddle', pattern: /^PADDLE(?:\.NET|\.COM)?\s?\*\s*/ },
  { via: 'paddle', pattern: /^PADDLE\.NET\s+/ },
  { via: 'apple', pattern: /^(?:APPLE\.COM|ITUNES\.COM)\s*\/\s*BILL(?:\s+ITUNES(?:\.COM)?)?\s*/ },
  { via: 'google', pattern: /^GOOGLE\s?\*\s*/ },
  { via: 'paypal', pattern: /^(?:PAYPAL|PP)\s?\*\s*/ },
  { via: 'stripe', pattern: /^(?:STRIPE|STR)\s?\*\s*/ },
  { via: 'square', pattern: /^SQ\s?\*\s*/ },
  { via: 'shopify', pattern: /^SP\s?\*\s*/ },
  { via: 'fastspring', pattern: /^FS\s?\*\s*/ },
  { via: 'fastspring', pattern: /^FASTSPRING(?:\.COM)?\s?\*?\s+/ },
  { via: '2checkout', pattern: /^2CO(?:\.COM)?\s?\*\s*/ },
  { via: '2checkout', pattern: /^2CHECKOUT(?:\.COM)?\s?\*?\s+/ },
  { via: 'lemonsqueezy', pattern: /^LEMSQZY\s?\*\s*/ },
  { via: 'lemonsqueezy', pattern: /^LEMON\s?SQUEEZY\s?\*?\s*/ },
  { via: 'microsoft', pattern: /^MSFT\s?\*\s*/ },
];

/** Currency conversion tails: "USD 20.00 @ 0.92", "USD 20.00@0.9280 FX FEE 0.55". */
const FX_SUFFIX = /\b[A-Z]{3}\s*\d+(?:[.,]\d+)?\s*@\s*\d+(?:[.,]\d+)?.*$/;
const FX_WORDS = /\b(?:FX\s+(?:RATE|FEE)|EXCHANGE\s+RATE|NON[-\s]?(?:STERLING|EURO)).*$/;

const NOISE_WORDS = new Set([
  'INC',
  'LTD',
  'LLC',
  'LIMITED',
  'GMBH',
  'BV',
  'PLC',
  'PTY',
  'CORP',
  'CORPORATION',
  'CO',
  'SARL',
  'PBC',
  'INTERNET',
  'ONLINE',
  'HTTPS',
  'HTTP',
  'WWW',
  'RECURRING',
  'SUBSCR',
  'SUBSCRIPTION',
  'PAYMENT',
  'PURCHASE',
  'DEBIT',
  'CARD',
  'VISA',
  'MASTERCARD',
  'CONTACTLESS',
  'BILL',
  'BILLING',
  'HELP',
  'INVOICE',
  'INV',
  'THE',
]);

const PLACE_NAMES =
  /\b(?:SAN\s+FRANCISCO|NEW\s+YORK|DUBLIN|CORK|GALWAY|LIMERICK|LONDON|AMSTERDAM|SINGAPORE|SEATTLE|COVINA|WILMINGTON|DOVER|LUXEMBOURG|PALO\s+ALTO|MOUNTAIN\s+VIEW|BERLIN|PARIS|SYDNEY|TORONTO|BOSTON|AUSTIN|LOS\s+ANGELES|SUNNYVALE|WALNUT|NUREMBERG|GUNZENHAUSEN)\b/g;

const COUNTRY_CODES = new Set([
  'IE',
  'IRL',
  'US',
  'USA',
  'GB',
  'GBR',
  'UK',
  'NL',
  'NLD',
  'DE',
  'DEU',
  'FR',
  'ES',
  'SG',
  'CA',
  'AU',
  'LU',
  'LUX',
  'SE',
  'CH',
  'IL',
  'NY',
]);

const TLD = /\.(?:COM|NET|IO|AI|APP|DEV|SO|CO|ORG|IE|UK|SH|TECH|XYZ)\b/g;

/** Merchants that repeat but are not subscriptions: rent, transfers, cash, card repayments. */
const NOT_A_SUBSCRIPTION =
  /^(?:TO|FROM)\s|\b(?:RENT|MORTGAGE|LANDLORD|TRANSFER|TFR|ATM|CASH|TOP[-\s]?UP|TOPUP|SAVINGS|PENSION|LOAN|SALARY|PAYROLL|REFUND|PAYMENT\s+RECEIVED|THANK\s+YOU|EXCHANGED|REVOLUT\s+(?:PREMIUM|METAL|PLUS))\b/;

interface Stripped {
  /** Uppercased description without bank prefix, processor, FX noise. */
  text: string;
  via?: string;
}

const stripProcessor = (description: string): Stripped => {
  const upper = description.normalize('NFKC').toUpperCase().replace(/\s+/g, ' ').trim();
  const noBank = upper.replace(BANK_PREFIX, '');
  const [first] = PROCESSORS.filter(({ pattern }) => pattern.test(noBank));
  const afterProcessor = first ? noBank.replace(first.pattern, '') : noBank;
  // A second, nested processor ("PAYPAL *PADDLE.NET* X") is rare but cheap to handle.
  const [second] = PROCESSORS.filter(({ pattern }) => pattern.test(afterProcessor));
  const text = (second ? afterProcessor.replace(second.pattern, '') : afterProcessor)
    .replace(FX_SUFFIX, '')
    .replace(FX_WORDS, '')
    .replace(/HTTPS?:\/\//g, ' ')
    .replace(/\bWWW\./g, ' ')
    .trim();
  return { text, via: first?.via };
};

const isNoiseToken = (token: string) =>
  NOISE_WORDS.has(token) ||
  /^\d+$/.test(token) ||
  // Reference codes such as "2K4L91" or "X1234": several digits mixed with letters.
  (/\d.*\d/.test(token) && 4 <= token.length);

const dropTrailingCountries = (tokens: string[]): string[] => {
  const last = tokens.at(-1);
  if (1 >= tokens.length || undefined === last || !COUNTRY_CODES.has(last)) {
    return tokens;
  }
  return dropTrailingCountries(tokens.slice(0, -1));
};

const cleanTokens = (text: string): string[] => {
  const tokens = text
    .replace(TLD, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => '' !== token && !isNoiseToken(token));
  const withoutPlaces = tokens.join(' ').replace(PLACE_NAMES, ' ').trim().split(/\s+/);
  const kept = '' === withoutPlaces.join('') ? tokens : withoutPlaces;
  return dropTrailingCountries(kept.filter(Boolean)).slice(0, 4);
};

/**
 * The merchant part of a statement line, lower case, without processor prefix, place names,
 * reference numbers or legal suffixes: "PADDLE.NET* RAYCAST 8445 IE" → "raycast".
 * Returns '' when nothing meaningful is left.
 */
export const normaliseMerchant = (description: string): string =>
  cleanTokens(stripProcessor(description).text).join(' ').toLowerCase();

const titleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

const toMatch = (def: VendorDef, via: string | undefined): VendorMatch => ({
  vendorId: def.id,
  name: def.name,
  category: def.category,
  ...(def.catalogId && CATALOG_IDS.has(def.catalogId) ? { catalogId: def.catalogId } : {}),
  ...(def.trialDays ? { trialDays: def.trialDays } : {}),
  ...(via && via !== def.company && via !== def.id ? { via } : {}),
  known: true,
});

/** Match a statement description against the dev / SaaS vendor list. */
export const matchVendor = (description: string): VendorMatch => {
  const { text, via } = stripProcessor(description);
  // Keep the company of a first-party processor so "GOOGLE *GSUITE" reads "GOOGLE GSUITE".
  const subject = (
    'google' === via ? `GOOGLE ${text}` : 'apple' === via && '' !== text ? `APPLE ${text}` : text
  )
    .replace(/[^A-Z0-9.]+/g, ' ')
    .trim();
  const meaningful = cleanTokens(text).filter((token) => !COUNTRY_CODES.has(token));
  const probe = 'apple' === via && 0 === meaningful.length ? 'APPLE' : subject;
  const def = VENDORS.find((vendor) => vendor.patterns.some((pattern) => pattern.test(probe)));
  if (def) {
    return toMatch(def, via);
  }
  const merchant = cleanTokens(text).join(' ').toLowerCase();
  return {
    vendorId: null,
    name: '' === merchant ? 'Unknown merchant' : titleCase(merchant),
    category: UNKNOWN_VENDOR_CATEGORY,
    ...(via ? { via } : {}),
    known: false,
  };
};

/** Stable grouping key: the vendor id, else a slug of the normalised merchant. */
export const vendorKey = (match: VendorMatch): string =>
  match.vendorId ??
  (match.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') ||
    'unknown');

/** Usual monthly list price (USD cents) for a known vendor, from the vendor list or catalog. */
export const vendorMonthlyUsd = (vendorId: string | null): bigint | null => {
  if (null === vendorId) {
    return null;
  }
  const def = BY_ID.get(vendorId);
  if (!def) {
    return null;
  }
  if (undefined !== def.monthlyUsd) {
    return def.monthlyUsd;
  }
  const service = SERVICE_CATALOG.find((entry) => entry.id === def.catalogId);
  const plans: readonly { monthlyUsd: bigint }[] =
    service && 'plans' in service ? service.plans : [];
  return plans[0]?.monthlyUsd ?? null;
};

/** True for rent, transfers, cash, salary and card repayments: recurring but not subscriptions. */
export const isNonSubscriptionMerchant = (description: string): boolean =>
  NOT_A_SUBSCRIPTION.test(description.normalize('NFKC').toUpperCase().replace(/\s+/g, ' ').trim());

/** Number of vendors on the list (for tests and docs). */
export const VENDOR_COUNT = VENDORS.length;
