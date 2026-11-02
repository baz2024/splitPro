import { createNextApiHandler } from '@trpc/server/adapters/next';

import { env } from '~/env';
import { appRouter } from '~/server/api/root';
import { createTRPCContext } from '~/server/api/trpc';

// The receipt.scan procedure sends a base64 photo; stay under Vercel's 4.5 MB request cap.
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

// Export API handler
export default createNextApiHandler({
  router: appRouter,
  createContext: createTRPCContext,
  onError:
    'development' === env.NODE_ENV
      ? ({ path, error }) => {
          console.error(`❌ tRPC failed on ${path ?? '<no-path>'}: ${error.message}`);
        }
      : undefined,
});
