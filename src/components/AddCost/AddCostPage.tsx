import { Tabs } from '@heroui/react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import React, { useState } from 'react';

import { AddExpenseJourney } from '~/components/AddExpense/journey/AddExpenseJourney';
import { DEFAULT_CATEGORY } from '~/lib/category';
import { useAddExpenseStore } from '~/store/addStore';

import { COST_TYPES, type CostType, parseCostType, parseServiceQuery } from './addCost';
import { CostForm } from './CostForm';

const TAB_LABEL_KEYS = {
  subscription: 'types.subscription',
  usage: 'types.usage',
  oneoff: 'types.oneoff',
} as const satisfies Record<CostType, string>;

const isCostType = (value: unknown): value is CostType => COST_TYPES.some((type) => type === value);

/**
 * /add: "Add cost" with Subscription | API usage | One-off. One-off is the existing add-expense
 * journey under this page's single header (its own header only on deep steps); the other two
 * tabs share CostForm.
 */
export const AddCostPage: React.FC<{
  enableSendingInvites: boolean;
  bankConnectionEnabled: boolean;
}> = ({ enableSendingInvites, bankConnectionEnabled }) => {
  const { t } = useTranslation('addcost');
  const router = useRouter();
  const [costType, setCostType] = useState<CostType>(() => parseCostType(router.query));
  const [initialService] = useState(() => parseServiceQuery(router.query));
  const [journeyOnEntryScreen, setJourneyOnEntryScreen] = useState(true);

  const onTypeChange = (key: React.Key) => {
    if (!isCostType(key) || key === costType) {
      return;
    }
    // Start the new tab clean, but keep the people, group and currency already chosen.
    const { setAmount, setAmountStr, setDescription, setCategory, setCronExpression } =
      useAddExpenseStore.getState().actions;
    setAmount(0n);
    setAmountStr('');
    setDescription('');
    setCategory(DEFAULT_CATEGORY);
    setCronExpression('');
    setCostType(key);

    const { type: _type, service: _service, ...rest } = router.query;
    router
      .replace(
        {
          pathname: router.pathname,
          query: 'oneoff' === key ? rest : { ...rest, type: key },
        },
        undefined,
        { shallow: true },
      )
      .catch(console.error);
  };

  const onCancel = () => {
    if (1 < window.history.length) {
      router.back();
      return;
    }
    router.push('/home').catch(console.error);
  };

  const isOneOff = 'oneoff' === costType;
  // Deep one-off steps (reading, review, split) show the journey's own back header instead.
  const showChrome = !isOneOff || journeyOnEntryScreen;

  return (
    <div className="bg-background text-foreground mx-auto flex min-h-full w-full max-w-md flex-col gap-4">
      {showChrome ? (
        <header className="grid grid-cols-[minmax(4rem,1fr)_auto_minmax(4rem,1fr)] items-center pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-accent focus-visible:ring-focus min-h-11 justify-self-start rounded-lg px-1 text-[15px] outline-none focus-visible:ring-2"
          >
            {t('cancel')}
          </button>
          <h1 className="text-base font-semibold">{t('title')}</h1>
          <span aria-hidden />
        </header>
      ) : null}

      <Tabs selectedKey={costType} onSelectionChange={onTypeChange}>
        <Tabs.ListContainer className={showChrome ? undefined : 'hidden'}>
          <Tabs.List aria-label={t('type_label')} className="w-full">
            {COST_TYPES.map((type) => (
              <Tabs.Tab key={type} id={type} className="min-h-11 flex-1">
                {t(TAB_LABEL_KEYS[type])}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="subscription" className="px-0 pt-4">
          {'subscription' === costType ? (
            <CostForm
              kind="subscription"
              enableSendingInvites={enableSendingInvites}
              initialService={initialService}
            />
          ) : null}
        </Tabs.Panel>
        <Tabs.Panel id="usage" className="px-0 pt-4">
          {'usage' === costType ? (
            <CostForm
              kind="usage"
              enableSendingInvites={enableSendingInvites}
              initialService={initialService}
            />
          ) : null}
        </Tabs.Panel>
        <Tabs.Panel id="oneoff" className={showChrome ? 'px-0 pt-4' : 'px-0 pt-2'}>
          {isOneOff ? (
            <AddExpenseJourney
              enableSendingInvites={enableSendingInvites}
              bankConnectionEnabled={bankConnectionEnabled}
              hideHeader
              onEntryScreenChange={setJourneyOnEntryScreen}
            />
          ) : null}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
};
