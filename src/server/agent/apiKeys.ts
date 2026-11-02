import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export const API_KEY_PREFIX = 'safi_';
export const API_KEY_RANDOM_LENGTH = 40;
export const API_KEY_DISPLAY_PREFIX_LENGTH = 8;
export const MAX_ACTIVE_API_KEYS = 20;

const API_KEY_REGEX = /^safi_[A-Za-z0-9_-]{40}$/;

/** `safi_` + 40 url-safe random characters (30 random bytes → 40 base64url chars). */
export const generateApiKey = (): string =>
  `${API_KEY_PREFIX}${randomBytes(30).toString('base64url').slice(0, API_KEY_RANDOM_LENGTH)}`;

export const isApiKeyFormat = (token: string): boolean => API_KEY_REGEX.test(token);

export const hashApiKey = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

/** First 8 chars of the token (e.g. "safi_AbC") for display; never enough to authenticate. */
export const getApiKeyDisplayPrefix = (token: string): string =>
  token.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH);

/** Last 4 chars of the token, shown after the prefix in the masked key ("safi_AbC…wxyz"). */
export const getApiKeyLastFour = (token: string): string => token.slice(-4);

export const createApiKeyRecord = () => {
  const token = generateApiKey();
  return {
    token,
    prefix: getApiKeyDisplayPrefix(token),
    lastFour: getApiKeyLastFour(token),
    hashedKey: hashApiKey(token),
  };
};

/** Extracts the bearer token from an Authorization header value, or null. */
export const parseBearerToken = (header: string | string[] | undefined): string | null => {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    return null;
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value);
  const token = match?.[1];
  if (!token || !isApiKeyFormat(token)) {
    return null;
  }
  return token;
};

export interface ApiKeyAuth {
  userId: number;
  apiKeyId: string;
  /** Set while the owner has paused this agent; endpoints reject it (see agentPausedBody). */
  pausedAt: Date | null;
}

/** 403 body for a paused agent key: the agent must stop spending until it is resumed. */
export const agentPausedBody = (pausedAt: Date) => ({
  error: 'agent_paused' as const,
  shouldPause: true,
  pauseReason: 'paused' as const,
  pausedAt: pausedAt.toISOString(),
  message: 'This agent was paused in Safi. Stop spending until the owner resumes it.',
});

/**
 * Resolves an Authorization header to the owning user id, or null when the key is missing,
 * malformed, unknown, or revoked. Updates lastUsedAt on success. Paused keys still resolve (with
 * `pausedAt` set) so endpoints can answer 403 with a reason instead of 401.
 */
export const authenticateApiKey = async (
  db: PrismaClient,
  authorizationHeader: string | string[] | undefined,
): Promise<ApiKeyAuth | null> => {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return null;
  }

  const apiKey = await db.apiKey.findUnique({
    where: { hashedKey: hashApiKey(token) },
    select: { id: true, userId: true, revokedAt: true, pausedAt: true },
  });

  if (!apiKey || apiKey.revokedAt) {
    return null;
  }

  await db.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });

  return { userId: apiKey.userId, apiKeyId: apiKey.id, pausedAt: apiKey.pausedAt ?? null };
};
