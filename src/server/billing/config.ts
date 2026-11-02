import { env } from '~/env';

import { parseEncryptionKey } from './crypto';

/** The token-encryption key, or null when billing sync is disabled (key unset or invalid). */
export const getIntegrationKey = (): Buffer | null =>
  parseEncryptionKey(env.INTEGRATION_ENCRYPTION_KEY);

export const isBillingSyncEnabled = () => null !== getIntegrationKey();
