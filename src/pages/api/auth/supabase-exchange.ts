import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import {
  SIGNIN_ERROR_PATH,
  SupabaseExchangeError,
  createSessionCookie,
  fetchSupabaseUser,
  findOrCreateUserForSupabase,
  safeNextPath,
} from '~/server/supabaseExchange';

const isFormPost = (req: NextApiRequest) =>
  (req.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded');

// Next.js parses both JSON and urlencoded bodies into an object before the handler runs.
const bodySchema = z.object({
  accessToken: z.string().min(1).optional().catch(undefined),
  next: z.string().optional().catch(undefined),
});

const readBody = (body: unknown) => {
  const parsed = bodySchema.safeParse(body);
  return parsed.success ? parsed.data : {};
};

/**
 * Exchanges a Supabase access token (Apple, phone OTP, native OAuth) for a NextAuth database
 * session cookie, so the rest of the app keeps using NextAuth sessions unchanged.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if ('POST' !== req.method) {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const form = isFormPost(req);
  const fail = (message: string) => {
    if (form) {
      res.redirect(303, SIGNIN_ERROR_PATH);
      return;
    }
    res.status(401).json({ error: message });
  };

  const body = readBody(req.body);
  const accessToken = body.accessToken;
  const next = safeNextPath(body.next);

  if (!accessToken) {
    fail('Missing access token');
    return;
  }

  try {
    const supabaseUser = await fetchSupabaseUser(accessToken);
    if (!supabaseUser) {
      fail('Invalid Supabase token');
      return;
    }

    const userId = await findOrCreateUserForSupabase(supabaseUser);
    res.setHeader('Set-Cookie', await createSessionCookie(userId));
    res.setHeader('Cache-Control', 'no-store');

    if (form) {
      res.redirect(303, next);
      return;
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    if (!(error instanceof SupabaseExchangeError)) {
      console.error('Supabase exchange failed:', error);
    }
    fail(error instanceof SupabaseExchangeError ? error.message : 'Sign-in failed');
  }
};

export default handler;
