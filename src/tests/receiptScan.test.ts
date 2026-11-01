import {
  RECEIPT_CATEGORY_KEYS,
  mapReceiptCategory,
  normaliseReceiptAmount,
  normaliseReceiptDate,
  normaliseReceiptScan,
  parseReceiptScanText,
} from '~/lib/receiptScan';

describe('parseReceiptScanText', () => {
  describe('with clean model output', () => {
    it('returns the contract shape unchanged', () => {
      const text = JSON.stringify({
        merchant: 'Blue Bottle Coffee',
        amount: '20.00',
        currency: 'USD',
        date: '2026-10-30',
        category: 'diningOut',
        lowConfidenceFields: [],
        note: null,
      });

      expect(parseReceiptScanText(text)).toEqual({
        merchant: 'Blue Bottle Coffee',
        amount: '20.00',
        currency: 'USD',
        date: '2026-10-30',
        category: 'diningOut',
        lowConfidenceFields: [],
        note: null,
      });
    });
  });

  describe('with messy model output', () => {
    it('strips a code fence and normalises every field', () => {
      const text = `\`\`\`json
{"merchant":"  Tesco   Extra ","amount":"£1,234.5","currency":"gbp","date":"2026-02-03T10:00:00Z",
"category":"Supermarket","lowConfidenceFields":["amount","bogus"],"note":"Tax looked blurry"}
\`\`\``;

      expect(parseReceiptScanText(text)).toEqual({
        merchant: 'Tesco Extra',
        amount: '1234.50',
        currency: 'GBP',
        date: '2026-02-03',
        category: 'groceries',
        lowConfidenceFields: ['amount'],
        note: 'Tax looked blurry',
      });
    });

    it('flags fields it could not parse as low confidence', () => {
      const result = parseReceiptScanText(
        JSON.stringify({
          merchant: 'Cafe',
          amount: 'twenty',
          currency: 'Dollars',
          date: '2026-02-31',
          category: 'spaceship',
          lowConfidenceFields: [],
          note: null,
        }),
      );

      expect(result.amount).toBeNull();
      expect(result.currency).toBeNull();
      expect(result.date).toBeNull();
      expect(result.category).toBeNull();
      expect(result.lowConfidenceFields).toEqual(['amount', 'currency', 'date']);
    });

    it('returns an all-null result for non-JSON text', () => {
      expect(parseReceiptScanText('Sorry, I cannot read this.')).toEqual({
        merchant: null,
        amount: null,
        currency: null,
        date: null,
        category: null,
        lowConfidenceFields: [],
        note: null,
      });
    });
  });
});

describe('normaliseReceiptScan', () => {
  it('ignores non-object input', () => {
    expect(normaliseReceiptScan(['x']).merchant).toBeNull();
    expect(normaliseReceiptScan(null).lowConfidenceFields).toEqual([]);
  });

  it('treats the string "null" as missing', () => {
    expect(normaliseReceiptScan({ merchant: 'null', note: '' })).toMatchObject({
      merchant: null,
      note: null,
    });
  });
});

describe('normaliseReceiptAmount', () => {
  it.each([
    ['20', '20.00'],
    ['20.5', '20.50'],
    ['$20.00', '20.00'],
    ['1,234', '1234.00'],
    ['1.234,56', '1234.56'],
    ['1,234.567', '1234.56'],
    ['0.99', '0.99'],
    [12.3, '12.30'],
    ['20.', '20.00'],
  ])('normalises %p to %p', (input, expected) => {
    expect(normaliseReceiptAmount(input)).toBe(expected);
  });

  it.each([[null], [''], ['abc'], [Number.NaN]])('returns null for %p', (input) => {
    expect(normaliseReceiptAmount(input)).toBeNull();
  });
});

describe('normaliseReceiptDate', () => {
  it('rejects impossible dates', () => {
    expect(normaliseReceiptDate('2026-13-01')).toBeNull();
    expect(normaliseReceiptDate('30/10/2026')).toBeNull();
  });

  it('keeps valid ISO dates', () => {
    expect(normaliseReceiptDate('2024-02-29')).toBe('2024-02-29');
  });
});

describe('mapReceiptCategory', () => {
  it('maps exact keys case-insensitively', () => {
    expect(mapReceiptCategory('DiningOut')).toBe('diningOut');
    expect(mapReceiptCategory('dining_out')).toBe('diningOut');
    expect(mapReceiptCategory('travel')).toBe('travel');
  });

  it('maps synonyms and falls back to null', () => {
    expect(mapReceiptCategory('Restaurant')).toBe('diningOut');
    expect(mapReceiptCategory('other')).toBe('general');
    expect(mapReceiptCategory('unknown thing')).toBeNull();
    expect(mapReceiptCategory(42)).toBeNull();
  });

  it('never offers "other" as a category key', () => {
    expect(RECEIPT_CATEGORY_KEYS).not.toContain('other');
    expect(RECEIPT_CATEGORY_KEYS).toContain('groceries');
  });
});
