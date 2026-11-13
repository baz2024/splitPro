import { UserX } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import React, { useCallback } from 'react';
import { toast } from 'sonner';

import { api } from '~/utils/api';

import { SimpleConfirmationDialog } from '../SimpleConfirmationDialog';
import { Button } from '../ui/button';

/** Account deletion, required by App Store guideline 5.1.1(v) and Google Play policy. */
export const DeleteAccount: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const deleteAccountMutation = api.user.deleteAccount.useMutation();

  const onConfirm = useCallback(async () => {
    try {
      await deleteAccountMutation.mutateAsync();
    } catch (error) {
      console.error('Account deletion failed', error);
      toast.error(t('account.delete_account_details.failed'));
      return;
    }

    toast.success(t('account.delete_account_details.deleted'));
    // The server already removed every session; this clears the local cookie too.
    await signOut({ redirect: false }).catch(console.error);
    // The native app watches for /auth/signin and returns to its Welcome screen.
    await router.replace('/auth/signin');
  }, [deleteAccountMutation, router, t]);

  return (
    <SimpleConfirmationDialog
      title={t('account.delete_account_details.title')}
      description={t('account.delete_account_details.description')}
      hasPermission
      onConfirm={onConfirm}
      loading={deleteAccountMutation.isPending}
      variant="destructive"
    >
      <Button
        variant="ghost"
        className="text-danger hover:text-danger/90 min-h-11 gap-2"
        data-testid="delete-account"
      >
        <UserX className="size-4" />
        {t('account.delete_account')}
      </Button>
    </SimpleConfirmationDialog>
  );
};
