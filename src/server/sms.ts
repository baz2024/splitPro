import { env } from '~/env';
import { buildInviteSmsText } from '~/lib/inviteMessage';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

/** True when this server can send SMS invites (always true in development, where SMS is only logged). */
export const isSmsInviteEnabled = (): boolean =>
  'development' === env.NODE_ENV ||
  Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_MESSAGING_SERVICE_SID);

export const buildInviteSmsBody = (inviterName: string, url: string = env.NEXTAUTH_URL): string =>
  buildInviteSmsText(inviterName, url);

/**
 * Sends an SMS invite through Twilio's Messages API. Returns false when Twilio is not
 * configured or the request fails. In development the message is only logged.
 */
export const sendInviteSms = async (
  phone: string,
  inviterName: string,
  url: string = env.NEXTAUTH_URL,
): Promise<boolean> => {
  const body = buildInviteSmsBody(inviterName, url);

  if ('development' === env.NODE_ENV) {
    console.log('Sending invite SMS', phone, body);
    return true;
  }

  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID;
  if (!accountSid || !authToken || !messagingServiceSid) {
    return false;
  }

  const response = await fetch(
    `${TWILIO_API_BASE}/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phone,
        MessagingServiceSid: messagingServiceSid,
        Body: body,
      }).toString(),
    },
  );

  if (!response.ok) {
    console.error('Twilio rejected invite SMS', response.status);
    return false;
  }

  return true;
};
