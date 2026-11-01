import type { NextApiRequest, NextApiResponse } from 'next';

import {
  createApiKeyRecord,
  generateApiKey,
  getApiKeyDisplayPrefix,
  hashApiKey,
  isApiKeyFormat,
  parseBearerToken,
} from '~/server/agent/apiKeys';
import {
  buildDuplicateUpdate,
  reportToCreateData,
  serializeDetectedSubscription,
} from '~/server/agent/detectedSubscriptions';
import {
  detectedSubscriptionReportSchema,
  formatMinorUnits,
  mergeEvidence,
  parseAmountToMinorUnits,
} from '~/server/agent/validation';

const mockDb = {
  apiKey: { findUnique: jest.fn(), update: jest.fn() },
  detectedSubscription: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
};

jest.mock('~/server/db', () => ({ db: mockDb }));

const parseReport = (body: unknown) => detectedSubscriptionReportSchema.parse(body);

describe('apiKeys', () => {
  describe('generateApiKey', () => {
    it('should produce safi_ + 40 url-safe chars', () => {
      const token = generateApiKey();
      expect(token).toMatch(/^safi_[A-Za-z0-9_-]{40}$/);
      expect(token).toHaveLength(45);
      expect(isApiKeyFormat(token)).toBe(true);
    });

    it('should produce unique tokens', () => {
      const tokens = new Set(Array.from({ length: 50 }, generateApiKey));
      expect(tokens.size).toBe(50);
    });
  });

  describe('hashApiKey', () => {
    it('should be a stable sha256 hex digest', () => {
      const token = `safi_${'a'.repeat(40)}`;
      expect(hashApiKey(token)).toMatch(/^[0-9a-f]{64}$/);
      expect(hashApiKey(token)).toBe(hashApiKey(token));
      expect(hashApiKey(token)).not.toBe(hashApiKey(`safi_${'b'.repeat(40)}`));
    });
  });

  describe('createApiKeyRecord', () => {
    it('should return the raw token, an 8-char prefix and its hash', () => {
      const { token, prefix, hashedKey } = createApiKeyRecord();
      expect(prefix).toBe(token.slice(0, 8));
      expect(prefix).toHaveLength(8);
      expect(getApiKeyDisplayPrefix(token)).toBe(prefix);
      expect(hashedKey).toBe(hashApiKey(token));
      expect(hashedKey).not.toContain(token);
    });
  });

  describe('parseBearerToken', () => {
    const token = `safi_${'x'.repeat(40)}`;

    it('should accept a valid bearer header', () => {
      expect(parseBearerToken(`Bearer ${token}`)).toBe(token);
      expect(parseBearerToken(`bearer ${token}`)).toBe(token);
    });

    it('should reject missing, malformed or wrong-prefix tokens', () => {
      expect(parseBearerToken(undefined)).toBeNull();
      expect(parseBearerToken('')).toBeNull();
      expect(parseBearerToken(token)).toBeNull();
      expect(parseBearerToken('Bearer safi_short')).toBeNull();
      expect(parseBearerToken(`Bearer sk_${'x'.repeat(40)}`)).toBeNull();
      expect(parseBearerToken(`Basic ${token}`)).toBeNull();
    });
  });
});

describe('validation', () => {
  describe('detectedSubscriptionReportSchema', () => {
    it('should accept a minimal body and default category to saas', () => {
      const report = parseReport({ fingerprint: 'openai', service: 'OpenAI API' });
      expect(report.category).toBe('saas');
    });

    it('should accept a full body', () => {
      const report = parseReport({
        fingerprint: 'openai',
        service: 'OpenAI API',
        vendor: 'OpenAI',
        category: 'aiApis',
        detectedIn: 'acme/web',
        evidence: ['package.json: openai@^4.52.0'],
        estimatedMonthlyCost: { amount: '20.00', currency: 'usd' },
        pricingUrl: 'https://openai.com/api/pricing',
        agent: 'claude-code',
      });
      expect(report.estimatedMonthlyCost?.currency).toBe('USD');
    });

    it.each([
      ['missing fingerprint', { service: 'X' }],
      ['empty service', { fingerprint: 'x', service: '' }],
      ['fingerprint too long', { fingerprint: 'x'.repeat(101), service: 'X' }],
      ['unknown category', { fingerprint: 'x', service: 'X', category: 'food' }],
      [
        'too many evidence items',
        { fingerprint: 'x', service: 'X', evidence: Array(21).fill('e') },
      ],
      ['evidence item too long', { fingerprint: 'x', service: 'X', evidence: ['e'.repeat(301)] }],
      ['http pricing url', { fingerprint: 'x', service: 'X', pricingUrl: 'http://a.com' }],
      [
        'bad amount',
        {
          fingerprint: 'x',
          service: 'X',
          estimatedMonthlyCost: { amount: '20,00', currency: 'USD' },
        },
      ],
      [
        'unknown currency',
        { fingerprint: 'x', service: 'X', estimatedMonthlyCost: { amount: '20', currency: 'ZZZ' } },
      ],
      [
        'too many decimals for currency',
        {
          fingerprint: 'x',
          service: 'X',
          estimatedMonthlyCost: { amount: '5.5', currency: 'JPY' },
        },
      ],
      ['not an object', 'hello'],
    ])('should reject %s', (_label, body) => {
      expect(detectedSubscriptionReportSchema.safeParse(body).success).toBe(false);
    });
  });

  describe('parseAmountToMinorUnits', () => {
    it('should convert using currency decimal digits', () => {
      expect(parseAmountToMinorUnits('20.00', 'USD')).toBe(2000n);
      expect(parseAmountToMinorUnits('20', 'USD')).toBe(2000n);
      expect(parseAmountToMinorUnits('0.5', 'USD')).toBe(50n);
      expect(parseAmountToMinorUnits('500', 'JPY')).toBe(500n);
      expect(parseAmountToMinorUnits('500.00', 'JPY')).toBe(500n);
    });

    it('should reject invalid input', () => {
      expect(parseAmountToMinorUnits('20.001', 'USD')).toBeNull();
      expect(parseAmountToMinorUnits('-1', 'USD')).toBeNull();
      expect(parseAmountToMinorUnits('abc', 'USD')).toBeNull();
      expect(parseAmountToMinorUnits('1', 'ZZZ')).toBeNull();
    });
  });

  describe('formatMinorUnits', () => {
    it('should format back to decimal strings', () => {
      expect(formatMinorUnits(2000n, 'USD')).toBe('20.00');
      expect(formatMinorUnits(5n, 'USD')).toBe('0.05');
      expect(formatMinorUnits(500n, 'JPY')).toBe('500');
    });
  });

  describe('mergeEvidence', () => {
    it('should keep order, drop duplicates and cap at 20', () => {
      expect(mergeEvidence(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
      const many = Array.from({ length: 30 }, (_, i) => `e${i}`);
      expect(mergeEvidence([], many)).toHaveLength(20);
    });
  });
});

describe('detectedSubscriptions', () => {
  const existing = {
    status: 'PENDING' as const,
    evidence: ['package.json: openai@^4.0.0'],
    vendor: null,
    detectedIn: 'acme/web',
    estimatedAmount: null,
    pricingUrl: null,
    agent: 'claude-code',
  };

  describe('buildDuplicateUpdate', () => {
    it('should merge evidence and fill empty fields for PENDING rows', () => {
      const update = buildDuplicateUpdate(
        existing,
        parseReport({
          fingerprint: 'openai',
          service: 'OpenAI API',
          vendor: 'OpenAI',
          detectedIn: 'acme/api',
          evidence: ['.env.example: OPENAI_API_KEY'],
          estimatedMonthlyCost: { amount: '20.00', currency: 'USD' },
        }),
      );
      expect(update).toEqual({
        evidence: ['package.json: openai@^4.0.0', '.env.example: OPENAI_API_KEY'],
        vendor: 'OpenAI',
        estimatedAmount: 2000n,
        estimatedCurrency: 'USD',
      });
    });

    it('should also merge into ADDED rows', () => {
      const update = buildDuplicateUpdate(
        { ...existing, status: 'ADDED' },
        parseReport({ fingerprint: 'openai', service: 'OpenAI API', evidence: ['x'] }),
      );
      expect(update?.evidence).toEqual(['package.json: openai@^4.0.0', 'x']);
    });

    it('should not re-open DISMISSED rows', () => {
      expect(
        buildDuplicateUpdate(
          { ...existing, status: 'DISMISSED' },
          parseReport({ fingerprint: 'openai', service: 'OpenAI API', evidence: ['x'] }),
        ),
      ).toBeNull();
    });
  });

  describe('serializeDetectedSubscription', () => {
    it('should return lowercase status and decimal amount', () => {
      const now = new Date('2026-11-01T00:00:00.000Z');
      const data = reportToCreateData(
        1,
        parseReport({
          fingerprint: 'openai',
          service: 'OpenAI API',
          estimatedMonthlyCost: { amount: '20.00', currency: 'USD' },
        }),
      );
      const serialized = serializeDetectedSubscription({
        ...data,
        id: 'id1',
        status: 'PENDING',
        expenseId: null,
        createdAt: now,
        updatedAt: now,
      });
      expect(serialized.status).toBe('pending');
      expect(serialized.estimatedMonthlyCost).toEqual({ amount: '20.00', currency: 'USD' });
      expect(serialized.createdAt).toBe('2026-11-01T00:00:00.000Z');
    });
  });
});

describe('/api/agent/v1/subscriptions', () => {
  const token = `safi_${'k'.repeat(40)}`;

  const createMockRes = () => {
    const res = {} as NextApiResponse;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    return res;
  };

  const callHandler = async (req: Partial<NextApiRequest>) => {
    const { default: handler } = await import('~/pages/api/agent/v1/subscriptions');
    const res = createMockRes();
    await handler({ headers: {}, ...req } as NextApiRequest, res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.apiKey.findUnique.mockResolvedValue({ id: 'key1', userId: 7, revokedAt: null });
    mockDb.apiKey.update.mockResolvedValue({});
  });

  it('should return 405 for other methods', async () => {
    const res = await callHandler({ method: 'DELETE' });
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('should return 401 without a valid key', async () => {
    const res = await callHandler({ method: 'GET' });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized' });
  });

  it('should return 401 for a revoked key', async () => {
    mockDb.apiKey.findUnique.mockResolvedValue({ id: 'key1', userId: 7, revokedAt: new Date() });
    const res = await callHandler({
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 400 for an invalid body', async () => {
    const res = await callHandler({
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: { service: 'X' },
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'invalid_request', issues: expect.any(Array) }),
    );
  });

  it('should return 201 for a new report and update lastUsedAt', async () => {
    mockDb.detectedSubscription.findUnique.mockResolvedValue(null);
    mockDb.detectedSubscription.create.mockResolvedValue({ id: 'ds1', status: 'PENDING' });
    const res = await callHandler({
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: { fingerprint: 'openai', service: 'OpenAI API' },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 'ds1', status: 'pending', duplicate: false });
    expect(mockDb.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hashedKey: hashApiKey(token) } }),
    );
    expect(mockDb.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'key1' } }),
    );
  });

  it('should return 200 duplicate for a dismissed fingerprint without changing it', async () => {
    mockDb.detectedSubscription.findUnique.mockResolvedValue({
      ...existingRow(),
      status: 'DISMISSED',
    });
    const res = await callHandler({
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: { fingerprint: 'openai', service: 'OpenAI API', evidence: ['new'] },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: 'ds1', status: 'dismissed', duplicate: true });
    expect(mockDb.detectedSubscription.update).not.toHaveBeenCalled();
  });
});

const existingRow = () => ({
  id: 'ds1',
  userId: 7,
  fingerprint: 'openai',
  service: 'OpenAI API',
  vendor: null,
  category: 'aiApis',
  status: 'PENDING',
  detectedIn: null,
  evidence: [],
  estimatedAmount: null,
  estimatedCurrency: null,
  pricingUrl: null,
  agent: null,
  expenseId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});
