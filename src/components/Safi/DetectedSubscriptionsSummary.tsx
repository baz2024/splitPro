import { Bot, ChevronDown } from 'lucide-react';
import React, { useState } from 'react';

import { DetectedSubscriptionsCard } from '~/components/Agent/DetectedSubscriptionsCard';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cn } from '~/lib/utils';
import { api } from '~/utils/api';

/**
 * Home-screen version of the detected-subscriptions inbox: one summary row ("Your coding agent
 * found 1 new service · Review") that expands into the full card. Renders nothing when empty.
 */
export const DetectedSubscriptionsSummary: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useTranslationWithUtils();
  const [expanded, setExpanded] = useState(false);
  // Same query as the card, so React Query shares one request.
  const pendingQuery = api.agent.listDetectedSubscriptions.useQuery({ status: 'PENDING' });
  const count = pendingQuery.data?.length ?? 0;

  if (0 === count) {
    return null;
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
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
      {expanded ? <DetectedSubscriptionsCard /> : null}
    </div>
  );
};
