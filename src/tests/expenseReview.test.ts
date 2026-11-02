import {
  MAX_REVIEW_NOTE_LENGTH,
  MAX_REVIEW_REASONS,
  REVIEW_CONFIDENCE_THRESHOLD,
  REVIEW_SCAN_SKIPPED,
  buildReviewReasons,
  lowConfidenceReviewFields,
  normaliseConfidence,
  parseReviewReason,
  parseReviewReasons,
  sanitizeReviewReasons,
} from '~/lib/expenseReview';

describe('normaliseConfidence', () => {
  describe('ValidNumbers', () => {
    it('should keep values between 0 and 1', () => {
      expect(normaliseConfidence(0.42)).toBe(0.42);
      expect(normaliseConfidence(0)).toBe(0);
      expect(normaliseConfidence(1)).toBe(1);
    });

    it('should read percentages as fractions', () => {
      expect(normaliseConfidence(75)).toBe(0.75);
    });

    it('should clamp out-of-range values', () => {
      expect(normaliseConfidence(-0.5)).toBe(0);
      expect(normaliseConfidence(250)).toBe(1);
    });
  });

  describe('InvalidInput', () => {
    it('should return null for non-numbers', () => {
      expect(normaliseConfidence('0.9')).toBeNull();
      expect(normaliseConfidence(null)).toBeNull();
      expect(normaliseConfidence(Number.NaN)).toBeNull();
    });
  });
});

describe('lowConfidenceReviewFields', () => {
  it('should flag only fields strictly below the threshold, in canonical order', () => {
    expect(
      lowConfidenceReviewFields({
        tax: 0.3,
        merchant: 0.79,
        total: REVIEW_CONFIDENCE_THRESHOLD,
        date: null,
      }),
    ).toEqual(['merchant', 'tax']);
  });

  it('should respect a custom threshold', () => {
    expect(lowConfidenceReviewFields({ total: 0.85 }, 0.9)).toEqual(['total']);
  });
});

describe('buildReviewReasons', () => {
  describe('ConfidenceMapping', () => {
    it('should turn unsure fields and the note into reason codes', () => {
      expect(
        buildReviewReasons({
          confidence: { merchant: 0.99, total: 0.95, tax: 0.2 },
          note: '  Tax   looked blurry ',
        }),
      ).toEqual(['field:tax', 'note:Tax looked blurry']);
    });

    it('should merge directly flagged fields without duplicates', () => {
      expect(
        buildReviewReasons({ confidence: { total: 0.1 }, flaggedFields: ['total', 'date'] }),
      ).toEqual(['field:total', 'field:date']);
    });

    it('should return nothing when everything is confident', () => {
      expect(buildReviewReasons({ confidence: { merchant: 0.9, total: 1 }, note: '' })).toEqual([]);
    });
  });

  describe('SkippedReading', () => {
    it('should put the skipped reason first', () => {
      expect(buildReviewReasons({ skipped: true, flaggedFields: ['date'] })).toEqual([
        REVIEW_SCAN_SKIPPED,
        'field:date',
      ]);
    });
  });

  describe('Limits', () => {
    it('should cap the note length', () => {
      const [reason] = buildReviewReasons({ note: 'x'.repeat(500) });
      expect(reason).toHaveLength('note:'.length + MAX_REVIEW_NOTE_LENGTH);
    });
  });
});

describe('parseReviewReason', () => {
  it('should parse every stored format', () => {
    expect(parseReviewReason(REVIEW_SCAN_SKIPPED)).toEqual({ kind: 'skipped' });
    expect(parseReviewReason('field:tax')).toEqual({ kind: 'field', field: 'tax' });
    expect(parseReviewReason('note:Tax looked blurry')).toEqual({
      kind: 'note',
      text: 'Tax looked blurry',
    });
  });

  it('should reject unknown or empty reasons', () => {
    expect(parseReviewReason('field:colour')).toBeNull();
    expect(parseReviewReason('note:   ')).toBeNull();
    expect(parseReviewReason('whatever')).toBeNull();
  });

  it('should drop invalid entries from a list', () => {
    expect(parseReviewReasons(['field:date', 'bogus'])).toEqual([{ kind: 'field', field: 'date' }]);
  });
});

describe('sanitizeReviewReasons', () => {
  it('should keep valid, unique reasons only', () => {
    expect(
      sanitizeReviewReasons(['field:tax', ' field:tax ', 'evil', REVIEW_SCAN_SKIPPED]),
    ).toEqual(['field:tax', REVIEW_SCAN_SKIPPED]);
  });

  it('should handle a missing list', () => {
    expect(sanitizeReviewReasons(undefined)).toEqual([]);
  });

  it('should cap the number of reasons', () => {
    const many = Array.from({ length: 30 }, (_, index) => `note:${index}`);
    expect(sanitizeReviewReasons(many)).toHaveLength(MAX_REVIEW_REASONS);
  });
});
