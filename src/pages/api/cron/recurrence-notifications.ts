import type { NextApiRequest, NextApiResponse } from 'next';

import { sendPendingRecurrenceNotifications } from '~/server/api/services/notificationService';

/**
 * Triggered by Vercel Cron (see vercel.json). On serverless hosts the in-process
 * polling loop from instrumentation.ts cannot run, so this endpoint replaces it.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await sendPendingRecurrenceNotifications();
  return res.status(200).json({ ok: true });
}
