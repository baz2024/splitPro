import { type TFunction } from 'next-i18next';

export const BILLING_NAMESPACES = ['billing', 'common'];

const KNOWN_ERRORS = [
  'sync_disabled',
  'provider_unsupported',
  'unsupported_provider',
  'project_not_found',
  'unauthorized',
  'forbidden',
  'not_found',
  'rate_limited',
  'unavailable',
  'bad_response',
  'network',
  'token_unreadable',
  'sync_too_soon',
  'connection_not_found',
] as const;

type KnownError = (typeof KNOWN_ERRORS)[number];

const isKnownError = (code: string): code is KnownError =>
  (KNOWN_ERRORS as readonly string[]).includes(code);

/** Translates a server error code (tRPC message or `lastError`) for display. */
export const billingErrorText = (t: TFunction, code: string | null | undefined) =>
  code && isKnownError(code) ? t(`billing:errors.${code}`) : t('billing:errors.unknown');

/** Matches the server check: a single token without whitespace, 10 to 512 characters. */
export const isPlausibleToken = (token: string) => /^\S{10,512}$/.test(token.trim());

export const isPlausibleTeamId = (teamId: string) => /^[A-Za-z0-9_-]{0,64}$/.test(teamId.trim());
