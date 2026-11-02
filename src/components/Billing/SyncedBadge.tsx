import { Chip } from '@heroui/react';
import { InfoIcon, RefreshCwIcon } from 'lucide-react';
import React from 'react';

import { usePolishTranslation } from './usePolishTranslation';

const PROVIDER_NAMES: Record<string, string> = { VERCEL: 'Vercel', SUPABASE: 'Supabase' };

/** Brand name for a `BillingProvider` value; brand names are not translated. */
export const billingProviderName = (provider: string): string =>
  PROVIDER_NAMES[provider] ?? provider;

/** Small "Synced from Vercel" chip for expenses imported by billing sync. */
export const SyncedBadge: React.FC<{ provider: string; className?: string }> = ({
  provider,
  className,
}) => {
  const { t } = usePolishTranslation();
  const name = billingProviderName(provider);

  return (
    <Chip
      size="sm"
      variant="soft"
      color="accent"
      className={className}
      aria-label={t('synced.badge_label', { provider: name })}
    >
      <RefreshCwIcon className="size-3" aria-hidden />
      {t('synced.badge', { provider: name })}
    </Chip>
  );
};

/** Note for the edit form: billing sync owns the amount and description of this expense. */
export const SyncedEditNote: React.FC<{ provider: string }> = ({ provider }) => {
  const { t } = usePolishTranslation();

  return (
    <p
      role="note"
      className="border-border bg-surface text-muted flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs"
    >
      <InfoIcon className="text-accent mt-px size-4 shrink-0" aria-hidden />
      <span>{t('synced.edit_note', { provider: billingProviderName(provider) })}</span>
    </p>
  );
};
