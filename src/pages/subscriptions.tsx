import { ChevronLeftIcon, PlusIcon, ScanSearchIcon } from 'lucide-react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useState } from 'react';

import MainLayout from '~/components/Layout/MainLayout';
import { ConnectBillingCard } from '~/components/Subscriptions/ConnectBillingCard';
import {
  FilterChips,
  SUBSCRIPTIONS_PANEL_ID,
  type SubscriptionFilter,
} from '~/components/Subscriptions/FilterChips';
import { MonthCashTiles } from '~/components/Subscriptions/MonthCashTiles';
import { PaidForChecklist } from '~/components/Subscriptions/PaidForChecklist';
import { RunRateCard } from '~/components/Subscriptions/RunRateCard';
import { SavingsBanner } from '~/components/Subscriptions/SavingsBanner';
import { SectionCard } from '~/components/Subscriptions/SectionCard';
import { ServiceCostCard } from '~/components/Subscriptions/ServiceCostCard';
import { SubscriptionRow } from '~/components/Subscriptions/SubscriptionRow';
import {
  SUBSCRIPTIONS_NAMESPACES,
  type SubscriptionListItem,
} from '~/components/Subscriptions/types';
import { UsageRow } from '~/components/Subscriptions/UsageRow';
import { LoadingSpinner } from '~/components/ui/spinner';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { daysUntil } from '~/server/subscriptions/helpers';
import { type NextPageWithUser } from '~/types';
import { api } from '~/utils/api';
import { withI18nStaticProps } from '~/utils/i18n/server';

const CYCLE_ORDER = ['monthly', 'yearly', 'weekly', 'other'] as const;
const UPCOMING_DAYS = 7;

const parseGroupId = (value: string | string[] | undefined): number | undefined => {
  const parsed = Number('string' === typeof value ? value : undefined);
  return Number.isInteger(parsed) && 0 < parsed ? parsed : undefined;
};

const SubscriptionsPage: NextPageWithUser = ({ user }) => {
  const { t, i18n } = useTranslationWithUtils(SUBSCRIPTIONS_NAMESPACES);
  const router = useRouter();
  const groupId = parseGroupId(router.query.groupId);
  const [filter, setFilter] = useState<SubscriptionFilter>('upcoming');
  const [now] = useState(() => new Date());

  const overviewQuery = api.subscriptions.list.useQuery(groupId ? { groupId } : undefined, {
    enabled: router.isReady,
  });
  const overview = overviewQuery.data;

  const addHref = groupId ? `/add?type=subscription&groupId=${groupId}` : '/add?type=subscription';

  const handleBack = () => {
    if (1 < window.history.length) {
      router.back();
      return;
    }
    router.push('/projects').catch(console.error);
  };

  // Mid-month avoids any time-zone edge pushing the label into a neighbouring month.
  const lastMonthLabel = new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(
    new Date(now.getFullYear(), now.getMonth() - 1, 15),
  );

  const renderSubscription = (item: SubscriptionListItem, showCycle = false) => (
    <SubscriptionRow
      key={item.recurrenceId}
      item={item}
      currentUserId={user.id}
      now={now}
      showCycle={showCycle}
      unused={item.unused}
    />
  );

  const upcoming = (overview?.items ?? []).filter(
    (item) => null !== item.nextDueDate && UPCOMING_DAYS >= daysUntil(item.nextDueDate, now),
  );

  const addCta = (
    <div className="flex flex-col items-start">
      <Link
        href={addHref}
        className="text-accent focus-visible:ring-focus mt-2 inline-flex min-h-11 items-center rounded-lg font-semibold focus-visible:ring-2 focus-visible:outline-none"
      >
        {t('empty.add_cta')}
      </Link>
      <PaidForChecklist groupId={groupId ?? null} />
    </div>
  );

  const usageSection = overview ? (
    <SectionCard
      title={t('sections.usage_this_month')}
      isEmpty={0 === overview.usage.length}
      empty={t('empty.usage')}
    >
      {overview.usage.map((item) => (
        <UsageRow key={item.key} item={item} lastMonthLabel={lastMonthLabel} />
      ))}
    </SectionCard>
  ) : null;

  const renderPanel = () => {
    if (!overview) {
      return null;
    }
    if ('usage' === filter) {
      return usageSection;
    }
    if ('by_cycle' === filter) {
      const byCycle = CYCLE_ORDER.map((cadence) => ({
        cadence,
        items: overview.items.filter((item) => cadence === item.cadence),
      })).filter(({ items }) => 0 < items.length);

      if (0 === byCycle.length) {
        return (
          <SectionCard
            title={t('cycle.monthly')}
            isEmpty
            empty={
              <>
                <p>{t('empty.subscriptions')}</p>
                {addCta}
              </>
            }
          >
            {null}
          </SectionCard>
        );
      }
      return byCycle.map(({ cadence, items }) => (
        <SectionCard key={cadence} title={t(`cycle.${cadence}`)} isEmpty={false} empty={null}>
          {items.map((item) => renderSubscription(item, true))}
        </SectionCard>
      ));
    }
    return (
      <>
        <SectionCard
          title={t('sections.next_7_days')}
          isEmpty={0 === upcoming.length}
          empty={
            0 === overview.items.length ? (
              <>
                <p>{t('empty.subscriptions')}</p>
                {addCta}
              </>
            ) : (
              t('empty.upcoming')
            )
          }
        >
          {upcoming.map((item) => renderSubscription(item))}
        </SectionCard>
        {usageSection}
      </>
    );
  };

  return (
    <>
      <Head>
        <title>{t('title')}</title>
      </Head>
      <MainLayout>
        <div className="mx-auto flex max-w-lg flex-col gap-4 pb-6">
          <header className="flex items-center justify-between pt-4">
            <button
              type="button"
              onClick={handleBack}
              aria-label={t('back')}
              className="border-border bg-surface text-foreground focus-visible:ring-focus flex size-11 items-center justify-center rounded-full border focus-visible:ring-2 focus-visible:outline-none"
            >
              <ChevronLeftIcon className="size-5 rtl:rotate-180" aria-hidden />
            </button>
            <h1 className="text-foreground text-base font-semibold">{t('title')}</h1>
            <Link
              href={addHref}
              aria-label={t('add')}
              className="bg-accent text-accent-foreground focus-visible:ring-focus focus-visible:ring-offset-background flex size-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <PlusIcon className="size-5" strokeWidth={2.5} aria-hidden />
            </Link>
          </header>

          <Link
            href="/scan-statement"
            className="border-border bg-surface text-foreground focus-visible:ring-focus inline-flex min-h-11 items-center gap-2 self-start rounded-full border px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            <ScanSearchIcon className="text-accent size-4" aria-hidden />
            {t('statementscan:entry.subscriptions')}
          </Link>

          {overviewQuery.isPending ? (
            <div className="mt-10 flex justify-center">
              <LoadingSpinner className="text-accent" />
            </div>
          ) : null}

          {overviewQuery.isError ? (
            <div
              role="alert"
              className="border-border bg-surface flex items-center justify-between gap-3 rounded-[20px] border p-4"
            >
              <span className="text-danger text-sm">{t('error')}</span>
              <button
                type="button"
                onClick={() => overviewQuery.refetch()}
                className="text-accent focus-visible:ring-focus min-h-11 rounded-lg px-2 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
              >
                {t('retry')}
              </button>
            </div>
          ) : null}

          {overview ? (
            <>
              <RunRateCard overview={overview} />
              <SavingsBanner overview={overview} />
              <MonthCashTiles overview={overview} now={now} />
              <ServiceCostCard overview={overview} />
              <FilterChips value={filter} onChange={setFilter} />
              <div
                role="tabpanel"
                id={SUBSCRIPTIONS_PANEL_ID}
                aria-labelledby={`subscriptions-tab-${filter}`}
                className="flex flex-col gap-5"
              >
                {renderPanel()}
              </div>
              <ConnectBillingCard groupId={groupId ?? null} />
            </>
          ) : null}
        </div>
      </MainLayout>
    </>
  );
};

SubscriptionsPage.auth = true;

export const getStaticProps = withI18nStaticProps([
  'common',
  'subscriptions',
  'billing',
  'categories',
  'currencies',
  'insights',
  'reminders',
  'statementscan',
  'unused',
]);

export default SubscriptionsPage;
