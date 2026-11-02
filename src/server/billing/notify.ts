import { sendPushNotificationToUsers } from '~/server/api/services/notificationService';

import { type SyncErrorCode } from './sync';

/** Push to the owner when a connection stops syncing and needs a new token. */
export const notifyBillingSyncBlocked = async (
  connection: { userId: number },
  error: SyncErrorCode,
) => {
  await sendPushNotificationToUsers([connection.userId], {
    title: 'Vercel billing sync stopped',
    message:
      'forbidden' === error
        ? 'The Vercel token has no billing access. Connect a team token from a billing-capable role.'
        : 'The Vercel token no longer works. Reconnect Vercel to keep importing costs.',
    data: { url: '/agents' },
  });
};
