import React from 'react';

import { Money } from '~/components/Safi/Money';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { capTone, summarizeAgentSpend } from '~/lib/agentControls';
import { type AgentSpend } from '~/server/agent/caps';

import { CAP_MONEY_TONE, UsageRing, capPercent } from './UsageSummaryCard';

const FALLBACK_CURRENCY = 'USD';

/**
 * Agents tab header: what agents reported spending this month and, when any agent has a cap,
 * a donut of capped agents' spend against the sum of their caps. No project budget here.
 */
export const AgentSpendHeader: React.FC<{ agents: AgentSpend[] }> = ({ agents }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(['agentcaps']);
  const totals = summarizeAgentSpend(agents);
  const { toUIString } = getCurrencyHelpersCached(totals.currency ?? FALLBACK_CURRENCY);
  const percent = null === totals.capTotal ? 0 : capPercent(totals.cappedSpent, totals.capTotal);
  const allCapped = totals.cappedCount === totals.agentCount;

  return (
    <section className="flex flex-col gap-2">
      <div className="bg-surface border-border flex items-center justify-between gap-4 rounded-[20px] border p-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <Money
            amount={totals.spent}
            currency={totals.currency ?? FALLBACK_CURRENCY}
            tone={
              // Only colour the total when every agent is capped, so the tone covers all of it.
              null === totals.capTotal || !allCapped
                ? 'neutral'
                : CAP_MONEY_TONE[capTone({ percent, hasCap: true })]
            }
            className="self-start text-2xl font-bold tracking-tight"
          />
          <span className="text-muted text-xs">{t('header.spent')}</span>
        </div>

        {null !== totals.capTotal && (
          <UsageRing
            percent={percent}
            label={t('header.ring_label', { percent, cap: toUIString(totals.capTotal) })}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col items-end text-end">
          {null !== totals.capTotal ? (
            <>
              <Money
                amount={totals.capTotal}
                currency={totals.currency ?? FALLBACK_CURRENCY}
                className="text-2xl font-bold tracking-tight"
              />
              <span className="text-muted text-xs">
                {allCapped
                  ? t('header.caps')
                  : t('header.caps_partial', {
                      capped: totals.cappedCount,
                      total: totals.agentCount,
                    })}
              </span>
            </>
          ) : (
            <span className="text-muted text-xs">{t('header.no_caps')}</span>
          )}
        </div>
      </div>
      {0 < totals.excludedCount && (
        <p className="text-muted px-1 text-xs">
          {t('header.excluded', { count: totals.excludedCount })}
        </p>
      )}
    </section>
  );
};
