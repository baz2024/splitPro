import { ChevronRightIcon, GlobeIcon } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import { cn } from '~/lib/utils';
import { useCurrencyPreferenceStore } from '~/store/currencyPreferenceStore';
import { api } from '~/utils/api';
import { getSupportedLanguages } from '~/utils/i18n/client';

import { LanguagePicker } from '../Account/LanguagePicker';
import { CurrencyPicker } from '../AddExpense/CurrencyPicker';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

type OpenPicker = 'language' | 'currency' | null;

/**
 * The currency the app is actually showing: the user's saved default, else this session's
 * preference, else USD. Never empty, so the toolbar chip always has something to say.
 */
export const resolveEffectiveCurrency = (
  userDefault: string | null | undefined,
  sessionPreference: string | null | undefined,
): CurrencyCode => {
  if (isCurrencyCode(userDefault)) {
    return userDefault;
  }
  if (isCurrencyCode(sessionPreference)) {
    return sessionPreference;
  }
  return 'USD';
};

/** Pickers open from the menu, so they need a trigger that never shows. */
const HIDDEN_TRIGGER = <span className="hidden" aria-hidden />;

/**
 * One compact "EN · USD" chip that opens a small menu with Language and Currency rows. Each row
 * opens the existing language or currency picker.
 */
export const ToolbarSwitchers: React.FC<{ className?: string }> = ({ className }) => {
  const { t, i18n } = useTranslation();
  const utils = api.useUtils();
  const userQuery = api.user.me.useQuery();
  const updateUser = api.user.updateUserDetail.useMutation();
  const setUserDefaultCurrency = useCurrencyPreferenceStore((s) => s.setUserDefaultCurrency);
  const sessionPreference = useCurrencyPreferenceStore((s) => s.getPreference());

  const [menuOpen, setMenuOpen] = useState(false);
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  const pendingPicker = useRef<OpenPicker>(null);

  const currency = resolveEffectiveCurrency(userQuery.data?.defaultCurrency, sessionPreference);

  const onCurrencyPick = useCallback(
    (picked: CurrencyCode | null) => {
      if (!picked || picked === userQuery.data?.defaultCurrency) {
        return;
      }
      updateUser
        .mutateAsync({ defaultCurrency: picked })
        .then(() => {
          setUserDefaultCurrency(picked);
          return utils.invalidate();
        })
        .catch((error: unknown) => {
          console.error('Error changing currency:', error);
          toast.error(t('errors.something_went_wrong'));
        });
    },
    [userQuery.data?.defaultCurrency, setUserDefaultCurrency, t, updateUser, utils],
  );

  const languageCode = (i18n.language ?? 'en').split('-')[0]?.toUpperCase() ?? 'EN';
  const languageCodeLabel = 'DEFAULT' === languageCode ? 'EN' : languageCode;
  const languageName = useMemo(
    () => getSupportedLanguages().find((language) => language.code === i18n.language)?.name,
    [i18n.language],
  );

  const openFromMenu = useCallback((picker: Exclude<OpenPicker, null>) => {
    pendingPicker.current = picker;
    setMenuOpen(false);
    setOpenPicker(picker);
  }, []);

  const onPickerOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setOpenPicker(null);
    }
  }, []);

  if (!userQuery.data) {
    return null;
  }

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('audit_a.switchers.button_label')}
            className={cn(
              'border-border text-foreground focus-visible:ring-focus hover:bg-default/60 flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:outline-none',
              className,
            )}
          >
            <GlobeIcon className="size-4" aria-hidden />
            <span dir="ltr">
              {languageCodeLabel} · {currency}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-64 p-1"
          onCloseAutoFocus={(event) => {
            // A picker is about to take focus; don't pull it back to the chip.
            if (pendingPicker.current) {
              event.preventDefault();
              pendingPicker.current = null;
            }
          }}
        >
          <MenuRow
            label={t('audit_a.switchers.language')}
            value={languageName ?? languageCodeLabel}
            onClick={() => openFromMenu('language')}
          />
          <MenuRow
            label={t('audit_a.switchers.currency')}
            value={currency}
            onClick={() => openFromMenu('currency')}
          />
        </PopoverContent>
      </Popover>

      <LanguagePicker open={'language' === openPicker} onOpenChange={onPickerOpenChange}>
        {HIDDEN_TRIGGER}
      </LanguagePicker>
      <CurrencyPicker
        currentCurrency={currency}
        onCurrencyPick={onCurrencyPick}
        trigger={HIDDEN_TRIGGER}
        open={'currency' === openPicker}
        onOpenChange={onPickerOpenChange}
      />
    </>
  );
};

const MenuRow: React.FC<{ label: string; value: string; onClick: () => void }> = ({
  label,
  value,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="hover:bg-default focus-visible:ring-focus flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-start text-sm focus-visible:ring-2 focus-visible:outline-none"
  >
    <span className="text-foreground flex-1 font-medium">{label}</span>
    <span className="text-muted truncate" dir="auto">
      {value}
    </span>
    <ChevronRightIcon className="text-muted size-4 shrink-0 rtl:rotate-180" aria-hidden />
  </button>
);
