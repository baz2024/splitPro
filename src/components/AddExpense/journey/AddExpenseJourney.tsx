import { Button, Tabs } from '@heroui/react';
import { ChevronLeft } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cronToBackend } from '~/lib/cron';
import { type CurrencyCode } from '~/lib/currency';
import { useAddExpenseStore } from '~/store/addStore';
import { useAppStore } from '~/store/appStore';
import { api } from '~/utils/api';
import { prepareImageForUpload, uploadImage, validateUploadSize } from '~/utils/imageUpload';
import { isStringQueryParam } from '~/utils/queryParams';

import { AddOrEditExpensePage } from '../AddExpensePage';
import { AmountKeypad } from './AmountKeypad';
import { type BudgetSnapshot } from './BudgetBarCard';
import { ExpenseDetailsStep } from './ExpenseDetailsStep';
import { ReadingReceipt, ScanCamera } from './ScanCamera';
import { SplitStep, useNeedsParticipants } from './SplitStep';
import {
  type ReceiptScanResult,
  type ScanField,
  fileToBase64,
  parseScanAmount,
  parseScanCategory,
  parseScanCurrency,
  parseScanDate,
  toScanMimeType,
  useReceiptScanMutation,
} from './receiptScan';

export type AddMode = 'scan' | 'manual' | 'import';
type Step = 'capture' | 'reading' | 'amount' | 'details' | 'split';

const SCAN_MAX_FILE_SIZE_MB = 1.5;
const MAX_SCAN_BASE64_LENGTH = 3_900_000;

export const parseAddMode = (value: unknown, allowImport: boolean): AddMode => {
  if ('scan' === value || 'manual' === value) {
    return value;
  }
  return 'import' === value && allowImport ? 'import' : 'manual';
};

const firstStep = (mode: AddMode): Step => ('scan' === mode ? 'capture' : 'amount');

export const AddExpenseJourney: React.FC<{
  enableSendingInvites: boolean;
  bankConnectionEnabled: boolean;
  budget?: BudgetSnapshot;
}> = ({ enableSendingInvites, bankConnectionEnabled, budget }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils();
  const router = useRouter();
  const { update } = useSession();

  const [mode, setMode] = useState<AddMode>(() =>
    parseAddMode(router.query.mode, bankConnectionEnabled),
  );
  const [step, setStep] = useState<Step>(() => firstStep(mode));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanFlags, setScanFlags] = useState<{ fields: ScanField[]; note: string | null }>({
    fields: [],
    note: null,
  });

  const amount = useAddExpenseStore((s) => s.amount);
  const description = useAddExpenseStore((s) => s.description);
  const isFileUploading = useAddExpenseStore((s) => s.isFileUploading);
  const canSplitScreenClosed = useAddExpenseStore((s) => s.canSplitScreenClosed);
  const {
    setAmount,
    setAmountStr,
    setCategory,
    setCurrency,
    setDescription,
    setExpenseDate,
    setFileKey,
    setFileUploading,
  } = useAddExpenseStore((s) => s.actions);
  const maxUploadFileSizeMB = useAppStore((s) => s.maxUploadFileSizeMB);
  const needsParticipants = useNeedsParticipants();

  const scanMutation = useReceiptScanMutation();
  const addExpenseMutation = api.expense.addOrEditExpense.useMutation();
  const updateProfile = api.user.updateUserDetail.useMutation();

  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl],
  );

  const changeMode = (next: AddMode, nextStep: Step = firstStep(next)) => {
    setMode(next);
    setStep(nextStep);
    router
      .replace({ pathname: router.pathname, query: { ...router.query, mode: next } }, undefined, {
        shallow: true,
      })
      .catch(console.error);
  };

  const onModeTab = (key: React.Key) => {
    const next = parseAddMode(key, bankConnectionEnabled);
    if (next === mode) {
      return;
    }
    // Keep what was typed: go straight to details if an amount already exists.
    changeMode(next, 'manual' === next && 0n !== amount ? 'details' : firstStep(next));
  };

  const onCurrencyPick = (currency: CurrencyCode | null) => {
    if (!currency) {
      return;
    }
    updateProfile.mutate({ currency });
    setCurrency(currency);
    // Re-parse the typed amount in the new currency's precision.
    const { amountStr } = useAddExpenseStore.getState();
    setAmount(getCurrencyHelpersCached(currency).toSafeBigInt(amountStr));
  };

  const uploadReceipt = async (file: File) => {
    if (!validateUploadSize(file, maxUploadFileSizeMB)) {
      toast.error(t('errors.less_than', { size: maxUploadFileSizeMB }));
      return;
    }
    setFileUploading(true);
    try {
      setFileKey(await uploadImage(file));
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(t('errors.uploading_error'));
    } finally {
      setFileUploading(false);
    }
  };

  const applyScanResult = (result: ReceiptScanResult) => {
    if (result.merchant) {
      setDescription(result.merchant.trim());
    }
    const currency = parseScanCurrency(result.currency);
    if (currency) {
      setCurrency(currency);
    }
    const helpers = getCurrencyHelpersCached(currency ?? useAddExpenseStore.getState().currency);
    const scannedAmount = parseScanAmount(result.amount);
    if (null !== scannedAmount) {
      const value = helpers.toSafeBigInt(scannedAmount);
      setAmount(value);
      setAmountStr(helpers.toUIString(value, false, true));
    }
    const date = parseScanDate(result.date);
    if (date) {
      setExpenseDate(date);
    }
    const category = parseScanCategory(result.category);
    if (category) {
      setCategory(category);
    }

    const missing: ScanField[] = [];
    if (!result.merchant) {
      missing.push('merchant');
    }
    if (null === scannedAmount) {
      missing.push('amount');
    }
    setScanFlags({
      fields: [...new Set([...result.lowConfidenceFields, ...missing])],
      note: result.note,
    });
  };

  const fallBackToManual = (message: string) => {
    toast.error(message);
    changeMode('manual', 'amount');
  };

  const onReceiptPicked = async (file: File) => {
    setPreviewUrl(URL.createObjectURL(file));
    setStep('reading');

    let prepared = file;
    try {
      prepared = await prepareImageForUpload(file, maxUploadFileSizeMB);
    } catch (error) {
      console.error('Compression failed:', error);
    }

    // The photo is attached to the expense whether or not the scan succeeds.
    uploadReceipt(prepared).catch(console.error);

    const mimeType = toScanMimeType(prepared.type);
    if (!mimeType) {
      fallBackToManual(t('add_journey.scan.unsupported'));
      return;
    }

    try {
      // A smaller JPEG copy for the scan keeps the tRPC body under its 4 MB limit.
      const scanFile = await prepareImageForUpload(prepared, SCAN_MAX_FILE_SIZE_MB).catch(
        () => prepared,
      );
      const imageBase64 = await fileToBase64(scanFile);
      if (imageBase64.length > MAX_SCAN_BASE64_LENGTH) {
        fallBackToManual(t('add_journey.scan.too_large'));
        return;
      }
      applyScanResult(await scanMutation.mutateAsync({ imageBase64, mimeType }));
      setStep('details');
    } catch (error) {
      console.error('Receipt scan failed:', error);
      fallBackToManual(
        error instanceof Error && error.message ? error.message : t('add_journey.scan.failed'),
      );
    }
  };

  const returnToOrigin = () => {
    const { friendId, groupId } = router.query;
    if (isStringQueryParam(groupId) && groupId) {
      return router.push(`/groups/${groupId}`);
    }
    if (isStringQueryParam(friendId) && friendId) {
      return router.push(`/balances/${friendId}`);
    }
    if (1 < window.history.length) {
      router.back();
      return Promise.resolve(true);
    }
    return router.push('/balances');
  };

  const saveExpense = async () => {
    const state = useAddExpenseStore.getState();
    if (!state.paidBy) {
      return;
    }
    const sign = state.isNegative ? -1n : 1n;

    try {
      await addExpenseMutation.mutateAsync([
        {
          name: state.description,
          currency: state.currency,
          amount: state.amount * sign,
          groupId: state.group?.id ?? null,
          splitType: state.splitType,
          participants: state.participants.map((p) => ({
            userId: p.id,
            amount: (p.amount ?? 0n) * sign,
          })),
          paidBy: state.paidBy.id,
          category: state.category,
          fileKey: state.fileKey,
          expenseDate: state.expenseDate,
          transactionId: state.transactionId,
          cronExpression: state.cronExpression ? cronToBackend(state.cronExpression) : undefined,
        },
      ]);
      toast.success(t('add_journey.saved'));
      update((session: any) => ({
        ...session,
        user: { ...(session?.user ?? {}), currency: state.currency },
      })).catch(console.error);
      returnToOrigin().catch(console.error);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : t('errors.expense_submission_failed'));
    }
  };

  const onBack = () => {
    if ('split' === step) {
      setStep('details');
    } else if ('details' === step) {
      setStep('scan' === mode ? 'capture' : 'amount');
    } else {
      router.back();
    }
  };

  const canSave =
    !addExpenseMutation.isPending &&
    0n !== amount &&
    '' !== description.trim() &&
    !isFileUploading &&
    canSplitScreenClosed &&
    !needsParticipants;

  const titleKey =
    'import' === mode
      ? 'actions.add_expense'
      : {
          capture: 'add_journey.titles.scan',
          reading: 'add_journey.titles.reading',
          amount: 'add_journey.titles.amount',
          details: 'scan' === mode ? 'add_journey.titles.review' : 'add_journey.titles.details',
          split: 'add_journey.titles.split',
        }[step];

  const footer = (() => {
    if ('amount' === step) {
      return (
        <Button fullWidth size="lg" isDisabled={0n === amount} onPress={() => setStep('details')}>
          {t('actions.next')}
        </Button>
      );
    }
    if ('details' === step && needsParticipants) {
      return (
        <Button
          fullWidth
          size="lg"
          isDisabled={0n === amount || '' === description.trim()}
          onPress={() => setStep('split')}
        >
          {t('add_journey.choose_people')}
        </Button>
      );
    }
    if ('details' === step || 'split' === step) {
      return (
        <Button
          fullWidth
          size="lg"
          isDisabled={!canSave}
          isPending={addExpenseMutation.isPending || isFileUploading}
          onPress={() => {
            saveExpense().catch(console.error);
          }}
        >
          {t('add_journey.save')}
        </Button>
      );
    }
    return null;
  })();

  const stepContent = (() => {
    switch (step) {
      case 'capture':
        return (
          <ScanCamera
            onPick={(file) => {
              onReceiptPicked(file).catch(console.error);
            }}
          />
        );
      case 'reading':
        return <ReadingReceipt previewUrl={previewUrl} />;
      case 'amount':
        return <AmountKeypad onCurrencyPick={onCurrencyPick} />;
      case 'details':
        return (
          <ExpenseDetailsStep
            lowConfidenceFields={'scan' === mode ? scanFlags.fields : []}
            note={'scan' === mode ? scanFlags.note : null}
            receiptPreviewUrl={previewUrl}
            onEditAmount={() => setStep('amount')}
            onSplitPress={() => setStep('split')}
          />
        );
      default:
        return <SplitStep enableSendingInvites={enableSendingInvites} budget={budget} />;
    }
  })();

  const showModeTabs = 'reading' !== step && 'split' !== step;

  return (
    <div className="bg-background text-foreground mx-auto flex min-h-full w-full max-w-md flex-col gap-4 pb-28">
      <header className="flex items-center justify-between gap-2">
        <Button
          isIconOnly
          variant="ghost"
          className="size-11"
          aria-label={t('actions.back')}
          onPress={onBack}
        >
          <ChevronLeft className="size-6 rtl:rotate-180" />
        </Button>
        <h1 className="text-base font-semibold">{t(titleKey)}</h1>
        <span className="size-11" aria-hidden />
      </header>

      {showModeTabs ? (
        <Tabs selectedKey={mode} onSelectionChange={onModeTab}>
          <Tabs.ListContainer>
            <Tabs.List aria-label={t('add_journey.mode_label')} className="w-full">
              <Tabs.Tab id="scan" className="min-h-11 flex-1">
                {t('add_journey.modes.scan')}
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="manual" className="min-h-11 flex-1">
                {t('add_journey.modes.manual')}
                <Tabs.Indicator />
              </Tabs.Tab>
              {bankConnectionEnabled ? (
                <Tabs.Tab id="import" className="min-h-11 flex-1">
                  {t('add_journey.modes.import')}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ) : null}
            </Tabs.List>
          </Tabs.ListContainer>
          <Tabs.Panel id="scan">{'scan' === mode ? stepContent : null}</Tabs.Panel>
          <Tabs.Panel id="manual">{'manual' === mode ? stepContent : null}</Tabs.Panel>
          {bankConnectionEnabled ? (
            <Tabs.Panel id="import">
              {'import' === mode ? (
                <AddOrEditExpensePage
                  enableSendingInvites={enableSendingInvites}
                  bankConnectionEnabled={bankConnectionEnabled}
                />
              ) : null}
            </Tabs.Panel>
          ) : null}
        </Tabs>
      ) : (
        stepContent
      )}

      {'import' !== mode && footer ? (
        <div className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-20 border-t px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur">
          <div className="mx-auto max-w-md">{footer}</div>
        </div>
      ) : null}
    </div>
  );
};
