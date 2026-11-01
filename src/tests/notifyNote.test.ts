import { notifiedParticipants } from '~/lib/notifyNote';

describe('notifiedParticipants', () => {
  const me = { id: 1, amount: 1500n };
  const dana = { id: 2, amount: -1500n };
  const sam = { id: 3, amount: 0n };

  it('should leave out the person adding the cost', () => {
    expect(notifiedParticipants([me, dana], 1)).toEqual([dana]);
  });

  it('should leave out people the cost does not affect', () => {
    expect(notifiedParticipants([me, dana, sam], 1)).toEqual([dana]);
    expect(notifiedParticipants([me, { id: 4 }], 1)).toEqual([]);
  });

  it('should count everyone else when nobody is signed in yet', () => {
    expect(notifiedParticipants([me, dana], undefined)).toEqual([me, dana]);
  });
});
