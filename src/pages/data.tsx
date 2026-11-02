import { ChevronLeftIcon, ChevronRightIcon, ScanSearchIcon } from 'lucide-react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { ExportCard } from '~/components/DataIO/ExportCard';
import { ImportFlow } from '~/components/DataIO/ImportFlow';
import { DATAIO_NAMESPACES } from '~/components/DataIO/ui';
import MainLayout from '~/components/Layout/MainLayout';
import { type NextPageWithUser } from '~/types';
import { api } from '~/utils/api';
import { withI18nStaticProps } from '~/utils/i18n/server';

const DataPage: NextPageWithUser = () => {
  const { t } = useTranslation(DATAIO_NAMESPACES);
  const router = useRouter();
  const meQuery = api.user.me.useQuery();

  const handleBack = () => {
    if (1 < window.history.length) {
      router.back();
      return;
    }
    router.push('/account').catch(console.error);
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

          <p className="text-muted px-1 text-sm">{t('intro')}</p>

          <Link
            href="/scan-statement"
            className="border-border bg-surface focus-visible:ring-focus flex min-h-16 items-center gap-3 rounded-[20px] border p-4 focus-visible:ring-2 focus-visible:outline-none"
          >
            <ScanSearchIcon className="text-accent size-5 shrink-0" aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-foreground text-sm font-semibold">
                {t('statementscan:entry.data_title')}
              </span>
              <span className="text-muted text-xs">{t('statementscan:entry.data_body')}</span>
            </span>
            <ChevronRightIcon className="text-muted size-4 shrink-0 rtl:rotate-180" aria-hidden />
          </Link>

          <ExportCard />
          <ImportFlow fallbackCurrency={meQuery.data?.defaultCurrency ?? 'USD'} />
        </div>
      </MainLayout>
    </>
  );
};

DataPage.auth = true;

export const getStaticProps = withI18nStaticProps([...DATAIO_NAMESPACES, 'statementscan']);

export default DataPage;
