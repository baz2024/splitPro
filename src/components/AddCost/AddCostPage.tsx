import { Tabs } from '@heroui/react';
import { ScanLine } from 'lucide-react';
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
  scan: 'audit_b.addcost.scan',
} as const satisfies Record<CostType, string>;

/** The Scan label lives in common (audit_b); the other segment labels in addcost. */
const TAB_LABEL_NS = { scan: 'common' } as const satisfies Partial<Record<CostType, string>>;

const isCostType = (value: unknown): value is CostType => COST_TYPES.some((type) => type === value);

/**
 * /add: "Add cost" with Subscription | API usage | One-off | Scan. One-off and Scan are the
 * existing add-expense journey (Scan opens it on the receipt camera, as `/add?mode=scan` does)
 * under this page's single header; the first two tabs share CostForm.
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

    const { type: _type, service: _service, mode: _mode, ...rest } = router.query;
    const query =
      'oneoff' === key ? rest : 'scan' === key ? { ...rest, mode: 'scan' } : { ...rest, type: key };
    const navigation = router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
    if ('scan' === key || 'oneoff' === key) {
      // The journey reads `mode` once when it mounts, so switch after the URL is updated.
      navigation.then(() => setCostType(key)).catch(console.error);
      return;
    }
    setCostType(key);
    navigation.catch(console.error);
  };

  const onCancel = () => {
    if (1 < window.history.length) {
      router.back();
      return;
    }
    router.push('/home').catch(console.error);
  };

  const isOneOff = 'oneoff' === costType;
  const isJourney = isOneOff || 'scan' === costType;
  // Deep one-off steps (reading, review, split) show the journey's own back header instead.
  const showChrome = !isJourney || journeyOnEntryScreen;

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
              <Tabs.Tab
                key={type}
                id={type}
                className="min-h-11 flex-auto gap-1 px-2.5 text-[13px] whitespace-nowrap"
              >
                {'scan' === type ? <ScanLine className="size-3.5 shrink-0" aria-hidden /> : null}
                {'scan' === type
                  ? t(TAB_LABEL_KEYS[type], { ns: TAB_LABEL_NS.scan })
                  : t(TAB_LABEL_KEYS[type])}
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
              hideModeSwitch
              initialMode="manual"
              onEntryScreenChange={setJourneyOnEntryScreen}
            />
          ) : null}
        </Tabs.Panel>
        <Tabs.Panel id="scan" className={showChrome ? 'px-0 pt-4' : 'px-0 pt-2'}>
          {'scan' === costType ? (
            <AddExpenseJourney
              enableSendingInvites={enableSendingInvites}
              bankConnectionEnabled={bankConnectionEnabled}
              hideHeader
              hideModeSwitch
              initialMode="scan"
              onEntryScreenChange={setJourneyOnEntryScreen}
            />
          ) : null}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
};
