import { CircleAlertIcon, PencilIcon } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';

import { ChoiceChips, SELECT_CLASS } from '~/components/DataIO/ui';
import { isolateLtr } from '~/components/Project/format';
import { ServiceBadge } from '~/components/Safi/ServiceBadge';
import { cn } from '~/lib/utils';
import { type CalendarDate } from '~/server/dataio/dates';
import { type ScanCadence, type ScanDecision } from '~/server/statementScan/types';
import { getCurrencyHelpers } from '~/utils/numbers';

import { DecisionChips } from './DecisionChips';
import {
  SOON_DAYS,
  badgeService,
  daysBetween,
  effectiveAmount,
  formatDay,
  formatMonthYear,
  itemName,
  moneyText,
  needsAmount,
  resellerName,
} from './format';
import {
  STATEMENT_SCAN_NAMESPACES,
  type ScanDraft,
  type ScanItemError,
  type ScanListItem,
} from './types';

const CADENCES = ['weekly', 'monthly', 'yearly'] as const satisfies readonly ScanCadence[];

type Translate = ReturnType<typeof useTranslation>['t'];

/** "$96/yr", "$20/mo", or the bare amount when the cadence isn't known yet (trials). */
export const priceLabel = (
  t: Translate,
  locale: string,
  amount: bigint,
  currency: string,
  cadence: ScanCadence | null,
) => {
  if (0n >= amount) {
    return t('item.price_unknown');
  }
  const text = isolateLtr(moneyText({ amount, currency, locale, whole: true }));
  return null === cadence ? text : t(`item.per_${cadence}`, { amount: text });
};

const renewalLabel = (
  t: Translate,
  locale: string,
  item: ScanListItem,
  today: CalendarDate,
): string | null => {
  if (!item.nextRenewal) {
    return null;
  }
  const days = daysBetween(today, item.nextRenewal);
  const date = isolateLtr(formatDay(item.nextRenewal, locale, today));
  if (item.flags.includes('trial')) {
    if (0 > days) {
      return null;
    }
    return SOON_DAYS >= days ? t('item.trial_ends', { days }) : t('item.trial_ends_on', { date });
  }
  if (0 > days) {
    return null;
  }
  return SOON_DAYS >= days ? t('item.renews_in', { days }) : t('item.renews_on', { date });
};

interface ScanItemRowProps {
  item: ScanListItem;
  draft: ScanDraft | undefined;
  today: CalendarDate;
  onDraftChange: (draft: ScanDraft) => void;
  /** Display name of the stream this one duplicates, when flagged as a duplicate. */
  duplicateOfName?: string;
  /** Error returned by the server for this item on the last save. */
  error?: ScanItemError;
  /** Set after a save attempt, so missing trial prices show as errors. */
  showMissing?: boolean;
  disabled?: boolean;
}

export const ScanItemRow: React.FC<ScanItemRowProps> = ({
  item,
  draft,
  today,
  onDraftChange,
  duplicateOfName,
  error,
  showMissing = false,
  disabled = false,
}) => {
  const { t, i18n } = useTranslation(STATEMENT_SCAN_NAMESPACES);
  const locale = i18n.language;
  const helpers = getCurrencyHelpers({ currency: item.currency, locale });
  const priceMissing = 0n >= item.amountMinor;
  const [editing, setEditing] = useState(false);
  const [amountText, setAmountText] = useState(() =>
    priceMissing ? '' : helpers.toUIString(item.amountMinor, false, true),
  );

  const name = itemName(item, draft);
  const amount = effectiveAmount(item, draft);
  const cadence = draft?.cadence ?? item.cadence;
  const decision = draft?.decision ?? null;
  const showFields = editing || priceMissing;
  const missing = showMissing && needsAmount(item, draft);
  const errorCode: ScanItemError | undefined = missing ? 'amount_required' : error;
  const idBase = `scan-item-${item.id}`;

  const update = (patch: Partial<ScanDraft>) => onDraftChange({ decision, ...draft, ...patch });

  const renewal = renewalLabel(t, locale, item, today);
  const renewalIsWarning = item.flags.includes('trial') || item.flags.includes('annual_soon');
  const facts = [
    item.vendor.via ? t('item.via', { name: resellerName(item.vendor.via) }) : null,
    t('item.since', { date: isolateLtr(formatMonthYear(item.firstSeen, locale)) }),
    renewal,
  ].filter((fact): fact is string => null !== fact);

  // The highlighted renewal line already says "Trial ends in 8 days" or "Renews 14 Dec".
  const chipFlags = item.flags.filter(
    (flag) => null === renewal || ('trial' !== flag && 'annual_soon' !== flag),
  );
  const flagLabels = chipFlags.map((flag) => {
    if ('duplicate' === flag) {
      if (!duplicateOfName) {
        return t('item.flag_duplicate');
      }
      // Two ChatGPT rows: "Duplicate of ChatGPT" on a row called ChatGPT says nothing.
      return duplicateOfName === item.vendor.name
        ? t('item.flag_duplicate_same', { name: duplicateOfName })
        : t('item.flag_duplicate_of', { name: duplicateOfName });
    }
    if ('price_rise' === flag && null !== item.previousAmountMinor) {
      return t('item.flag_price_rise', {
        from: isolateLtr(
          moneyText({ amount: item.previousAmountMinor, currency: item.currency, locale }),
        ),
        to: isolateLtr(moneyText({ amount: item.amountMinor, currency: item.currency, locale })),
      });
    }
    return t(`item.flag_${flag}`);
  });

  const onAmountChange = (text: string) => {
    setAmountText(text);
    const parsed = '' === text.trim() ? 0n : helpers.toSafeBigInt(text);
    update({
      amountMinor: 0n > parsed ? -parsed : parsed,
      // A trial has no billing cycle yet; save the one shown in the picker.
      ...(null === item.cadence && !draft?.cadence ? { cadence: 'monthly' as const } : {}),
    });
  };

  return (
    <li
      className="flex flex-col gap-3 px-3.5 py-3.5"
      aria-labelledby={`${idBase}-name`}
      data-testid="scan-item"
    >
      <div className="flex items-start gap-3">
        <ServiceBadge service={badgeService(item)} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <p
              id={`${idBase}-name`}
              className="text-foreground min-w-0 truncate text-sm font-semibold"
              dir="auto"
            >
              {name}
            </p>
            <p
              className={cn(
                'shrink-0 text-sm font-semibold whitespace-nowrap tabular-nums',
                0n >= amount ? 'text-muted font-normal' : 'text-foreground',
              )}
            >
              {priceLabel(t, locale, amount, item.currency, cadence)}
            </p>
          </div>
          <p className="text-muted flex min-w-0 flex-wrap gap-x-1 text-xs">
            {facts.map((fact, index) => (
              <span
                key={fact}
                className={cn(
                  'whitespace-nowrap',
                  fact === renewal && renewalIsWarning && 'text-warning',
                )}
              >
                {fact}
                {index < facts.length - 1 ? ' ·' : null}
              </span>
            ))}
          </p>
          {0 < flagLabels.length || 'low' === item.confidence ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {flagLabels.map((label) => (
                <span
                  key={label}
                  className="bg-warning/15 text-warning inline-flex min-h-6 items-center rounded-full px-2 text-[11px] font-semibold"
                >
                  {label}
                </span>
              ))}
              {'low' === item.confidence ? (
                <span className="text-muted inline-flex items-center gap-1 text-xs">
                  <CircleAlertIcon className="size-3.5" aria-hidden />
                  {t('item.check')}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative">
        <DecisionChips
          label={t('item.decision_label', { name })}
          value={decision}
          disabled={disabled}
          onChange={(next: ScanDecision) => update({ decision: next })}
        />
        {/* Shares the line of the quieter last chip, to keep long lists scannable. */}
        <button
          type="button"
          aria-expanded={editing}
          aria-label={editing ? undefined : t('item.edit_label', { name })}
          disabled={disabled}
          onClick={() => setEditing((open) => !open)}
          className="text-accent focus-visible:ring-focus absolute end-0 bottom-0 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-xs font-semibold outline-none focus-visible:ring-2 disabled:opacity-50"
        >
          <PencilIcon className="size-3.5" aria-hidden />
          {editing ? t('item.done_editing') : t('item.edit')}
        </button>
      </div>
      {decision ? (
        <p className="text-muted -mt-1 text-xs" aria-live="polite">
          {t(`item.decision_hint.${decision}`)}
        </p>
      ) : null}

      {errorCode ? (
        <p
          id={`${idBase}-error`}
          role="alert"
          className="text-danger flex min-w-0 items-center gap-1.5 text-xs"
        >
          <CircleAlertIcon className="size-3.5 shrink-0" aria-hidden />
          {t(`item.errors.${errorCode}`)}
        </p>
      ) : null}

      {showFields ? (
        <div className="bg-background flex flex-col gap-3 rounded-2xl p-3">
          {item.rawDescriptions[0] ? (
            <p className="text-muted truncate text-xs" dir="auto">
              {t('item.seen_as', { text: item.rawDescriptions[0] })}
            </p>
          ) : null}
          {editing ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${idBase}-name-input`} className="text-muted text-xs font-medium">
                {t('item.name')}
              </label>
              <input
                id={`${idBase}-name-input`}
                type="text"
                dir="auto"
                maxLength={100}
                value={draft?.name ?? item.vendor.name}
                disabled={disabled}
                onChange={(event) => update({ name: event.target.value })}
                className={SELECT_CLASS}
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${idBase}-amount`} className="text-muted text-xs font-medium">
              {priceMissing ? t('item.amount_trial') : t('item.amount')} · {item.currency}
            </label>
            <input
              id={`${idBase}-amount`}
              type="text"
              inputMode="decimal"
              dir="ltr"
              autoComplete="off"
              value={amountText}
              disabled={disabled}
              aria-invalid={'amount_required' === errorCode}
              aria-describedby={errorCode ? `${idBase}-error` : undefined}
              onChange={(event) => onAmountChange(event.target.value)}
              className={cn(
                SELECT_CLASS,
                'text-start tabular-nums',
                'amount_required' === errorCode && 'border-danger',
              )}
            />
          </div>
          <ChoiceChips
            label={t('item.cadence')}
            value={cadence ?? 'monthly'}
            onChange={(next) => update({ cadence: next })}
            options={CADENCES.map((value) => ({ value, label: t(`item.cadence_${value}`) }))}
          />
        </div>
      ) : null}
    </li>
  );
};

/** Compact row for items already saved or hidden in an earlier review. */
export const HandledScanRow: React.FC<{ item: ScanListItem }> = ({ item }) => {
  const { t, i18n } = useTranslation(STATEMENT_SCAN_NAMESPACES);
  return (
    <li className="flex min-h-14 items-center gap-3 px-3.5 py-2.5">
      <ServiceBadge service={badgeService(item)} size="sm" />
      <span className="text-foreground min-w-0 flex-1 truncate text-sm" dir="auto">
        {item.vendor.name}
      </span>
      <span className="text-muted shrink-0 text-xs tabular-nums">
        {priceLabel(t, i18n.language, item.amountMinor, item.currency, item.cadence)}
      </span>
      <span
        className={cn(
          'shrink-0 text-xs font-medium',
          'ADDED' === item.status ? 'text-positive' : 'text-muted',
        )}
      >
        {'ADDED' === item.status ? t('item.status_added') : t('item.status_dismissed')}
      </span>
    </li>
  );
};
