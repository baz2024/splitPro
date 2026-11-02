import { env } from '~/env';
import { isSmsInviteEnabled, sendInviteSms } from '~/server/sms';

jest.mock('~/env', () => ({
  env: {
    NODE_ENV: 'production',
    NEXTAUTH_URL: 'https://safi.example.com',
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'secret-token',
    TWILIO_MESSAGING_SERVICE_SID: 'MG456',
  },
}));

const mutableEnv = env as unknown as Record<string, string | undefined>;
const originalEnv = { ...mutableEnv };
const mockFetch = jest.fn();

describe('sendInviteSms', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mutableEnv, originalEnv);
    global.fetch = mockFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('when Twilio is configured', () => {
    it('should post the invite to the Twilio Messages API', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });

      await expect(sendInviteSms('+962791234567', 'Basel')).resolves.toBe(true);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({
        Authorization: `Basic ${Buffer.from('AC123:secret-token').toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      });
      const body = new URLSearchParams(init.body as string);
      expect(body.get('To')).toBe('+962791234567');
      expect(body.get('MessagingServiceSid')).toBe('MG456');
      expect(body.get('Body')).toBe(
        'Basel invited you to Safi to share expenses. Sign in with this phone number: https://safi.example.com',
      );
    });

    it('should return false when Twilio rejects the request', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });

      await expect(sendInviteSms('+962791234567', 'Basel')).resolves.toBe(false);
    });
  });

  describe('when Twilio is not configured', () => {
    it('should return false without calling Twilio', async () => {
      mutableEnv.TWILIO_AUTH_TOKEN = undefined;

      await expect(sendInviteSms('+962791234567', 'Basel')).resolves.toBe(false);
      expect(isSmsInviteEnabled()).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('when running in development', () => {
    it('should only log the message', async () => {
      mutableEnv.NODE_ENV = 'development';
      mutableEnv.TWILIO_ACCOUNT_SID = undefined;
      const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await expect(sendInviteSms('+962791234567', 'Basel')).resolves.toBe(true);
      expect(isSmsInviteEnabled()).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
      log.mockRestore();
    });
  });
});
