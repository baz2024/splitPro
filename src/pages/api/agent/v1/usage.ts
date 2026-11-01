import type { NextApiRequest, NextApiResponse } from 'next';

import { agentPausedBody, authenticateApiKey } from '~/server/agent/apiKeys';
import {
  loadKeySpendStatus,
  recordSpendReport,
  serializeAgentSpend,
  spendReportSchema,
} from '~/server/agent/spendReports';
import { db } from '~/server/db';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8kb',
    },
  },
};

/**
 * Agents report their own API spend (POST) and read month-to-date spend against their cap (GET).
 * When `shouldPause` is true the agent must stop spending; `pauseReason` says why ("paused" by
 * the owner, "cap_reached", or "not_allowed" for a provider/model outside the key's allow-list).
 * A paused key may still GET its status, but POST answers 403 `agent_paused` and records nothing.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'no-store');

  if ('GET' !== req.method && 'POST' !== req.method) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const auth = await authenticateApiKey(db, req.headers.authorization);
  if (!auth) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if ('GET' === req.method) {
    const status = await loadKeySpendStatus(db, auth.apiKeyId);
    return res.status(200).json(serializeAgentSpend(status));
  }

  if (auth.pausedAt) {
    return res.status(403).json(agentPausedBody(auth.pausedAt));
  }

  const parsed = spendReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_request',
      issues: parsed.error.issues.map(({ path, message, code }) => ({ path, message, code })),
    });
  }

  const result = await recordSpendReport(db, auth, parsed.data);
  const status = serializeAgentSpend(result.status);
  return res.status(result.duplicate ? 200 : 201).json({
    expenseId: result.expenseId,
    duplicate: result.duplicate,
    ...status,
    message: [status.message, result.allowListReason].filter(Boolean).join(' ') || null,
  });
};

export default handler;
