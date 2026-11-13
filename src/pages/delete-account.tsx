import type { GetServerSideProps, NextPage } from 'next';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import Head from 'next/head';
import Link from 'next/link';

import { DeleteAccount } from '~/components/Account/DeleteAccount';
import { Button } from '~/components/ui/button';
import { customServerSideTranslations } from '~/utils/i18n/server';

/**
 * Public account-deletion page. Google Play asks for a web URL where people can delete their
 * account without reinstalling the app; App Store reviewers can also open it.
 */
const DeleteAccountPage: NextPage = () => {
  const { t } = useTranslation();
  const { status } = useSession();

  return (
    <>
      <Head>
        <title>{t('delete_account_page.title')}</title>
      </Head>
      <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-12">
        <Link href="/" className="text-2xl font-medium">
          Safi
        </Link>
        <h1 className="text-2xl font-semibold">{t('delete_account_page.title')}</h1>
        <p className="text-muted text-lg">{t('delete_account_page.intro')}</p>
        <p className="text-lg">{t('delete_account_page.in_app')}</p>

        <div className="flex justify-start">
          {'authenticated' === status ? (
            <DeleteAccount />
          ) : (
            <Button asChild className="min-h-11">
              <Link href="/auth/signin?callbackUrl=/delete-account">
                {t('delete_account_page.sign_in_cta')}
              </Link>
            </Button>
          )}
        </div>

        <p className="text-muted">{t('delete_account_page.what_deleted')}</p>
        <p className="text-muted">{t('delete_account_page.what_kept')}</p>
        <p className="text-muted text-sm">{t('delete_account_page.help')}</p>
        <p className="text-muted flex gap-4 text-sm">
          <Link href="/privacy" className="inline-flex min-h-11 items-center underline">
            {t('auth.welcome.privacy')}
          </Link>
          <Link href="/terms" className="inline-flex min-h-11 items-center underline">
            {t('auth.welcome.terms')}
          </Link>
        </p>
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => ({
  props: {
    ...(await customServerSideTranslations(context.locale, ['common'])),
  },
});

export default DeleteAccountPage;
