import { isExpoPushToken, sendExpoPushNotifications } from '~/server/expoPush';

const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

const message = {
  title: 'Dana',
  message: 'Dana paid $15.00 for Lunch',
  data: { url: '/expenses/1' },
};

const mockFetch = (body: unknown, ok = true) =>
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  } as Response);

describe('isExpoPushToken', () => {
  it('should accept Expo push tokens', () => {
    expect(isExpoPushToken(TOKEN_A)).toBe(true);
    expect(isExpoPushToken(TOKEN_B)).toBe(true);
  });

  it('should reject Web Push endpoints and malformed tokens', () => {
    expect(isExpoPushToken('https://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[a b]')).toBe(false);
  });
});

describe('sendExpoPushNotifications', () => {
  afterEach(() => jest.restoreAllMocks());

  it('should send one message per token with the page to open', async () => {
    const fetchSpy = mockFetch({
      data: [
        { status: 'ok', id: '1' },
        { status: 'ok', id: '2' },
      ],
    });

    const results = await sendExpoPushNotifications([TOKEN_A, TOKEN_B], message);

    expect(results).toEqual([
      { token: TOKEN_A, ok: true, unregistered: false },
      { token: TOKEN_B, ok: true, unregistered: false },
    ]);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(JSON.parse(init?.body as string)).toEqual([
      expect.objectContaining({
        to: TOKEN_A,
        title: 'Dana',
        body: message.message,
        data: message.data,
      }),
      expect.objectContaining({ to: TOKEN_B }),
    ]);
  });

  it('should flag tokens whose device is no longer registered', async () => {
    mockFetch({
      data: [
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
      ],
    });

    const results = await sendExpoPushNotifications([TOKEN_A, TOKEN_B], message);

    expect(results).toEqual([
      { token: TOKEN_A, ok: false, unregistered: true },
      { token: TOKEN_B, ok: false, unregistered: false },
    ]);
  });

  it('should report failure without dropping tokens when the service is down', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch({}, false);

    const results = await sendExpoPushNotifications([TOKEN_A], message);

    expect(results).toEqual([{ token: TOKEN_A, ok: false, unregistered: false }]);
  });

  it('should send in batches of 100', async () => {
    const tokens = Array.from({ length: 150 }, (_, i) => `ExponentPushToken[token${i}]`);
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      const count = (JSON.parse(init?.body as string) as unknown[]).length;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ data: Array.from({ length: count }, () => ({ status: 'ok' })) }),
      } as Response);
    });

    const results = await sendExpoPushNotifications(tokens, message);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(results.every((result) => result.ok)).toBe(true);
  });
});
