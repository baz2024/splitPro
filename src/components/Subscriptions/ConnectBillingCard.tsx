import { Link2Icon } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { SUBSCRIPTIONS_NAMESPACES } from './types';

/** Dashed prompt to connect provider billing. Sync does not exist yet, so it says so. */
export const ConnectBillingCard: React.FC = () => {
  const { t } = useTranslation(SUBSCRIPTIONS_NAMESPACES);

  return (
    <div className="border-border flex items-center gap-3 rounded-2xl border border-dashed px-4 py-3.5">
      <Link2Icon className="text-accent size-[22px] shrink-0" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-foreground/80 text-[13px]">{t('connect.text')}</span>
        <span className="text-muted text-[11px]">{t('connect.soon')}</span>
      </span>
      <Link
        href="/agents"
        className="text-accent focus-visible:ring-focus flex min-h-11 shrink-0 items-center rounded-lg px-2 text-[13px] font-semibold focus-visible:ring-2 focus-visible:outline-none"
      >
        {t('connect.cta')}
      </Link>
    </div>
  );
};
