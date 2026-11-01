import { buttonVariants } from '@heroui/react';
import { ChevronLeft, PencilLine, Plus, Settings, Target } from 'lucide-react';
import { type GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useEffect } from 'react';
import { toast } from 'sonner';

import MainLayout from '~/components/Layout/MainLayout';
import { BudgetGauge } from '~/components/Project/BudgetGauge';
import { BudgetSheet } from '~/components/Project/BudgetSheet';
import { isolateLtr, monthName, useTzOffset } from '~/components/Project/format';
import {
  PeopleAndAgents,
  ProjectStatsCard,
  type ProjectSummary,
  TodayList,
  WhereItGoes,
} from '~/components/Project/ProjectSections';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cn } from '~/lib/utils';
import { percentOf } from '~/server/project/budget';
import { type NextPageWithUser } from '~/types';
import { api } from '~/utils/api';
import { customServerSideTranslations } from '~/utils/i18n/server';
import { isStringQueryParam } from '~/utils/queryParams';

const NS = ['projects', 'common'];

const STATUS_TEXT = {
  on_track: 'text-success',
  at_risk: 'text-warning',
  over: 'text-danger',
  no_budget: 'text-muted',
} as const;

const ROUND_ICON_BUTTON =
  'bg-surface border-border text-foreground focus-visible:ring-focus inline-flex size-11 shrink-0 items-center justify-center rounded-full border focus-visible:ring-2 focus-visible:outline-none';

const BudgetOverview: React.FC<{ summary: ProjectSummary }> = ({ summary }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(NS);
  const { toUIString } = getCurrencyHelpersCached(summary.currency);

  if (null === summary.budget || null === summary.left) {
    return (
      <section className="bg-surface border-border mt-4 mb-4 flex flex-col items-center gap-3 rounded-[20px] border px-5 py-6 text-center">
        <span className="bg-default text-accent inline-flex size-12 items-center justify-center rounded-full">
          <Target className="size-6" aria-hidden />
        </span>
        <h2 className="text-base font-semibold">{t('empty_budget.title')}</h2>
        <p className="text-muted text-sm">{t('empty_budget.description')}</p>
        <BudgetSheet
          groupId={summary.id}
          budget={null}
          budgetCurrency={null}
          fallbackCurrency={summary.currency}
          trigger={
            <button
              type="button"
              className={cn(buttonVariants({ variant: 'primary' }), 'min-h-11 rounded-full px-6')}
            >
              {t('empty_budget.cta')}
            </button>
          }
        />
      </section>
    );
  }

  const isOver = 0n > summary.left;
  const percentSpent = percentOf(summary.spent, summary.budget);
  const days = t('list.days_left', { count: summary.daysLeft });

  return (
    <BudgetGauge
      percentSpent={percentSpent}
      isOver={isOver}
      label={isOver ? t('gauge.over_by') : t('gauge.left_to_spend')}
      value={toUIString(isOver ? -summary.left : summary.left)}
      caption={t('gauge.of_budget', { budget: isolateLtr(toUIString(summary.budget)), days })}
      ariaLabel={t('gauge.aria', { percent: Math.round(percentSpent) })}
    />
  );
};

const ProjectPage: NextPageWithUser = ({ user }) => {
  const { t, i18n } = useTranslationWithUtils(NS);
  const router = useRouter();
  const groupId = isStringQueryParam(router.query.groupId)
    ? parseInt(router.query.groupId)
    : Number.NaN;

  const tzOffset = useTzOffset();
  const summaryQuery = api.project.summary.useQuery(
    { groupId, tzOffset },
    { enabled: router.isReady && !Number.isNaN(groupId) },
  );
  const summary = summaryQuery.data;

  // The add-expense flow can land here with ?saved=1 to confirm the save (Figma screen 6).
  useEffect(() => {
    if (!router.isReady || '1' !== router.query.saved) {
      return;
    }
    toast.success(t('today.saved'));
    const { saved: _saved, ...query } = router.query;
    router
      .replace({ pathname: router.pathname, query }, undefined, { shallow: true })
      .catch(console.error);
  }, [router, t]);

  const month = summary ? monthName(i18n.language, summary.year, summary.month) : '';

  return (
    <>
      <Head>
        <title>{summary?.name ?? t('title')}</title>
      </Head>
      <MainLayout loading={summaryQuery.isPending && !summaryQuery.isError}>
        <header className="flex items-center justify-between gap-2 pt-5 pb-2">
          <Link href="/projects" aria-label={t('back')} className={ROUND_ICON_BUTTON}>
            <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
          </Link>
          {'manual' === summary?.budgetSource ? (
            <span className="bg-surface border-border text-muted inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs">
              <PencilLine className="text-success size-3.5" aria-hidden />
              {t('status.manual')}
            </span>
          ) : null}
          <Link
            href={Number.isNaN(groupId) ? '/groups' : `/groups/${groupId}`}
            aria-label={t('settings')}
            className={ROUND_ICON_BUTTON}
          >
            <Settings className="size-5" aria-hidden />
          </Link>
        </header>

        {summaryQuery.isError ? (
          <p className="text-danger mt-6 text-sm">{t('errors.load_failed')}</p>
        ) : null}

        {summary ? (
          <div className="flex flex-col pb-6">
            <div className="pt-1">
              <h1 className="text-[28px] leading-tight font-bold tracking-tight">{summary.name}</h1>
              <p className="text-muted mt-0.5 text-[13px]">
                {null === summary.budget
                  ? t('status.month_spending', { month })
                  : t('status.month_budget', { month })}
                {'no_budget' !== summary.status ? (
                  <>
                    {' · '}
                    <span className={STATUS_TEXT[summary.status]}>
                      {t(`status.${summary.status}`)}
                    </span>
                  </>
                ) : null}
              </p>
            </div>

            <BudgetOverview summary={summary} />
            <ProjectStatsCard summary={summary} />
            {summary.skippedOtherCurrencies || summary.renewalsDue.skippedOtherCurrencies ? (
              <p className="text-muted mt-2 text-xs">{t('stats.other_currencies')}</p>
            ) : null}
            <WhereItGoes summary={summary} detailsHref={`/groups/${summary.id}`} />
            <PeopleAndAgents summary={summary} manageHref={`/groups/${summary.id}`} />

            <div className="mt-4 flex gap-2.5">
              <Link
                href={`/subscriptions?groupId=${summary.id}`}
                className={cn(
                  buttonVariants({ variant: 'secondary', size: 'lg' }),
                  'h-[52px] flex-1 rounded-full',
                )}
              >
                {t('actions.subscriptions')}
              </Link>
              <Link
                href={`/add?groupId=${summary.id}`}
                className={cn(
                  buttonVariants({ variant: 'primary', size: 'lg' }),
                  'h-[52px] flex-1 gap-1.5 rounded-full font-semibold',
                )}
              >
                <Plus className="size-[18px]" aria-hidden />
                {t('actions.add_cost')}
              </Link>
            </div>

            <TodayList summary={summary} currentUserId={user.id} />
          </div>
        ) : null}
      </MainLayout>
    </>
  );
};

ProjectPage.auth = true;

export default ProjectPage;

export const getServerSideProps: GetServerSideProps = async (context) => ({
  props: {
    ...(await customServerSideTranslations(context.locale, ['common', 'projects', 'currencies'])),
  },
});
