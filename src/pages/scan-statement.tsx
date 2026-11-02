import { ChevronLeftIcon } from 'lucide-react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import React from 'react';

import MainLayout from '~/components/Layout/MainLayout';
import { StatementScanFlow } from '~/components/StatementScan/StatementScanFlow';
import { STATEMENT_SCAN_NAMESPACES } from '~/components/StatementScan/types';
import { type NextPageWithUser } from '~/types';
import { api } from '~/utils/api';
import { withI18nStaticProps } from '~/utils/i18n/server';

const ScanStatementPage: NextPageWithUser = () => {
  const { t } = useTranslation(STATEMENT_SCAN_NAMESPACES);
  const router = useRouter();
  const meQuery = api.user.me.useQuery();

  const handleBack = () => {
    if (1 < window.history.length) {
      router.back();
      return;
    }
    router.push('/subscriptions').catch(console.error);
  };

  return (
    <>
      <Head>
        <title>{t('title')}</title>
      </Head>
      <MainLayout>
        <div className="mx-auto flex max-w-lg flex-col gap-5 pb-8">
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
            <span className="size-11" aria-hidden />
          </header>

          <StatementScanFlow fallbackCurrency={meQuery.data?.defaultCurrency ?? 'USD'} />
        </div>
      </MainLayout>
    </>
  );
};

ScanStatementPage.auth = true;

export const getStaticProps = withI18nStaticProps([...STATEMENT_SCAN_NAMESPACES, 'categories']);

export default ScanStatementPage;
