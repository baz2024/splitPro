import { ChevronLeftIcon } from 'lucide-react';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { ApiKeysSection } from '~/components/Agent/ApiKeysSection';
import { DetectedSubscriptionsCard } from '~/components/Agent/DetectedSubscriptionsCard';
import { InstallSkillSection } from '~/components/Agent/InstallSkillSection';
import MainLayout from '~/components/Layout/MainLayout';
import { Button } from '~/components/ui/button';
import { type NextPageWithUser } from '~/types';
import { withI18nStaticProps } from '~/utils/i18n/server';

const AgentsPage: NextPageWithUser = () => {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t('agents.title')}</title>
      </Head>
      <MainLayout
        title={
          <div className="flex items-center gap-2">
            <Link href="/account" aria-label={t('agents.back')}>
              <Button variant="ghost" className="p-0">
                <ChevronLeftIcon className="me-1 h-6 w-6 rtl:rotate-180" aria-hidden />
              </Button>
            </Link>
            <p className="text-[16px] font-normal">{t('agents.title')}</p>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pb-8">
          <p className="text-muted text-sm">{t('agents.intro')}</p>
          <DetectedSubscriptionsCard />
          <ApiKeysSection />
          <InstallSkillSection />
        </div>
      </MainLayout>
    </>
  );
};

AgentsPage.auth = true;

export default AgentsPage;

export const getStaticProps = withI18nStaticProps(['common', 'categories', 'currencies']);
