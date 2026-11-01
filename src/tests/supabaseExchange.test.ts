import type { NextApiRequest, NextApiResponse } from 'next';

import handler from '~/pages/api/auth/supabase-exchange';
import { safeNextPath } from '~/server/supabaseExchange';

const mockAccountFindUnique = jest.fn();
const mockAccountUpsert = jest.fn();
const mockUserFindUnique = jest.fn();
const mockUserCreate = jest.fn();
const mockSessionCreate = jest.fn();

jest.mock('~/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    INVITE_ONLY: false,
  },
}));

jest.mock('~/server/auth', () => ({ authOptions: { session: { maxAge: 3600 } } }));

jest.mock('~/server/db', () => ({
  db: {
    account: {
      findUnique: (...args: unknown[]) => mockAccountFindUnique(...args),
      upsert: (...args: unknown[]) => mockAccountUpsert(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      create: (...args: unknown[]) => mockUserCreate(...args),
    },
    session: { create: (...args: unknown[]) => mockSessionCreate(...args) },
  },
}));

const mockFetch = jest.fn();

const createMockRes = () => {
  const status = jest.fn();
  const json = jest.fn();
  const setHeader = jest.fn();
  const redirect = jest.fn();
  const res = { status, json, setHeader, redirect } as unknown as NextApiResponse;
  status.mockReturnValue(res);
  json.mockReturnValue(res);
  setHeader.mockReturnValue(res);
  redirect.mockReturnValue(res);
  const setCookie = () =>
    setHeader.mock.calls.find(([name]) => 'Set-Cookie' === name)?.[1] as string | undefined;
  return { res, status, json, redirect, setCookie };
};

const jsonRequest = (body: Record<string, unknown>) =>
  ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  }) as unknown as NextApiRequest;

const formRequest = (body: Record<string, string>) =>
  ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  }) as unknown as NextApiRequest;

const supabaseResponds = (status: number, body: unknown) =>
  mockFetch.mockResolvedValueOnce({ status, json: () => Promise.resolve(body) });

const sessionData = () => {
  const [args] = mockSessionCreate.mock.calls[0] as [
    { data: { userId: number; sessionToken: string } },
  ];
  return args.data;
};

describe('/api/auth/supabase-exchange', () => {
  const originalNextAuthUrl = process.env.NEXTAUTH_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
    process.env.NEXTAUTH_URL = 'https://app.example.com';
    mockSessionCreate.mockResolvedValue({});
    mockAccountUpsert.mockResolvedValue({});
  });

  afterAll(() => {
    process.env.NEXTAUTH_URL = originalNextAuthUrl;
    global.fetch = originalFetch;
  });

  describe('token verification', () => {
    it('should return 401 when Supabase rejects the token', async () => {
      supabaseResponds(401, { message: 'invalid JWT' });
      const { res, status, setCookie } = createMockRes();

      await handler(jsonRequest({ accessToken: 'bad-token' }), res);

      expect(mockFetch).toHaveBeenCalledWith('https://example.supabase.co/auth/v1/user', {
        headers: { apikey: 'public-anon-key', Authorization: 'Bearer bad-token' },
      });
      expect(status).toHaveBeenCalledWith(401);
      expect(mockSessionCreate).not.toHaveBeenCalled();
      expect(setCookie()).toBeUndefined();
    });

    it('should redirect form posts to the sign-in error page when the token is rejected', async () => {
      supabaseResponds(403, {});
      const { res, redirect } = createMockRes();

      await handler(formRequest({ accessToken: 'bad-token', next: '/groups' }), res);

      expect(redirect).toHaveBeenCalledWith(303, '/auth/signin?error=SupabaseSignin');
    });

    it('should return 401 without calling Supabase when the token is missing', async () => {
      const { res, status } = createMockRes();

      await handler(jsonRequest({}), res);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
    });
  });

  describe('new phone user', () => {
    it('should create a user without email, link the account and set the session cookie', async () => {
      supabaseResponds(200, {
        id: 'sb-phone-1',
        email: null,
        phone: '+15555550100',
        user_metadata: {},
        app_metadata: { provider: 'phone' },
      });
      mockAccountFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({ id: 42 });
      const { res, status, json, setCookie } = createMockRes();

      await handler(jsonRequest({ accessToken: 'good-token' }), res);

      expect(mockUserFindUnique).not.toHaveBeenCalled();
      expect(mockUserCreate).toHaveBeenCalledWith({
        data: { name: '+15555550100', email: null, emailVerified: null, image: null },
        select: { id: true },
      });
      expect(mockAccountUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: {
            userId: 42,
            type: 'oauth',
            provider: 'supabase',
            providerAccountId: 'sb-phone-1',
          },
        }),
      );
      const session = sessionData();
      expect(session.userId).toBe(42);
      expect(session.sessionToken).toMatch(/^[0-9a-f]{64}$/);

      const cookie = setCookie();
      expect(cookie).toContain(`__Secure-next-auth.session-token=${session.sessionToken}`);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Secure');
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe('existing email user', () => {
    it('should link a verified Supabase email to the existing user instead of creating one', async () => {
      supabaseResponds(200, {
        id: 'sb-apple-1',
        email: 'Alex@Example.com',
        email_confirmed_at: '2026-10-01T00:00:00Z',
        user_metadata: { full_name: 'Alex' },
        app_metadata: { provider: 'apple' },
      });
      mockAccountFindUnique.mockResolvedValue(null);
      mockUserFindUnique.mockResolvedValue({ id: 7 });
      const { res, redirect } = createMockRes();

      await handler(formRequest({ accessToken: 'good-token', next: '/groups/3' }), res);

      expect(mockUserFindUnique).toHaveBeenCalledWith({
        where: { email: 'alex@example.com' },
        select: { id: true },
      });
      expect(mockUserCreate).not.toHaveBeenCalled();
      expect(mockAccountUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ userId: 7, providerAccountId: 'sb-apple-1' }),
        }),
      );
      expect(sessionData().userId).toBe(7);
      expect(redirect).toHaveBeenCalledWith(303, '/groups/3');
    });

    it('should use a non-secure cookie name on http', async () => {
      process.env.NEXTAUTH_URL = 'http://localhost:3000';
      supabaseResponds(200, { id: 'sb-linked' });
      mockAccountFindUnique.mockResolvedValue({ userId: 9 });
      const { res, setCookie } = createMockRes();

      await handler(jsonRequest({ accessToken: 'good-token' }), res);

      const cookie = setCookie();
      expect(cookie).toMatch(/^next-auth\.session-token=/);
      expect(cookie).not.toContain('Secure');
    });
  });

  describe('unsafe next', () => {
    it('should fall back to /balances for a protocol-relative next value', async () => {
      supabaseResponds(200, { id: 'sb-linked' });
      mockAccountFindUnique.mockResolvedValue({ userId: 9 });
      const { res, redirect } = createMockRes();

      await handler(formRequest({ accessToken: 'good-token', next: '//evil.com/steal' }), res);

      expect(redirect).toHaveBeenCalledWith(303, '/balances');
    });

    it.each(['https://evil.com', '//evil.com', '/\\evil.com', 'balances', '', '/a\nb'])(
      'should reject %p',
      (next) => {
        expect(safeNextPath(next)).toBe('/balances');
      },
    );

    it('should keep safe relative paths', () => {
      expect(safeNextPath('/groups/1?tab=expenses')).toBe('/groups/1?tab=expenses');
    });
  });
});
