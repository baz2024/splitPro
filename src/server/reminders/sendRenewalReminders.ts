import { type PrismaClient } from '@prisma/client';

import { sendPushNotificationToUsers } from '~/server/api/services/notificationService';
import { sendRenewalReminderEmail } from '~/server/mailer';
import { daysUntil, splitKindFromParticipants } from '~/server/subscriptions/helpers';

import { reminderDueFor } from './dueDate';
import { buildReminderMessage, reminderLocale } from './message';

const PAGE_SIZE = 200;

export interface RenewalReminderSummary {
  checked: number;
  due: number;
  pushed: number;
  emailed: number;
  unreached: number;
}

interface Recipient {
  id: number;
  email: string | null;
  preferredLanguage: string;
}

const EMPTY_SUMMARY: RenewalReminderSummary = {
  checked: 0,
  due: 0,
  pushed: 0,
  emailed: 0,
  unreached: 0,
};

const addSummaries = (a: RenewalReminderSummary, b: RenewalReminderSummary) => ({
  checked: a.checked + b.checked,
  due: a.due + b.due,
  pushed: a.pushed + b.pushed,
  emailed: a.emailed + b.emailed,
  unreached: a.unreached + b.unreached,
});

/** Push when the person has a working subscription, otherwise email. */
const notifyRecipient = async (
  recipient: Recipient,
  content: { name: string; amount: bigint; currency: string; days: number },
  split: ReturnType<typeof splitKindFromParticipants>,
  url: string,
): Promise<'pushed' | 'emailed' | 'unreached'> => {
  const locale = reminderLocale(recipient.preferredLanguage);
  const message = buildReminderMessage({ ...content, split, locale });

  const { sentCount } = await sendPushNotificationToUsers([recipient.id], {
    title: message.title,
    message: message.body,
    data: { url },
  });
  if (0 < sentCount) {
    return 'pushed';
  }
  if (!recipient.email) {
    return 'unreached';
  }
  const emailed = await sendRenewalReminderEmail(recipient.email, {
    subject: message.emailSubject,
    line: message.line,
    openLabel: message.emailOpen,
    footer: message.emailFooter,
    dir: 'ar' === locale ? 'rtl' : 'ltr',
  });
  return emailed ? 'emailed' : 'unreached';
};

const remindRecurrence = async (
  db: PrismaClient,
  recurrenceId: number,
  renewal: Date,
  now: Date,
): Promise<RenewalReminderSummary> => {
  const expense = await db.expense.findFirst({
    where: { recurrenceId, deletedBy: null },
    orderBy: { createdAt: 'desc' },
    select: {
      name: true,
      amount: true,
      currency: true,
      paidBy: true,
      expenseParticipants: { select: { userId: true, amount: true } },
    },
  });
  if (!expense) {
    return { ...EMPTY_SUMMARY, checked: 1 };
  }

  // Claim this renewal before sending so overlapping runs never remind twice.
  const claimed = await db.expenseRecurrence.updateMany({
    where: {
      id: recurrenceId,
      remindDaysBefore: { not: null },
      OR: [{ lastReminderSentFor: null }, { lastReminderSentFor: { not: renewal } }],
    },
    data: { lastReminderSentFor: renewal },
  });
  if (0 === claimed.count) {
    return { ...EMPTY_SUMMARY, checked: 1 };
  }

  const userIds = [
    ...new Set([expense.paidBy, ...expense.expenseParticipants.map(({ userId }) => userId)]),
  ];
  const recipients = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, preferredLanguage: true },
  });
  const split = splitKindFromParticipants(expense.expenseParticipants);
  const content = {
    name: expense.name,
    amount: expense.amount,
    currency: expense.currency,
    days: daysUntil(renewal, now),
  };

  const outcomes = await Promise.all(
    recipients.map((recipient) =>
      notifyRecipient(recipient, content, split, '/subscriptions').catch((error: unknown) => {
        console.error('Renewal reminder failed', recurrenceId, recipient.id, error);
        return 'unreached' as const;
      }),
    ),
  );

  return {
    checked: 1,
    due: 1,
    pushed: outcomes.filter((outcome) => 'pushed' === outcome).length,
    emailed: outcomes.filter((outcome) => 'emailed' === outcome).length,
    unreached: outcomes.filter((outcome) => 'unreached' === outcome).length,
  };
};

/**
 * Daily job: remind every participant of subscriptions renewing in exactly `remindDaysBefore`
 * UTC days. Walks recurrences with a reminder in pages, and marks each renewal as reminded
 * (lastReminderSentFor) so re-running the same day sends nothing new.
 */
export const sendRenewalReminders = async (
  db: PrismaClient,
  now: Date = new Date(),
): Promise<RenewalReminderSummary> => {
  const walk = async (cursor: number | undefined): Promise<RenewalReminderSummary> => {
    const page = await db.expenseRecurrence.findMany({
      where: { remindDaysBefore: { not: null } },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(undefined === cursor ? {} : { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        remindDaysBefore: true,
        lastReminderSentFor: true,
        job: { select: { schedule: true } },
      },
    });

    const due = page.flatMap((recurrence) => {
      const renewal = reminderDueFor(
        {
          schedule: recurrence.job.schedule,
          remindDaysBefore: recurrence.remindDaysBefore,
          lastReminderSentFor: recurrence.lastReminderSentFor,
        },
        now,
      );
      return renewal ? [{ id: recurrence.id, renewal }] : [];
    });

    const results = await Promise.all(
      due.map(({ id, renewal }) => remindRecurrence(db, id, renewal, now)),
    );
    const pageSummary = results.reduce(addSummaries, {
      ...EMPTY_SUMMARY,
      checked: page.length - due.length,
    });

    const last = page.at(-1);
    if (PAGE_SIZE > page.length || !last) {
      return pageSummary;
    }
    return addSummaries(pageSummary, await walk(last.id));
  };

  return walk(undefined);
};
