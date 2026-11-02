import { z } from 'zod';

import { looksLikePhone, normalizePhone } from './phone';

export type InviteTarget =
  | { kind: 'email'; email: string }
  | { kind: 'phone'; phone: string }
  | { kind: 'invalid-phone' }
  | { kind: 'none' };

const emailSchema = z.string().email();

/** Works out whether the add-friend input is an email, a phone number, or neither. */
export const getInviteTarget = (input: string): InviteTarget => {
  const trimmed = input.trim();

  if (emailSchema.safeParse(trimmed).success) {
    return { kind: 'email', email: trimmed.toLowerCase() };
  }

  if (!looksLikePhone(trimmed)) {
    return { kind: 'none' };
  }

  const phone = normalizePhone(trimmed);
  return phone ? { kind: 'phone', phone } : { kind: 'invalid-phone' };
};

/** The `inviteFriend` input for a valid target. */
export const toInviteFriendInput = (
  target: Extract<InviteTarget, { kind: 'email' | 'phone' }>,
  sendInviteEmail: boolean,
  groupId?: number,
) =>
  'email' === target.kind
    ? { email: target.email, sendInviteEmail, groupId }
    : { phone: target.phone, sendInviteEmail, groupId };
