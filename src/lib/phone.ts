const PHONE_SEPARATORS = /[\s\-().]/g;
const E164_PATTERN = /^\+\d{8,15}$/;
const PHONE_LIKE_PATTERN = /^\+?[\d\s\-().]+$/;

/**
 * Normalises a phone number to E.164 (`+` followed by 8–15 digits) after removing spaces,
 * dashes, dots and parentheses. Returns null when the result is not a valid E.164 number.
 */
export const normalizePhone = (input: string | null | undefined): string | null => {
  if (!input) {
    return null;
  }

  const compact = input.trim().replace(PHONE_SEPARATORS, '');
  return E164_PATTERN.test(compact) ? compact : null;
};

/**
 * Supabase stores phone numbers without the leading `+` (for example `15551234567`), so add
 * it back before normalising.
 */
export const normalizeSupabasePhone = (input: string | null | undefined): string | null => {
  const trimmed = input?.trim();
  if (!trimmed) {
    return null;
  }
  return normalizePhone(trimmed.startsWith('+') ? trimmed : `+${trimmed}`);
};

/** True when the input looks like the user is typing a phone number rather than a name or email. */
export const looksLikePhone = (input: string): boolean => {
  const trimmed = input.trim();
  return '' !== trimmed && PHONE_LIKE_PATTERN.test(trimmed) && /\d/.test(trimmed);
};
