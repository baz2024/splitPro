import { confirmationFlags } from './receiptScan';

jest.mock('~/utils/api', () => ({ api: { receipt: { scan: { useMutation: jest.fn() } } } }));

describe('confirmationFlags', () => {
  it('should keep the fields the scan flagged', () => {
    expect([...confirmationFlags(['merchant', 'date'], [])]).toEqual(['merchant', 'date']);
  });

  it('should add fields named by low-confidence review reasons, mapping total to amount', () => {
    const flags = confirmationFlags([], ['field:total', 'field:category', 'scan:skipped']);
    expect(flags.has('amount')).toBe(true);
    expect(flags.has('category')).toBe(true);
    expect(flags.size).toBe(2);
  });

  it('should ignore tax and notes, which have no row on the card', () => {
    expect(confirmationFlags([], ['field:tax', 'note:Tax looked blurry']).size).toBe(0);
  });

  it('should not repeat a field flagged twice', () => {
    expect([...confirmationFlags(['amount'], ['field:total'])]).toEqual(['amount']);
  });
});
