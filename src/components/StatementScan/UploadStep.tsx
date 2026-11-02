import { CircleAlertIcon, FileUpIcon, LockIcon } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React, { useRef, useState } from 'react';

import { LoadingSpinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';

import { STATEMENT_SCAN_NAMESPACES } from './types';

interface UploadStepProps {
  busy: boolean;
  /** Why the last file couldn't be read. Stays until the next file is picked. */
  error?: string | null;
  onFile: (file: File) => void;
}

/** Drop zone and file button for a statement or invoice export. */
export const UploadStep: React.FC<UploadStepProps> = ({ busy, error = null, onFile }) => {
  const { t } = useTranslation(STATEMENT_SCAN_NAMESPACES);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (file: File | undefined) => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    if (file && !busy) {
      onFile(file);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        id="statement-scan-file"
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        disabled={busy}
        onChange={(event) => pick(event.target.files?.[0])}
      />
      <label
        htmlFor="statement-scan-file"
        aria-busy={busy}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          pick(event.dataTransfer.files[0]);
        }}
        className={cn(
          'text-foreground focus-within:ring-focus flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-6 text-center text-sm font-medium transition-colors focus-within:ring-2',
          dragging ? 'border-accent bg-accent/10' : 'border-border hover:bg-background',
          busy && 'cursor-wait',
        )}
      >
        {busy ? (
          <>
            <LoadingSpinner className="text-accent" />
            <span aria-live="polite">{t('upload.reading')}</span>
          </>
        ) : (
          <>
            <FileUpIcon className="text-accent size-7" aria-hidden />
            <span>{dragging ? t('upload.drop_active') : t('upload.choose')}</span>
            {dragging ? null : (
              <span className="text-muted text-xs font-normal">{t('upload.drop')}</span>
            )}
          </>
        )}
      </label>
      {error ? (
        <p role="alert" className="text-danger flex items-start gap-2 text-sm leading-snug">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
      <p className="text-muted text-xs leading-relaxed">{t('upload.sources')}</p>
      <p className="text-muted flex items-start gap-2 text-xs leading-relaxed">
        <LockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{t('upload.privacy')}</span>
      </p>
    </div>
  );
};
