import { Bot } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

import { EntityAvatar } from '~/components/ui/avatar';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cn } from '~/lib/utils';
import { SPEND_BUCKETS, type SpendBucket, percentOf } from '~/server/project/budget';
import { type RouterOutputs } from '~/utils/api';

import { Money } from '../Safi/Money';
import { isolateLtr } from './format';

export type ProjectSummary = RouterOutputs['project']['summary'];

const NS = ['projects', 'common'];

const BUCKET_LABEL_KEYS = {
  subscriptions: 'where.subscriptions',
  apiUsage: 'where.api_usage',
  agentRuns: 'where.agent_runs',
  other: 'where.other',
} as const satisfies Record<SpendBucket, string>;

const BUCKET_FILL = {
  subscriptions: 'bg-accent',
  apiUsage: 'bg-success',
  agentRuns: 'bg-warning',
  other: 'bg-muted',
} as const satisfies Record<SpendBucket, string>;

const StatRow: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <div className="border-border flex min-h-12 items-center justify-between gap-3 border-b px-4 py-3.5 last:border-b-0">
    <div className="flex min-w-0 flex-col">
      <span className="text-sm">{label}</span>
      {hint ? <span className="text-muted text-xs">{hint}</span> : null}
    </div>
    <span className="shrink-0 text-sm font-semibold">{value}</span>
  </div>
);

export const ProjectStatsCard: React.FC<{ summary: ProjectSummary }> = ({ summary }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(NS);
  const { toUIString } = getCurrencyHelpersCached(summary.currency);
  const { renewalsDue } = summary;

  return (
    <section className="bg-surface border-border mt-1 flex flex-col rounded-[20px] border">
      <StatRow
        label={t('stats.spent')}
        value={<Money amount={summary.spent} currency={summary.currency} />}
      />
      <StatRow
        label={t('stats.renewals')}
        hint={0 < renewalsDue.count ? undefined : t('stats.renewals_hint')}
        value={
          0 < renewalsDue.count ? (
            <span className="text-warning">
              {t('stats.renewals_value', {
                amount: isolateLtr(toUIString(renewalsDue.total)),
                count: renewalsDue.count,
              })}
            </span>
          ) : (
            <span className="text-muted font-normal">{t('stats.renewals_none')}</span>
          )
        }
      />
      {null !== summary.safeToSpendPerDay ? (
        <StatRow
          label={t('stats.safe_to_spend')}
          value={t('stats.per_day', {
            amount: isolateLtr(toUIString(summary.safeToSpendPerDay)),
          })}
        />
      ) : null}
    </section>
  );
};

export const WhereItGoes: React.FC<{ summary: ProjectSummary; detailsHref: string }> = ({
  summary,
  detailsHref,
}) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(NS);
  const { toUIString } = getCurrencyHelpersCached(summary.currency);
  const buckets = SPEND_BUCKETS.filter(
    (bucket) => 'other' !== bucket || 0n < summary.whereItGoes.other,
  );

  return (
    <section className="mt-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">{t('where.title')}</h2>
        <Link
          href={detailsHref}
          className="text-accent focus-visible:ring-focus -my-3 inline-flex min-h-11 items-center rounded-md px-1 text-[13px] focus-visible:ring-2 focus-visible:outline-none"
        >
          {t('where.details')}
        </Link>
      </div>
      {0n === summary.spent ? (
        <p className="text-muted text-sm">{t('where.empty')}</p>
      ) : (
        buckets.map((bucket) => {
          const amount = summary.whereItGoes[bucket];
          const width = percentOf(amount, summary.spent);
          // Nothing in this bucket yet: say so instead of drawing an empty bar.
          if (0n === amount) {
            return (
              <div key={bucket} className="flex justify-between text-[13px]">
                <span>{t(BUCKET_LABEL_KEYS[bucket])}</span>
                <span className="text-muted">{t('where.none_yet')}</span>
              </div>
            );
          }
          return (
            <div key={bucket} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[13px]">
                <span>{t(BUCKET_LABEL_KEYS[bucket])}</span>
                <span className="text-muted" dir="ltr">
                  {toUIString(amount)}
                </span>
              </div>
              <div
                className="bg-default h-2 rounded-full"
                role="progressbar"
                aria-label={t(BUCKET_LABEL_KEYS[bucket])}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(width)}
              >
                <div
                  className={cn('h-2 rounded-full', BUCKET_FILL[bucket])}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })
      )}
    </section>
  );
};

const MAX_AVATARS = 3;
const MAX_AGENT_ICONS = 2;

export const PeopleAndAgents: React.FC<{ summary: ProjectSummary; manageHref: string }> = ({
  summary,
  manageHref,
}) => {
  const { t } = useTranslationWithUtils(NS);
  // One icon per agent up to the cap, then "+N", so the icons always match the count in words.
  const shownAgents = Math.min(summary.agentsCount, MAX_AGENT_ICONS);
  const extraAgents = summary.agentsCount - shownAgents;
  const agentIcons = Array.from({ length: shownAgents }, (_, index) => `agent-${index}`);

  return (
    <section className="bg-surface border-border mt-[18px] flex items-center justify-between gap-3 rounded-[20px] border px-4 py-3">
      <div className="flex min-w-0 items-center">
        <div className="flex shrink-0 items-center" aria-hidden>
          {summary.members.slice(0, MAX_AVATARS).map((member, index) => (
            <span
              key={member.id}
              className={cn('ring-surface rounded-full ring-2', 0 < index && '-ms-2')}
            >
              <EntityAvatar entity={member} size={32} />
            </span>
          ))}
          {0 < shownAgents ? (
            <span className="ms-2 flex items-center gap-1">
              {agentIcons.map((key) => (
                <span
                  key={key}
                  className="bg-accent/15 border-accent/40 text-accent inline-flex size-8 items-center justify-center rounded-[10px] border"
                >
                  <Bot className="size-4" />
                </span>
              ))}
              {0 < extraAgents ? (
                <span
                  className="bg-default border-border text-foreground inline-flex h-8 min-w-8 items-center justify-center rounded-[10px] border px-1.5 text-xs font-semibold"
                  dir="ltr"
                >
                  +{extraAgents}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        <span className="text-muted ms-2.5 truncate text-[13px]">
          {t('people.summary', { people: summary.members.length, agents: summary.agentsCount })}
        </span>
      </div>
      <Link
        href={manageHref}
        className="text-accent focus-visible:ring-focus inline-flex min-h-11 shrink-0 items-center rounded-md px-1 text-[13px] focus-visible:ring-2 focus-visible:outline-none"
      >
        {t('people.manage')}
      </Link>
    </section>
  );
};
