import { GlobeIcon } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React, { useCallback } from 'react';
import { toast } from 'sonner';

import { type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import { useCurrencyPreferenceStore } from '~/store/currencyPreferenceStore';
import { api } from '~/utils/api';

import { LanguagePicker } from '../Account/LanguagePicker';
import { CurrencyPicker } from '../AddExpense/CurrencyPicker';

/** Language and default-currency switchers shown in the page toolbar. */
export const ToolbarSwitchers: React.FC = () => {
  const { t, i18n } = useTranslation();
  const utils = api.useUtils();
  const userQuery = api.user.me.useQuery();
  const updateUser = api.user.updateUserDetail.useMutation();
  const setUserDefaultCurrency = useCurrencyPreferenceStore((s) => s.setUserDefaultCurrency);

  const defaultCurrency = userQuery.data?.defaultCurrency;
  const currentCurrency = isCurrencyCode(defaultCurrency) ? defaultCurrency : null;

  const onCurrencyPick = useCallback(
    (currency: CurrencyCode | null) => {
      if (!currency || currency === currentCurrency) {
        return;
      }
      updateUser
        .mutateAsync({ defaultCurrency: currency })
        .then(() => {
          setUserDefaultCurrency(currency);
          return utils.invalidate();
        })
        .catch((error: unknown) => {
          console.error('Error changing currency:', error);
          toast.error(t('errors.something_went_wrong'));
        });
    },
    [currentCurrency, setUserDefaultCurrency, t, updateUser, utils],
  );

  const languageCode = (i18n.language ?? 'en').split('-')[0]?.toUpperCase() ?? 'EN';

  if (!userQuery.data) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <LanguagePicker>
        <button
          type="button"
          aria-label={t('account.change_language_details.title')}
          className="border-border text-foreground focus-visible:ring-focus flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          <GlobeIcon className="size-4" aria-hidden />
          <span dir="ltr">{languageCode}</span>
        </button>
      </LanguagePicker>
      <CurrencyPicker currentCurrency={currentCurrency} onCurrencyPick={onCurrencyPick} />
    </div>
  );
};
