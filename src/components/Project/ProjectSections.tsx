import { Bot } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

import { EntityAvatar } from '~/components/ui/avatar';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cn } from '~/lib/utils';
import { SPEND_BUCKETS, type SpendBucket, percentOf } from '~/server/project/budget';
import { type RouterOutputs } from '~/utils/api';

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
        value={<span dir="ltr">{toUIString(summary.spent)}</span>}
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
const AGENT_ICON_KEYS = ['agent-a', 'agent-b'] as const;

export const PeopleAndAgents: React.FC<{ summary: ProjectSummary; manageHref: string }> = ({
  summary,
  manageHref,
}) => {
  const { t } = useTranslationWithUtils(NS);
  const agentIcons = AGENT_ICON_KEYS.slice(0, summary.agentsCount);

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
          {agentIcons.map((key) => (
            <span
              key={key}
              className="bg-default ring-surface text-accent -ms-2 inline-flex size-8 items-center justify-center rounded-[10px] ring-2"
            >
              <Bot className="size-4" />
            </span>
          ))}
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

export const TodayList: React.FC<{ summary: ProjectSummary; currentUserId: number }> = ({
  summary,
  currentUserId,
}) => {
  const { t, displayName, getCurrencyHelpersCached } = useTranslationWithUtils(NS);

  return (
    <section className="mt-6 flex flex-col gap-2" aria-labelledby="project-today-title">
      <h2
        id="project-today-title"
        className="text-muted text-[11px] font-semibold tracking-wider uppercase"
      >
        {t('today.title')}
      </h2>
      {0 === summary.today.length ? (
        <p className="text-muted text-sm">{t('today.empty')}</p>
      ) : (
        <ul className="bg-surface border-border flex flex-col rounded-[16px] border">
          {summary.today.map((expense) => (
            <li key={expense.id} className="border-border border-b last:border-b-0">
              <Link
                href={`/groups/${summary.id}/expenses/${expense.id}`}
                className="focus-visible:ring-focus flex min-h-14 items-center justify-between gap-3 rounded-[16px] px-4 py-3 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{expense.description}</span>
                  <span className="text-muted truncate text-xs">
                    {t('today.paid_by', {
                      // `actors.you` lives in common, which this projects-first `t` doesn't search.
                      name:
                        currentUserId === expense.paidBy.id
                          ? t('actors.you', { ns: 'common' })
                          : displayName(expense.paidBy),
                      source: expense.isRecurring
                        ? t('today.recurring')
                        : expense.hasReceipt
                          ? t('today.receipt')
                          : t('today.manual'),
                    })}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-semibold" dir="ltr">
                  {getCurrencyHelpersCached(expense.currency).toUIString(expense.amount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
