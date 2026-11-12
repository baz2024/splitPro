import { deleteUserAccount } from '~/server/accountDeletion';

import { db } from './database';
import { testUser } from './factories';
import { callerFor } from './trpc';

const TOKEN = 'ExponentPushToken[integrationtoken000000]';

const expoReplies = (tickets: unknown[]) =>
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data: tickets }),
  } as Response);

describe('native push tokens', () => {
  afterEach(() => jest.restoreAllMocks());

  it('stores the token for the signed-in user and rejects anything else', async () => {
    const user = await testUser();
    await callerFor(user.id).user.registerNativePushToken({ token: TOKEN, platform: 'ios' });

    expect(await db.pushNotification.findMany({ where: { userId: user.id } })).toEqual([
      expect.objectContaining({ endpoint: TOKEN }),
    ]);
    await expect(
      callerFor(user.id).user.registerNativePushToken({ token: 'not-a-token', platform: 'ios' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('moves a device to whoever signed in on it last', async () => {
    const first = await testUser('First');
    const second = await testUser('Second');
    await callerFor(first.id).user.registerNativePushToken({ token: TOKEN, platform: 'ios' });
    await callerFor(second.id).user.registerNativePushToken({ token: TOKEN, platform: 'ios' });

    expect(await db.pushNotification.findMany({ where: { endpoint: TOKEN } })).toEqual([
      expect.objectContaining({ userId: second.id }),
    ]);
  });

  it('sends the test notification through Expo and forgets unregistered devices', async () => {
    const user = await testUser();
    await callerFor(user.id).user.registerNativePushToken({ token: TOKEN, platform: 'ios' });

    const fetchSpy = expoReplies([{ status: 'ok', id: 'ticket' }]);
    expect(await callerFor(user.id).user.sendTestPushNotification()).toEqual({ sentCount: 1 });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.anything(),
    );

    expoReplies([{ status: 'error', details: { error: 'DeviceNotRegistered' } }]);
    expect(await callerFor(user.id).user.sendTestPushNotification()).toEqual({ sentCount: 0 });
    expect(await db.pushNotification.count({ where: { userId: user.id } })).toBe(0);
  });

  it('removes the token on sign-out and on account deletion', async () => {
    const user = await testUser();
    await callerFor(user.id).user.registerNativePushToken({ token: TOKEN, platform: 'android' });
    await callerFor(user.id).user.deleteNativePushToken({ token: TOKEN });
    expect(await db.pushNotification.count({ where: { userId: user.id } })).toBe(0);

    await callerFor(user.id).user.registerNativePushToken({ token: TOKEN, platform: 'android' });
    await deleteUserAccount(user.id);
    expect(await db.pushNotification.count({ where: { userId: user.id } })).toBe(0);
  });
});
