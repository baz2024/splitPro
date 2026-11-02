import { Button } from '@heroui/react';
import { BellIcon, CircleCheckIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { Card } from '~/components/DataIO/ui';
import { isolateLtr } from '~/components/Project/format';

import { formatDay, todayCalendar } from './format';
import { STATEMENT_SCAN_NAMESPACES, type ScanOutcome } from './types';

interface DoneStepProps {
  outcome: ScanOutcome;
  onRestart: () => void;
}

export const DoneStep: React.FC<DoneStepProps> = ({ outcome, onRestart }) => {
  const { t, i18n } = useTranslation(STATEMENT_SCAN_NAMESPACES);
  const today = todayCalendar();

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <CircleCheckIcon className="text-positive size-10" aria-hidden />
        <h2 className="text-foreground text-lg font-semibold">{t('done.title')}</h2>
        <p className="text-muted text-sm" role="status">
          {t('done.summary', { saved: outcome.saved, reminders: outcome.reminders.length })}
        </p>
        {0 < outcome.dismissed ? (
          <p className="text-muted text-xs">{t('done.hidden', { count: outcome.dismissed })}</p>
        ) : null}
      </div>

      {0 < outcome.reminders.length ? (
        <section aria-labelledby="statement-scan-reminders" className="flex flex-col gap-2">
          <h3
            id="statement-scan-reminders"
            className="text-muted px-1 text-xs font-semibold tracking-widest uppercase"
          >
            {t('done.reminders_heading')}
          </h3>
          <ul className="bg-background divide-border flex flex-col divide-y rounded-2xl">
            {outcome.reminders.map((reminder) => (
              <li key={reminder.id} className="flex min-h-12 items-center gap-3 px-3 py-2.5">
                <BellIcon className="text-accent size-4 shrink-0" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="text-foreground truncate text-sm font-medium" dir="auto">
                    {reminder.name}
                  </span>
                  <span className="text-muted text-xs">
                    {reminder.date
                      ? t('done.reminder', {
                          days: reminder.daysBefore,
                          date: isolateLtr(formatDay(reminder.date, i18n.language, today)),
                        })
                      : t('done.reminder_each', { days: reminder.daysBefore })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/subscriptions"
          className="bg-accent text-accent-foreground focus-visible:ring-focus focus-visible:ring-offset-surface inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {t('done.go')}
        </Link>
        <Button variant="ghost" className="min-h-11 w-full flex-1 rounded-full" onPress={onRestart}>
          {t('done.again')}
        </Button>
      </div>
    </Card>
  );
};
