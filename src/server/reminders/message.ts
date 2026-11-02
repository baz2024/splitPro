import { IntlMessageFormat } from 'intl-messageformat';

import { type SplitKind } from '~/server/subscriptions/helpers';
import { getCurrencyHelpers } from '~/utils/numbers';

import arMessages from '../../../public/locales/ar/reminders.json';
import enMessages from '../../../public/locales/en/reminders.json';

type NotificationMessages = typeof enMessages.notification;

const MESSAGES = {
  en: enMessages.notification,
  ar: arMessages.notification,
} as const satisfies Record<string, NotificationMessages>;

export type ReminderLocale = keyof typeof MESSAGES;

/** Reminders are translated into English and Arabic; every other language falls back to English. */
export const reminderLocale = (preferredLanguage: string | null | undefined): ReminderLocale =>
  'ar' === preferredLanguage?.split('-')[0] ? 'ar' : 'en';

const format = (
  locale: ReminderLocale,
  key: keyof NotificationMessages,
  values: Record<string, string | number>,
): string => {
  const result = new IntlMessageFormat(MESSAGES[locale][key], locale).format(values);
  return 'string' === typeof result ? result : String(result);
};

export interface ReminderMessageInput {
  name: string;
  amount: bigint;
  currency: string;
  days: number;
  split: SplitKind;
  locale: ReminderLocale;
}

export interface ReminderMessage {
  title: string;
  body: string;
  /** "Vercel Pro renews in 3 days — $20 · split 2 ways" */
  line: string;
  emailSubject: string;
  emailOpen: string;
  emailFooter: string;
}

export const buildReminderMessage = ({
  name,
  amount,
  currency,
  days,
  split,
  locale,
}: ReminderMessageInput): ReminderMessage => {
  const formattedAmount = getCurrencyHelpers({ currency, locale }).toUIString(amount);
  const body =
    'split' === split.kind
      ? format(locale, 'amount_split', { amount: formattedAmount, ways: split.ways })
      : format(locale, 'amount_personal', { amount: formattedAmount });

  return {
    title: format(locale, 'title', { name, days }),
    body,
    line: format(locale, 'line', { name, days, details: body }),
    emailSubject: format(locale, 'email_subject', { name }),
    emailOpen: format(locale, 'email_open', {}),
    emailFooter: format(locale, 'email_footer', {}),
  };
};
