import { clsx } from 'clsx';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { SUBSCRIPTIONS_NAMESPACES } from './types';

export const SUBSCRIPTION_FILTERS = ['upcoming', 'by_cycle', 'usage'] as const;
export type SubscriptionFilter = (typeof SUBSCRIPTION_FILTERS)[number];
export const SUBSCRIPTIONS_PANEL_ID = 'subscriptions-panel';

interface FilterChipsProps {
  value: SubscriptionFilter;
  onChange: (value: SubscriptionFilter) => void;
}

/** Pill chip group (Upcoming / By cycle / Usage-based) with tab semantics and arrow-key support. */
export const FilterChips: React.FC<FilterChipsProps> = ({ value, onChange }) => {
  const { t } = useTranslation(SUBSCRIPTIONS_NAMESPACES);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const isRtl = 'rtl' === getComputedStyle(event.currentTarget).direction;
    const forward = isRtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = isRtl ? 'ArrowRight' : 'ArrowLeft';
    if (forward !== event.key && backward !== event.key) {
      return;
    }
    event.preventDefault();
    const index = SUBSCRIPTION_FILTERS.indexOf(value);
    const step = forward === event.key ? 1 : -1;
    const next =
      SUBSCRIPTION_FILTERS[
        (index + step + SUBSCRIPTION_FILTERS.length) % SUBSCRIPTION_FILTERS.length
      ] ?? value;
    onChange(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-filter="${next}"]`)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={t('tabs.label')}
      onKeyDown={handleKeyDown}
      className="flex gap-2 overflow-x-auto"
    >
      {SUBSCRIPTION_FILTERS.map((filter) => {
        const selected = filter === value;
        return (
          <button
            key={filter}
            type="button"
            role="tab"
            id={`subscriptions-tab-${filter}`}
            aria-controls={SUBSCRIPTIONS_PANEL_ID}
            data-filter={filter}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(filter)}
            className={clsx(
              'focus-visible:ring-focus focus-visible:ring-offset-background min-h-11 shrink-0 rounded-full px-4 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
              selected
                ? 'bg-foreground text-background'
                : 'border-border text-muted hover:text-foreground border bg-transparent',
            )}
          >
            {t(`tabs.${filter}`)}
          </button>
        );
      })}
    </div>
  );
};
