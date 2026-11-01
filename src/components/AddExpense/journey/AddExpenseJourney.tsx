import { Button } from '@heroui/react';
import { Camera, PencilLine, Upload } from 'lucide-react';
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
import { ExpenseDetailsStep } from './ExpenseDetailsStep';
import { type ReadingFields, ReadingReceipt, ScanCamera } from './ScanCamera';
import { SplitStep, SplitSummaryCard, useNeedsParticipants } from './SplitStep';
import { categoryLabel } from './journeyPickers';
import { JourneyHeader, PRIMARY_CTA_CLASS, PinnedFooter, Segmented } from './journeyUi';
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
type Step = 'capture' | 'reading' | 'review' | 'manual' | 'split';

const SCAN_MAX_FILE_SIZE_MB = 1.5;
const MAX_SCAN_BASE64_LENGTH = 3_900_000;
/** How long the filled checklist stays on screen before moving on to review. */
const READ_RESULT_PAUSE_MS = 900;

export const parseAddMode = (value: unknown, allowImport: boolean): AddMode => {
  if ('scan' === value || 'manual' === value) {
    return value;
  }
  return 'import' === value && allowImport ? 'import' : 'manual';
};

const firstStep = (mode: AddMode): Step => ('scan' === mode ? 'capture' : 'manual');

const MODE_ICONS = {
  scan: <Camera className="size-4" aria-hidden />,
  manual: <PencilLine className="size-4" aria-hidden />,
  import: <Upload className="size-4" aria-hidden />,
} as const satisfies Record<AddMode, React.ReactNode>;

const TITLE_KEYS = {
  capture: 'add_journey.titles.scan',
  reading: 'add_journey.titles.reading',
  review: 'add_journey.titles.review',
  manual: 'add_journey.titles.amount',
  split: 'add_journey.titles.split',
} as const satisfies Record<Step, string>;

/**
 * Add-expense journey (Figma screens 1–5): Scan → Reading receipt → Review expense → Split
 * expense, or Manual → Split expense. Import reuses the classic add page.
 */
export const AddExpenseJourney: React.FC<{
  enableSendingInvites: boolean;
  bankConnectionEnabled: boolean;
}> = ({ enableSendingInvites, bankConnectionEnabled }) => {
  const { t, displayName, getCurrencyHelpersCached } = useTranslationWithUtils([
    'common',
    'categories',
  ]);
  const router = useRouter();
  const { update } = useSession();
  const utils = api.useUtils();

  const [mode, setMode] = useState<AddMode>(() =>
    parseAddMode(router.query.mode, bankConnectionEnabled),
  );
  const [step, setStep] = useState<Step>(() => firstStep(mode));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [readingFields, setReadingFields] = useState<ReadingFields | null>(null);
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
  const markDetectedAdded = api.agent.markDetectedSubscriptionAdded.useMutation();
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

  const onModeTab = (next: AddMode) => {
    if (next === mode) {
      return;
    }
    changeMode(next);
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

  const attachReceipt = async (file: File) => {
    let prepared = file;
    try {
      prepared = await prepareImageForUpload(file, maxUploadFileSizeMB);
    } catch (error) {
      console.error('Compression failed:', error);
    }
    await uploadReceipt(prepared);
  };

  const applyScanResult = (result: ReceiptScanResult): ReadingFields => {
    if (result.merchant) {
      setDescription(result.merchant.trim());
    }
    const currency = parseScanCurrency(result.currency);
    if (currency) {
      setCurrency(currency);
    }
    const helpers = getCurrencyHelpersCached(currency ?? useAddExpenseStore.getState().currency);
    const scannedAmount = parseScanAmount(result.amount);
    const value = null === scannedAmount ? null : helpers.toSafeBigInt(scannedAmount);
    if (null !== value) {
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

    return {
      merchant: result.merchant?.trim() || null,
      total: null === value ? null : helpers.toUIString(value),
      date: date
        ? new Intl.DateTimeFormat(router.locale, { dateStyle: 'medium' }).format(date)
        : null,
      category: category ? categoryLabel(t, category) : null,
    };
  };

  const fallBackToManual = (message: string) => {
    toast.error(message);
    changeMode('manual', 'manual');
  };

  const onReceiptPicked = async (file: File) => {
    setPreviewUrl(URL.createObjectURL(file));
    setReadingFields(null);
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
      setReadingFields(applyScanResult(await scanMutation.mutateAsync({ imageBase64, mimeType })));
      // Let the filled checklist register before moving on.
      setTimeout(
        () => setStep((current) => ('reading' === current ? 'review' : current)),
        READ_RESULT_PAUSE_MS,
      );
    } catch (error) {
      console.error('Receipt scan failed:', error);
      fallBackToManual(
        error instanceof Error && error.message ? error.message : t('add_journey.scan.failed'),
      );
    }
  };

  /** Group with a budget → its project page; otherwise back where the user came from. */
  const leaveAfterSave = async (groupId: number | undefined) => {
    if (groupId) {
      const summary = await utils.project.summary
        .fetch({ groupId, tzOffset: new Date().getTimezoneOffset() })
        .catch(() => null);
      if (summary && null !== summary.budget) {
        await router.push(`/projects/${groupId}`);
        return;
      }
    }
    if (1 < window.history.length) {
      router.back();
      return;
    }
    const { friendId } = router.query;
    if (groupId) {
      await router.push(`/groups/${groupId}`);
      return;
    }
    await router.push(
      isStringQueryParam(friendId) && friendId ? `/balances/${friendId}` : '/balances',
    );
  };

  const saveExpense = async () => {
    const state = useAddExpenseStore.getState();
    if (!state.paidBy) {
      return;
    }
    const sign = state.isNegative ? -1n : 1n;

    try {
      const [saved] = await addExpenseMutation.mutateAsync([
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

      if (state.detectedSubscriptionId && saved) {
        // The agents inbox item is only marked added once the expense really exists.
        await markDetectedAdded
          .mutateAsync({ id: state.detectedSubscriptionId, expenseId: saved.id })
          .catch(console.error);
        utils.agent.listDetectedSubscriptions.invalidate().catch(console.error);
      }

      const others = state.participants.filter((p) => p.id !== state.currentUser?.id);
      toast.success(
        t('add_journey.saved_notified', {
          count: others.length,
          name: displayName(others[0], state.currentUser?.id),
        }),
      );
      update((session: any) => ({
        ...session,
        user: { ...(session?.user ?? {}), currency: state.currency },
      })).catch(console.error);
      await leaveAfterSave(state.group?.id);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : t('errors.expense_submission_failed'));
    }
  };

  const onLeading = () => {
    if ('split' === step) {
      setStep('scan' === mode ? 'review' : 'manual');
      return;
    }
    if ('review' === step || 'reading' === step) {
      setStep('capture');
      return;
    }
    if ('manual' === step && 'scan' === mode) {
      setStep('review');
      return;
    }
    router.back();
  };

  const canSave =
    !addExpenseMutation.isPending &&
    0n !== amount &&
    '' !== description.trim() &&
    !isFileUploading &&
    canSplitScreenClosed &&
    !needsParticipants;

  const isEntryScreen =
    'import' === mode || 'capture' === step || ('manual' === step && 'manual' === mode);
  const title = t('import' === mode ? 'actions.add_expense' : TITLE_KEYS[step]);
  const canGoToSplit = 0n !== amount && '' !== description.trim();

  const footer = (() => {
    if ('import' === mode) {
      return null;
    }
    if ('review' === step || 'manual' === step) {
      return (
        <Button
          fullWidth
          size="lg"
          className={PRIMARY_CTA_CLASS}
          isDisabled={!canGoToSplit}
          onPress={() => setStep('split')}
        >
          {t('add_journey.next_split')}
        </Button>
      );
    }
    if ('split' === step) {
      return (
        <Button
          fullWidth
          size="lg"
          className={PRIMARY_CTA_CLASS}
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
    if ('import' === mode) {
      return (
        <AddOrEditExpensePage
          enableSendingInvites={enableSendingInvites}
          bankConnectionEnabled={bankConnectionEnabled}
        />
      );
    }
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
        return <ReadingReceipt previewUrl={previewUrl} fields={readingFields} />;
      case 'manual':
        return (
          <AmountKeypad
            onCurrencyPick={onCurrencyPick}
            onAttach={(file) => {
              attachReceipt(file).catch(console.error);
            }}
          />
        );
      case 'review':
        return (
          <ExpenseDetailsStep
            lowConfidenceFields={scanFlags.fields}
            note={scanFlags.note}
            receiptPreviewUrl={previewUrl}
            fromPhoto={'scan' === mode}
            onEditAmount={() => setStep('manual')}
            onSplitPress={() => setStep('split')}
            onCurrencyPick={onCurrencyPick}
          />
        );
      default:
        return (
          <div className="flex flex-col gap-4">
            <SplitSummaryCard />
            <SplitStep enableSendingInvites={enableSendingInvites} />
          </div>
        );
    }
  })();

  const modeItems = [
    { id: 'scan' as const, label: t('add_journey.modes.scan'), icon: MODE_ICONS.scan },
    { id: 'manual' as const, label: t('add_journey.modes.manual'), icon: MODE_ICONS.manual },
    ...(bankConnectionEnabled
      ? [{ id: 'import' as const, label: t('add_journey.modes.import'), icon: MODE_ICONS.import }]
      : []),
  ];

  return (
    <div className="bg-background text-foreground mx-auto flex min-h-full w-full max-w-md flex-col gap-4 pb-28">
      <JourneyHeader
        title={title}
        leading={isEntryScreen ? 'close' : 'back'}
        leadingLabel={isEntryScreen ? t('add_journey.close') : t('actions.back')}
        onLeading={onLeading}
      />

      {isEntryScreen ? (
        <Segmented
          ariaLabel={t('add_journey.mode_label')}
          items={modeItems}
          selected={mode}
          onChange={onModeTab}
        />
      ) : null}

      {stepContent}

      {footer ? <PinnedFooter>{footer}</PinnedFooter> : null}
    </div>
  );
};
