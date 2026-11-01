import { Chip } from '@heroui/react';
import { Link2Icon } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { BILLING_NAMESPACES, billingErrorText } from '~/components/Billing/billingErrors';
import { ConnectBillingSheet } from '~/components/Billing/ConnectBillingSheet';
import { api } from '~/utils/api';

const CARD_CLASS =
  'border-border flex items-center gap-3 rounded-2xl border border-dashed px-4 py-3.5';

/**
 * Dashed prompt to connect provider billing. Vercel connects with a token when billing sync is
 * enabled on the server; Supabase stays "Soon" (its API exposes no billed amounts).
 */
export const ConnectBillingCard: React.FC<{ groupId?: number | null }> = ({ groupId = null }) => {
  const { t } = useTranslation(BILLING_NAMESPACES);
  const listQuery = api.billing.list.useQuery();
  const enabled = listQuery.data?.enabled ?? false;
  const vercel = listQuery.data?.connections.find((c) => 'VERCEL' === c.provider) ?? null;

  if (vercel) {
    const hasError = 'error' === vercel.status;
    return (
      <div className={CARD_CLASS}>
        <Link2Icon
          className={`${hasError ? 'text-danger' : 'text-accent'} size-[22px] shrink-0`}
          aria-hidden
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-foreground/80 text-[13px]">{t('card.connected_text')}</span>
          <span className={`${hasError ? 'text-danger' : 'text-muted'} text-[11px]`}>
            {hasError
              ? t('row.error', { reason: billingErrorText(t, vercel.lastError) })
              : t('card.connected_sub')}
          </span>
        </span>
        <Link
          href="/agents"
          className="text-accent focus-visible:ring-focus inline-flex min-h-11 shrink-0 items-center rounded-lg text-[13px] font-semibold focus-visible:ring-2 focus-visible:outline-none"
        >
          {t('card.manage')}
        </Link>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className={CARD_CLASS}>
        <Link2Icon className="text-muted size-[22px] shrink-0" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-foreground/80 text-[13px]">{t('card.soon_text')}</span>
          <span className="text-muted text-[11px]">{t('card.soon_sub')}</span>
        </span>
        <Chip size="sm" variant="soft" className="shrink-0">
          {t('soon')}
        </Chip>
      </div>
    );
  }

  return (
    <div className={CARD_CLASS}>
      <Link2Icon className="text-accent size-[22px] shrink-0" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-foreground/80 text-[13px]">{t('card.text')}</span>
        <span className="text-muted text-[11px]">{t('card.sub')}</span>
      </span>
      <ConnectBillingSheet
        defaultGroupId={groupId}
        trigger={
          <button
            type="button"
            aria-label={t('connect_label', { service: t('provider.vercel') })}
            className="text-accent focus-visible:ring-focus inline-flex min-h-11 shrink-0 items-center rounded-lg text-[13px] font-semibold focus-visible:ring-2 focus-visible:outline-none"
          >
            {t('connect')}
          </button>
        }
      />
    </div>
  );
};
