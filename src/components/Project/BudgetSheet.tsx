import { Input } from '@heroui/react';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { CurrencyPicker } from '~/components/AddExpense/CurrencyPicker';
import { Button } from '~/components/ui/button';
import { AppDrawer } from '~/components/ui/drawer';
import { CURRENCIES, type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import { api } from '~/utils/api';

interface BudgetSheetProps {
  groupId: number;
  /** Element rendered as the sheet trigger; must be a single focusable element. */
  trigger: React.ReactNode;
  /** Current budget in minor units, if any. */
  budget: bigint | null;
  budgetCurrency: string | null;
  /** Currency suggested when no budget exists yet. */
  fallbackCurrency?: string | null;
  onSaved?: () => void;
}

const DECIMAL_PATTERN = /^\d{1,12}(?:\.\d+)?$/;

const minorToDecimal = (amount: bigint, currency: CurrencyCode) => {
  const { decimalDigits } = CURRENCIES[currency];
  if (0 === decimalDigits) {
    return amount.toString();
  }
  const scale = 10n ** BigInt(decimalDigits);
  const fraction = (amount % scale).toString().padStart(decimalDigits, '0').replace(/0+$/, '');
  return '' === fraction ? `${amount / scale}` : `${amount / scale}.${fraction}`;
};

/** Sheet for setting or removing a project's monthly budget (manual source). */
export const BudgetSheet: React.FC<BudgetSheetProps> = ({
  groupId,
  trigger,
  budget,
  budgetCurrency,
  fallbackCurrency,
  onSaved,
}) => {
  const { t } = useTranslation('projects');
  const utils = api.useUtils();
  const initialCurrency: CurrencyCode = isCurrencyCode(budgetCurrency)
    ? budgetCurrency
    : isCurrencyCode(fallbackCurrency)
      ? fallbackCurrency
      : 'USD';

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(initialCurrency);

  const setBudget = api.project.setBudget.useMutation();
  const clearBudget = api.project.clearBudget.useMutation();

  const normalized = amount.trim().replace(',', '.');
  const isValid = DECIMAL_PATTERN.test(normalized) && 0 < Number(normalized);

  const refresh = async () => {
    await Promise.all([
      utils.project.invalidate(),
      utils.group.getGroupDetails.invalidate({ groupId }),
    ]);
    onSaved?.();
  };

  const onOpenChange = (next: boolean) => {
    if (next) {
      setAmount(null === budget ? '' : minorToDecimal(budget, initialCurrency));
      setCurrency(initialCurrency);
    }
    setOpen(next);
  };

  const onSave = () => {
    if (!isValid) {
      toast.error(t('budget_sheet.invalid'));
      return;
    }
    setBudget.mutate(
      { groupId, amount: normalized, currency },
      {
        onSuccess: () => {
          toast.success(t('budget_sheet.saved'));
          setOpen(false);
          void refresh();
        },
        onError: (error) => {
          toast.error(error.message || t('budget_sheet.failed'));
        },
      },
    );
  };

  const onRemove = () => {
    clearBudget.mutate(
      { groupId },
      {
        onSuccess: () => {
          toast.success(t('budget_sheet.removed'));
          setOpen(false);
          void refresh();
        },
        onError: () => {
          toast.error(t('budget_sheet.failed'));
        },
      },
    );
  };

  return (
    <AppDrawer
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={t('budget_sheet.title')}
      actionTitle={t('budget_sheet.save')}
      actionOnClick={onSave}
      actionDisabled={!isValid || setBudget.isPending}
      shouldCloseOnAction={false}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="project-budget-amount" className="text-sm font-medium">
            {t('budget_sheet.amount')}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="project-budget-amount"
              inputMode="decimal"
              autoComplete="off"
              dir="ltr"
              placeholder={t('budget_sheet.amount_placeholder')}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-h-11 min-w-0 flex-1 text-lg font-semibold"
              variant="secondary"
              aria-describedby="project-budget-hint"
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
          <p id="project-budget-hint" className="text-muted text-xs">
            {t('budget_sheet.hint')}
          </p>
        </div>
        {null !== budget ? (
          <Button
            type="button"
            variant="ghost"
            className="text-danger min-h-11 self-start"
            disabled={clearBudget.isPending}
            onClick={onRemove}
          >
            {t('budget_sheet.remove')}
          </Button>
        ) : null}
      </form>
    </AppDrawer>
  );
};
