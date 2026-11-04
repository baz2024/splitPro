import { Button } from '@heroui/react';
import { CheckCircle2Icon } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { toCsv } from '~/server/dataio/csv';
import { type ImportOutcomeRow, type ImportResult } from '~/server/dataio/types';

import { saveText } from './transfer';
import { DATAIO_NAMESPACES } from './ui';

const SHOWN_ISSUES = 10;

export const ResultStep: React.FC<{ result: ImportResult; onRestart: () => void }> = ({
  result,
  onRestart,
}) => {
  const { t } = useTranslation(DATAIO_NAMESPACES);
  const issues = [
    ...result.failed.map((row) => ({ ...row, outcome: 'failed' as const })),
    ...result.skipped.map((row) => ({ ...row, outcome: 'skipped' as const })),
  ].sort((a, b) => a.line - b.line);

  const reasonText = (row: ImportOutcomeRow) => t(`import.issues.${row.reason}`);

  const downloadReport = () => {
    const csv = toCsv([
      [
        t('import.report_columns.line'),
        t('import.report_columns.description'),
        t('import.report_columns.outcome'),
        t('import.report_columns.reason'),
      ],
      ...issues.map((row) => [
        { numeric: String(row.line) },
        row.description,
        t(`import.outcome_${row.outcome}`),
        reasonText(row),
      ]),
    ]);
    saveText(csv, 'safi-import-report.csv', 'text/csv;charset=utf-8').catch(console.error);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <CheckCircle2Icon className="text-success size-8 shrink-0" aria-hidden />
        <div className="flex flex-col">
          <p className="text-foreground text-base font-semibold" role="status">
            {t('import.result_imported', { count: result.imported })}
          </p>
          <p className="text-muted text-sm">
            {t('import.result_skipped', { count: result.skipped.length })} ·{' '}
            {t('import.result_failed', { count: result.failed.length })}
          </p>
        </div>
      </div>

      {0 < issues.length ? (
        <>
          <ul className="border-border divide-border flex flex-col divide-y overflow-hidden rounded-2xl border">
            {issues.slice(0, SHOWN_ISSUES).map((row) => (
              <li key={`${row.outcome}-${row.line}`} className="flex flex-col gap-0.5 px-3 py-2.5">
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-foreground truncate" dir="auto">
                    {row.description || t('import.line', { line: row.line })}
                  </span>
                  <span className="text-muted shrink-0 text-xs">
                    {t('import.line', { line: row.line })}
                  </span>
                </span>
                <span
                  className={
                    'failed' === row.outcome ? 'text-danger text-xs' : 'text-muted text-xs'
                  }
                >
                  {t(`import.outcome_${row.outcome}`)} · {reasonText(row)}
                </span>
              </li>
            ))}
          </ul>
          {SHOWN_ISSUES < issues.length ? (
            <p className="text-muted text-xs">
              {t('import.more_issues', { count: issues.length - SHOWN_ISSUES })}
            </p>
          ) : null}
          <Button variant="secondary" className="min-h-11 rounded-full" onPress={downloadReport}>
            {t('import.download_errors')}
          </Button>
        </>
      ) : null}

      <div className="flex gap-2">
        <Button variant="ghost" className="min-h-11 rounded-full" onPress={onRestart}>
          {t('import.another')}
        </Button>
        <Link
          href="/balances"
          className="bg-accent text-accent-foreground focus-visible:ring-focus focus-visible:ring-offset-background flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {t('import.view_balances')}
        </Link>
      </div>
    </div>
  );
};
