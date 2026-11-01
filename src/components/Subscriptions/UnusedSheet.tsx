import React from 'react';

import { AppDrawer } from '~/components/ui/drawer';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';

import { type SubscriptionsOverview } from './types';
import { UNUSED_NAMESPACES, UnusedRow } from './UnusedRow';

interface UnusedSheetProps {
  overview: SubscriptionsOverview;
}

/**
 * "N unused 30+ days" link for the run-rate card. Opens a sheet listing those subscriptions.
 * Renders nothing when no subscription is unused.
 */
export const UnusedSheet: React.FC<UnusedSheetProps> = ({ overview }) => {
  const { t } = useTranslationWithUtils(UNUSED_NAMESPACES);
  const unused = overview.items.filter((item) => item.unused);

  if (0 === unused.length) {
    return null;
  }

  return (
    <AppDrawer
      title={t('sheet.title')}
      className="max-h-[85vh]"
      trigger={
        <button
          type="button"
          className="text-warning focus-visible:ring-focus min-h-6 rounded text-end text-xs font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {t('summary', { count: unused.length })}
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-muted text-sm">{t('sheet.explainer')}</p>
        <ul className="border-border bg-surface divide-border divide-y overflow-hidden rounded-[20px] border">
          {unused.map((item) => (
            <UnusedRow key={item.recurrenceId} item={item} />
          ))}
        </ul>
      </div>
    </AppDrawer>
  );
};
