#!/usr/bin/env node
/*
 * Safi subscription monitor: finds paid APIs and services a codebase depends on and
 * optionally reports NEW ones to Safi (https://safi.kafoai.com).
 *
 * Zero dependencies, Node >= 18, ESM.
 * Usage: node scan.mjs [repoDir] [--report] [--heartbeat] [--json] [--baseline <file>]
 *        [--update-baseline]
 *
 * Privacy: this script only reads dependency manifests, deploy configs and the variable
 * NAMES of committed env templates (.env.example / .env.sample / .env.template). It never
 * opens .env, .env.local or any other file that holds secret values.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_API_URL = 'https://safi.kafoai.com';
export const DEFAULT_BASELINE = '.safi/known-subscriptions.json';
export const MAX_FILES = 5000;
export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_DEPTH = 8;
const MAX_EVIDENCE = 20;
const MAX_EVIDENCE_CHARS = 300;

export const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'vendor',
  '.turbo',
  '.cache',
  'coverage',
  'target',
  '.venv',
  'venv',
  '__pycache__',
  '.terraform',
  'Pods',
  '.expo',
  '.vercel',
  '.netlify',
  '.output',
  '.svelte-kit',
  '.worktrees',
  // Test fixtures describe fake repos, not this project's real dependencies.
  'fixtures',
  '__fixtures__',
]);

// Nested checkouts of the same repo (agent worktrees) would double-count everything.
const SKIP_REL_DIRS = new Set(['.claude/worktrees']);

// Only these env files are ever opened, and only variable names are kept.
export const ENV_TEMPLATE_FILES = new Set(['.env.example', '.env.sample', '.env.template']);

// Common framework prefixes stripped before matching env names.
const ENV_PUBLIC_PREFIXES = [
  'NEXT_PUBLIC_',
  'VITE_',
  'EXPO_PUBLIC_',
  'REACT_APP_',
  'PUBLIC_',
  'NUXT_PUBLIC_',
];

/**
 * Catalog of known paid services. Patterns ending in `*` are prefixes; others are exact.
 * Ecosystems: npm, pypi, go, gem, cargo, composer.
 */
export const CATALOG = [
  // AI APIs
  {
    fingerprint: 'openai',
    service: 'OpenAI API',
    vendor: 'OpenAI',
    category: 'aiApis',
    pricingUrl: 'https://openai.com/api/pricing',
    deps: {
      npm: ['openai', '@ai-sdk/openai', '@langchain/openai'],
      pypi: ['openai', 'langchain-openai'],
      go: ['github.com/sashabaranov/go-openai', 'github.com/openai/openai-go*'],
      gem: ['ruby-openai', 'openai'],
      cargo: ['async-openai'],
      composer: ['openai-php/*'],
    },
    env: ['OPENAI_'],
  },
  {
    fingerprint: 'anthropic',
    service: 'Anthropic API',
    vendor: 'Anthropic',
    category: 'aiApis',
    pricingUrl: 'https://www.anthropic.com/pricing',
    deps: {
      npm: ['@anthropic-ai/*', '@ai-sdk/anthropic', '@langchain/anthropic'],
      pypi: ['anthropic', 'langchain-anthropic', 'claude-agent-sdk'],
      go: ['github.com/anthropics/anthropic-sdk-go*'],
      gem: ['anthropic'],
      composer: ['anthropic-ai/*'],
    },
    env: ['ANTHROPIC_', 'CLAUDE_API_KEY'],
  },
  {
    fingerprint: 'google-gemini',
    service: 'Google Gemini / Vertex AI',
    vendor: 'Google',
    category: 'aiApis',
    pricingUrl: 'https://ai.google.dev/pricing',
    deps: {
      npm: [
        '@google/generative-ai',
        '@google/genai',
        '@ai-sdk/google',
        '@ai-sdk/google-vertex',
        '@google-cloud/vertexai',
        '@langchain/google-genai',
      ],
      pypi: ['google-generativeai', 'google-genai', 'google-cloud-aiplatform', 'vertexai'],
      go: ['github.com/google/generative-ai-go*', 'google.golang.org/genai*'],
    },
    env: ['GEMINI_', 'GOOGLE_GENERATIVE_AI_', 'GOOGLE_AI_', 'VERTEX_AI_'],
  },
  {
    fingerprint: 'mistral',
    service: 'Mistral AI API',
    vendor: 'Mistral AI',
    category: 'aiApis',
    pricingUrl: 'https://mistral.ai/pricing',
    deps: { npm: ['@mistralai/*', '@ai-sdk/mistral'], pypi: ['mistralai'] },
    env: ['MISTRAL_'],
  },
  {
    fingerprint: 'cohere',
    service: 'Cohere API',
    vendor: 'Cohere',
    category: 'aiApis',
    pricingUrl: 'https://cohere.com/pricing',
    deps: { npm: ['cohere-ai', '@ai-sdk/cohere'], pypi: ['cohere'] },
    env: ['COHERE_', 'CO_API_KEY'],
  },
  {
    fingerprint: 'replicate',
    service: 'Replicate',
    vendor: 'Replicate',
    category: 'aiApis',
    pricingUrl: 'https://replicate.com/pricing',
    deps: { npm: ['replicate'], pypi: ['replicate'] },
    env: ['REPLICATE_'],
  },
  {
    fingerprint: 'together',
    service: 'Together AI',
    vendor: 'Together AI',
    category: 'aiApis',
    pricingUrl: 'https://www.together.ai/pricing',
    deps: { npm: ['together-ai', '@ai-sdk/togetherai'], pypi: ['together'] },
    env: ['TOGETHER_'],
  },
  {
    fingerprint: 'groq',
    service: 'Groq API',
    vendor: 'Groq',
    category: 'aiApis',
    pricingUrl: 'https://groq.com/pricing',
    deps: { npm: ['groq-sdk', '@ai-sdk/groq'], pypi: ['groq'] },
    env: ['GROQ_'],
  },
  {
    fingerprint: 'elevenlabs',
    service: 'ElevenLabs API',
    vendor: 'ElevenLabs',
    category: 'aiApis',
    pricingUrl: 'https://elevenlabs.io/pricing',
    deps: { npm: ['elevenlabs', 'elevenlabs-node', '@elevenlabs/*'], pypi: ['elevenlabs'] },
    env: ['ELEVENLABS_', 'XI_API_KEY'],
  },
  {
    fingerprint: 'pinecone',
    service: 'Pinecone',
    vendor: 'Pinecone',
    category: 'databases',
    pricingUrl: 'https://www.pinecone.io/pricing',
    deps: {
      npm: ['@pinecone-database/*'],
      pypi: ['pinecone', 'pinecone-client'],
      go: ['github.com/pinecone-io/*'],
    },
    env: ['PINECONE_'],
  },
  // Coding agents
  {
    fingerprint: 'github-copilot',
    service: 'GitHub Copilot',
    vendor: 'GitHub',
    category: 'codingAgents',
    pricingUrl: 'https://github.com/features/copilot/plans',
    files: ['.github/copilot-instructions.md', '.github/instructions'],
  },
  {
    fingerprint: 'cursor',
    service: 'Cursor',
    vendor: 'Anysphere',
    category: 'codingAgents',
    pricingUrl: 'https://cursor.com/pricing',
    files: ['.cursor', '.cursorrules', '.cursorignore'],
  },
  {
    fingerprint: 'claude-code',
    service: 'Claude Code',
    vendor: 'Anthropic',
    category: 'codingAgents',
    pricingUrl: 'https://www.anthropic.com/pricing',
    deps: { npm: ['@anthropic-ai/claude-code'] },
    files: ['CLAUDE.md', '.claude/settings.json'],
    actions: ['anthropics/claude-code-action*'],
  },
  {
    fingerprint: 'devin',
    service: 'Devin',
    vendor: 'Cognition',
    category: 'codingAgents',
    pricingUrl: 'https://devin.ai/pricing',
    files: ['.devin'],
  },
  // Cloud & hosting
  {
    fingerprint: 'vercel',
    service: 'Vercel',
    vendor: 'Vercel',
    category: 'cloudHosting',
    pricingUrl: 'https://vercel.com/pricing',
    deps: { npm: ['vercel', '@vercel/*'] },
    env: ['VERCEL_'],
    files: ['vercel.json'],
    actions: ['amondnet/vercel-action*', 'vercel/*'],
    terraform: ['vercel'],
  },
  {
    fingerprint: 'aws',
    service: 'Amazon Web Services',
    vendor: 'Amazon',
    category: 'cloudHosting',
    pricingUrl: 'https://aws.amazon.com/pricing',
    deps: {
      npm: [
        'aws-sdk',
        '@aws-sdk/*',
        'aws-cdk-lib',
        'aws-cdk',
        'aws-amplify',
        '@aws-amplify/*',
        'sst',
      ],
      pypi: ['boto3', 'botocore', 'aws-cdk-lib', 'awscli'],
      go: ['github.com/aws/aws-sdk-go*'],
      gem: ['aws-sdk*'],
      cargo: ['aws-sdk-*', 'aws-config'],
      composer: ['aws/aws-sdk-php'],
    },
    env: ['AWS_'],
    images: ['public.ecr.aws/*', 'amazon/*'],
    actions: ['aws-actions/*'],
    terraform: ['aws'],
  },
  {
    fingerprint: 'gcp',
    service: 'Google Cloud',
    vendor: 'Google',
    category: 'cloudHosting',
    pricingUrl: 'https://cloud.google.com/pricing',
    deps: {
      npm: ['@google-cloud/*', 'googleapis'],
      pypi: ['google-cloud-*'],
      go: ['cloud.google.com/go*'],
      gem: ['google-cloud-*'],
      cargo: ['google-cloud-*'],
      composer: ['google/cloud*'],
    },
    env: ['GOOGLE_CLOUD_', 'GCP_', 'GCLOUD_', 'GOOGLE_APPLICATION_CREDENTIALS'],
    images: ['gcr.io/*', '*-docker.pkg.dev/*'],
    actions: ['google-github-actions/*'],
    terraform: ['google', 'google-beta'],
  },
  {
    fingerprint: 'azure',
    service: 'Microsoft Azure',
    vendor: 'Microsoft',
    category: 'cloudHosting',
    pricingUrl: 'https://azure.microsoft.com/pricing',
    deps: {
      npm: ['@azure/*'],
      pypi: ['azure-*'],
      go: ['github.com/Azure/azure-sdk-for-go*'],
      gem: ['azure*'],
      composer: ['microsoft/azure-*'],
    },
    env: ['AZURE_'],
    images: ['mcr.microsoft.com/*'],
    actions: ['azure/*', 'Azure/*'],
    terraform: ['azurerm', 'azuread'],
  },
  {
    fingerprint: 'cloudflare',
    service: 'Cloudflare',
    vendor: 'Cloudflare',
    category: 'domains',
    pricingUrl: 'https://www.cloudflare.com/plans',
    deps: {
      npm: ['wrangler', 'cloudflare', '@cloudflare/*'],
      pypi: ['cloudflare'],
      go: ['github.com/cloudflare/cloudflare-go*'],
    },
    env: ['CLOUDFLARE_', 'CF_API_TOKEN', 'CF_ACCOUNT_ID'],
    files: ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'],
    actions: ['cloudflare/*'],
    terraform: ['cloudflare'],
  },
  {
    fingerprint: 'fly',
    service: 'Fly.io',
    vendor: 'Fly.io',
    category: 'cloudHosting',
    pricingUrl: 'https://fly.io/pricing',
    env: ['FLY_'],
    files: ['fly.toml'],
    actions: ['superfly/*'],
    terraform: ['fly'],
  },
  {
    fingerprint: 'netlify',
    service: 'Netlify',
    vendor: 'Netlify',
    category: 'cloudHosting',
    pricingUrl: 'https://www.netlify.com/pricing',
    deps: { npm: ['netlify-cli', '@netlify/*'] },
    env: ['NETLIFY_'],
    files: ['netlify.toml'],
    actions: ['netlify/*', 'nwtgck/actions-netlify*'],
    terraform: ['netlify'],
  },
  {
    fingerprint: 'render',
    service: 'Render',
    vendor: 'Render',
    category: 'cloudHosting',
    pricingUrl: 'https://render.com/pricing',
    env: ['RENDER_'],
    files: ['render.yaml'],
    terraform: ['render'],
  },
  {
    fingerprint: 'railway',
    service: 'Railway',
    vendor: 'Railway',
    category: 'cloudHosting',
    pricingUrl: 'https://railway.com/pricing',
    deps: { npm: ['@railway/cli'] },
    env: ['RAILWAY_'],
    files: ['railway.json', 'railway.toml'],
  },
  {
    fingerprint: 'heroku',
    service: 'Heroku',
    vendor: 'Salesforce',
    category: 'cloudHosting',
    pricingUrl: 'https://www.heroku.com/pricing',
    deps: { npm: ['heroku'] },
    env: ['HEROKU_'],
    files: ['heroku.yml'],
    actions: ['akhileshns/heroku-deploy*'],
    terraform: ['heroku'],
  },
  // Databases
  {
    fingerprint: 'supabase',
    service: 'Supabase',
    vendor: 'Supabase',
    category: 'databases',
    pricingUrl: 'https://supabase.com/pricing',
    deps: {
      npm: ['supabase', '@supabase/*'],
      pypi: ['supabase'],
      go: ['github.com/supabase-community/*'],
      gem: ['supabase'],
    },
    env: ['SUPABASE_'],
    files: ['supabase/config.toml'],
    images: ['supabase/*'],
    actions: ['supabase/*'],
    terraform: ['supabase'],
  },
  {
    fingerprint: 'neon',
    service: 'Neon Postgres',
    vendor: 'Neon',
    category: 'databases',
    pricingUrl: 'https://neon.com/pricing',
    deps: { npm: ['@neondatabase/*'], pypi: ['neon-api'] },
    env: ['NEON_'],
    actions: ['neondatabase/*'],
    terraform: ['neon'],
  },
  {
    fingerprint: 'planetscale',
    service: 'PlanetScale',
    vendor: 'PlanetScale',
    category: 'databases',
    pricingUrl: 'https://planetscale.com/pricing',
    deps: { npm: ['@planetscale/*'] },
    env: ['PLANETSCALE_'],
    actions: ['planetscale/*'],
    terraform: ['planetscale'],
  },
  {
    fingerprint: 'mongodb-atlas',
    service: 'MongoDB Atlas',
    vendor: 'MongoDB',
    category: 'databases',
    pricingUrl: 'https://www.mongodb.com/pricing',
    deps: { npm: ['mongodb-atlas-api-client'], pypi: ['atlasapi'] },
    env: ['MONGODB_ATLAS_', 'ATLAS_PUBLIC_KEY', 'ATLAS_PRIVATE_KEY'],
    actions: ['mongodb/atlas-github-action*'],
    terraform: ['mongodbatlas'],
  },
  {
    fingerprint: 'upstash',
    service: 'Upstash',
    vendor: 'Upstash',
    category: 'databases',
    pricingUrl: 'https://upstash.com/pricing',
    deps: {
      npm: ['@upstash/*'],
      pypi: ['upstash-redis', 'upstash-vector', 'qstash'],
      go: ['github.com/upstash/*'],
    },
    env: ['UPSTASH_', 'QSTASH_', 'KV_REST_API_'],
    terraform: ['upstash'],
  },
  {
    fingerprint: 'firebase',
    service: 'Firebase',
    vendor: 'Google',
    category: 'databases',
    pricingUrl: 'https://firebase.google.com/pricing',
    deps: {
      npm: [
        'firebase',
        'firebase-admin',
        'firebase-tools',
        '@firebase/*',
        '@react-native-firebase/*',
      ],
      pypi: ['firebase-admin'],
      go: ['firebase.google.com/go*'],
    },
    env: ['FIREBASE_'],
    files: ['firebase.json', '.firebaserc'],
    actions: ['FirebaseExtended/*', 'w9jds/firebase-action*'],
  },
  // Monitoring
  {
    fingerprint: 'sentry',
    service: 'Sentry',
    vendor: 'Sentry',
    category: 'monitoring',
    pricingUrl: 'https://sentry.io/pricing',
    deps: {
      npm: ['@sentry/*'],
      pypi: ['sentry-sdk'],
      go: ['github.com/getsentry/sentry-go*'],
      gem: ['sentry-ruby', 'sentry-rails', 'sentry-raven'],
      cargo: ['sentry'],
      composer: ['sentry/*'],
    },
    env: ['SENTRY_'],
    files: ['.sentryclirc'],
    images: ['getsentry/*'],
    actions: ['getsentry/*'],
    terraform: ['sentry'],
  },
  {
    fingerprint: 'datadog',
    service: 'Datadog',
    vendor: 'Datadog',
    category: 'monitoring',
    pricingUrl: 'https://www.datadoghq.com/pricing',
    deps: {
      npm: ['dd-trace', '@datadog/*', 'datadog-metrics'],
      pypi: ['ddtrace', 'datadog', 'datadog-api-client'],
      go: ['github.com/DataDog/*', 'gopkg.in/DataDog/*'],
      gem: ['ddtrace', 'datadog', 'dogstatsd-ruby'],
      composer: ['datadog/*'],
    },
    env: ['DD_', 'DATADOG_'],
    images: ['datadog/*', 'gcr.io/datadoghq/*', 'public.ecr.aws/datadog/*'],
    actions: ['DataDog/*', 'datadog/*'],
    terraform: ['datadog'],
  },
  {
    fingerprint: 'posthog',
    service: 'PostHog',
    vendor: 'PostHog',
    category: 'monitoring',
    pricingUrl: 'https://posthog.com/pricing',
    deps: {
      npm: ['posthog-js', 'posthog-node', 'posthog-react-native'],
      pypi: ['posthog'],
      go: ['github.com/posthog/posthog-go*'],
      gem: ['posthog-ruby'],
      composer: ['posthog/posthog-php'],
    },
    env: ['POSTHOG_'],
    terraform: ['posthog'],
  },
  {
    fingerprint: 'logrocket',
    service: 'LogRocket',
    vendor: 'LogRocket',
    category: 'monitoring',
    pricingUrl: 'https://logrocket.com/pricing',
    deps: { npm: ['logrocket', 'logrocket-react', '@logrocket/*'] },
    env: ['LOGROCKET_'],
  },
  // Messaging APIs
  {
    fingerprint: 'twilio',
    service: 'Twilio',
    vendor: 'Twilio',
    category: 'messagingApis',
    pricingUrl: 'https://www.twilio.com/en-us/pricing',
    deps: {
      npm: ['twilio', '@twilio/*'],
      pypi: ['twilio'],
      go: ['github.com/twilio/twilio-go*'],
      gem: ['twilio-ruby'],
      cargo: ['twilio'],
      composer: ['twilio/sdk'],
    },
    env: ['TWILIO_'],
  },
  {
    fingerprint: 'resend',
    service: 'Resend',
    vendor: 'Resend',
    category: 'messagingApis',
    pricingUrl: 'https://resend.com/pricing',
    deps: {
      npm: ['resend'],
      pypi: ['resend'],
      go: ['github.com/resend/resend-go*'],
      gem: ['resend'],
      composer: ['resend/*'],
    },
    env: ['RESEND_'],
  },
  {
    fingerprint: 'sendgrid',
    service: 'SendGrid',
    vendor: 'Twilio',
    category: 'messagingApis',
    pricingUrl: 'https://sendgrid.com/en-us/pricing',
    deps: {
      npm: ['@sendgrid/*'],
      pypi: ['sendgrid'],
      go: ['github.com/sendgrid/*'],
      gem: ['sendgrid-ruby'],
      composer: ['sendgrid/*'],
    },
    env: ['SENDGRID_'],
  },
  {
    fingerprint: 'postmark',
    service: 'Postmark',
    vendor: 'ActiveCampaign',
    category: 'messagingApis',
    pricingUrl: 'https://postmarkapp.com/pricing',
    deps: {
      npm: ['postmark'],
      pypi: ['postmarker'],
      gem: ['postmark', 'postmark-rails'],
      composer: ['wildbit/postmark-php'],
    },
    env: ['POSTMARK_'],
  },
  {
    fingerprint: 'mailgun',
    service: 'Mailgun',
    vendor: 'Sinch',
    category: 'messagingApis',
    pricingUrl: 'https://www.mailgun.com/pricing',
    deps: {
      npm: ['mailgun.js', 'mailgun-js'],
      go: ['github.com/mailgun/mailgun-go*'],
      gem: ['mailgun-ruby'],
      composer: ['mailgun/mailgun-php'],
    },
    env: ['MAILGUN_'],
  },
  // Software subscriptions / SaaS
  {
    fingerprint: 'stripe',
    service: 'Stripe (usage-based fees)',
    vendor: 'Stripe',
    category: 'saas',
    pricingUrl: 'https://stripe.com/pricing',
    note: 'Usage-based processing fees rather than a fixed subscription.',
    deps: {
      npm: ['stripe', '@stripe/*'],
      pypi: ['stripe'],
      go: ['github.com/stripe/stripe-go*'],
      gem: ['stripe'],
      cargo: ['async-stripe', 'stripe-rust'],
      composer: ['stripe/stripe-php'],
    },
    env: ['STRIPE_'],
    terraform: ['stripe'],
  },
  {
    fingerprint: 'algolia',
    service: 'Algolia',
    vendor: 'Algolia',
    category: 'saas',
    pricingUrl: 'https://www.algolia.com/pricing',
    deps: {
      npm: ['algoliasearch', '@algolia/*', 'react-instantsearch'],
      pypi: ['algoliasearch'],
      go: ['github.com/algolia/*'],
      gem: ['algolia', 'algoliasearch'],
      composer: ['algolia/*'],
    },
    env: ['ALGOLIA_'],
    terraform: ['algolia'],
  },
  {
    fingerprint: 'mapbox',
    service: 'Mapbox',
    vendor: 'Mapbox',
    category: 'saas',
    pricingUrl: 'https://www.mapbox.com/pricing',
    deps: { npm: ['mapbox-gl', '@mapbox/*', '@rnmapbox/*', 'react-map-gl'], pypi: ['mapbox'] },
    env: ['MAPBOX_'],
  },
  {
    fingerprint: 'clerk',
    service: 'Clerk',
    vendor: 'Clerk',
    category: 'saas',
    pricingUrl: 'https://clerk.com/pricing',
    deps: {
      npm: ['@clerk/*'],
      pypi: ['clerk-backend-api'],
      go: ['github.com/clerk/*'],
      gem: ['clerk-sdk-ruby'],
    },
    env: ['CLERK_'],
  },
  {
    fingerprint: 'auth0',
    service: 'Auth0',
    vendor: 'Okta',
    category: 'saas',
    pricingUrl: 'https://auth0.com/pricing',
    deps: {
      npm: ['auth0', '@auth0/*'],
      pypi: ['auth0-python'],
      go: ['github.com/auth0/*'],
      gem: ['auth0'],
      composer: ['auth0/*'],
    },
    env: ['AUTH0_'],
    terraform: ['auth0'],
  },
];

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

const globToRegExp = (pattern) =>
  new RegExp(
    `^${pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\/]/g, '\\$&'))
      .join('.*')}$`,
  );

const regexCache = new Map();
export const matchesPattern = (value, pattern) => {
  if (!pattern.includes('*')) {
    return value === pattern;
  }
  if (!regexCache.has(pattern)) {
    regexCache.set(pattern, globToRegExp(pattern));
  }
  return regexCache.get(pattern).test(value);
};

/** Entries whose patterns match `value`; exact matches win over wildcard matches. */
const matchCatalog = (value, listOf, catalog) => {
  const exact = catalog.filter((entry) => (listOf(entry) ?? []).includes(value));
  if (0 < exact.length) {
    return exact;
  }
  return catalog.filter((entry) =>
    (listOf(entry) ?? []).some(
      (pattern) => pattern.includes('*') && matchesPattern(value, pattern),
    ),
  );
};

export const normalizePythonName = (name) => name.toLowerCase().replace(/[_.]+/g, '-');

const stripEnvPrefix = (name) => {
  const prefix = ENV_PUBLIC_PREFIXES.find((candidate) => name.startsWith(candidate));
  return prefix ? name.slice(prefix.length) : name;
};

const envMatches = (name, patterns) => {
  const bare = stripEnvPrefix(name);
  return patterns.some((pattern) =>
    pattern.endsWith('_') ? bare.startsWith(pattern) || name.startsWith(pattern) : bare === pattern,
  );
};

/** A raw signal: which catalog entry it maps to and a human-readable evidence line. */
const signal = (entry, evidence) => ({ fingerprint: entry.fingerprint, evidence });

const depSignals = (ecosystem, deps, file, catalog) =>
  deps.flatMap(({ name, version }) =>
    matchCatalog(
      'pypi' === ecosystem ? normalizePythonName(name) : name,
      (entry) => entry.deps?.[ecosystem],
      catalog,
    ).map((entry) => signal(entry, `${file}: ${name}${version ? `@${version}` : ''}`)),
  );

// ---------------------------------------------------------------------------
// Parsers (pure: text in, signals out)
// ---------------------------------------------------------------------------

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const detectFromPackageJson = (text, file = 'package.json', catalog = CATALOG) => {
  const pkg = parseJson(text);
  if (!pkg || 'object' !== typeof pkg) {
    return [];
  }
  const deps = DEP_FIELDS.flatMap((field) =>
    Object.entries(pkg[field] ?? {}).map(([name, version]) => ({ name, version: String(version) })),
  );
  return depSignals('npm', deps, file, catalog);
};

export const detectFromRequirementsTxt = (text, file = 'requirements.txt', catalog = CATALOG) => {
  const deps = text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, '').trim())
    .filter((line) => '' !== line && !line.startsWith('-'))
    .map((line) => {
      const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*([<>=~!].*)?$/.exec(
        line.split(';')[0].trim(),
      );
      return match ? { name: match[1], version: match[2]?.trim() } : null;
    })
    .filter(Boolean);
  return depSignals('pypi', deps, file, catalog);
};

export const detectFromPyproject = (text, file = 'pyproject.toml', catalog = CATALOG) => {
  let section = '';
  const deps = text.split(/\r?\n/).flatMap((rawLine) => {
    const line = rawLine.replace(/#.*/, '').trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      section = header[1];
      return [];
    }
    // Poetry style: name = "^1.0"
    if (/^tool\.poetry\.(?:.*\.)?dependencies$/.test(section)) {
      const kv = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*(.*)$/.exec(line);
      return kv && 'python' !== kv[1] ? [{ name: kv[1], version: kv[2].replace(/["']/g, '') }] : [];
    }
    // PEP 621 style: quoted requirement strings inside dependency arrays.
    if (!/^project(?:\.optional-dependencies)?$|dependency-groups/.test(section)) {
      return [];
    }
    // In [project], only `dependencies = [...]` and continuation lines hold requirements.
    if ('project' === section && !/^\s*(?:dependencies\s*=\s*\[)?\s*["']/.test(line)) {
      return [];
    }
    return [
      ...line.matchAll(
        /["']([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*([<>=~!][^"';]*)?[^"']*["']/g,
      ),
    ].map((match) => ({ name: match[1], version: match[2]?.trim() }));
  });
  return depSignals('pypi', deps, file, catalog);
};

export const detectFromGoMod = (text, file = 'go.mod', catalog = CATALOG) => {
  const deps = [
    ...text.matchAll(/^\s*(?:require\s+)?([a-zA-Z0-9.-]+\.[a-z]+\/[^\s]+)\s+(v[^\s]+)/gm),
  ].map((match) => ({ name: match[1], version: match[2] }));
  return depSignals('go', deps, file, catalog);
};

export const detectFromGemfile = (text, file = 'Gemfile', catalog = CATALOG) => {
  const deps = [...text.matchAll(/^\s*gem\s+["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/gm)].map(
    (match) => ({
      name: match[1],
      version: match[2],
    }),
  );
  return depSignals('gem', deps, file, catalog);
};

export const detectFromCargoToml = (text, file = 'Cargo.toml', catalog = CATALOG) => {
  let section = '';
  const deps = text.split(/\r?\n/).flatMap((rawLine) => {
    const line = rawLine.replace(/#.*/, '').trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      section = header[1];
      return [];
    }
    if (!/(?:^|\.)(?:dev-|build-)?dependencies$/.test(section)) {
      return [];
    }
    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(line);
    if (!kv) {
      return [];
    }
    const version = /^"([^"]+)"/.exec(kv[2])?.[1] ?? /version\s*=\s*"([^"]+)"/.exec(kv[2])?.[1];
    return [{ name: kv[1], version }];
  });
  return depSignals('cargo', deps, file, catalog);
};

export const detectFromComposerJson = (text, file = 'composer.json', catalog = CATALOG) => {
  const pkg = parseJson(text);
  const deps = ['require', 'require-dev'].flatMap((field) =>
    Object.entries(pkg?.[field] ?? {}).map(([name, version]) => ({
      name,
      version: String(version),
    })),
  );
  return depSignals('composer', deps, file, catalog);
};

/** Extracts variable NAMES only from an env template. Values are discarded immediately. */
export const parseEnvNames = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1])
    .filter(Boolean);

export const detectFromEnvTemplate = (text, file = '.env.example', catalog = CATALOG) =>
  parseEnvNames(text).flatMap((name) =>
    catalog
      .filter((entry) => entry.env && envMatches(name, entry.env))
      .map((entry) => signal(entry, `${file}: ${name}`)),
  );

export const detectFromDockerImages = (text, file = 'Dockerfile', catalog = CATALOG) => {
  const images = [
    ...text.matchAll(/^\s*FROM\s+(?:--platform=\S+\s+)?([^\s]+)/gim),
    ...text.matchAll(/^\s*image:\s*["']?([^\s"']+)/gim),
  ].map((match) => match[1]);
  return images.flatMap((image) => {
    const bare = image.split('@')[0].replace(/:[^/]*$/, '');
    return matchCatalog(bare, (entry) => entry.images, catalog).map((entry) =>
      signal(entry, `${file}: ${image}`),
    );
  });
};

export const detectFromWorkflow = (text, file = '.github/workflows/ci.yml', catalog = CATALOG) =>
  [...text.matchAll(/^\s*-?\s*uses:\s*["']?([^\s"'#]+)/gm)].flatMap((match) => {
    const action = match[1];
    const bare = action.split('@')[0];
    return matchCatalog(bare, (entry) => entry.actions, catalog).map((entry) =>
      signal(entry, `${file}: uses ${action}`),
    );
  });

export const detectFromTerraform = (text, file = 'main.tf', catalog = CATALOG) => {
  const providers = new Set([
    ...[...text.matchAll(/^\s*provider\s+"([a-z0-9-]+)"/gm)].map((match) => match[1]),
    ...[...text.matchAll(/source\s*=\s*"(?:[^"/]+\/)?([^"/]+)\/([a-z0-9-]+)"/g)].map(
      (match) => match[2],
    ),
  ]);
  return [...providers].flatMap((provider) =>
    catalog
      .filter((entry) => (entry.terraform ?? []).includes(provider))
      .map((entry) => signal(entry, `${file}: provider "${provider}"`)),
  );
};

/** Deploy config files whose presence alone is a signal (vercel.json, fly.toml, ...). */
export const detectFromPaths = (relPaths, catalog = CATALOG) =>
  catalog.flatMap((entry) =>
    (entry.files ?? []).flatMap((file) =>
      relPaths
        .filter((rel) => rel === file || rel.endsWith(`/${file}`))
        .slice(0, 5)
        .map((rel) => signal(entry, `${rel}: present`)),
    ),
  );

// ---------------------------------------------------------------------------
// Repo walking
// ---------------------------------------------------------------------------

const PARSERS_BY_NAME = {
  'package.json': detectFromPackageJson,
  'requirements.txt': detectFromRequirementsTxt,
  'requirements-dev.txt': detectFromRequirementsTxt,
  'pyproject.toml': detectFromPyproject,
  'go.mod': detectFromGoMod,
  Gemfile: detectFromGemfile,
  'Cargo.toml': detectFromCargoToml,
  'composer.json': detectFromComposerJson,
  Dockerfile: detectFromDockerImages,
  'docker-compose.yml': detectFromDockerImages,
  'docker-compose.yaml': detectFromDockerImages,
  'compose.yml': detectFromDockerImages,
  'compose.yaml': detectFromDockerImages,
};

export const parserFor = (relPath) => {
  const base = path.posix.basename(relPath);
  if (ENV_TEMPLATE_FILES.has(base)) {
    return detectFromEnvTemplate;
  }
  if (base.startsWith('.env')) {
    // .env, .env.local, .env.production ... hold real secrets: never read them.
    return null;
  }
  if (PARSERS_BY_NAME[base]) {
    return PARSERS_BY_NAME[base];
  }
  if (base.startsWith('Dockerfile.') || base.endsWith('.Dockerfile')) {
    return detectFromDockerImages;
  }
  if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(relPath)) {
    return detectFromWorkflow;
  }
  if (base.endsWith('.tf')) {
    return detectFromTerraform;
  }
  return null;
};

/** Lists repo-relative POSIX paths (files and directories), skipping vendored/build dirs. */
export const walkRepo = (root, { maxFiles = MAX_FILES, maxDepth = MAX_DEPTH } = {}) => {
  const results = [];
  const queue = [{ dir: root, rel: '', depth: 0 }];
  while (0 < queue.length && results.length < maxFiles) {
    const { dir, rel, depth } = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((dirent) => {
        if (results.length >= maxFiles || dirent.isSymbolicLink()) {
          return;
        }
        const childRel = rel ? `${rel}/${dirent.name}` : dirent.name;
        if (dirent.isDirectory()) {
          if (SKIP_DIRS.has(dirent.name) || SKIP_REL_DIRS.has(childRel)) {
            return;
          }
          results.push({ rel: childRel, isDir: true });
          if (depth < maxDepth) {
            queue.push({ dir: path.join(dir, dirent.name), rel: childRel, depth: depth + 1 });
          }
          return;
        }
        if (dirent.isFile()) {
          results.push({ rel: childRel, isDir: false });
        }
      });
  }
  return results;
};

const readCapped = (absPath) => {
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
      return null;
    }
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
};

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Folds raw signals into one finding per fingerprint. */
export const groupSignals = (signals, catalog = CATALOG) => {
  const byFingerprint = new Map();
  signals.forEach(({ fingerprint, evidence }) => {
    const entry = catalog.find((candidate) => candidate.fingerprint === fingerprint);
    if (!entry) {
      return;
    }
    if (!byFingerprint.has(fingerprint)) {
      byFingerprint.set(fingerprint, {
        fingerprint,
        service: entry.service,
        vendor: entry.vendor,
        category: entry.category,
        pricingUrl: entry.pricingUrl,
        ...(entry.note ? { note: entry.note } : {}),
        evidence: [],
      });
    }
    const finding = byFingerprint.get(fingerprint);
    const line = truncate(evidence, MAX_EVIDENCE_CHARS);
    if (!finding.evidence.includes(line) && finding.evidence.length < MAX_EVIDENCE) {
      finding.evidence.push(line);
    }
  });
  return [...byFingerprint.values()].sort(
    (a, b) => a.category.localeCompare(b.category) || a.service.localeCompare(b.service),
  );
};

export const scanRepo = (root, { catalog = CATALOG, maxFiles = MAX_FILES } = {}) => {
  const absRoot = path.resolve(root);
  const entries = walkRepo(absRoot, { maxFiles });
  const relPaths = entries.map((entry) => entry.rel);
  let scannedFiles = 0;
  const signals = [
    ...detectFromPaths(relPaths, catalog),
    ...entries
      .filter((entry) => !entry.isDir)
      .flatMap(({ rel }) => {
        const parser = parserFor(rel);
        if (!parser) {
          return [];
        }
        const text = readCapped(path.join(absRoot, ...rel.split('/')));
        if (null === text) {
          return [];
        }
        scannedFiles += 1;
        return parser(text, rel, catalog);
      }),
  ];
  return { root: absRoot, scannedFiles, findings: groupSignals(signals, catalog) };
};

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

export const baselineFingerprints = (baseline) => {
  if (!baseline) {
    return new Set();
  }
  const list = Array.isArray(baseline) ? baseline : (baseline.subscriptions ?? []);
  return new Set(
    list.map((item) => ('string' === typeof item ? item : item?.fingerprint)).filter(Boolean),
  );
};

export const diffAgainstBaseline = (findings, baseline) => {
  const known = baselineFingerprints(baseline);
  return {
    newFindings: findings.filter((finding) => !known.has(finding.fingerprint)),
    knownFindings: findings.filter((finding) => known.has(finding.fingerprint)),
  };
};

export const readBaseline = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

export const mergeIntoBaseline = (baseline, findings, now = new Date().toISOString()) => {
  const existing = Array.isArray(baseline)
    ? baseline.map((fingerprint) => ({ fingerprint }))
    : [...(baseline?.subscriptions ?? [])];
  const known = baselineFingerprints(existing);
  const added = findings
    .filter((finding) => !known.has(finding.fingerprint))
    .map(({ fingerprint, service, category }) => ({
      fingerprint,
      service,
      category,
      firstSeen: now,
    }));
  return {
    version: 1,
    updatedAt: now,
    subscriptions: [...existing, ...added].sort((a, b) =>
      a.fingerprint.localeCompare(b.fingerprint),
    ),
  };
};

export const writeBaseline = (file, baseline) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`);
};

// ---------------------------------------------------------------------------
// Reporting to Safi
// ---------------------------------------------------------------------------

export const parseGitRemote = (url) => {
  const match = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match ? `${match[1]}/${match[2]}` : null;
};

export const detectRepoName = (root) => {
  try {
    const url = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = parseGitRemote(url);
    if (parsed) {
      return parsed;
    }
  } catch {
    // No git or no origin remote: fall back to the folder name.
  }
  return path.basename(path.resolve(root));
};

export const toReportPayload = (finding, { detectedIn, agent }) => ({
  fingerprint: finding.fingerprint.slice(0, 100),
  service: finding.service.slice(0, 100),
  vendor: finding.vendor?.slice(0, 100),
  category: finding.category,
  detectedIn: detectedIn?.slice(0, 200),
  evidence: finding.evidence
    .slice(0, MAX_EVIDENCE)
    .map((line) => truncate(line, MAX_EVIDENCE_CHARS)),
  ...(finding.pricingUrl?.startsWith('https://') ? { pricingUrl: finding.pricingUrl } : {}),
  agent: agent.slice(0, 100),
});

const reportOne = async (finding, { endpoint, apiKey, detectedIn, agent, fetchImpl }) => {
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(toReportPayload(finding, { detectedIn, agent })),
    });
    const body = await response.json().catch(() => ({}));
    return {
      fingerprint: finding.fingerprint,
      ok: response.ok,
      httpStatus: response.status,
      id: body.id,
      status: body.status,
      duplicate: body.duplicate,
      error: response.ok ? undefined : (body.error ?? `HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      fingerprint: finding.fingerprint,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const reportFindings = async (
  findings,
  { apiUrl, apiKey, detectedIn, agent, fetchImpl = globalThis.fetch },
) => {
  const endpoint = `${apiUrl.replace(/\/+$/, '')}/api/agent/v1/subscriptions`;
  const options = { endpoint, apiKey, detectedIn, agent, fetchImpl };
  // Sequential on purpose: keeps request volume polite and stops early on 401.
  return findings.reduce(async (previous, finding) => {
    const results = await previous;
    if (results.some((result) => 401 === result.httpStatus)) {
      return results;
    }
    return [...results, await reportOne(finding, options)];
  }, Promise.resolve([]));
};

// ---------------------------------------------------------------------------
// Heartbeat: tells Safi which known services this repo still uses
// ---------------------------------------------------------------------------

export const MAX_HEARTBEAT_FINGERPRINTS = 200;

export const toHeartbeatPayload = (findings, { detectedIn }) => ({
  fingerprints: findings.slice(0, MAX_HEARTBEAT_FINGERPRINTS).map((finding) => ({
    fingerprint: finding.fingerprint.slice(0, 100),
    service: finding.service.slice(0, 100),
  })),
  ...(detectedIn ? { detectedIn: detectedIn.slice(0, 200) } : {}),
});

/**
 * POSTs every CURRENT finding (new and known) to /api/agent/v1/seen so Safi can tell which
 * subscriptions are still in use. Safi only refreshes services it already knows; it never creates
 * new ones from a heartbeat.
 */
export const sendHeartbeat = async (
  findings,
  { apiUrl, apiKey, detectedIn, fetchImpl = globalThis.fetch },
) => {
  const endpoint = `${apiUrl.replace(/\/+$/, '')}/api/agent/v1/seen`;
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(toHeartbeatPayload(findings, { detectedIn })),
    });
    const body = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      httpStatus: response.status,
      seen: Array.isArray(body.seen) ? body.seen : [],
      ignored: Array.isArray(body.ignored) ? body.ignored : [],
      error: response.ok ? undefined : (body.error ?? `HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      ok: false,
      seen: [],
      ignored: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export const parseArgs = (argv) => {
  const args = {
    repoDir: '.',
    report: false,
    heartbeat: false,
    json: false,
    baseline: null,
    updateBaseline: false,
    help: false,
  };
  const rest = [...argv];
  while (0 < rest.length) {
    const arg = rest.shift();
    if ('--report' === arg) {
      args.report = true;
    } else if ('--heartbeat' === arg) {
      args.heartbeat = true;
    } else if ('--json' === arg) {
      args.json = true;
    } else if ('--update-baseline' === arg) {
      args.updateBaseline = true;
    } else if ('--baseline' === arg) {
      args.baseline = rest.shift() ?? null;
    } else if (arg.startsWith('--baseline=')) {
      args.baseline = arg.slice('--baseline='.length);
    } else if ('--help' === arg || '-h' === arg) {
      args.help = true;
    } else if (!arg.startsWith('--')) {
      args.repoDir = arg;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return args;
};

const HELP = `Safi subscription monitor
Finds paid APIs and services this codebase uses and reports new ones to Safi.

Usage: node scan.mjs [repoDir] [--report] [--heartbeat] [--json] [--baseline <file>] [--update-baseline]

  --report            POST each NEW finding to Safi (needs SAFI_API_KEY)
  --heartbeat         Also tell Safi which known services this repo still uses (all CURRENT
                      findings, not only new ones), so it can flag subscriptions unused 30+ days
  --json              Machine-readable output
  --baseline <file>   Known-subscriptions file (default: <repo>/${DEFAULT_BASELINE})
  --update-baseline   Mark every current finding as known

Environment: SAFI_API_KEY, SAFI_API_URL (default ${DEFAULT_API_URL}), SAFI_AGENT_NAME.
Only manifests, deploy configs and env template variable NAMES are read. .env files are never opened.`;

const pad = (text, width) =>
  text.length >= width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);

export const formatTable = (findings, newSet) => {
  if (0 === findings.length) {
    return 'No paid services detected.';
  }
  const header = `${pad('STATUS', 7)} ${pad('SERVICE', 28)} ${pad('CATEGORY', 14)} EVIDENCE`;
  const rows = findings.map((finding) => {
    const status = newSet.has(finding.fingerprint) ? 'NEW' : 'known';
    const more = 1 < finding.evidence.length ? ` (+${finding.evidence.length - 1} more)` : '';
    return `${pad(status, 7)} ${pad(finding.service, 28)} ${pad(finding.category, 14)} ${finding.evidence[0] ?? ''}${more}`;
  });
  return [header, ...rows].join('\n');
};

export const main = async (argv = process.argv.slice(2), env = process.env) => {
  const args = (() => {
    try {
      return parseArgs(argv);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      console.error(HELP);
      return null;
    }
  })();
  if (!args) {
    return 2;
  }
  if (args.help) {
    console.log(HELP);
    return 0;
  }

  const root = path.resolve(args.repoDir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`Not a directory: ${root}`);
    return 2;
  }
  const apiKey = env.SAFI_API_KEY?.trim();
  if ((args.report || args.heartbeat) && !apiKey) {
    console.error(
      'SAFI_API_KEY is not set. Create a key in Safi (Account → Coding agents), then run:\n' +
        '  export SAFI_API_KEY=safi_...\n' +
        'Nothing was reported.',
    );
    return 2;
  }

  const baselineFile = path.resolve(root, args.baseline ?? DEFAULT_BASELINE);
  const baseline = readBaseline(baselineFile);
  const { scannedFiles, findings } = scanRepo(root);
  const { newFindings } = diffAgainstBaseline(findings, baseline);
  const newSet = new Set(newFindings.map((finding) => finding.fingerprint));

  let reported = null;
  let nextBaseline = null;
  let exitCode = 0;
  if (args.report && 0 < newFindings.length) {
    const detectedIn = detectRepoName(root);
    reported = await reportFindings(newFindings, {
      apiUrl: env.SAFI_API_URL?.trim() || DEFAULT_API_URL,
      apiKey,
      detectedIn,
      agent: env.SAFI_AGENT_NAME?.trim() || 'coding-agent',
    });
    const okSet = new Set(
      reported.filter((result) => result.ok).map((result) => result.fingerprint),
    );
    if (0 < okSet.size) {
      nextBaseline = mergeIntoBaseline(
        baseline,
        newFindings.filter((finding) => okSet.has(finding.fingerprint)),
      );
    }
    if (reported.some((result) => !result.ok)) {
      exitCode = 1;
    }
  }
  let heartbeat = null;
  const keyRejected = Boolean(reported?.some((result) => 401 === result.httpStatus));
  if (args.heartbeat && 0 < findings.length && !keyRejected) {
    heartbeat = await sendHeartbeat(findings, {
      apiUrl: env.SAFI_API_URL?.trim() || DEFAULT_API_URL,
      apiKey,
      detectedIn: detectRepoName(root),
    });
    if (!heartbeat.ok) {
      exitCode = 1;
    }
  }
  if (args.updateBaseline) {
    nextBaseline = mergeIntoBaseline(nextBaseline ?? baseline, findings);
  }
  if (nextBaseline) {
    writeBaseline(baselineFile, nextBaseline);
  }

  const relBaseline = path.relative(root, baselineFile) || baselineFile;
  if (args.json) {
    console.log(
      JSON.stringify(
        {
          repo: path.basename(root),
          scannedFiles,
          baseline: relBaseline,
          baselineUpdated: Boolean(nextBaseline),
          newCount: newFindings.length,
          findings: findings.map((finding) => ({
            ...finding,
            isNew: newSet.has(finding.fingerprint),
          })),
          ...(reported ? { reported } : {}),
          ...(heartbeat ? { heartbeat } : {}),
        },
        null,
        2,
      ),
    );
    return exitCode;
  }

  console.log(formatTable(findings, newSet));
  console.log(
    `\n${findings.length} service(s) found, ${newFindings.length} new (baseline: ${relBaseline}, ${scannedFiles} file(s) read).`,
  );
  if (reported) {
    reported.forEach((result) => {
      const label = result.ok
        ? `${result.duplicate ? 'already in Safi' : 'reported'} (${result.status ?? 'ok'})`
        : `FAILED: ${result.error}`;
      console.log(`  ${result.fingerprint}: ${label}`);
    });
    if (reported.some((result) => 401 === result.httpStatus)) {
      console.error('Safi rejected the API key (401). Check SAFI_API_KEY or create a new key.');
    }
  } else if (0 < newFindings.length && !args.report) {
    console.log(
      'Run with --report to send the new ones to Safi, or --update-baseline to mark them known.',
    );
  }
  if (heartbeat) {
    console.log(
      heartbeat.ok
        ? `Heartbeat sent: ${heartbeat.seen.length} known service(s) marked as still in use.`
        : `Heartbeat FAILED: ${heartbeat.error}`,
    );
    if (401 === heartbeat.httpStatus) {
      console.error('Safi rejected the API key (401). Check SAFI_API_KEY or create a new key.');
    }
  }
  if (args.updateBaseline) {
    console.log(`Baseline updated: ${relBaseline}`);
  }
  return exitCode;
};

const isDirectRun = () => {
  try {
    return (
      Boolean(process.argv[1]) &&
      fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
};

if (isDirectRun()) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
