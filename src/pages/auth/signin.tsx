import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Separator } from '@heroui/react';
import {
  SiApple,
  SiAuth0,
  SiAuthelia,
  SiAuthentik,
  SiGithub,
  SiGitlab,
  SiGoogle,
  SiKeycloak,
} from '@icons-pack/react-simple-icons';
import { Phone } from 'lucide-react';
import { type GetServerSideProps, type NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { type ClientSafeProvider, getProviders, signIn } from 'next-auth/react';
import { type TFunction, useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { PhoneSignIn } from '~/components/Auth/PhoneSignIn';
import { LanguageSelector } from '~/components/LanguageSelector';
import { LoadingSpinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';
import { env } from '~/env';
import { getServerAuthSession } from '~/server/auth';
import { customServerSideTranslations } from '~/utils/i18n/server';
import { getSupabaseClient, safeRelativePath } from '~/utils/supabaseClient';

import VerificationStep from './VerificationStep';

const providerSvgs = {
  github: <SiGithub className="size-4" aria-hidden />,
  google: <SiGoogle className="size-4" aria-hidden />,
  authentik: <SiAuthentik className="size-4" aria-hidden />,
  authelia: <SiAuthelia className="size-4" aria-hidden />,
  auth0: <SiAuth0 className="size-4" aria-hidden />,
  keycloak: <SiKeycloak className="size-4" aria-hidden />,
  gitlab: <SiGitlab className="size-4" aria-hidden />,
};

const providerTypeGuard = (providerId: string): providerId is keyof typeof providerSvgs =>
  providerId in providerSvgs;

const emailSchema = (t: TFunction) =>
  z.object({
    email: z
      .string({ required_error: t('errors.email_required') })
      .email({ message: t('errors.email_invalid') }),
  });

type EmailFormValues = z.infer<ReturnType<typeof emailSchema>>;

/**
 * NextAuth passes callbackUrl as an absolute URL. Supabase flows only accept relative paths,
 * so keep same-origin callbacks as a path and fall back to /balances for anything else.
 */
const resolveNextPath = (callbackUrl?: string) => {
  if (!callbackUrl) {
    return '/balances';
  }
  try {
    const url = new URL(callbackUrl, window.location.origin);
    if (url.origin !== window.location.origin) {
      return '/balances';
    }
    return safeRelativePath(`${url.pathname}${url.search}${url.hash}`);
  } catch {
    return '/balances';
  }
};

const Home: NextPage<{
  error: string;
  feedbackEmail: string;
  providers: ClientSafeProvider[];
  callbackUrl?: string;
  oauthAutoRedirect: boolean;
}> = ({ error, providers: serverProviders, feedbackEmail, callbackUrl, oauthAutoRedirect }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'success'>('idle');
  const [showVerificationStep, setShowVerificationStep] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [providers, setProviders] = useState<ClientSafeProvider[]>(serverProviders);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema(t)),
    defaultValues: {
      email: '',
    },
  });

  // Client-side fallback for getProviders when server-side call fails
  useEffect(() => {
    if (serverProviders.length > 0) {
      return;
    }

    void (async () => {
      setIsLoadingProviders(true);
      try {
        const clientProviders = await getProviders();
        if (clientProviders && Object.keys(clientProviders).length > 0) {
          setProviders(Object.values(clientProviders));
        } else {
          throw new Error('No providers returned from getProviders()');
        }
      } catch (providerError) {
        console.error('Error fetching providers client-side:', providerError);
        toast.error(t('errors.no_providers'), { duration: 8000 });
      } finally {
        setIsLoadingProviders(false);
      }
    })();
  }, [serverProviders.length, t]);

  useEffect(() => {
    // SessionRequired indicates an unauthenticated route redirect, not a failed sign-in.
    if (!error || 'SessionRequired' === error) {
      return;
    }
    if ('SignupDisabled' === error) {
      toast.error(t('errors.signup_disabled'), { duration: 5000 });
    } else if ('SupabaseSignin' === error) {
      toast.error(t('auth.supabase_error'), { duration: 5000 });
    } else {
      toast.error(t('errors.signin_error', { error }));
      console.error('Error during sign-in:', error);
    }
  }, [error, t]);

  useEffect(() => {
    const oauthProviders = providers.filter((provider) => 'oauth' === provider.type);
    const hasSignInError = Boolean(error && 'SessionRequired' !== error);
    const shouldAutoRedirect =
      oauthAutoRedirect && !hasSignInError && 1 === oauthProviders.length && 1 === providers.length;

    const oauthProvider = oauthProviders[0];
    if (shouldAutoRedirect && oauthProvider && !showVerificationStep && !isLoadingProviders) {
      void signIn(oauthProvider.id, { callbackUrl }).catch(() => {
        toast.error(t('errors.signin_failed'));
      });
    }
  }, [
    oauthAutoRedirect,
    error,
    showVerificationStep,
    providers,
    isLoadingProviders,
    callbackUrl,
    t,
  ]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (showVerificationStep) {
        e.preventDefault();
        setShowVerificationStep(false);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, [showVerificationStep]);

  const onEmailSubmit = async () => {
    setEmailStatus('sending');
    const email = emailForm.getValues().email.toLowerCase();
    setShowVerificationStep(true);
    await signIn('email', { email, callbackUrl, redirect: false });
    setEmailStatus('success');
  };

  const onAppleSignIn = async () => {
    setIsAppleLoading(true);
    const next = encodeURIComponent(resolveNextPath(callbackUrl));
    const { error: appleError } = await getSupabaseClient().auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/auth/supabase-callback?next=${next}` },
    });
    if (appleError) {
      console.error('Apple sign-in failed:', appleError.message);
      toast.error(t('auth.supabase_error'));
      setIsAppleLoading(false);
    }
  };

  if (showVerificationStep) {
    return (
      <VerificationStep
        feedbackEmail={feedbackEmail}
        email={emailForm.getValues().email}
        callbackUrl={callbackUrl}
      />
    );
  }

  const oauthProviders = providers.filter((provider) => 'email' !== provider.id);
  const googleProvider = oauthProviders.find((provider) => 'google' === provider.id);
  const otherOauthProviders = oauthProviders.filter((provider) => 'google' !== provider.id);
  const hasEmailProvider = providers.some((provider) => 'email' === provider.id);
  const emailError = emailForm.formState.errors.email?.message;

  return (
    <>
      <Head>
        <title>{t('audit_a.signin.page_title')}</title>
      </Head>
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-4 pt-6 pb-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* oxlint-disable-next-line next/no-img-element -- static brand mark, no optimisation needed. */}
            <img src="/logo.svg" alt="" aria-hidden className="size-9 rounded-xl" />
            <div className="flex flex-col leading-tight">
              <span className="text-foreground text-lg font-semibold">
                {t('meta.application_name')}
              </span>
              <span className="text-muted text-xs">{t('audit_a.signin.by_kafo')}</span>
            </div>
          </div>
          <LanguageSelector />
        </header>

        <section className="mt-12 mb-10 flex flex-col gap-3">
          <h1 className="text-foreground text-3xl leading-tight font-semibold">
            {t('auth.welcome.headline')}
          </h1>
          <p className="text-muted text-base">{t('auth.welcome.subtitle')}</p>
        </section>

        {isLoadingProviders ? (
          <div className="flex h-[200px] items-center justify-center">
            <LoadingSpinner className="h-8 w-8" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Apple and Google carry equal weight, side by side when both exist. */}
            <div className={cn('grid gap-3', googleProvider ? 'grid-cols-2' : 'grid-cols-1')}>
              <Button
                fullWidth
                size="lg"
                variant="secondary"
                aria-label={t('auth.welcome.continue_apple')}
                isDisabled={isAppleLoading}
                onPress={() => void onAppleSignIn()}
              >
                <SiApple className="size-4" aria-hidden />
                {googleProvider ? 'Apple' : t('auth.welcome.continue_apple')}
              </Button>
              {googleProvider ? (
                <Button
                  fullWidth
                  size="lg"
                  variant="secondary"
                  aria-label={t('auth.welcome.continue_google')}
                  onPress={() => void signIn(googleProvider.id, { callbackUrl })}
                >
                  {providerSvgs.google}
                  Google
                </Button>
              ) : null}
            </div>

            {otherOauthProviders.map((provider) => (
              <Button
                key={provider.id}
                fullWidth
                size="lg"
                variant="secondary"
                onPress={() => void signIn(provider.id, { callbackUrl })}
              >
                {providerTypeGuard(provider.id) && providerSvgs[provider.id]}
                {t('auth.continue_with', { provider: provider.name })}
              </Button>
            ))}

            {showPhone ? (
              <div className="bg-surface rounded-2xl p-4">
                <PhoneSignIn
                  getNext={() => resolveNextPath(callbackUrl)}
                  onSignedIn={(next) => void router.replace(next).catch(console.error)}
                />
              </div>
            ) : (
              <Button fullWidth size="lg" variant="secondary" onPress={() => setShowPhone(true)}>
                <Phone className="size-4" aria-hidden />
                {t('auth.welcome.continue_phone')}
              </Button>
            )}

            {hasEmailProvider && (
              <>
                <div className="my-3 flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-muted text-sm">{t('ui.or')}</span>
                  <Separator className="flex-1" />
                </div>
                <form
                  className="flex flex-col gap-3"
                  onSubmit={emailForm.handleSubmit(onEmailSubmit)}
                  noValidate
                >
                  <Input
                    type="email"
                    autoComplete="email"
                    aria-label={t('auth.email_placeholder')}
                    placeholder={t('auth.email_placeholder')}
                    className="min-h-12 w-full text-base"
                    variant="secondary"
                    aria-invalid={Boolean(emailError)}
                    {...emailForm.register('email')}
                  />
                  {emailError && <p className="text-danger text-sm">{emailError}</p>}
                  <Button
                    type="submit"
                    fullWidth
                    size="lg"
                    variant="tertiary"
                    isDisabled={'sending' === emailStatus}
                  >
                    {'sending' === emailStatus ? t('auth.sending') : t('auth.send_magic_link')}
                  </Button>
                </form>
              </>
            )}
          </div>
        )}

        <p className="text-muted mt-6 text-center text-sm">
          <span className="text-foreground font-medium">{t('audit_a.signin.invite_question')}</span>{' '}
          {t('audit_a.signin.invite_hint')}
        </p>

        <footer className="text-muted mt-auto flex flex-col items-center gap-3 pt-10 text-center text-xs">
          {feedbackEmail && (
            <p>
              {t('auth.trouble_logging_in')}{' '}
              {/* oxlint-disable-next-line next/no-html-link-for-pages */}
              <a className="underline" href={`mailto:${feedbackEmail}`}>
                {feedbackEmail}
              </a>
            </p>
          )}
          <p className="flex gap-4">
            <Link href="/terms" className="underline">
              {t('auth.welcome.terms')}
            </Link>
            <Link href="/privacy" className="underline">
              {t('auth.welcome.privacy')}
            </Link>
          </p>
        </footer>
      </main>
    </>
  );
};

export default Home;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerAuthSession(context);
  let providers: Record<string, ClientSafeProvider> | null = null;
  try {
    providers = await getProviders();
  } catch (error) {
    console.error(error);
  }
  const { callbackUrl, error } = context.query;

  if (session) {
    const redirectUrl = env.DEFAULT_HOMEPAGE == '/home' ? '/balances' : env.DEFAULT_HOMEPAGE;
    const destination = callbackUrl && !Array.isArray(callbackUrl) ? callbackUrl : redirectUrl;

    return {
      redirect: {
        destination: destination ?? '/balances',
        permanent: false,
      },
    };
  }

  return {
    props: {
      ...(await customServerSideTranslations(context.locale, ['common'])),
      error: typeof error === 'string' ? error : '',
      feedbackEmail: env.FEEDBACK_EMAIL ?? '',
      providers: Object.values(providers ?? {}),
      callbackUrl: callbackUrl && !Array.isArray(callbackUrl) ? callbackUrl : '',
      oauthAutoRedirect: env.OAUTH_AUTO_REDIRECT,
    },
  };
};
