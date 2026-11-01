export const InviteErrorCode = {
  INVITES_DISABLED: 'INVITES_DISABLED',
  INVITE_RATE_LIMITED: 'INVITE_RATE_LIMITED',
  INVITE_EMAIL_SEND_FAILED: 'INVITE_EMAIL_SEND_FAILED',
  INVITE_SMS_DISABLED: 'INVITE_SMS_DISABLED',
  INVITE_SMS_SEND_FAILED: 'INVITE_SMS_SEND_FAILED',
} as const;

export const isInviteEmailSendFailed = (appErrorCode: unknown): boolean =>
  InviteErrorCode.INVITE_EMAIL_SEND_FAILED === appErrorCode;

/**
 * True when the friend row was saved but the invite message could not be delivered, so the
 * client can retry the add without sending an invite.
 */
export const isInviteSendFailed = (appErrorCode: unknown): boolean =>
  InviteErrorCode.INVITE_EMAIL_SEND_FAILED === appErrorCode ||
  InviteErrorCode.INVITE_SMS_SEND_FAILED === appErrorCode ||
  InviteErrorCode.INVITE_SMS_DISABLED === appErrorCode;

export const getInviteErrorToastKey = (
  appErrorCode: string | null | undefined,
):
  | 'errors.invite_email_failed'
  | 'errors.invite_sms_failed'
  | 'errors.invite_sms_disabled'
  | 'errors.add_member_failed' => {
  if (InviteErrorCode.INVITE_EMAIL_SEND_FAILED === appErrorCode) {
    return 'errors.invite_email_failed';
  }
  if (InviteErrorCode.INVITE_SMS_SEND_FAILED === appErrorCode) {
    return 'errors.invite_sms_failed';
  }
  if (InviteErrorCode.INVITE_SMS_DISABLED === appErrorCode) {
    return 'errors.invite_sms_disabled';
  }
  return 'errors.add_member_failed';
};
