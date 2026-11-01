import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM sealing for provider tokens stored by billing sync.
 *
 * Stored format: `v<keyVersion>:<iv>:<tag>:<ciphertext>`, each part base64. The additional
 * authenticated data (AAD) binds a ciphertext to its row, so a sealed token copied onto another
 * connection fails to decrypt.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const CURRENT_KEY_VERSION = 1;

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenCryptoError';
  }
}

/** Decodes a base64 32-byte key; returns null when absent or malformed (feature disabled). */
export const parseEncryptionKey = (raw: string | undefined | null): Buffer | null => {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(trimmed)) {
    return null;
  }
  const key = Buffer.from(trimmed, 'base64');
  return KEY_BYTES === key.length ? key : null;
};

/** Row binding for the AAD: provider plus connection id. */
export const tokenAad = (provider: string, connectionId: string) =>
  `safi-billing:${provider}:${connectionId}`;

export const encryptToken = (plaintext: string, key: Buffer, aad: string): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    `v${CURRENT_KEY_VERSION}`,
    iv.toString('base64'),
    tag.toString('base64'),
    data.toString('base64'),
  ].join(':');
};

export const decryptToken = (sealed: string, key: Buffer, aad: string): string => {
  const [version, ivPart, tagPart, dataPart, ...rest] = sealed.split(':');
  if (`v${CURRENT_KEY_VERSION}` !== version || !ivPart || !tagPart || !dataPart || rest.length) {
    throw new TokenCryptoError('Unsupported token format');
  }
  const iv = Buffer.from(ivPart, 'base64');
  const tag = Buffer.from(tagPart, 'base64');
  if (IV_BYTES !== iv.length || TAG_BYTES !== tag.length) {
    throw new TokenCryptoError('Unsupported token format');
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Never include key or token material in the error.
    throw new TokenCryptoError('Token could not be decrypted');
  }
};

/** Last four characters for display; the token itself never leaves the server. */
export const tokenLast4 = (token: string) => token.slice(-4);
