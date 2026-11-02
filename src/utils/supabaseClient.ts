import { type SupabaseClient, createClient } from '@supabase/supabase-js';

import { env } from '~/env';

let client: SupabaseClient | null = null;

/**
 * Browser-only Supabase client used for Apple and phone sign-in. Supabase sessions are
 * exchanged for a NextAuth session right away, so Supabase never becomes the app's session.
 */
export const getSupabaseClient = () => {
  client ??= createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      flowType: 'pkce',
      // The callback page exchanges the code itself, so avoid a second automatic exchange.
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: false,
    },
  });
  return client;
};

/** Relative-path guard for client-side redirects; mirrors the server's `safeNextPath`. */
export const safeRelativePath = (next: unknown, fallback = '/balances') =>
  'string' === typeof next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
    ? next
    : fallback;

/** Posts a Supabase access token to the exchange route, which sets the NextAuth cookie. */
export const exchangeSupabaseToken = async (accessToken: string, next: string) => {
  const response = await fetch('/api/auth/supabase-exchange', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, next }),
  });
  if (!response.ok) {
    throw new Error('Supabase exchange failed');
  }
  // The NextAuth session now owns sign-in; drop the Supabase copy from this browser.
  await getSupabaseClient()
    .auth.signOut({ scope: 'local' })
    .catch(() => undefined);
};
