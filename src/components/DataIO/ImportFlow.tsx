import { TRPCClientError } from '@trpc/client';
import { FileUpIcon } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React, { useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  type ImportOptions,
  type ImportResult,
  MAX_IMPORT_BYTES,
  MAX_UPLOAD_BASE64_LENGTH,
  type PreviewRow,
} from '~/server/dataio/types';
import { type RouterOutputs, api } from '~/utils/api';

import { initialImportTarget } from './importTarget';
import { type MappingState, MappingStep } from './MappingStep';
import { PreviewStep } from './PreviewStep';
import { ResultStep } from './ResultStep';
import { browserTimeZone, gzipFileToBase64 } from './transfer';
import { Card, DATAIO_NAMESPACES, SectionTitle } from './ui';

export type Inspection = RouterOutputs['dataio']['inspectImport'];

const STEPS = ['file', 'mapping', 'preview', 'result'] as const;
type Step = (typeof STEPS)[number];

const UPLOAD_ERRORS = new Set(['too_large', 'too_many_rows', 'wrong_type', 'read_failed']);

const uploadErrorKey = (error: unknown) => {
  const message = error instanceof TRPCClientError ? error.message : '';
  return UPLOAD_ERRORS.has(message) ? `import.${message}` : 'import.read_failed';
};

export const toImportOptions = (state: MappingState): ImportOptions => ({
  mapping: state.mapping,
  dateFormat: state.dateFormat,
  defaultCurrency: state.defaultCurrency,
  amountSign: state.amountSign,
  target:
    'group' === state.targetType && null !== state.groupId
      ? { type: 'group', groupId: state.groupId, split: state.split }
      : { type: 'personal' },
  timeZone: browserTimeZone(),
});

export const ImportFlow: React.FC<{ fallbackCurrency: string; groupId?: number | null }> = ({
  fallbackCurrency,
  groupId = null,
}) => {
  const { t } = useTranslation(DATAIO_NAMESPACES);
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('file');
  const [file, setFile] = useState<{ name: string; gzipBase64: string } | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [settings, setSettings] = useState<MappingState | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<ImportResult | null>(null);
  const [reading, setReading] = useState(false);

  const inspectMutation = api.dataio.inspectImport.useMutation();
  const previewMutation = api.dataio.previewImport.useMutation();
  const commitMutation = api.dataio.commitImport.useMutation();
  const utils = api.useUtils();

  const reset = () => {
    setStep('file');
    setFile(null);
    setInspection(null);
    setSettings(null);
    setRows([]);
    setSelected(new Set());
    setResult(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const onFile = async (picked: File | undefined) => {
    if (!picked) {
      return;
    }
    if (!/\.(csv|txt|xlsx)$/i.test(picked.name)) {
      toast.error(t('import.wrong_type'));
      return;
    }
    if (MAX_IMPORT_BYTES < picked.size) {
      toast.error(t('import.too_large'));
      return;
    }
    setReading(true);
    try {
      const gzipBase64 = await gzipFileToBase64(picked);
      if (MAX_UPLOAD_BASE64_LENGTH < gzipBase64.length) {
        toast.error(t('import.too_large_compressed'));
        return;
      }
      const upload = { name: picked.name, gzipBase64 };
      const inspected = await inspectMutation.mutateAsync({ file: upload });
      setFile(upload);
      setInspection(inspected);
      setSettings({
        mapping: inspected.mapping,
        dateFormat: inspected.dateFormat,
        amountSign: inspected.amountSign,
        defaultCurrency: inspected.currency ?? fallbackCurrency,
        ...initialImportTarget(groupId),
        split: 'equal',
      });
      setStep('mapping');
    } catch (error) {
      console.error(error);
      toast.error(t(uploadErrorKey(error)));
    } finally {
      setReading(false);
    }
  };

  const onPreview = async () => {
    if (!file || !settings) {
      return;
    }
    try {
      const previewRows = await previewMutation.mutateAsync({
        file,
        options: toImportOptions(settings),
      });
      setRows(previewRows);
      setSelected(
        new Set(
          previewRows
            .filter((row) => 'ok' === row.status && null === row.duplicate)
            .map((row) => row.index),
        ),
      );
      setStep('preview');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : t('import.failed'));
    }
  };

  const onCommit = async () => {
    if (!file || !settings) {
      return;
    }
    try {
      const outcome = await commitMutation.mutateAsync({
        file,
        options: toImportOptions(settings),
        include: [...selected],
      });
      setResult(outcome);
      setStep('result');
      utils.invalidate().catch(console.error);
    } catch (error) {
      console.error(error);
      toast.error(t('import.failed'));
    }
  };

  const stepNumber = STEPS.indexOf(step) + 1;

  return (
    <section aria-labelledby="dataio-import" className="flex flex-col gap-2">
      <SectionTitle id="dataio-import">{t('import.heading')}</SectionTitle>
      <Card className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-foreground text-sm font-semibold">{t(`import.step_${step}`)}</p>
          <p className="text-muted text-xs" aria-live="polite">
            {t('import.step', { current: stepNumber, total: STEPS.length })}
          </p>
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((entry, index) => (
            <span
              key={entry}
              className={
                index < stepNumber
                  ? 'bg-accent h-1 flex-1 rounded-full'
                  : 'bg-border h-1 flex-1 rounded-full'
              }
            />
          ))}
        </div>

        {'file' === step ? (
          <div className="flex flex-col gap-3">
            <p className="text-muted text-sm">{t('import.file_hint')}</p>
            <input
              ref={inputRef}
              id="dataio-import-file"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(event) => {
                onFile(event.target.files?.[0]).catch(console.error);
              }}
            />
            <label
              htmlFor="dataio-import-file"
              aria-busy={reading}
              className="border-border text-foreground hover:bg-background focus-within:ring-focus flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-5 text-sm font-medium focus-within:ring-2"
            >
              <FileUpIcon className="text-accent size-6" aria-hidden />
              {reading ? t('import.reading') : t('import.choose_file')}
            </label>
          </div>
        ) : null}

        {'mapping' === step && inspection && settings ? (
          <MappingStep
            inspection={inspection}
            fileName={file?.name ?? ''}
            value={settings}
            onChange={setSettings}
            onBack={reset}
            onContinue={() => {
              onPreview().catch(console.error);
            }}
            isPending={previewMutation.isPending}
          />
        ) : null}

        {'preview' === step ? (
          <PreviewStep
            rows={rows}
            selected={selected}
            onSelectedChange={setSelected}
            onBack={() => setStep('mapping')}
            onImport={() => {
              onCommit().catch(console.error);
            }}
            isPending={commitMutation.isPending}
          />
        ) : null}

        {'result' === step && result ? <ResultStep result={result} onRestart={reset} /> : null}
      </Card>
    </section>
  );
};
