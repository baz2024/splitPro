import { type PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const MAX_HEARTBEAT_FINGERPRINTS = 200;

export const heartbeatSchema = z.object({
  fingerprints: z
    .array(
      z.object({
        fingerprint: z.string().trim().min(1).max(100),
        service: z.string().trim().min(1).max(100).optional(),
      }),
    )
    .max(MAX_HEARTBEAT_FINGERPRINTS),
  detectedIn: z.string().trim().max(200).optional(),
});

export type HeartbeatReport = z.infer<typeof heartbeatSchema>;

export interface HeartbeatResult {
  /** Fingerprints that matched one of the user's detected subscriptions and were refreshed. */
  seen: string[];
  /** Fingerprints Safi does not know for this user; they are ignored, never created. */
  ignored: string[];
}

/**
 * Records that the subscription-monitor skill still finds these services in a repo by setting
 * lastSeenAt on the user's existing DetectedSubscription rows. Unknown fingerprints are ignored:
 * new services go through POST /api/agent/v1/subscriptions instead.
 */
export const recordHeartbeat = async (
  db: PrismaClient,
  userId: number,
  report: HeartbeatReport,
  now = new Date(),
): Promise<HeartbeatResult> => {
  const fingerprints = [...new Set(report.fingerprints.map(({ fingerprint }) => fingerprint))];
  if (0 === fingerprints.length) {
    return { seen: [], ignored: [] };
  }

  const existing = await db.detectedSubscription.findMany({
    where: { userId, fingerprint: { in: fingerprints } },
    select: { fingerprint: true },
  });
  const known = new Set(existing.map(({ fingerprint }) => fingerprint));

  if (0 < known.size) {
    await db.detectedSubscription.updateMany({
      where: { userId, fingerprint: { in: [...known] } },
      data: { lastSeenAt: now },
    });
  }

  return {
    seen: fingerprints.filter((fingerprint) => known.has(fingerprint)),
    ignored: fingerprints.filter((fingerprint) => !known.has(fingerprint)),
  };
};
