import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import type { PrismaConfig } from 'prisma/config';

if (existsSync('.env')) {
  loadEnvFile('.env');
}

// Migrations take advisory locks that hang behind a transaction-mode pooler (Supabase :6543).
// Use DIRECT_URL when set, otherwise route Supabase pooler URLs to session mode (:5432).
const migrationUrl = (url: string | undefined) => {
  if (process.env.DIRECT_URL) {
    return process.env.DIRECT_URL;
  }
  if (!url?.includes('.pooler.supabase.com:6543')) {
    return url;
  }
  return url.replace('.pooler.supabase.com:6543', '.pooler.supabase.com:5432');
};

export default {
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: migrationUrl(process.env.DATABASE_URL),
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  experimental: {
    externalTables: true,
  },
  tables: {
    external: ['cron.job', 'cron.job_run_details'],
  },
} satisfies PrismaConfig;
