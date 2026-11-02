import { TRPCClientError } from '@trpc/client';
import { Button } from '@heroui/react';
import { HistoryIcon } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { browserTimeZone, gzipFileToBase64 } from '~/components/DataIO/transfer';
import { Card, SectionTitle } from '~/components/DataIO/ui';
import { type UploadInspection } from '~/server/dataio/inspect';
import { MAX_IMPORT_BYTES, MAX_UPLOAD_BASE64_LENGTH } from '~/server/dataio/types';
import { api } from '~/utils/api';

import { DoneStep } from './DoneStep';
import { buildDecisions, itemName, needsAmount, todayCalendar } from './format';
import { ReviewStep } from './ReviewStep';
import { type ScanMappingState, ScanMappingStep, mappingFromInspection } from './ScanMappingStep';
import {
  STATEMENT_SCAN_NAMESPACES,
  type ScanDraft,
  type ScanItemError,
  type ScanListItem,
  type ScanOutcome,
  type ScanSession,
} from './types';
import { UploadStep } from './UploadStep';

type Step = 'upload' | 'mapping' | 'review' | 'done';

interface UploadFile {
  name: string;
  gzipBase64: string;
}

const UPLOAD_ERRORS = new Set([
  'too_large',
  'too_many_rows',
  'wrong_type',
  'read_failed',
  'empty_file',
  'not_statement',
]);

/** Long enough to read: the app-wide toast default is only 1.5 seconds. */
const ERROR_TOAST = { duration: 6000 };

const uploadErrorKey = (error: unknown, fallback: string) => {
  const message = error instanceof TRPCClientError ? error.message : '';
  return UPLOAD_ERRORS.has(message) ? `upload.${message}` : fallback;
};

const EMPTY_OUTCOME: ScanOutcome = { saved: 0, dismissed: 0, reminders: [] };

export const StatementScanFlow: React.FC<{ fallbackCurrency: string }> = ({ fallbackCurrency }) => {
  const { t } = useTranslation(STATEMENT_SCAN_NAMESPACES);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<UploadFile | null>(null);
  const [inspection, setInspection] = useState<UploadInspection | null>(null);
  const [mapping, setMapping] = useState<ScanMappingState | null>(null);
  const [session, setSession] = useState<ScanSession | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ScanDraft>>({});
  const [errors, setErrors] = useState<Record<string, ScanItemError>>({});
  const [showMissing, setShowMissing] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome>(EMPTY_OUTCOME);
  const [reading, setReading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [today] = useState(todayCalendar);

  const latestQuery = api.statementScan.latest.useQuery();
  const inspectMutation = api.statementScan.inspect.useMutation();
  const scanMutation = api.statementScan.scan.useMutation();
  const confirmMutation = api.statementScan.confirm.useMutation();
  const utils = api.useUtils();

  const latest = latestQuery.data ?? null;
  const latestPending = latest?.items.filter((item) => 'PENDING' === item.status).length ?? 0;

  const openSession = (next: ScanSession) => {
    setSession(next);
    setDrafts({});
    setErrors({});
    setShowMissing(false);
    setOutcome(EMPTY_OUTCOME);
    setStep('review');
    window.scrollTo?.({ top: 0 });
  };

  const reset = () => {
    setStep('upload');
    setFile(null);
    setInspection(null);
    setMapping(null);
    setSession(null);
    setDrafts({});
    setErrors({});
    setShowMissing(false);
    setOutcome(EMPTY_OUTCOME);
    setUploadError(null);
  };

  const runScan = async (upload: UploadFile, settings: ScanMappingState) => {
    const result = await scanMutation.mutateAsync({
      file: upload,
      options: { ...settings, timeZone: browserTimeZone() },
    });
    openSession({
      scanId: result.scanId,
      totals: result.report.totals,
      items: result.items,
      report: {
        from: result.report.from,
        to: result.report.to,
        scannedRows: result.report.scannedRows,
      },
    });
    utils.statementScan.latest.invalidate().catch(console.error);
  };

  const onFile = async (picked: File) => {
    setUploadError(null);
    if (!/\.(csv|xlsx)$/i.test(picked.name)) {
      setUploadError('upload.wrong_type');
      return;
    }
    if (MAX_IMPORT_BYTES < picked.size) {
      setUploadError('upload.too_large');
      return;
    }
    setReading(true);
    try {
      const gzipBase64 = await gzipFileToBase64(picked);
      if (MAX_UPLOAD_BASE64_LENGTH < gzipBase64.length) {
        setUploadError('upload.too_large_compressed');
        return;
      }
      const upload = { name: picked.name, gzipBase64 };
      const inspected = await inspectMutation.mutateAsync({ file: upload });
      const settings = mappingFromInspection(inspected.inspection, fallbackCurrency);
      setFile(upload);
      setInspection(inspected.inspection);
      setMapping(settings);
      if (!inspected.mappingComplete) {
        setStep('mapping');
        return;
      }
      await runScan(upload, settings);
    } catch (error) {
      console.error(error);
      setUploadError(uploadErrorKey(error, 'upload.read_failed'));
    } finally {
      setReading(false);
    }
  };

  const onMappedScan = async () => {
    if (!file || !mapping) {
      return;
    }
    try {
      await runScan(file, mapping);
    } catch (error) {
      console.error(error);
      toast.error(t(uploadErrorKey(error, 'upload.scan_failed')), ERROR_TOAST);
    }
  };

  const onResume = () => {
    if (!latest) {
      return;
    }
    openSession({
      scanId: latest.scanId,
      totals: latest.totals,
      items: latest.items,
      report: null,
    });
  };

  const onSave = async () => {
    if (!session) {
      return;
    }
    const pending = session.items.filter((item) => 'PENDING' === item.status);
    const missing = pending.filter((item) => needsAmount(item, drafts[item.id]));
    if (0 < missing.length) {
      setShowMissing(true);
      toast.error(t('list.need_amount', { count: missing.length }));
      document.getElementById(`scan-item-${missing[0]?.id}-amount`)?.focus();
      return;
    }
    const decisions = buildDecisions(pending, drafts);
    if (0 === decisions.length) {
      return;
    }

    try {
      const result = await confirmMutation.mutateAsync({ decisions });
      Promise.all([
        utils.subscriptions.list.invalidate(),
        utils.agent.listDetectedSubscriptions.invalidate(),
        utils.statementScan.latest.invalidate(),
      ]).catch(console.error);

      const failed = new Map(result.errors.map((entry) => [entry.id, entry.code] as const));
      const created = new Map(result.created.map((entry) => [entry.id, entry] as const));
      const byId = new Map(pending.map((item) => [item.id, item] as const));
      const dismissedIds = new Set(
        decisions
          .filter((entry) => 'not_subscription' === entry.decision && !failed.has(entry.id))
          .map((entry) => entry.id),
      );

      const reminders = result.created.flatMap((entry) => {
        const item = byId.get(entry.id);
        if (!item || null === entry.remindDaysBefore) {
          return [];
        }
        return [
          {
            id: entry.id,
            name: itemName(item, drafts[entry.id]),
            daysBefore: entry.remindDaysBefore,
            date: item.nextRenewal,
          },
        ];
      });
      const next: ScanOutcome = {
        saved: outcome.saved + result.created.length,
        dismissed: outcome.dismissed + result.dismissed,
        reminders: [...outcome.reminders, ...reminders],
      };
      setOutcome(next);

      const statusFor = (item: ScanListItem): ScanListItem['status'] => {
        if (created.has(item.id)) {
          return 'ADDED';
        }
        return dismissedIds.has(item.id) ? 'DISMISSED' : item.status;
      };
      setSession({
        ...session,
        items: session.items.map((item) => ({ ...item, status: statusFor(item) })),
      });
      setErrors(Object.fromEntries(failed));

      if (0 < failed.size) {
        setShowMissing(true);
        toast.error(
          t('list.partial', {
            saved: result.created.length + result.dismissed,
            failed: failed.size,
          }),
        );
        return;
      }
      setStep('done');
      window.scrollTo?.({ top: 0 });
    } catch (error) {
      console.error(error);
      toast.error(t('list.save_failed'), ERROR_TOAST);
    }
  };

  if ('done' === step) {
    return <DoneStep outcome={outcome} onRestart={reset} />;
  }

  if ('review' === step && session) {
    return (
      <ReviewStep
        session={session}
        drafts={drafts}
        onDraftChange={(id, draft) => {
          setDrafts((current) => ({ ...current, [id]: draft }));
          if (errors[id]) {
            setErrors((current) =>
              Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)),
            );
          }
        }}
        errors={errors}
        showMissing={showMissing}
        saving={confirmMutation.isPending}
        today={today}
        onSave={() => {
          onSave().catch(console.error);
        }}
        onRestart={reset}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {'upload' === step ? <p className="text-muted px-1 text-sm">{t('intro')}</p> : null}

      {'upload' === step && 0 < latestPending ? (
        <Card className="flex items-center gap-3">
          <HistoryIcon className="text-accent size-5 shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-foreground text-sm font-semibold">{t('resume.title')}</p>
            <p className="text-muted text-xs">{t('resume.count', { count: latestPending })}</p>
          </div>
          <Button className="min-h-11 shrink-0 rounded-full" onPress={onResume}>
            {t('resume.action')}
          </Button>
        </Card>
      ) : null}

      <section aria-labelledby="statement-scan-upload" className="flex flex-col gap-2">
        <SectionTitle id="statement-scan-upload">
          {0 < latestPending ? t('resume.new') : t('upload.heading')}
        </SectionTitle>
        <Card>
          {'mapping' === step && inspection && mapping && file ? (
            <ScanMappingStep
              inspection={inspection}
              fileName={file.name}
              value={mapping}
              onChange={setMapping}
              onBack={reset}
              onContinue={() => {
                onMappedScan().catch(console.error);
              }}
              isPending={scanMutation.isPending}
            />
          ) : (
            <UploadStep
              busy={reading}
              error={uploadError ? t(uploadError) : null}
              onFile={(picked) => {
                onFile(picked).catch(console.error);
              }}
            />
          )}
        </Card>
      </section>
    </div>
  );
};
