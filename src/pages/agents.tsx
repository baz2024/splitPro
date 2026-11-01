import { Alert, Button } from '@heroui/react';
import { ChevronLeftIcon, Plus } from 'lucide-react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';

import {
  API_KEYS_SECTION_ID,
  API_KEY_NAME_INPUT_ID,
  ApiKeysSection,
} from '~/components/Agent/ApiKeysSection';
import { DetectedSubscriptionsCard } from '~/components/Agent/DetectedSubscriptionsCard';
import { InstallSkillSection } from '~/components/Agent/InstallSkillSection';
import { UsageConnected } from '~/components/Agent/UsageConnected';
import { UsageSpentBy } from '~/components/Agent/UsageSpentBy';
import { UsageSummaryCard, capPercent } from '~/components/Agent/UsageSummaryCard';
import MainLayout from '~/components/Layout/MainLayout';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type NextPageWithUser } from '~/types';
import { api } from '~/utils/api';
import { withI18nStaticProps } from '~/utils/i18n/server';

const NEAR_CAP_PERCENT = 80;
const FALLBACK_CURRENCY = 'USD';

const parseGroupId = (value: string | string[] | undefined): number | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) {
    return undefined;
  }
  const id = Number(raw);
  return 0 < id && Number.isSafeInteger(id) ? id : undefined;
};

const openCreateKeyForm = () => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document
    .getElementById(API_KEYS_SECTION_ID)
    ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  document.getElementById(API_KEY_NAME_INPUT_ID)?.focus({ preventScroll: true });
};

const UsageOverview: React.FC<{ groupId?: number }> = ({ groupId }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(['agentsusage']);
  const usageQuery = api.agent.usage.useQuery(groupId ? { groupId } : undefined);

  if (usageQuery.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="bg-surface border-border h-[106px] animate-pulse rounded-[20px] border" />
        <p className="text-muted px-1 text-sm">{t('loading')}</p>
      </div>
    );
  }

  if (usageQuery.isError) {
    return <p className="text-danger px-1 text-sm">{t('error')}</p>;
  }

  const usage = usageQuery.data;
  const currency = usage.currency ?? FALLBACK_CURRENCY;
  const { toUIString } = getCurrencyHelpersCached(currency);
  const percent = null === usage.cap ? 0 : capPercent(usage.total, usage.cap);
  const overCap = null !== usage.cap && usage.total > usage.cap;
  const nearCap = !overCap && NEAR_CAP_PERCENT <= percent;

  return (
    <div className="flex flex-col gap-5">
      <UsageSummaryCard
        total={usage.total}
        cap={usage.cap}
        currency={currency}
        project={usage.project}
      />

      {0 < usage.otherCurrencies.length && (
        <p className="text-muted -mt-3 px-1 text-xs">
          {t('summary.excluded_currencies', { currencies: usage.otherCurrencies.join(', ') })}
        </p>
      )}

      <UsageSpentBy rows={usage.rows} currency={currency} />

      {null !== usage.cap && (overCap || nearCap) && (
        <Alert status="warning" className="rounded-2xl">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {overCap
                ? t('warning.over_cap', {
                    over: toUIString(usage.total - usage.cap),
                    cap: toUIString(usage.cap),
                  })
                : t('warning.near_cap', { percent, cap: toUIString(usage.cap) })}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <UsageConnected hasBudget={null !== usage.cap} projectId={usage.project?.id ?? null} />
    </div>
  );
};

const AgentsPage: NextPageWithUser = () => {
  const { t } = useTranslationWithUtils(['agentsusage']);
  const router = useRouter();
  const groupId = parseGroupId(router.query.groupId);

  return (
    <>
      <Head>
        <title>{t('title')}</title>
      </Head>
      <MainLayout>
        <div className="flex flex-col gap-5 pt-5">
          <header className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
            <Link
              href="/account"
              aria-label={t('back')}
              className="bg-surface border-border focus-visible:ring-focus flex size-11 items-center justify-center rounded-full border focus-visible:ring-2 focus-visible:outline-none"
            >
              <ChevronLeftIcon className="size-5 rtl:rotate-180" aria-hidden />
            </Link>
            <h1 className="text-center text-base font-semibold">{t('title')}</h1>
            <span aria-hidden="true" />
          </header>

          <UsageOverview groupId={groupId} />

          <DetectedSubscriptionsCard />
          <ApiKeysSection />
          <InstallSkillSection />

          <div className="sticky bottom-[7.5rem] z-10 lg:bottom-4">
            <Button
              fullWidth
              size="lg"
              className="h-13 rounded-full text-[15px] font-semibold shadow-lg"
              onPress={openCreateKeyForm}
            >
              <Plus className="size-[18px]" strokeWidth={2.5} aria-hidden />
              {t('add_agent')}
            </Button>
          </div>
        </div>
      </MainLayout>
    </>
  );
};

AgentsPage.auth = true;

export default AgentsPage;

export const getStaticProps = withI18nStaticProps([
  'common',
  'agentsusage',
  'categories',
  'currencies',
]);
