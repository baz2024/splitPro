import { Button } from '@heroui/react';
import { useRouter } from 'next/router';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { CurrencyPicker } from '~/components/AddExpense/CurrencyPicker';
import { DateSelector } from '~/components/AddExpense/DateSelector';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type CategoryItem } from '~/lib/category';
import { cronToBackend } from '~/lib/cron';
import { type CurrencyCode } from '~/lib/currency';
import { FEATURED_SERVICES, type ServiceInfo, findService } from '~/lib/serviceCatalog';
import { cn } from '~/lib/utils';
import { useAddExpenseStore } from '~/store/addStore';
import { api } from '~/utils/api';

import {
  type BillingCadence,
  TECH_CATEGORY_OPTIONS,
  USAGE_SERVICES,
  buildSubscriptionDescription,
  buildUsageDescription,
  cadenceToCron,
  defaultNextRenewal,
  fromMonthInputValue,
  lastChargeDate,
  toMonthInputValue,
  usageExpenseDate,
} from './addCost';
import { PaidBySplitRow } from './PaidBySplitRow';
import { OTHER_SERVICE, ServiceGrid } from './ServiceGrid';

const Row: React.FC<{ label: string; htmlFor?: string; children: React.ReactNode }> = ({
  label,
  htmlFor,
  children,
}) => (
  <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
    {htmlFor ? (
      <label htmlFor={htmlFor} className="shrink-0 text-sm">
        {label}
      </label>
    ) : (
      <span className="shrink-0 text-sm">{label}</span>
    )}
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</div>
  </div>
);

const FIELD =
  'text-foreground placeholder:text-muted min-h-11 w-full min-w-0 rounded-lg bg-transparent px-1 text-end text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus';

const CADENCES: readonly BillingCadence[] = ['monthly', 'yearly'];

/**
 * The Subscription and API usage tabs of Add cost. Writes amount, currency, category and
 * description into the shared add store, so the existing split step and expense mutation are
 * reused unchanged. Subscriptions also get a recurring job via the existing cron mechanism.
 */
export const CostForm: React.FC<{
  kind: 'subscription' | 'usage';
  enableSendingInvites: boolean;
  initialService?: ServiceInfo;
}> = ({ kind, enableSendingInvites, initialService }) => {
  const { t, i18n, getCurrencyHelpersCached } = useTranslationWithUtils([
    'addcost',
    'common',
    'categories',
  ]);
  const router = useRouter();
  const isSubscription = 'subscription' === kind;
  const services = isSubscription ? FEATURED_SERVICES : USAGE_SERVICES;

  const [serviceId, setServiceId] = useState<string | null>(() => {
    if (!initialService) {
      return null;
    }
    return services.some((service) => service.id === initialService.id)
      ? initialService.id
      : OTHER_SERVICE;
  });
  const [otherName, setOtherName] = useState(() =>
    initialService && !services.some((service) => service.id === initialService.id)
      ? initialService.name
      : '',
  );
  const [otherCategory, setOtherCategory] = useState<CategoryItem>(
    () => initialService?.category ?? 'tech',
  );
  const [plan, setPlan] = useState('');
  const [cadence, setCadence] = useState<BillingCadence>('monthly');
  const [nextRenewal, setNextRenewal] = useState<Date>(() => defaultNextRenewal('monthly'));
  const [month, setMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const amount = useAddExpenseStore((s) => s.amount);
  const amountStr = useAddExpenseStore((s) => s.amountStr);
  const currency = useAddExpenseStore((s) => s.currency);
  const canSplitScreenClosed = useAddExpenseStore((s) => s.canSplitScreenClosed);
  const group = useAddExpenseStore((s) => s.group);
  const { setAmount, setAmountStr, setCurrency } = useAddExpenseStore((s) => s.actions);

  // Only claim a budget when the selected project really has one.
  const budgetFootnote =
    group && null !== group.budgetAmount && 0n < group.budgetAmount
      ? t('footnote.budget', {
          project: group.name,
          month: new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(
            isSubscription ? lastChargeDate(cadence, nextRenewal) : month,
          ),
        })
      : null;

  const addExpenseMutation = api.expense.addOrEditExpense.useMutation();

  const service = serviceId && OTHER_SERVICE !== serviceId ? findService(serviceId) : undefined;
  const isOther = OTHER_SERVICE === serviceId;
  const serviceName = isOther ? otherName.trim() : (service?.name ?? '');
  const category = isOther ? otherCategory : service?.category;

  const onAmountChange = (value: string) => {
    const cleaned = value.replace(/[^\d.,]/g, '');
    setAmountStr(cleaned);
    setAmount(getCurrencyHelpersCached(currency).toSafeBigInt(cleaned.replace(',', '.')));
  };

  const onCurrencyPick = (next: CurrencyCode | null) => {
    if (!next) {
      return;
    }
    setCurrency(next);
    setAmount(getCurrencyHelpersCached(next).toSafeBigInt(amountStr.replace(',', '.')));
  };

  const onCadence = (next: BillingCadence) => {
    if (next === cadence) {
      return;
    }
    setCadence(next);
    setNextRenewal(defaultNextRenewal(next));
  };

  const goAfterSave = () => {
    const savedGroup = useAddExpenseStore.getState().group;
    if (savedGroup) {
      return router.push(`/groups/${savedGroup.id}`);
    }
    return router.push(isSubscription ? '/subscriptions' : '/balances');
  };

  const save = async () => {
    const state = useAddExpenseStore.getState();
    if (!state.paidBy || !category || '' === serviceName) {
      return;
    }
    const isPersonal = !state.group && 1 >= state.participants.length;
    const participants = isPersonal
      ? [{ userId: state.paidBy.id, amount: state.amount }]
      : state.participants.map((p) => ({ userId: p.id, amount: p.amount ?? 0n }));

    try {
      await addExpenseMutation.mutateAsync([
        {
          name: isSubscription
            ? buildSubscriptionDescription(serviceName, plan)
            : buildUsageDescription(serviceName, month, i18n.language),
          currency: state.currency,
          amount: state.amount,
          groupId: state.group?.id ?? null,
          splitType: state.splitType,
          participants,
          paidBy: state.paidBy.id,
          category,
          expenseDate: isSubscription
            ? lastChargeDate(cadence, nextRenewal)
            : usageExpenseDate(month),
          cronExpression: isSubscription
            ? cronToBackend(cadenceToCron(cadence, nextRenewal))
            : undefined,
        },
      ]);
      toast.success(t(isSubscription ? 'saved.subscription' : 'saved.usage'));
      goAfterSave().catch(console.error);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : t('errors.save_failed'));
    }
  };

  const canSave =
    !addExpenseMutation.isPending &&
    0n < amount &&
    '' !== serviceName &&
    Boolean(category) &&
    canSplitScreenClosed;

  const [thisMonth] = useState(() => toMonthInputValue(new Date()));

  return (
    <div className="flex flex-col gap-5 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <ServiceGrid services={services} selected={serviceId} onSelect={setServiceId} />

      {isOther ? (
        <div className="bg-surface border-border flex flex-col gap-3 rounded-2xl border p-4">
          <label htmlFor="addcost-other-name" className="text-sm">
            {t('service.other_name')}
          </label>
          <input
            id="addcost-other-name"
            value={otherName}
            onChange={(e) => setOtherName(e.target.value)}
            placeholder={t('service.other_placeholder')}
            autoComplete="off"
            className="bg-field-background border-field-border text-field-foreground placeholder:text-field-placeholder focus-visible:ring-focus min-h-11 rounded-xl border px-3 text-sm outline-none focus-visible:ring-2"
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-muted mb-2 text-xs font-medium">{t('service.category')}</legend>
            <div className="flex flex-wrap gap-2">
              {TECH_CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={option === otherCategory}
                  onClick={() => setOtherCategory(option)}
                  className={cn(
                    'focus-visible:ring-focus min-h-11 rounded-full border px-3 text-xs font-medium outline-none focus-visible:ring-2',
                    option === otherCategory
                      ? 'bg-foreground text-background border-transparent'
                      : 'border-border text-muted hover:text-foreground',
                  )}
                >
                  {'tech' === option
                    ? t('categories_list.tech.items.other', { ns: 'categories' })
                    : t(`categories_list.tech.items.${option}`, { ns: 'categories' })}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}

      <div className="bg-surface border-border divide-border flex flex-col divide-y overflow-hidden rounded-[20px] border">
        {isSubscription ? (
          <Row label={t('fields.plan')} htmlFor="addcost-plan">
            <input
              id="addcost-plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder={t('fields.plan_placeholder')}
              autoComplete="off"
              className={FIELD}
            />
          </Row>
        ) : null}

        <Row label={t(isSubscription ? 'fields.price' : 'fields.amount')} htmlFor="addcost-amount">
          <input
            id="addcost-amount"
            dir="ltr"
            inputMode="decimal"
            value={amountStr}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder={getCurrencyHelpersCached(currency).toUIString(0n, false, true)}
            autoComplete="off"
            className={cn(FIELD, 'text-lg font-semibold tabular-nums')}
          />
          <CurrencyPicker currentCurrency={currency} onCurrencyPick={onCurrencyPick} />
        </Row>

        {isSubscription ? (
          <>
            <Row label={t('fields.billing')}>
              <div role="radiogroup" aria-label={t('fields.billing')} className="flex gap-1.5">
                {CADENCES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={option === cadence}
                    onClick={() => onCadence(option)}
                    className={cn(
                      'focus-visible:ring-focus min-h-11 rounded-full px-4 text-xs font-medium outline-none focus-visible:ring-2',
                      option === cadence
                        ? 'bg-foreground text-background'
                        : 'border-border text-muted hover:text-foreground border',
                    )}
                  >
                    {t(`fields.${option}`)}
                  </button>
                ))}
              </div>
            </Row>
            <Row label={t('fields.next_renewal')}>
              <DateSelector
                mode="single"
                required
                selected={nextRenewal}
                onSelect={setNextRenewal}
                formatDate={(date) =>
                  new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(date)
                }
              />
            </Row>
          </>
        ) : (
          <Row label={t('fields.month')} htmlFor="addcost-month">
            <input
              id="addcost-month"
              type="month"
              dir="ltr"
              max={thisMonth}
              value={toMonthInputValue(month)}
              onChange={(e) => {
                const parsed = fromMonthInputValue(e.target.value);
                if (parsed) {
                  setMonth(parsed);
                }
              }}
              className={cn(FIELD, 'max-w-44')}
            />
          </Row>
        )}

        <PaidBySplitRow enableSendingInvites={enableSendingInvites} />
      </div>

      <div className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-20 border-t px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur">
        <div className="mx-auto flex max-w-md flex-col gap-2">
          <p className="text-muted text-center text-xs">
            {budgetFootnote ??
              (isSubscription ? t('footnote.subscription', { cadence }) : t('footnote.usage'))}
          </p>
          <Button
            fullWidth
            size="lg"
            className="min-h-13 rounded-full"
            isDisabled={!canSave}
            isPending={addExpenseMutation.isPending}
            onPress={() => {
              save().catch(console.error);
            }}
          >
            {t(isSubscription ? 'actions.save_subscription' : 'actions.save_usage')}
          </Button>
        </div>
      </div>
    </div>
  );
};
