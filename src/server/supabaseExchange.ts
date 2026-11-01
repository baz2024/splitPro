import { randomBytes } from 'node:crypto';
import { z } from 'zod';

import { env } from '~/env';
import { authOptions } from '~/server/auth';
import { db } from '~/server/db';

export const SUPABASE_PROVIDER = 'supabase';
export const DEFAULT_NEXT_PATH = '/balances';
export const SIGNIN_ERROR_PATH = '/auth/signin?error=SupabaseSignin';

const DEFAULT_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const supabaseUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().nullish(),
  email_confirmed_at: z.string().nullish(),
  phone: z.string().nullish(),
  user_metadata: z.record(z.unknown()).nullish(),
  app_metadata: z.record(z.unknown()).nullish(),
});

export type SupabaseUser = z.infer<typeof supabaseUserSchema>;

export class SupabaseExchangeError extends Error {}

const hasControlCharacter = (value: string) =>
  Array.from({ length: value.length }, (_, index) => value.charCodeAt(index)).some(
    (code) => 0x20 > code || 0x7f === code,
  );

/**
 * Only allow same-origin relative paths. Rejects protocol-relative (`//evil.com`) and
 * backslash tricks (`/\evil.com`) that browsers treat as absolute URLs.
 */
export const safeNextPath = (next: unknown): string => {
  if ('string' !== typeof next || !next.startsWith('/')) {
    return DEFAULT_NEXT_PATH;
  }
  if (next.startsWith('//') || next.includes('\\') || hasControlCharacter(next)) {
    return DEFAULT_NEXT_PATH;
  }
  return next;
};

/** Verifies the access token with Supabase Auth. Returns null when Supabase rejects it. */
export const fetchSupabaseUser = async (accessToken: string): Promise<SupabaseUser | null> => {
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (200 !== response.status) {
    return null;
  }

  const parsed = supabaseUserSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
};

const metadataString = (metadata: Record<string, unknown> | null | undefined, key: string) => {
  const value = metadata?.[key];
  return 'string' === typeof value && '' !== value.trim() ? value.trim() : undefined;
};

/** Finds or creates the SplitPro user for a verified Supabase user and links the account. */
export const findOrCreateUserForSupabase = async (supabaseUser: SupabaseUser) => {
  const linkedAccount = await db.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: SUPABASE_PROVIDER,
        providerAccountId: supabaseUser.id,
      },
    },
    select: { userId: true },
  });

  if (linkedAccount) {
    return linkedAccount.userId;
  }

  const email = supabaseUser.email ? supabaseUser.email.toLowerCase() : null;
  const emailVerified = Boolean(email && supabaseUser.email_confirmed_at);

  const existingUser =
    emailVerified && email
      ? await db.user.findUnique({ where: { email }, select: { id: true } })
      : null;

  let userId = existingUser?.id;

  if (undefined === userId) {
    if (env.INVITE_ONLY) {
      throw new SupabaseExchangeError('This instance is Invite Only');
    }

    const metadata = supabaseUser.user_metadata;
    const name =
      metadataString(metadata, 'full_name') ??
      metadataString(metadata, 'name') ??
      (supabaseUser.phone ? supabaseUser.phone : undefined) ??
      email?.split('@')[0] ??
      null;

    const created = await db.user.create({
      data: {
        name,
        // An unverified email could belong to someone else, so only store verified ones.
        email: emailVerified ? email : null,
        emailVerified: emailVerified ? new Date() : null,
        image: metadataString(metadata, 'avatar_url') ?? null,
      },
      select: { id: true },
    });
    userId = created.id;
  }

  await db.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: SUPABASE_PROVIDER,
        providerAccountId: supabaseUser.id,
      },
    },
    update: {},
    create: {
      userId,
      type: 'oauth',
      provider: SUPABASE_PROVIDER,
      providerAccountId: supabaseUser.id,
    },
  });

  return userId;
};

/**
 * Mirrors NextAuth v4: secure cookies when the base URL is https. NextAuth reads the raw
 * NEXTAUTH_URL (or VERCEL_URL) and treats a URL without a protocol as https.
 */
export const usesSecureCookies = () => {
  const rawUrl = process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL;
  if (!rawUrl) {
    return false;
  }
  return rawUrl.startsWith('https://') || !rawUrl.startsWith('http');
};

export const sessionCookieName = (secure: boolean) =>
  `${secure ? '__Secure-' : ''}next-auth.session-token`;

/** Creates a NextAuth database session and returns the Set-Cookie header value. */
export const createSessionCookie = async (userId: number) => {
  const maxAge = authOptions.session?.maxAge ?? DEFAULT_SESSION_MAX_AGE_SECONDS;
  const expires = new Date(Date.now() + maxAge * 1000);
  const sessionToken = randomBytes(32).toString('hex');

  await db.session.create({ data: { sessionToken, userId, expires } });

  const secure = usesSecureCookies();
  const parts = [
    `${sessionCookieName(secure)}=${sessionToken}`,
    'Path=/',
    `Expires=${expires.toUTCString()}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
};
