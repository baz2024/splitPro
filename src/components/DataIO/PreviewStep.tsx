import { Button } from '@heroui/react';
import { clsx } from 'clsx';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';

import { CATEGORIES, type CategorySection } from '~/lib/category';
import { type PreviewRow } from '~/server/dataio/types';

import { ChoiceChips, DATAIO_NAMESPACES } from './ui';

const PAGE_SIZE = 100;
const SECTIONS = Object.keys(CATEGORIES).filter((key): key is CategorySection =>
  Object.hasOwn(CATEGORIES, key),
);

type PreviewFilter = 'all' | 'ready' | 'duplicates' | 'problems';

const matchesFilter = (row: PreviewRow, filter: PreviewFilter) => {
  switch (filter) {
    case 'ready':
      return 'ok' === row.status && null === row.duplicate;
    case 'duplicates':
      return null !== row.duplicate;
    case 'problems':
      return 'ok' !== row.status;
    default:
      return true;
  }
};

interface PreviewStepProps {
  rows: PreviewRow[];
  selected: Set<number>;
  onSelectedChange: (selected: Set<number>) => void;
  onBack: () => void;
  onImport: () => void;
  isPending: boolean;
}

export const PreviewStep: React.FC<PreviewStepProps> = ({
  rows,
  selected,
  onSelectedChange,
  onBack,
  onImport,
  isPending,
}) => {
  const { t } = useTranslation(DATAIO_NAMESPACES);
  const [filter, setFilter] = useState<PreviewFilter>('all');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const ready = rows.filter((row) => 'ok' === row.status && null === row.duplicate).length;
  const duplicates = rows.filter((row) => null !== row.duplicate).length;
  const problems = rows.filter((row) => 'ok' !== row.status).length;
  const filtered = rows.filter((row) => matchesFilter(row, filter));

  const toggle = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    onSelectedChange(next);
  };

  const categoryName = (key: string) => {
    if (Object.hasOwn(CATEGORIES, key)) {
      return t(`categories_list.${key}.items.other`, { ns: 'categories' });
    }
    const section = SECTIONS.find((entry) =>
      (CATEGORIES[entry] as readonly string[]).includes(key),
    );
    return section ? t(`categories_list.${section}.items.${key}`, { ns: 'categories' }) : key;
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted text-sm" aria-live="polite">
        {t('import.preview_summary', { ready, duplicates, problems })}
      </p>

      <ChoiceChips
        label={t('import.status')}
        value={filter}
        onChange={(next) => {
          setFilter(next);
          setVisible(PAGE_SIZE);
        }}
        options={[
          { value: 'all', label: t('import.filter_all', { count: rows.length }) },
          { value: 'ready', label: t('import.filter_ready', { count: ready }) },
          { value: 'duplicates', label: t('import.filter_duplicates', { count: duplicates }) },
          { value: 'problems', label: t('import.filter_problems', { count: problems }) },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            onSelectedChange(
              new Set(
                rows
                  .filter((row) => 'ok' === row.status && null === row.duplicate)
                  .map((row) => row.index),
              ),
            )
          }
          className="text-accent focus-visible:ring-focus min-h-11 rounded-lg px-2 text-sm font-semibold outline-none focus-visible:ring-2"
        >
          {t('import.select_all')}
        </button>
        <button
          type="button"
          onClick={() => onSelectedChange(new Set())}
          className="text-muted hover:text-foreground focus-visible:ring-focus min-h-11 rounded-lg px-2 text-sm font-semibold outline-none focus-visible:ring-2"
        >
          {t('import.select_none')}
        </button>
      </div>

      <ul className="border-border divide-border flex flex-col divide-y overflow-hidden rounded-2xl border">
        {filtered.slice(0, visible).map((row) => {
          const importable = 'ok' === row.status;
          const checked = importable && selected.has(row.index);
          const id = `dataio-row-${row.index}`;
          return (
            <li
              key={row.index}
              className={clsx('flex gap-3 px-3 py-3', !importable && 'opacity-80')}
            >
              <input
                id={id}
                type="checkbox"
                className="accent-accent mt-0.5 size-5 shrink-0"
                checked={checked}
                disabled={!importable}
                onChange={() => toggle(row.index)}
                aria-label={`${t('import.include')}: ${t('import.line', { line: row.line })}`}
              />
              <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-foreground truncate text-sm font-medium" dir="auto">
                    {row.description || '—'}
                  </span>
                  <span
                    className="text-foreground shrink-0 text-sm font-semibold tabular-nums"
                    dir="ltr"
                  >
                    {row.amount ?? '—'} {row.currency}
                  </span>
                </span>
                <span className="text-muted flex flex-wrap gap-x-2 text-xs">
                  <span>{t('import.line', { line: row.line })}</span>
                  <span dir="ltr">{row.date ?? '—'}</span>
                  <span>{categoryName(row.category)}</span>
                </span>
                {0 < row.issues.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {row.issues.map((issue) => (
                      <span
                        key={issue}
                        className={clsx(
                          'rounded-full px-2 py-0.5 text-[11px] font-medium',
                          'error' === row.status
                            ? 'bg-danger/15 text-danger'
                            : 'bg-warning/15 text-warning',
                        )}
                      >
                        {t(`import.issues.${issue}`)}
                      </span>
                    ))}
                  </span>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>

      {visible < filtered.length ? (
        <button
          type="button"
          onClick={() => setVisible((count) => count + PAGE_SIZE)}
          className="text-accent focus-visible:ring-focus min-h-11 rounded-lg text-sm font-semibold outline-none focus-visible:ring-2"
        >
          {t('import.show_more', { count: Math.min(PAGE_SIZE, filtered.length - visible) })}
        </button>
      ) : null}

      <div className="flex gap-2">
        <Button variant="ghost" className="min-h-11 rounded-full" onPress={onBack}>
          {t('import.back_step')}
        </Button>
        <Button
          className="min-h-11 flex-1 rounded-full"
          isDisabled={0 === selected.size || isPending}
          isPending={isPending}
          onPress={onImport}
        >
          {isPending ? t('import.importing') : t('import.import_button', { count: selected.size })}
        </Button>
      </div>
    </div>
  );
};
