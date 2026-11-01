import { Input } from '@heroui/react';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { CurrencyPicker } from '~/components/AddExpense/CurrencyPicker';
import { AppDrawer } from '~/components/ui/drawer';
import { type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import { api } from '~/utils/api';

import { isValidCapInput, minorToDecimal } from './capInput';

const MAX_NAME_LENGTH = 100;

interface QuickEditKey {
  id: string;
  name: string;
  agentLabel: string | null;
  monthlyCapAmount: bigint | null;
  capCurrency: string | null;
}

interface AgentQuickEditSheetProps {
  apiKey: QuickEditKey;
  /** "rename" edits the display name; "cap" edits only the monthly cap. */
  mode: 'rename' | 'cap';
  trigger: React.ReactNode;
  fallbackCurrency?: string | null;
}

/** Small one-field sheets behind an agent card's Rename and Edit cap buttons. */
export const AgentQuickEditSheet: React.FC<AgentQuickEditSheetProps> = ({
  apiKey,
  mode,
  trigger,
  fallbackCurrency,
}) => {
  const { t } = useTranslation('agentcaps');
  const utils = api.useUtils();
  const updateMutation = api.agent.updateApiKey.useMutation();
  const renameMutation = api.agent.renameApiKey.useMutation();

  const initialCurrency: CurrencyCode = isCurrencyCode(apiKey.capCurrency)
    ? apiKey.capCurrency
    : isCurrencyCode(fallbackCurrency)
      ? fallbackCurrency
      : 'USD';

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [cap, setCap] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(initialCurrency);

  const isRename = 'rename' === mode;
  const capValid = isValidCapInput(cap);
  const nameValid = '' !== name.trim();
  const isPending = updateMutation.isPending || renameMutation.isPending;

  const onOpenChange = (next: boolean) => {
    if (next) {
      setName(apiKey.agentLabel?.trim() || apiKey.name);
      setCurrency(initialCurrency);
      setCap(
        null !== apiKey.monthlyCapAmount && isCurrencyCode(apiKey.capCurrency)
          ? minorToDecimal(apiKey.monthlyCapAmount, apiKey.capCurrency)
          : '',
      );
    }
    setOpen(next);
  };

  const refresh = () =>
    Promise.all([utils.agent.listApiKeys.invalidate(), utils.agent.usage.invalidate()]).catch(
      console.error,
    );

  const onSave = async () => {
    try {
      if (isRename) {
        if (!nameValid) {
          return;
        }
        await renameMutation.mutateAsync({ id: apiKey.id, name: name.trim() });
        toast.success(t('rename.saved'));
      } else {
        if (!capValid) {
          toast.error(t('sheet.invalid_cap'));
          return;
        }
        const normalized = cap.trim().replace(',', '.');
        await updateMutation.mutateAsync({
          id: apiKey.id,
          cap: '' === normalized ? null : { amount: normalized, currency },
        });
        toast.success(t('sheet.saved'));
      }
      setOpen(false);
      refresh().catch(console.error);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t(isRename ? 'rename.failed' : 'sheet.failed'),
      );
    }
  };

  const fieldId = `agent-quick-${mode}-${apiKey.id}`;

  return (
    <AppDrawer
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={t(isRename ? 'rename.title' : 'cap_sheet.title')}
      actionTitle={t(isRename ? 'rename.save' : 'cap_sheet.save')}
      actionOnClick={() => {
        onSave().catch(console.error);
      }}
      actionDisabled={(isRename ? !nameValid : !capValid) || isPending}
      shouldCloseOnAction={false}
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave().catch(console.error);
        }}
      >
        <label htmlFor={fieldId} className="text-sm font-medium">
          {t(isRename ? 'rename.label' : 'sheet.cap')}
        </label>
        {isRename ? (
          <Input
            id={fieldId}
            value={name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11"
            variant="secondary"
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Input
                id={fieldId}
                inputMode="decimal"
                autoComplete="off"
                dir="ltr"
                placeholder={t('sheet.cap_placeholder')}
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                className="min-h-11 min-w-0 flex-1 text-lg font-semibold"
                variant="secondary"
                aria-invalid={!capValid}
                aria-describedby={`${fieldId}-hint`}
              />
              <CurrencyPicker
                currentCurrency={currency}
                onCurrencyPick={(picked) => {
                  if (picked) {
                    setCurrency(picked);
                  }
                }}
              />
            </div>
            <p id={`${fieldId}-hint`} className="text-muted text-xs">
              {capValid ? t('sheet.cap_hint') : t('sheet.invalid_cap')}
            </p>
          </>
        )}
      </form>
    </AppDrawer>
  );
};
