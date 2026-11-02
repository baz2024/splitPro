import { Button } from '@heroui/react';
import { type GetServerSideProps, type NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useEffect, useRef, useState } from 'react';

import { LoadingSpinner } from '~/components/ui/spinner';
import { customServerSideTranslations } from '~/utils/i18n/server';
import { exchangeSupabaseToken, getSupabaseClient, safeRelativePath } from '~/utils/supabaseClient';

/**
 * Landing page for Supabase OAuth (Apple on web). Finishes the PKCE exchange in the browser,
 * then trades the Supabase access token for a NextAuth session cookie.
 */
const SupabaseCallback: NextPage = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!router.isReady || started.current) {
      return;
    }
    started.current = true;

    const { code, next, error } = router.query;
    const nextPath = safeRelativePath(next);

    void (async () => {
      try {
        if ('string' === typeof error) {
          throw new Error(error);
        }
        const supabase = getSupabaseClient();
        if ('string' === typeof code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        }
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          throw new Error('No Supabase session');
        }
        await exchangeSupabaseToken(data.session.access_token, nextPath);
        await router.replace(nextPath);
      } catch (callbackError) {
        console.error('Supabase callback failed:', callbackError);
        setFailed(true);
      }
    })();
  }, [router]);

  return (
    <>
      <Head>
        <title>{t('auth.welcome.page_title')}</title>
      </Head>
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
        {failed ? (
          <>
            <p className="text-foreground text-lg font-semibold">{t('auth.supabase_error')}</p>
            <Button
              size="lg"
              fullWidth
              onPress={() => void router.replace('/auth/signin').catch(console.error)}
            >
              {t('auth.callback.back_to_signin')}
            </Button>
          </>
        ) : (
          <>
            <LoadingSpinner className="h-8 w-8" />
            <p className="text-muted text-sm">{t('auth.callback.signing_in')}</p>
          </>
        )}
      </main>
    </>
  );
};

export default SupabaseCallback;

export const getServerSideProps: GetServerSideProps = async (context) => ({
  props: await customServerSideTranslations(context.locale, ['common']),
});
