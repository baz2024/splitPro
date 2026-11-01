import {
  INVITE_EMAIL_SUBJECT,
  buildInviteEmailText,
  buildInviteSmsText,
} from '~/lib/inviteMessage';

describe('invite messages', () => {
  describe('buildInviteSmsText', () => {
    it('should name the inviter and include the sign-in link', () => {
      expect(buildInviteSmsText(' Dana ', 'https://safi.kafoai.com')).toBe(
        'Dana invited you to Safi to share expenses. Sign in with this phone number: https://safi.kafoai.com',
      );
    });

    it('should fall back to "A friend" without a name', () => {
      expect(buildInviteSmsText('  ', 'https://x.test')).toMatch(/^A friend invited you/);
    });
  });

  describe('buildInviteEmailText', () => {
    it('should keep the subject and the link the server sends', () => {
      const text = buildInviteEmailText('Dana', 'https://safi.kafoai.com');
      expect(INVITE_EMAIL_SUBJECT).toBe('Invitation to Safi');
      expect(text).toContain('You have been invited to Safi by Dana.');
      expect(text).toContain('\nhttps://safi.kafoai.com\n');
    });
  });
});
