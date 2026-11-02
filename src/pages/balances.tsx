import { ArrowUpOnSquareIcon } from '@heroicons/react/24/outline';
import { Download, Scale } from 'lucide-react';
import Head from 'next/head';
import { useCallback, useEffect } from 'react';
import { DownloadAppDrawer } from '~/components/Account/DownloadAppDrawer';
import { EmptyState } from '~/components/EmptyState';
import { MonthlySpendCard } from '~/components/Insights/MonthlySpendCard';
import { BalanceHeadline } from '~/components/Safi/BalanceHeadline';
import { DetectedSubscriptionsSummary } from '~/components/Safi/DetectedSubscriptionsSummary';
import { HomeBalanceRow } from '~/components/Safi/HomeBalanceRow';
import { AddExpenseShortcuts } from '~/components/AddExpense/journey/AddExpenseShortcuts';
import MainLayout from '~/components/Layout/MainLayout';
import { NotificationModal } from '~/components/NotificationModal';
import { Button } from '~/components/ui/button';
import { useIsPwa } from '~/hooks/useIsPwa';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type NextPageWithUser } from '~/types';
import { api } from '~/utils/api';
import { withI18nStaticProps } from '~/utils/i18n/server';
import { isCurrencyCode } from '~/lib/currency';
import { useCurrencyPreferenceStore } from '~/store/currencyPreferenceStore';

const BalancePage: NextPageWithUser = ({ user }) => {
  const { t } = useTranslationWithUtils();
  const isPwa = useIsPwa();
  const balanceQuery = api.expense.getBalances.useQuery();
  const cumulatedQuery = api.expense.getCumulatedBalances.useQuery();

  const setUserDefaultCurrency = useCurrencyPreferenceStore((s) => s.setUserDefaultCurrency);

  useEffect(() => {
    if (isCurrencyCode(user.defaultCurrency)) {
      setUserDefaultCurrency(user.defaultCurrency);
    }
  }, [user, setUserDefaultCurrency]);

  const shareWithFriends = useCallback(() => {
    if (navigator.share) {
      navigator
        .share({
          title: t('meta.application_name'),
          text: t('ui.share_text'),
          url: window.location.origin,
        })
        .then(() => console.info('Successful share'))
        .catch((error) => console.error('Error sharing', error));
    }
  }, [t]);

  return (
    <>
      <Head>
        <title>{t('meta.title')}</title>
      </Head>
      <MainLayout
        title={t('navigation.balances')}
        actions={
          'undefined' !== typeof window && 'share' in window.navigator ? (
            <Button variant="ghost" onClick={shareWithFriends}>
              <ArrowUpOnSquareIcon className="h-6 w-6" />
            </Button>
          ) : null
        }
        loading={cumulatedQuery.isPending}
      >
        <NotificationModal />
        {/* New users get the empty state below instead of "You're all settled up". */}
        {balanceQuery.data?.balances.length ? (
          <BalanceHeadline
            className="mt-1"
            youGet={cumulatedQuery.data?.youGet}
            youOwe={cumulatedQuery.data?.youOwe}
            balances={balanceQuery.data.balances}
          />
        ) : null}

        <MonthlySpendCard className="mt-6" />

        <DetectedSubscriptionsSummary className="mt-4" />

        <div id="balances-list" className="mt-6 flex scroll-mt-4 flex-col gap-6 pb-36">
          {balanceQuery.data?.balances.map((balance) => (
            <HomeBalanceRow
              key={balance.friend.id}
              id={balance.friend.id}
              entity={balance.friend}
              balances={balance.currencies}
            />
          ))}

          {!balanceQuery.isPending && !balanceQuery.data?.balances.length ? (
            <EmptyState
              icon={Scale}
              title={t('empty_states.balances.title')}
              description={t('empty_states.balances.description')}
            >
              <AddExpenseShortcuts className="w-62.5 flex-col" />
              {!isPwa && (
                <DownloadAppDrawer>
                  <Button variant="outline" className="w-62.5">
                    <Download className="me-2 h-5 w-5" />
                    {t('account.download_app')}
                  </Button>
                </DownloadAppDrawer>
              )}
            </EmptyState>
          ) : null}
        </div>
      </MainLayout>
    </>
  );
};

BalancePage.auth = true;

export const getStaticProps = withI18nStaticProps(['common', 'categories', 'insights']);

export default BalancePage;
