import { Alert, Tabs } from '@heroui/react';
import { ChevronLeftIcon, Clock, Plus } from 'lucide-react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';

import { AgentCapBanner } from '~/components/Agent/AgentCapBanner';
import { AgentSpendHeader } from '~/components/Agent/AgentSpendHeader';
import { AgentCreateSheet } from '~/components/Agent/AgentCreateSheet';
import { ApiKeysSection } from '~/components/Agent/ApiKeysSection';
import { DetectedSubscriptionsCard } from '~/components/Agent/DetectedSubscriptionsCard';
import { InstallSkillSection } from '~/components/Agent/InstallSkillSection';
import { UsageConnected } from '~/components/Agent/UsageConnected';
import { UsageProviders } from '~/components/Agent/UsageProviders';
import { UsageSummaryCard, capPercent } from '~/components/Agent/UsageSummaryCard';
import MainLayout from '~/components/Layout/MainLayout';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { CAP_WARN_PERCENT } from '~/lib/agentControls';
import { type NextPageWithUser } from '~/types';
import { type RouterOutputs, api } from '~/utils/api';
import { withI18nStaticProps } from '~/utils/i18n/server';

const FALLBACK_CURRENCY = 'USD';
const TABS = ['agents', 'providers'] as const;
type AgentsTab = (typeof TABS)[number];

type Usage = RouterOutputs['agent']['usage'];

const parseGroupId = (value: string | string[] | undefined): number | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) {
    return undefined;
  }
  const id = Number(raw);
  return 0 < id && Number.isSafeInteger(id) ? id : undefined;
};

const parseTab = (value: string | string[] | undefined): AgentsTab =>
  'providers' === (Array.isArray(value) ? value[0] : value) ? 'providers' : 'agents';

const isAgentsTab = (value: unknown): value is AgentsTab => TABS.some((tab) => tab === value);

const UsageLoading: React.FC = () => {
  const { t } = useTranslationWithUtils(['agentsusage']);
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="bg-surface border-border h-[106px] animate-pulse rounded-[20px] border" />
      <p className="text-muted px-1 text-sm">{t('loading')}</p>
    </div>
  );
};

/** Agents tab: agent spend vs combined caps, freshness note, then one control card per agent. */
const AgentsPanel: React.FC<{ usage: Usage | undefined; isPending: boolean }> = ({
  usage,
  isPending,
}) => {
  const { t } = useTranslationWithUtils(['agentcaps']);
  const agents = usage?.agents ?? [];

  return (
    <div className="flex flex-col gap-5">
      {isPending ? <UsageLoading /> : <AgentSpendHeader agents={agents} />}
      <p className="text-muted -mt-2 flex items-center gap-1.5 px-1 text-xs">
        <Clock className="size-3.5 shrink-0" aria-hidden />
        {t('freshness')}
      </p>
      <AgentCapBanner agents={agents} />
      <ApiKeysSection agents={agents} />
      <DetectedSubscriptionsCard />
      <InstallSkillSection />
    </div>
  );
};

/** Providers tab: all AI & dev spend by provider against the project budget it counts toward. */
const ProvidersPanel: React.FC<{ usage: Usage }> = ({ usage }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(['agentsusage']);
  const currency = usage.currency ?? FALLBACK_CURRENCY;
  const { toUIString } = getCurrencyHelpersCached(currency);
  const percent = null === usage.cap ? 0 : capPercent(usage.total, usage.cap);
  const overCap = null !== usage.cap && usage.total > usage.cap;
  const nearCap = !overCap && CAP_WARN_PERCENT <= percent;

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

      <UsageProviders rows={usage.providers} currency={currency} />

      <UsageConnected hasBudget={null !== usage.cap} projectId={usage.project?.id ?? null} />
    </div>
  );
};

const AgentsPage: NextPageWithUser = () => {
  const { t } = useTranslationWithUtils(['agentsusage', 'agentcaps']);
  const router = useRouter();
  const groupId = parseGroupId(router.query.groupId);
  const tab = parseTab(router.query.tab);
  const usageQuery = api.agent.usage.useQuery(groupId ? { groupId } : undefined);

  const onTabChange = (key: React.Key) => {
    if (!isAgentsTab(key) || key === tab) {
      return;
    }
    const { tab: _tab, ...rest } = router.query;
    router
      .replace(
        { pathname: router.pathname, query: 'agents' === key ? rest : { ...rest, tab: key } },
        undefined,
        { shallow: true },
      )
      .catch(console.error);
  };

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

          {usageQuery.isError && <p className="text-danger px-1 text-sm">{t('error')}</p>}

          <Tabs selectedKey={tab} onSelectionChange={onTabChange}>
            <Tabs.ListContainer>
              <Tabs.List aria-label={t('tabs.label', { ns: 'agentcaps' })} className="w-full">
                {TABS.map((id) => (
                  <Tabs.Tab key={id} id={id} className="min-h-11 flex-1">
                    {t(`tabs.${id}`, { ns: 'agentcaps' })}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
            <Tabs.Panel id="agents" className="px-0 pt-4">
              {'agents' === tab ? (
                <AgentsPanel usage={usageQuery.data} isPending={usageQuery.isPending} />
              ) : null}
            </Tabs.Panel>
            <Tabs.Panel id="providers" className="px-0 pt-4">
              {'providers' === tab ? (
                usageQuery.data ? (
                  <ProvidersPanel usage={usageQuery.data} />
                ) : usageQuery.isPending ? (
                  <UsageLoading />
                ) : null
              ) : null}
            </Tabs.Panel>
          </Tabs>

          {/*
            Pinned just above the tab bar on a solid strip, so cards scroll under it instead of
            showing through. The bottom padding clears the raised Add button.
          */}
          {'agents' === tab && (
            <div className="bg-background/95 sticky bottom-[calc(3.25rem+max(env(safe-area-inset-bottom),0.75rem))] z-10 -mx-4 px-4 pt-3 pb-7 backdrop-blur lg:bottom-0 lg:pb-4">
              <AgentCreateSheet
                trigger={
                  <button
                    type="button"
                    className="bg-accent text-accent-foreground focus-visible:ring-focus focus-visible:ring-offset-background flex h-13 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold shadow-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98]"
                  >
                    <Plus className="size-[18px]" strokeWidth={2.5} aria-hidden />
                    {t('add_agent')}
                  </button>
                }
              />
            </div>
          )}
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
  'agentcaps',
  'billing',
  'categories',
  'currencies',
]);
