import { Button } from '@heroui/react';
import { Bell, Camera, Check, PencilLine, Upload } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cronToBackend } from '~/lib/cron';
import { type CurrencyCode } from '~/lib/currency';
import { REVIEW_SCAN_SKIPPED } from '~/lib/expenseReview';
import { notifiedParticipants } from '~/lib/notifyNote';
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
  /**
   * The host page already shows the header (Add cost): skip the journey's own close + title
   * row on entry screens. Deep steps (reading, review, split) keep their back-button header.
   */
  hideHeader?: boolean;
  /** Told whether the journey is on an entry screen (Scan / Manual / Import) or a deep step. */
  onEntryScreenChange?: (isEntryScreen: boolean) => void;
  /**
   * The host page already has its own Scan / One-off switch (Add cost): hide the journey's
   * Scan / Manual / Import segments. Import stays reachable through a small link.
   */
  hideModeSwitch?: boolean;
  /** Mode to start in, instead of reading `?mode=` from the URL. */
  initialMode?: AddMode;
}> = ({
  enableSendingInvites,
  bankConnectionEnabled,
  hideHeader = false,
  onEntryScreenChange,
  hideModeSwitch = false,
  initialMode,
}) => {
  const { t, displayName, getCurrencyHelpersCached } = useTranslationWithUtils([
    'common',
    'categories',
  ]);
  const router = useRouter();
  const { update } = useSession();
  const utils = api.useUtils();

  const [mode, setMode] = useState<AddMode>(() =>
    parseAddMode(initialMode ?? router.query.mode, bankConnectionEnabled),
  );
  const [step, setStep] = useState<Step>(() => firstStep(mode));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [readingFields, setReadingFields] = useState<ReadingFields | null>(null);
  const [scanFlags, setScanFlags] = useState<{ fields: ScanField[]; note: string | null }>({
    fields: [],
    note: null,
  });
  /** Reason codes for the "Review" flag saved with a scanned expense (~/lib/expenseReview). */
  const [scanReviewReasons, setScanReviewReasons] = useState<string[]>([]);
  /**
   * The scan in flight. `id` changes when a new photo is picked or the scan is abandoned, so a
   * late answer for an old photo is ignored. `skipped` = the user left the reading screen to
   * fill in the details before the AI finished.
   */
  const scanSessionRef = useRef<{ id: number; skipped: boolean }>({ id: 0, skipped: false });

  const amount = useAddExpenseStore((s) => s.amount);
  const description = useAddExpenseStore((s) => s.description);
  const isFileUploading = useAddExpenseStore((s) => s.isFileUploading);
  const canSplitScreenClosed = useAddExpenseStore((s) => s.canSplitScreenClosed);
  const participants = useAddExpenseStore((s) => s.participants);
  const currentUserId = useAddExpenseStore((s) => s.currentUser?.id);
  /** Who Save will notify, for the note above the button. */
  const notifiedNow = notifiedParticipants(participants, currentUserId);
  const [savedSheet, setSavedSheet] = useState<SavedSummary | null>(null);
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

  const resetScanReview = () => {
    scanSessionRef.current = { id: scanSessionRef.current.id + 1, skipped: false };
    setScanReviewReasons([]);
  };

  const changeMode = (next: AddMode, nextStep: Step = firstStep(next)) => {
    if ('scan' !== next) {
      resetScanReview();
    }
    setMode(next);
    setStep(nextStep);
    router
      .replace({ pathname: router.pathname, query: { ...router.query, mode: next } }, undefined, {
        shallow: true,
      })
      .catch(console.error);
  };

  /** "Add another" after a save: same project and people, fresh amount and details. */
  const startAnother = () => {
    resetScanReview();
    setPreviewUrl(null);
    setReadingFields(null);
    setScanFlags({ fields: [], note: null });
    useAddExpenseStore.setState({
      description: '',
      fileKey: '',
      transactionId: undefined,
      cronExpression: '',
      detectedSubscriptionId: undefined,
    });
    setAmountStr('');
    setAmount(0n);
    setExpenseDate(new Date());
    setStep(firstStep(mode));
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

  /**
   * Copies the scan into the add store. With `onlyEmpty` (the user already left the reading
   * screen and may have typed things) only the description and amount fill in, and only when
   * still empty, so the late answer never overwrites the user's input.
   */
  const applyScanResult = (result: ReceiptScanResult, onlyEmpty = false): ReadingFields => {
    const before = useAddExpenseStore.getState();
    const canFillDescription = !onlyEmpty || '' === before.description.trim();
    const canFillAmount = !onlyEmpty || 0n === before.amount;

    if (result.merchant && canFillDescription) {
      setDescription(result.merchant.trim());
    }
    const currency = canFillAmount ? parseScanCurrency(result.currency) : null;
    if (currency) {
      setCurrency(currency);
    }
    const helpers = getCurrencyHelpersCached(currency ?? useAddExpenseStore.getState().currency);
    const scannedAmount = parseScanAmount(result.amount);
    const value = null === scannedAmount ? null : helpers.toSafeBigInt(scannedAmount);
    if (null !== value && canFillAmount) {
      setAmount(value);
      setAmountStr(helpers.toUIString(value, false, true));
    }
    const date = onlyEmpty ? null : parseScanDate(result.date);
    if (date) {
      setExpenseDate(date);
    }
    const category = onlyEmpty ? null : parseScanCategory(result.category);
    if (category) {
      setCategory(category);
    }
    setScanReviewReasons(result.reviewReasons);

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

  /** Reading screen → fill in by hand while the scan keeps running ("Review" flag is set). */
  const skipReading = () => {
    scanSessionRef.current = { ...scanSessionRef.current, skipped: true };
    setStep('manual');
  };

  const onReceiptPicked = async (file: File) => {
    resetScanReview();
    const scanId = scanSessionRef.current.id;
    const isCurrentScan = () => scanId === scanSessionRef.current.id;
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
      const result = await scanMutation.mutateAsync({ imageBase64, mimeType });
      if (!isCurrentScan()) {
        return;
      }
      if (scanSessionRef.current.skipped) {
        applyScanResult(result, true);
        return;
      }
      setReadingFields(applyScanResult(result));
      // Let the filled checklist register before moving on.
      setTimeout(
        () => setStep((current) => ('reading' === current ? 'review' : current)),
        READ_RESULT_PAUSE_MS,
      );
    } catch (error) {
      console.error('Receipt scan failed:', error);
      if (!isCurrentScan() || scanSessionRef.current.skipped) {
        // The user is already filling it in by hand; the "Review" flag stays on.
        return;
      }
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
      await router.push(`/projects/${groupId}`);
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
    const reviewReasons =
      'scan' === mode
        ? [
            ...new Set([
              ...(scanSessionRef.current.skipped ? [REVIEW_SCAN_SKIPPED] : []),
              ...scanReviewReasons,
            ]),
          ]
        : [];

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
          ...(0 < reviewReasons.length && { needsReview: true, reviewReasons }),
        },
      ]);

      if (state.detectedSubscriptionId && saved) {
        // The agents inbox item is only marked added once the expense really exists.
        await markDetectedAdded
          .mutateAsync({ id: state.detectedSubscriptionId, expenseId: saved.id })
          .catch(console.error);
        utils.agent.listDetectedSubscriptions.invalidate().catch(console.error);
      }

      const notified = notifiedParticipants(state.participants, state.currentUser?.id);
      update((session: any) => ({
        ...session,
        user: { ...(session?.user ?? {}), currency: state.currency },
      })).catch(console.error);
      // A shared cost gets a small confirmation sheet on this screen; a personal one just leaves.
      if (0 < notified.length) {
        setSavedSheet({
          groupId: state.group?.id,
          amount: getCurrencyHelpersCached(state.currency).toUIString(state.amount),
          description: state.description.trim(),
          notified: notified.length,
          name: displayName(notified[0]),
        });
        return;
      }
      toast.success(t('add_journey.saved_notified', { count: 0, name: '' }));
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
      // Back to the camera abandons this photo's scan.
      resetScanReview();
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

  useEffect(() => {
    onEntryScreenChange?.(isEntryScreen);
  }, [isEntryScreen, onEntryScreenChange]);

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
        <div className="flex flex-col gap-2">
          {0 < notifiedNow.length ? (
            <p
              className="text-muted flex items-center justify-center gap-1.5 text-center text-xs"
              data-testid="notify-note"
            >
              <Bell className="size-3.5 shrink-0" aria-hidden />
              {t('audit_c.notify.will_be_notified', {
                count: notifiedNow.length,
                name: displayName(notifiedNow[0]),
              })}
            </p>
          ) : null}
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
        </div>
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
            onDecline={() => changeMode('manual', 'manual')}
          />
        );
      case 'reading':
        return (
          <ReadingReceipt previewUrl={previewUrl} fields={readingFields} onSkip={skipReading} />
        );
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
            reviewReasons={scanReviewReasons}
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
    <div className="bg-background text-foreground mx-auto flex min-h-full w-full max-w-md flex-col gap-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      {hideHeader && isEntryScreen ? null : (
        <JourneyHeader
          title={title}
          leading={isEntryScreen ? 'close' : 'back'}
          leadingLabel={isEntryScreen ? t('add_journey.close') : t('actions.back')}
          onLeading={onLeading}
        />
      )}

      {isEntryScreen && !hideModeSwitch ? (
        <Segmented
          ariaLabel={t('add_journey.mode_label')}
          items={modeItems}
          selected={mode}
          onChange={onModeTab}
        />
      ) : null}

      {isEntryScreen && hideModeSwitch && bankConnectionEnabled ? (
        <button
          type="button"
          onClick={() => changeMode('import' === mode ? (initialMode ?? 'manual') : 'import')}
          className="text-accent focus-visible:ring-focus inline-flex min-h-11 items-center gap-1.5 self-center rounded-lg px-2 text-[13px] font-medium outline-none focus-visible:ring-2"
        >
          {'import' === mode ? null : MODE_ICONS.import}
          {'import' === mode ? t('audit_d.journey.leave_import') : t('audit_d.journey.import_link')}
        </button>
      ) : null}

      {stepContent}

      {footer && !savedSheet ? <PinnedFooter>{footer}</PinnedFooter> : null}

      {savedSheet ? (
        <SavedSheet
          saved={savedSheet}
          onDone={() => {
            const { groupId } = savedSheet;
            setSavedSheet(null);
            leaveAfterSave(groupId).catch(console.error);
          }}
          onAddAnother={() => {
            setSavedSheet(null);
            startAnother();
          }}
        />
      ) : null}
    </div>
  );
};

interface SavedSummary {
  groupId: number | undefined;
  amount: string;
  description: string;
  notified: number;
  name: string;
}

/**
 * Small confirmation sheet after saving a shared cost: what was saved and who was told,
 * without leaving the screen until the user taps Done.
 */
const SavedSheet: React.FC<{
  saved: SavedSummary;
  onDone: () => void;
  onAddAnother: () => void;
}> = ({ saved, onDone, onAddAnother }) => {
  const { t } = useTranslationWithUtils();
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-sheet-title"
        className="bg-surface border-border w-full max-w-md rounded-t-3xl border px-5 pt-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-xl"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="bg-success/15 text-success inline-flex size-12 items-center justify-center rounded-full">
            <Check className="size-6" aria-hidden />
          </span>
          <h2 id="saved-sheet-title" className="text-base font-semibold">
            {t('audit_c.notify.saved_title')}
          </h2>
          <p className="text-sm">
            <span dir="ltr" className="font-semibold tabular-nums">
              {saved.amount}
            </span>
            {saved.description ? ` · ${saved.description}` : null}
          </p>
          <p className="text-muted flex items-center gap-1.5 text-xs">
            <Bell className="size-3.5" aria-hidden />
            {t('audit_c.notify.was_notified', { count: saved.notified, name: saved.name })}
          </p>
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" size="lg" className="h-12 flex-1" onPress={onAddAnother}>
            {t('audit_c.notify.add_another')}
          </Button>
          <Button size="lg" className="h-12 flex-1" onPress={onDone} autoFocus>
            {t('audit_c.notify.done')}
          </Button>
        </div>
      </div>
    </div>
  );
};
