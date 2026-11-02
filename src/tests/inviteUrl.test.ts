import { buildInviteUrl } from '~/lib/inviteMessage';

describe('buildInviteUrl', () => {
  it('should point at the join link when the invite is for a project', () => {
    expect(buildInviteUrl('https://safi.kafoai.com', 'hG_6kT8HFuj6tRY3LOaHm')).toBe(
      'https://safi.kafoai.com/join-group?groupId=hG_6kT8HFuj6tRY3LOaHm',
    );
  });

  it('should point at the app when there is no project', () => {
    expect(buildInviteUrl('https://safi.kafoai.com')).toBe('https://safi.kafoai.com');
  });
});
