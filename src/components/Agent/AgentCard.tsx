import { Button, Chip } from '@heroui/react';
import { Bot, Gauge, Pause, Pencil, Play, Settings2, Trash2 } from 'lucide-react';
import React from 'react';
import { toast } from 'sonner';

import { Money, type MoneyTone } from '~/components/Safi/Money';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { capTone, maskApiKey, relativeTimeParts } from '~/lib/agentControls';
import { cn } from '~/lib/utils';
import { type AgentSpend } from '~/server/agent/caps';
import { type RouterOutputs, api } from '~/utils/api';

import { AgentKeySheet } from './AgentKeySheet';
import { AgentQuickEditSheet } from './AgentQuickEditSheet';

export type AgentKeyListItem = RouterOutputs['agent']['listApiKeys'][number];

const BAR_TONE = {
  none: 'bg-default',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

const TEXT_TONE = {
  none: 'text-muted',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

/** Cap status as a Money tone: green under the cap, amber near it, red over it. */
const MONEY_TONE = {
  none: 'neutral',
  success: 'owed',
  warning: 'warn',
  danger: 'owe',
} as const satisfies Record<keyof typeof TEXT_TONE, MoneyTone>;

const ACTION =
  'bg-default text-foreground focus-visible:ring-focus inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none';

interface AgentCardProps {
  apiKey: AgentKeyListItem;
  /** This month's spend + cap status; undefined while usage loads. */
  spend?: AgentSpend;
  now: Date;
  onRevoke: (id: string) => void;
}

/**
 * One agent key as an object you control, like a card in a banking app: name, model, masked
 * key, last report, this month's spend against its cap, then Pause / Edit cap / Rename.
 */
export const AgentCard: React.FC<AgentCardProps> = ({ apiKey, spend, now, onRevoke }) => {
  const { t, i18n, getCurrencyHelpersCached } = useTranslationWithUtils(['agentcaps']);
  const utils = api.useUtils();
  const pauseMutation = api.agent.setApiKeyPaused.useMutation();

  const label = apiKey.agentLabel?.trim() || apiKey.name;
  const paused = null !== apiKey.pausedAt;
  const currency = spend?.currency ?? apiKey.capCurrency ?? 'USD';
  const { toUIString } = getCurrencyHelpersCached(currency);
  const monthToDate = spend?.monthToDate ?? 0n;
  const cap = spend ? spend.cap : apiKey.capCurrency ? apiKey.monthlyCapAmount : null;
  const percent = spend?.percent ?? 0;
  // A paused agent can't spend, so its cap status stays muted instead of looking healthy.
  const tone = paused ? 'none' : capTone({ percent, hasCap: null !== cap });
  const width = Math.min(Math.max(percent, 0), 100);

  const relative = (date: Date) => {
    const parts = relativeTimeParts(date, now);
    if (!parts) {
      return t('relative.now');
    }
    return new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto', style: 'short' }).format(
      -parts.value,
      parts.unit,
    );
  };

  const lastReport = apiKey.lastReportAt ?? apiKey.lastUsedAt;

  const togglePause = () => {
    pauseMutation.mutate(
      { id: apiKey.id, paused: !paused },
      {
        onSuccess: () => {
          toast.success(t(paused ? 'card.resumed_toast' : 'card.paused_toast', { name: label }));
          Promise.all([utils.agent.listApiKeys.invalidate(), utils.agent.usage.invalidate()]).catch(
            console.error,
          );
        },
        onError: (error) => {
          toast.error(error.message || t('card.pause_failed'));
        },
      },
    );
  };

  const meterLabel =
    null === cap
      ? undefined
      : t('spent_by.cap_bar_label', {
          spent: toUIString(monthToDate),
          cap: toUIString(cap),
          percent,
        });

  return (
    <li
      className={cn(
        'bg-surface border-border flex flex-col gap-3 rounded-[20px] border p-4',
        paused && 'border-dashed',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-10 shrink-0 items-center justify-center rounded-xl',
            paused ? 'bg-default text-muted' : 'bg-accent/15 text-accent',
          )}
        >
          <Bot className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold">{label}</h3>
            {paused && (
              <Chip size="sm" color="warning" variant="soft">
                {t('card.paused')}
              </Chip>
            )}
          </div>
          <p className="text-muted truncate text-xs">
            <span dir="ltr">{apiKey.model ?? t('card.model_none')}</span>
            {' · '}
            <code dir="ltr" className="font-mono">
              {maskApiKey(apiKey.prefix, apiKey.lastFour)}
            </code>
          </p>
          <p className="text-muted text-xs">
            {lastReport
              ? t('card.last_report', { time: relative(lastReport) })
              : t('card.never_reported')}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-1.5">
            <Money
              amount={monthToDate}
              currency={currency}
              tone={MONEY_TONE[tone]}
              className="text-xl font-bold tracking-tight"
            />
            <span className="text-muted text-xs">{t('card.this_month')}</span>
          </span>
          <span className={cn('text-xs font-medium', TEXT_TONE[tone])}>
            {null === cap
              ? t('card.no_cap')
              : `${percent}% ${t('card.of_cap', { cap: toUIString(cap) })}`}
          </span>
        </div>
        {null !== cap && (
          <div
            role="meter"
            aria-label={meterLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={width}
            className="bg-default h-2 w-full overflow-hidden rounded-full"
          >
            <div
              className={cn(
                'h-2 rounded-full transition-[width]',
                paused ? 'bg-muted/50' : BAR_TONE[tone],
              )}
              style={{ width: `${width}%` }}
            />
          </div>
        )}
        {0 < apiKey.allowList.length && (
          <p dir="auto" className="text-muted truncate text-xs">
            {t('card.allow_list', { entries: apiKey.allowList.join(', ') })}
          </p>
        )}
        {paused && <p className="text-warning text-xs">{t('audit_g.paused_note')}</p>}
      </div>

      {/* Same two rows on every card: three main actions, then settings and revoke. */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className={ACTION}
          onClick={togglePause}
          disabled={pauseMutation.isPending}
          aria-label={`${t(paused ? 'card.resume' : 'card.pause')}: ${label}`}
        >
          {paused ? (
            <Play className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <Pause className="size-3.5 shrink-0" aria-hidden />
          )}
          <span className="truncate">{t(paused ? 'card.resume' : 'card.pause')}</span>
        </button>
        <AgentQuickEditSheet
          apiKey={apiKey}
          mode="cap"
          fallbackCurrency={spend?.currency}
          trigger={
            <button type="button" className={ACTION}>
              <Gauge className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{t('card.edit_cap')}</span>
            </button>
          }
        />
        <AgentQuickEditSheet
          apiKey={apiKey}
          mode="rename"
          trigger={
            <button type="button" className={ACTION}>
              <Pencil className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{t('card.rename')}</span>
            </button>
          }
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <AgentKeySheet
          apiKey={apiKey}
          fallbackCurrency={spend?.currency}
          trigger={
            <button
              type="button"
              aria-label={`${t('card.settings')}: ${label}`}
              className={cn(ACTION, 'w-11 px-0')}
            >
              <Settings2 className="size-4" aria-hidden />
            </button>
          }
        />
        <Button
          size="sm"
          variant="danger-soft"
          isIconOnly
          className="size-11 rounded-xl"
          aria-label={`${t('card.revoke')}: ${label}`}
          onPress={() => onRevoke(apiKey.id)}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
};
