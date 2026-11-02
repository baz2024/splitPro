import type { NextApiRequest, NextApiResponse } from 'next';

import { getIntegrationKey } from '~/server/billing/config';
import { notifyBillingSyncBlocked } from '~/server/billing/notify';
import { syncAllBillingConnections } from '~/server/billing/sync';
import { db } from '~/server/db';

export const config = { maxDuration: 60 };

/**
 * Triggered daily by Vercel Cron (see vercel.json): imports month-to-date Vercel charges for
 * every active billing connection. Skips when INTEGRATION_ENCRYPTION_KEY is not set.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const key = getIntegrationKey();
  if (!key) {
    return res.status(200).json({ ok: true, skipped: 'disabled' });
  }

  try {
    const summary = await syncAllBillingConnections(db, {
      key,
      onBlocked: notifyBillingSyncBlocked,
    });
    return res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    // Details stay in server logs; the response carries only a stable code.
    console.error('billing-sync cron failed:', error instanceof Error ? error.message : error);
    return res.status(500).json({ ok: false, error: 'billing_sync_failed' });
  }
}
