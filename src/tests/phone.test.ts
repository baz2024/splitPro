import { getInviteTarget, toInviteFriendInput } from '~/lib/inviteTarget';
import { looksLikePhone, normalizePhone, normalizeSupabasePhone } from '~/lib/phone';

describe('normalizePhone', () => {
  describe('when the input is a valid international number', () => {
    it.each([
      ['+962791234567', '+962791234567'],
      ['+962 79 123 4567', '+962791234567'],
      ['+1 (555) 123-4567', '+15551234567'],
      ['  +44 20 7946 0958  ', '+442079460958'],
      ['+1.555.123.4567', '+15551234567'],
      ['+12345678', '+12345678'],
      ['+123456789012345', '+123456789012345'],
    ])('should normalise %p to %p', (input, expected) => {
      expect(normalizePhone(input)).toBe(expected);
    });
  });

  describe('when the input is not a valid E.164 number', () => {
    it.each([
      ['0791234567'],
      ['962791234567'],
      ['+1234567'],
      ['+1234567890123456'],
      ['+96279abc4567'],
      ['++962791234567'],
      [''],
      ['   '],
    ])('should return null for %p', (input) => {
      expect(normalizePhone(input)).toBeNull();
    });

    it('should return null for null and undefined', () => {
      expect(normalizePhone(null)).toBeNull();
      expect(normalizePhone(undefined)).toBeNull();
    });
  });
});

describe('normalizeSupabasePhone', () => {
  it('should add the missing leading +', () => {
    expect(normalizeSupabasePhone('962791234567')).toBe('+962791234567');
  });

  it('should keep an existing leading +', () => {
    expect(normalizeSupabasePhone('+962791234567')).toBe('+962791234567');
  });

  it('should return null for empty values', () => {
    expect(normalizeSupabasePhone('')).toBeNull();
    expect(normalizeSupabasePhone(null)).toBeNull();
  });
});

describe('looksLikePhone', () => {
  it.each(['+962', '0791234567', '+1 (555) 123-4567', '079-123'])(
    'should treat %p as a phone number',
    (input) => {
      expect(looksLikePhone(input)).toBe(true);
    },
  );

  it.each(['', '+', 'alice', 'alice@example.com', '+ -()'])(
    'should not treat %p as a phone number',
    (input) => {
      expect(looksLikePhone(input)).toBe(false);
    },
  );
});

describe('getInviteTarget', () => {
  it('should detect a trimmed, lowercased email', () => {
    expect(getInviteTarget(' Alice@Example.com ')).toEqual({
      kind: 'email',
      email: 'alice@example.com',
    });
  });

  it('should detect a valid phone number', () => {
    expect(getInviteTarget('+962 79 123 4567')).toEqual({ kind: 'phone', phone: '+962791234567' });
  });

  it('should flag a phone number without the country code', () => {
    expect(getInviteTarget('0791234567')).toEqual({ kind: 'invalid-phone' });
  });

  it('should return none for a plain name', () => {
    expect(getInviteTarget('alice')).toEqual({ kind: 'none' });
  });
});

describe('toInviteFriendInput', () => {
  it('should build an email input', () => {
    expect(toInviteFriendInput({ kind: 'email', email: 'a@b.co' }, true)).toEqual({
      email: 'a@b.co',
      sendInviteEmail: true,
    });
  });

  it('should build a phone input', () => {
    expect(toInviteFriendInput({ kind: 'phone', phone: '+962791234567' }, false)).toEqual({
      phone: '+962791234567',
      sendInviteEmail: false,
    });
  });
});
