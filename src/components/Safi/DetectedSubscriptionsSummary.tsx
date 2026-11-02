import { Bot, ChevronDown, ChevronRight, ScanSearch } from 'lucide-react';
import Link from 'next/link';
import React, { useState } from 'react';

import { DetectedSubscriptionsCard } from '~/components/Agent/DetectedSubscriptionsCard';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cn } from '~/lib/utils';
import { api } from '~/utils/api';

const SCAN_LINK_CLASS =
  'border-border bg-surface focus-visible:ring-focus flex min-h-12 w-full items-center gap-3 rounded-2xl border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none';

/**
 * Home-screen version of the detected-subscriptions inbox. Coding-agent finds get one summary row
 * ("Your coding agent found 1 new service · Review") that expands into the full card; finds from a
 * bank statement get their own row linking to the scan page. With neither, it offers a scan.
 */
export const DetectedSubscriptionsSummary: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useTranslationWithUtils();
  const [expanded, setExpanded] = useState(false);
  // Same query as the card, so React Query shares one request.
  const pendingQuery = api.agent.listDetectedSubscriptions.useQuery({ status: 'PENDING' });
  const pending = pendingQuery.data ?? [];
  const statementCount = pending.filter((item) => 'statement' === item.agent).length;
  const count = pending.length - statementCount;

  if (0 === count && 0 === statementCount) {
    // Nothing detected yet: offer the statement scan instead of an empty inbox.
    return pendingQuery.isSuccess ? (
      <Link href="/scan-statement" className={cn(SCAN_LINK_CLASS, className)}>
        <ScanSearch className="text-accent size-4 shrink-0" aria-hidden />
        <span className="text-foreground min-w-0 flex-1">{t('audit_a.detected.scan_cta')}</span>
        <ChevronRight className="text-muted size-4 shrink-0 rtl:rotate-180" aria-hidden />
      </Link>
    ) : null;
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {0 < statementCount ? (
        <Link href="/scan-statement" className={SCAN_LINK_CLASS}>
          <ScanSearch className="text-accent size-4 shrink-0" aria-hidden />
          <span className="text-foreground min-w-0 flex-1">
            {t('audit_a.detected.statement_summary', { count: statementCount })}
          </span>
          <span className="text-accent flex shrink-0 items-center gap-1 font-medium">
            {t('audit_a.detected.review')}
            <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
          </span>
        </Link>
      ) : null}
      {0 < count ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="border-border bg-surface focus-visible:ring-focus flex min-h-12 w-full items-center gap-3 rounded-2xl border px-4 py-2 text-start text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <Bot className="text-accent size-4 shrink-0" aria-hidden />
          <span className="text-foreground min-w-0 flex-1">
            {t('audit_a.detected.summary', { count })}
          </span>
          <span className="text-accent flex shrink-0 items-center gap-1 font-medium">
            {expanded ? t('audit_a.detected.hide') : t('audit_a.detected.review')}
            <ChevronDown
              className={cn('size-4 transition-transform', expanded && 'rotate-180')}
              aria-hidden
            />
          </span>
        </button>
      ) : null}
      {expanded && 0 < count ? <DetectedSubscriptionsCard /> : null}
    </div>
  );
};
