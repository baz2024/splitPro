import {
  BadgeInfo,
  Bot,
  CreditCard,
  Download,
  DownloadCloud,
  FileDown,
  FileSpreadsheet,
  Languages,
} from 'lucide-react';
import type { GetServerSideProps } from 'next';
import { signOut } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AccountButton } from '~/components/Account/AccountButton';
import { DownloadAppDrawer } from '~/components/Account/DownloadAppDrawer';
import { LanguagePicker } from '~/components/Account/LanguagePicker';
import { ThemePicker } from '~/components/Account/ThemePicker';
import { SubmitFeedback } from '~/components/Account/SubmitFeedback';
import { SubscribeNotification } from '~/components/Account/SubscribeNotification';
import { UpdateName } from '~/components/Account/UpdateDetails';
import MainLayout from '~/components/Layout/MainLayout';
import { EntityAvatar } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import { env } from '~/env';
import { customServerSideTranslations } from '~/utils/i18n/server';
import { BankConnection } from '~/components/Account/BankAccount/BankConnection';
import { bigIntReplacer } from '~/utils/numbers';
import {
  isBankConnectionConfigured,
  whichBankConnectionConfigured,
} from '~/server/bankTransactionHelper';
import { api } from '~/utils/api';
import type { NextPageWithUser } from '~/types';
import { DebugInfo } from '~/components/Account/DebugInfo';
import { useAppStore } from '~/store/appStore';

const AccountPage: NextPageWithUser<{
  feedBackPossible: boolean;
  bankConnectionEnabled: boolean;
  bankConnection: string;
  maxUploadFileSizeMB: number;
}> = ({ feedBackPossible, bankConnectionEnabled, bankConnection, maxUploadFileSizeMB }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const userQuery = api.user.me.useQuery();
  const downloadQuery = api.user.downloadData.useMutation();
  const updateDetailsMutation = api.user.updateUserDetail.useMutation();

  // TODO: Set this globally from env var with app router later
  const { setMaxUploadFileSizeMB } = useAppStore((s) => s.actions);
  setMaxUploadFileSizeMB(maxUploadFileSizeMB);

  const [downloading, setDownloading] = useState(false);

  const downloadData = useCallback(async () => {
    setDownloading(true);
    const data = await downloadQuery.mutateAsync();
    const blob = new Blob([JSON.stringify(data, bigIntReplacer, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'splitpro_data.json';
    link.click();
    URL.revokeObjectURL(url);
    setDownloading(false);
  }, [downloadQuery]);

  const utils = api.useUtils();

  const onNameUpdate = useCallback(
    async (values: { name: string; image?: string | null; defaultCurrency?: string | null }) => {
      try {
        await updateDetailsMutation.mutateAsync(values);
        toast.success(t('account.messages.submit_success'), { duration: 1500 });
        utils.user.me.refetch().catch(console.error);
      } catch (error) {
        toast.error(t('account.messages.submit_error'));

        console.error(error);
      }
    },
    [updateDetailsMutation, utils.user.me, t],
  );

  const header = useMemo(
    () => <div className="text-3xl font-semibold">{t('account.title')}</div>,
    [t],
  );

  const onSignOut = useCallback(async () => {
    await signOut({ redirect: false });
    void router.push('/auth/signin', '/auth/signin', { locale: 'default' });
  }, [router]);

  return (
    <>
      <Head>
        <title>{t('account.title')}</title>
      </Head>
      <MainLayout title={t('account.title')} header={header}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <EntityAvatar entity={userQuery.data} size={50} />
            <div>
              <div className="text-xl font-semibold">{userQuery.data?.name}</div>
              <div className="text-muted text-sm">{userQuery.data?.email}</div>
            </div>
          </div>
          {!userQuery.isPending && (
            <UpdateName
              className="size-5"
              defaultName={userQuery.data?.name ?? ''}
              defaultImage={userQuery.data?.image}
              defaultCurrency={userQuery.data?.defaultCurrency}
              onNameSubmit={onNameUpdate}
            />
          )}
        </div>
        <div className="mt-8 flex flex-col gap-4">
          <LanguagePicker>
            <AccountButton>
              <Languages className="text-muted size-5" />
              {t('account.change_language')}
            </AccountButton>
          </LanguagePicker>

          <BankConnection
            bankConnectionEnabled={bankConnectionEnabled}
            bankConnection={bankConnection}
          >
            <AccountButton>
              <CreditCard className="text-muted size-5" />
              {userQuery.data?.obapiProviderId ? t('actions.reconnect') : t('actions.connect')}{' '}
              {t('bank_transactions.to_bank')}
            </AccountButton>
          </BankConnection>

          <ThemePicker />

          <AccountButton href="/agents">
            <Bot className="text-muted size-5" />
            {t('agents.account_entry')}
          </AccountButton>

          {feedBackPossible && <SubmitFeedback />}

          <SubscribeNotification />

          <DownloadAppDrawer>
            <AccountButton>
              <Download className="text-muted size-5" />
              {t('account.download_app')}
            </AccountButton>
          </DownloadAppDrawer>

          <AccountButton onClick={downloadData} disabled={downloading} loading={downloading}>
            <FileDown className="text-muted size-5" />
            {t('account.download_splitpro_data')}
          </AccountButton>

          <AccountButton href="/data">
            <FileSpreadsheet className="text-muted size-5" />
            {t('account_entry', { ns: 'dataio' })}
          </AccountButton>

          <AccountButton href="/import-splitwise">
            <DownloadCloud className="text-muted size-5" />
            {t('account.import_from_splitwise')}
          </AccountButton>

          {/* Debug info is for local development only. */}
          {'production' !== process.env.NODE_ENV ? (
            <DebugInfo>
              <AccountButton>
                <BadgeInfo className="text-muted size-5" />
                {t('account.debug_info')}
              </AccountButton>
            </DebugInfo>
          ) : null}
        </div>

        <div className="mt-2 flex justify-center">
          <Button variant="ghost" className="text-danger hover:text-danger/90" onClick={onSignOut}>
            {t('account.logout')}
          </Button>
        </div>
      </MainLayout>
    </>
  );
};

AccountPage.auth = true;

export const getServerSideProps: GetServerSideProps = async (context) => ({
  props: {
    feedbackPossible: Boolean(env.FEEDBACK_EMAIL),
    bankConnectionEnabled: isBankConnectionConfigured(),
    bankConnection: whichBankConnectionConfigured(),
    ...(await customServerSideTranslations(context.locale, ['common', 'currencies', 'dataio'])),
    maxUploadFileSizeMB: env.UPLOAD_MAX_FILE_SIZE_MB,
  },
});

export default AccountPage;
