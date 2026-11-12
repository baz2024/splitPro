import { z } from 'zod';

import { env } from '~/env';
import { type PushMessage } from '~/types';

// Native push for the Safi iOS/Android app (mobile/src/lib/push.ts). Its Expo push tokens are
// stored in the PushNotification table next to Web Push subscriptions, with the token as the
// endpoint. https://docs.expo.dev/push-notifications/sending-notifications/

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// The Expo push API accepts at most 100 messages per request.
const EXPO_PUSH_BATCH = 100;

const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[^\]\s]+\]$/;

export const isExpoPushToken = (value: string) => EXPO_PUSH_TOKEN.test(value);

export const ExpoPushTokenSchema = z.string().max(200).refine(isExpoPushToken, {
  message: 'Invalid Expo push token',
});

/** What the PushNotification.subscription column holds for a native token. */
export const expoSubscriptionJson = (token: string, platform: 'ios' | 'android') =>
  JSON.stringify({ type: 'expo', token, platform });

const TicketSchema = z.object({
  status: z.enum(['ok', 'error']),
  details: z.object({ error: z.string().optional() }).optional(),
});

const ResponseSchema = z.object({ data: z.array(TicketSchema) });

export interface ExpoPushResult {
  token: string;
  ok: boolean;
  /** The token no longer reaches a device (app removed, or permission revoked). */
  unregistered: boolean;
}

const failed = (tokens: string[]): ExpoPushResult[] =>
  tokens.map((token) => ({ token, ok: false, unregistered: false }));

const sendBatch = async (tokens: string[], message: PushMessage): Promise<ExpoPushResult[]> => {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(
        tokens.map((to) => ({
          to,
          title: message.title,
          body: message.message,
          data: message.data ?? {},
          sound: 'default',
          channelId: 'default',
        })),
      ),
    });

    if (!response.ok) {
      console.error('Expo push request failed', response.status);
      return failed(tokens);
    }

    const parsed = ResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error('Unexpected Expo push response');
      return failed(tokens);
    }

    // Tickets come back in the order the messages were sent.
    return tokens.map((token, index) => {
      const ticket = parsed.data.data[index];
      return {
        token,
        ok: 'ok' === ticket?.status,
        unregistered: 'DeviceNotRegistered' === ticket?.details?.error,
      };
    });
  } catch (error) {
    console.error('Error sending Expo push notification', error);
    return failed(tokens);
  }
};

export const sendExpoPushNotifications = async (
  tokens: string[],
  message: PushMessage,
): Promise<ExpoPushResult[]> => {
  const batches = Array.from({ length: Math.ceil(tokens.length / EXPO_PUSH_BATCH) }, (_, i) =>
    tokens.slice(i * EXPO_PUSH_BATCH, (i + 1) * EXPO_PUSH_BATCH),
  );
  const results = await Promise.all(batches.map((batch) => sendBatch(batch, message)));
  return results.flat();
};
