import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '~/server/auth';
import { readFile } from '~/server/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if ('GET' !== req.method) {
    return res.status(405).end();
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(403).send('Unauthorized');
  }

  const { path: pathParts } = req.query;

  if (!pathParts || !Array.isArray(pathParts) || pathParts.some((p) => '..' === p || '' === p)) {
    return res.status(400).send('Invalid path');
  }

  const fileStream = await readFile(pathParts.join('/')).catch(() => undefined);
  if (undefined === fileStream) {
    return res.status(403).send('Forbidden');
  }

  if (!fileStream) {
    return res.status(404).send('File not found');
  }

  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  fileStream.pipe(res);
}
