import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { get, put } from '@vercel/blob';

import { fileExists } from '~/utils/file';

/**
 * Receipt storage. Uses private Vercel Blob storage when `BLOB_READ_WRITE_TOKEN` is set
 * (serverless hosts such as Vercel have no persistent disk), and the local `uploads/`
 * directory otherwise (Docker / self-hosted).
 */
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const BLOB_PREFIX = 'receipts/';

const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** Resolves a storage key inside the upload dir, rejecting path traversal. */
const resolveLocalPath = (key: string) => {
  const resolved = path.resolve(UPLOAD_DIR, key);
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
    throw new Error('Invalid storage key');
  }
  return resolved;
};

export const saveFile = async (key: string, body: Buffer, contentType: string) => {
  if (useBlob()) {
    await put(BLOB_PREFIX + key, body, {
      access: 'private',
      contentType,
      addRandomSuffix: false,
    });
    return;
  }

  const filePath = resolveLocalPath(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
};

/** Returns a readable stream for the stored file, or null if it does not exist. */
export const readFile = async (key: string): Promise<Readable | null> => {
  if (useBlob()) {
    const result = await get(BLOB_PREFIX + key, { access: 'private' });
    if (!result?.stream) {
      return null;
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return Readable.fromWeb(result.stream as Parameters<typeof Readable.fromWeb>[0]);
  }

  const filePath = resolveLocalPath(key);
  if (!(await fileExists(filePath))) {
    return null;
  }
  const handle = await fs.open(filePath, 'r');
  return handle.createReadStream();
};
