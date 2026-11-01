import type { NextApiRequest, NextApiResponse } from 'next';

import { db } from '~/server/db';
import { sendRenewalReminders } from '~/server/reminders/sendRenewalReminders';

/**
 * Triggered daily by Vercel Cron (see vercel.json). Sends "renews in N days" reminders for
 * subscriptions that have one turned on. Safe to call more than once a day.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const summary = await sendRenewalReminders(db);
    console.info('Renewal reminders', summary);
    return res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    console.error('Error sending renewal reminders', error);
    return res.status(500).json({ error: 'Failed to send renewal reminders' });
  }
}
