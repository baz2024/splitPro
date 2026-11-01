import { Card, buttonVariants } from '@heroui/react';
import {
  ArrowRight,
  Bot,
  Camera,
  type LucideIcon,
  PiggyBank,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react';
import { type GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import { LanguageSelector } from '~/components/LanguageSelector';
import { customServerSideTranslations } from '~/utils/i18n/server';

const FEATURES = [
  { icon: PiggyBank, key: 'budgets' },
  { icon: Camera, key: 'receipts' },
  { icon: Bot, key: 'agents' },
  { icon: RefreshCw, key: 'subscriptions' },
  { icon: Users, key: 'split' },
] as const satisfies readonly { icon: LucideIcon; key: string }[];

const Home = () => {
  const { t } = useTranslation('home');

  return (
    <>
      <Head>
        <title>{t('kafo.meta_title')}</title>
        <meta name="description" content={t('kafo.meta_description')} />
      </Head>
      <main className="min-h-dvh">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 lg:py-5">
          <p className="flex items-center gap-2 text-xl font-semibold">
            <Sparkles className="text-accent size-5" aria-hidden />
            {t('kafo.brand')}
          </p>
          <div className="flex items-center gap-4 text-sm">
            <LanguageSelector />
            <Link href="/auth/signin" className="text-accent font-medium">
              {t('kafo.sign_in')}
            </Link>
          </div>
        </nav>

        <section className="mx-auto mt-12 flex max-w-5xl flex-col items-center gap-6 px-4 text-center lg:mt-24 lg:items-start lg:text-start">
          <h1 className="text-foreground max-w-3xl text-3xl leading-tight font-semibold lg:text-5xl lg:leading-tight">
            {t('kafo.title_before_highlight')}{' '}
            <span className="text-accent">{t('kafo.title_highlight')}</span>
          </h1>
          <p className="text-muted max-w-2xl text-base lg:text-lg">{t('kafo.subtitle')}</p>
          <Link
            href="/auth/signin"
            className={`${buttonVariants({ size: 'lg' })} w-full max-w-xs gap-2 lg:w-auto`}
          >
            {t('kafo.get_started')}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
        </section>

        <section className="mx-auto mt-16 mb-16 grid max-w-5xl grid-cols-1 gap-4 px-4 sm:grid-cols-2 lg:mt-24 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, key }) => (
            <Card key={key} variant="secondary">
              <Card.Header>
                <Icon className="text-accent mb-2 size-6" aria-hidden />
                <Card.Title>{t(`kafo.features.${key}_title`)}</Card.Title>
                <Card.Description>{t(`kafo.features.${key}_description`)}</Card.Description>
              </Card.Header>
            </Card>
          ))}
        </section>

        <footer className="text-muted mx-auto flex max-w-5xl flex-wrap justify-center gap-6 px-4 pb-10 text-sm lg:justify-start">
          <Link href="/terms">{t('nav.terms')}</Link>
          <Link href="/privacy">{t('nav.privacy')}</Link>
          {/* SplitPro is AGPL-licensed, so keep a link to the source code. */}
          <a href="https://github.com/oss-apps/split-pro" target="_blank" rel="noreferrer">
            {t('kafo.source_link')}
          </a>
        </footer>
      </main>
    </>
  );
};

export default Home;

export const getServerSideProps: GetServerSideProps = async (context) => ({
  props: await customServerSideTranslations(context.locale, ['home']),
});
