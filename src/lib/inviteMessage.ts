/**
 * The exact invite texts the server sends (src/server/sms.ts, src/server/mailer.ts), shared so
 * the Add members sheet can preview them before anything goes out. `url` is the sign-in URL.
 */

export const INVITE_EMAIL_SUBJECT = 'Invitation to Safi';

/** Where an invite points: the project's join link when there is a project, else the app. */
export const buildInviteUrl = (baseUrl: string, groupPublicId?: string): string =>
  groupPublicId
    ? new URL(`/join-group?groupId=${encodeURIComponent(groupPublicId)}`, baseUrl).toString()
    : baseUrl;

export const buildInviteSmsText = (inviterName: string, url: string): string =>
  `${'' === inviterName.trim() ? 'A friend' : inviterName.trim()} invited you to Safi to share expenses. Sign in with this phone number: ${url}`;

export const buildInviteEmailText = (inviterName: string, url: string): string =>
  `Hey,\n\nYou have been invited to Safi by ${inviterName}. Safi keeps your team's expenses, receipts and project budgets in one place. You can sign in to Safi by clicking the below URL:\n${url}\n\nThanks,\nSafi Team`;
