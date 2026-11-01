import type { NextApiRequest, NextApiResponse } from 'next';

import { agentPausedBody, authenticateApiKey } from '~/server/agent/apiKeys';
import { heartbeatSchema, recordHeartbeat } from '~/server/agent/heartbeat';
import { db } from '~/server/db';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '32kb',
    },
  },
};

/**
 * POST /api/agent/v1/seen — heartbeat from the subscription-monitor skill. Body:
 * `{ fingerprints: [{ fingerprint, service? }], detectedIn? }`. Refreshes lastSeenAt on the
 * caller's existing detected subscriptions; unknown fingerprints are ignored.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'no-store');

  if ('POST' !== req.method) {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const auth = await authenticateApiKey(db, req.headers.authorization);
  if (!auth) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (auth.pausedAt) {
    return res.status(403).json(agentPausedBody(auth.pausedAt));
  }

  const parsed = heartbeatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_request',
      issues: parsed.error.issues.map(({ path, message, code }) => ({ path, message, code })),
    });
  }

  const result = await recordHeartbeat(db, auth.userId, parsed.data);
  return res.status(200).json(result);
};

export default handler;
