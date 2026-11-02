const TRUE_ENV_VALUES = new Set(['1', 'true']);
const FALSE_ENV_VALUES = new Set(['0', 'false']);

export const parseEnvBoolean = (value: string | undefined, fallback = false): boolean => {
  const normalizedValue = value?.trim().toLowerCase();

  if (TRUE_ENV_VALUES.has(normalizedValue ?? '')) {
    return true;
  }

  if (FALSE_ENV_VALUES.has(normalizedValue ?? '')) {
    return false;
  }

  return fallback;
};

/**
 * The app's public address. An explicitly set value wins; on Vercel the fallback is the
 * deployment hostname, which comes without a protocol and so needs `https://` added.
 */
export const resolveAppUrl = (explicitUrl: unknown, vercelHost = process.env.VERCEL_URL) => {
  if ('string' === typeof explicitUrl && '' !== explicitUrl.trim()) {
    return explicitUrl.trim();
  }

  return vercelHost ? `https://${vercelHost}` : explicitUrl;
};
