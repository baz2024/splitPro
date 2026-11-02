import { Button } from '@heroui/react';
import { ChevronDownIcon } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';

import { Card, SectionTitle } from '~/components/DataIO/ui';
import { cn } from '~/lib/utils';
import { type CalendarDate } from '~/server/dataio/dates';

import { sortForReview } from './format';
import { ReportHeader } from './ReportHeader';
import { HandledScanRow, ScanItemRow } from './ScanItemRow';
import {
  STATEMENT_SCAN_NAMESPACES,
  type ScanDraft,
  type ScanItemError,
  type ScanListItem,
  type ScanSession,
} from './types';

interface ReviewStepProps {
  session: ScanSession;
  drafts: Readonly<Record<string, ScanDraft>>;
  onDraftChange: (id: string, draft: ScanDraft) => void;
  errors: Readonly<Record<string, ScanItemError>>;
  showMissing: boolean;
  saving: boolean;
  today: CalendarDate;
  onSave: () => void;
  onRestart: () => void;
}

export const ReviewStep: React.FC<ReviewStepProps> = ({
  session,
  drafts,
  onDraftChange,
  errors,
  showMissing,
  saving,
  today,
  onSave,
  onRestart,
}) => {
  const { t } = useTranslation(STATEMENT_SCAN_NAMESPACES);
  const [handledOpen, setHandledOpen] = useState(false);

  const pending = sortForReview(session.items.filter((item) => 'PENDING' === item.status));
  const handled = session.items.filter((item) => 'PENDING' !== item.status);
  const flagged = pending.filter((item) => 0 < item.flags.length);
  const other = pending.filter((item) => 0 === item.flags.length);
  const decided = pending.filter((item) => drafts[item.id]?.decision).length;
  const namesByFingerprint = new Map(
    session.items.map((item) => [item.fingerprint, item.vendor.name] as const),
  );

  const renderList = (id: string, title: string, items: ScanListItem[]) =>
    0 === items.length ? null : (
      <section aria-labelledby={id} className="flex flex-col gap-2">
        <SectionTitle id={id}>{title}</SectionTitle>
        <Card className="p-0">
          <ul className="divide-border flex flex-col divide-y">
            {items.map((item) => (
              <ScanItemRow
                key={item.id}
                item={item}
                draft={drafts[item.id]}
                today={today}
                onDraftChange={(draft) => onDraftChange(item.id, draft)}
                duplicateOfName={
                  item.duplicateOf ? namesByFingerprint.get(item.duplicateOf) : undefined
                }
                error={errors[item.id]}
                showMissing={showMissing}
                disabled={saving}
              />
            ))}
          </ul>
        </Card>
      </section>
    );

  return (
    <div className="flex flex-col gap-5">
      <ReportHeader totals={session.totals} report={session.report} />

      {0 < pending.length ? (
        <p className="text-muted px-1 text-sm">{t('list.hint')}</p>
      ) : (
        <Button variant="ghost" className="min-h-11 w-full rounded-full" onPress={onRestart}>
          {t('done.again')}
        </Button>
      )}

      {renderList('statement-scan-flagged', t('list.heading_flagged'), flagged)}
      {renderList('statement-scan-other', t('list.heading_other'), other)}

      {0 < handled.length ? (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={handledOpen}
            aria-controls="statement-scan-handled"
            onClick={() => setHandledOpen((open) => !open)}
            className="text-muted focus-visible:ring-focus flex min-h-11 items-center justify-between gap-2 rounded-xl px-1 text-xs font-semibold tracking-widest uppercase outline-none focus-visible:ring-2"
          >
            {t('list.handled', { count: handled.length })}
            <ChevronDownIcon
              className={cn('size-4 transition-transform', handledOpen && 'rotate-180')}
              aria-hidden
            />
          </button>
          {handledOpen ? (
            <Card className="p-0">
              <ul id="statement-scan-handled" className="divide-border flex flex-col divide-y">
                {handled.map((item) => (
                  <HandledScanRow key={item.id} item={item} />
                ))}
              </ul>
            </Card>
          ) : null}
        </section>
      ) : null}

      {0 < pending.length ? (
        // Only pins itself once there's something to save, so it never covers the first row.
        <div
          className={cn(
            'flex flex-col gap-1.5',
            0 < decided &&
              'bg-background/95 sticky bottom-[calc(3.25rem+max(env(safe-area-inset-bottom),0.75rem))] z-10 -mx-4 px-4 pt-3 pb-4 backdrop-blur lg:bottom-0',
          )}
        >
          <Button
            className="min-h-12 w-full rounded-full text-base font-semibold"
            isDisabled={0 === decided || saving}
            isPending={saving}
            onPress={onSave}
          >
            {t('list.save', { count: decided })}
          </Button>
          {0 === decided ? (
            <p className="text-muted text-center text-xs">{t('list.save_hint')}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
