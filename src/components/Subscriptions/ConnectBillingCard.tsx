import { Chip } from '@heroui/react';
import { Link2Icon } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { SUBSCRIPTIONS_NAMESPACES } from './types';

/**
 * Dashed prompt to connect provider billing. Sync does not exist yet, so it shows a muted
 * "Soon" chip instead of a Connect link that would lead nowhere.
 */
export const ConnectBillingCard: React.FC = () => {
  const { t } = useTranslation(SUBSCRIPTIONS_NAMESPACES);

  return (
    <div className="border-border flex items-center gap-3 rounded-2xl border border-dashed px-4 py-3.5">
      <Link2Icon className="text-muted size-[22px] shrink-0" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-foreground/80 text-[13px]">{t('connect.text')}</span>
        <span className="text-muted text-[11px]">{t('connect.soon')}</span>
      </span>
      <Chip size="sm" variant="soft" className="shrink-0">
        {t('connect.soon_chip')}
      </Chip>
    </div>
  );
};
