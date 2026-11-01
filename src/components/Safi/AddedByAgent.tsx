import { Bot } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { cn } from '~/lib/utils';

export interface ReportingApiKey {
  name: string;
  agentLabel: string | null;
}

/** The agent's label, else the key name, without a trailing "agent" the copy already adds. */
export const agentDisplayName = (apiKey: ReportingApiKey) =>
  (apiKey.agentLabel?.trim() || apiKey.name.trim()).replace(/\s+agent$/i, '');

/**
 * Marks an expense reported through an agent API key: "Added by Growth agent". `compact` shows
 * only the bot icon (with the full text as its accessible name) for tight list rows.
 */
export const AddedByAgent: React.FC<{
  apiKey?: ReportingApiKey | null;
  compact?: boolean;
  className?: string;
}> = ({ apiKey, compact = false, className }) => {
  const { t } = useTranslation('common');

  if (!apiKey) {
    return null;
  }

  const label = t('audit_d.agent.added_by', { name: agentDisplayName(apiKey) });

  if (compact) {
    return (
      <span
        role="img"
        title={label}
        aria-label={label}
        className={cn(
          'bg-accent/15 text-accent inline-flex size-5 shrink-0 items-center justify-center rounded-full',
          className,
        )}
      >
        <Bot className="size-3" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'text-muted inline-flex max-w-full min-w-0 items-center gap-1 text-xs',
        className,
      )}
    >
      <Bot className="text-accent size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
};
