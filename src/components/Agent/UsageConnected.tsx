import Link from 'next/link';
import React from 'react';

import { BillingConnectedRows } from '~/components/Billing/BillingConnectedRows';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';

import { capHref } from './UsageSummaryCard';

interface UsageConnectedProps {
  hasBudget: boolean;
  projectId: number | null;
}

/** Connected sources: Kafo AI as the budget source, then billing sync (Vercel) rows. */
export const UsageConnected: React.FC<UsageConnectedProps> = ({ hasBudget, projectId }) => {
  const { t } = useTranslationWithUtils(['agentsusage']);

  return (
    <section aria-labelledby="usage-connected" className="flex flex-col">
      <h2
        id="usage-connected"
        className="text-muted px-1 pt-1 pb-2 text-xs font-semibold tracking-wider uppercase"
      >
        {t('connected.title')}
      </h2>
      <ul className="bg-surface border-border divide-border flex flex-col divide-y rounded-[20px] border">
        <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 text-sm">
          <span>{t('connected.kafo_ai')}</span>
          {hasBudget ? (
            <span className="text-success text-xs">{t('connected.budget_source')}</span>
          ) : (
            <Link
              href={capHref(projectId)}
              className="text-accent focus-visible:ring-focus inline-flex min-h-11 items-center rounded-lg text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none"
            >
              {t('connected.set_budget')}
            </Link>
          )}
        </li>
        <BillingConnectedRows projectId={projectId} />
      </ul>
    </section>
  );
};
