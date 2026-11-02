import { SplitType } from '@prisma/client';
import { type User } from 'next-auth';
import Head from 'next/head';
import Link from 'next/link';
import MainLayout from '~/components/Layout/MainLayout';
import { isolateLtr } from '~/components/Project/format';
import { AddedByAgent } from '~/components/Safi/AddedByAgent';
import { EntityAvatar } from '~/components/ui/avatar';
import { type NextPageWithUser } from '~/types';
import { api } from '~/utils/api';
import { getCurrencyHelpers } from '~/utils/numbers';
import { type TFunction } from 'next-i18next';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { withI18nStaticProps } from '~/utils/i18n/server';
import { ListIcon, RefreshCcwDot } from 'lucide-react';
import { EmptyState } from '~/components/EmptyState';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import React from 'react';

// Same tokens as the balances page and expense rows (Money's "owed" / "owe" tones).
const POSITIVE = 'text-positive';
const NEGATIVE = 'text-negative';

const getPaymentString = (
  user: User,
  amount: bigint,
  paidBy: number,
  expenseUserAmt: bigint,
  isSettlement: boolean,
  t: TFunction,
  toUIString: (value: bigint) => string,
  isDeleted?: boolean,
) => {
  if (isDeleted) {
    return null;
  }
  const youPaid = user.id === paidBy;
  if (0n === expenseUserAmt) {
    // The payer is always involved: zero means they paid exactly their own share.
    return (
      <div className="text-muted text-sm">
        {youPaid ? t('audit_c.expense_row.no_balance') : t('ui.not_involved')}
      </div>
    );
  }
  if (isSettlement) {
    return (
      <div className={cn(youPaid ? POSITIVE : NEGATIVE, 'text-sm')}>
        {t(youPaid ? 'activity.you_paid_amount' : 'activity.you_received_amount', {
          amount: isolateLtr(toUIString(amount)),
        })}
      </div>
    );
  }
  const youLent = youPaid !== amount < 0n;
  return (
    <div className={cn(youLent ? POSITIVE : NEGATIVE, 'text-sm')}>
      {t(
        youLent ? 'ui.expense.statements.you_lent_amount' : 'ui.expense.statements.you_owe_amount',
        { amount: isolateLtr(toUIString(expenseUserAmt)) },
      )}
    </div>
  );
};

const ActivityPage: NextPageWithUser = ({ user }) => {
  const { displayName, t, toUIDate, i18n } = useTranslationWithUtils();
  const expensesQuery = api.expense.getAllExpenses.useQuery();

  const actions = React.useMemo(
    () => (
      <Link href="/recurring">
        <Button variant="ghost" size="sm">
          <RefreshCcwDot className="size-6" />
        </Button>
      </Link>
    ),
    [],
  );

  return (
    <>
      <Head>
        <title>{t('navigation.activity')}</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <MainLayout
        title={t('navigation.activity')}
        actions={actions}
        loading={expensesQuery.isPending}
      >
        <div className="flex flex-col gap-4">
          {!expensesQuery.data?.length ? (
            <EmptyState
              icon={ListIcon}
              title={t('ui.no_activity')}
              description={t('empty_states.activity.description')}
            />
          ) : null}
          {expensesQuery.data?.map((e) => {
            const { toUIString } = getCurrencyHelpers({
              locale: i18n.language,
              currency: e.expense.currency,
            });

            return (
              <Link href={`/expenses/${e.expenseId}`} key={e.expenseId} className="flex gap-2">
                <div className="mt-1">
                  <EntityAvatar entity={e.expense.paidByUser} size={30} />
                </div>
                <div>
                  {e.expense.deletedByUser ? (
                    <p className="text-red-500 opacity-70">
                      {t('activity.user_deleted_expense', {
                        actor: e.expense.deletedByUser.id === user.id ? 'you' : 'other',
                        user: displayName(e.expense.deletedByUser),
                        expense: e.expense.name,
                      })}
                    </p>
                  ) : (
                    <p className="text-foreground/80">
                      {t(
                        e.expense.paidByUser.id === user.id
                          ? e.expense.amount > 0n
                            ? 'activity.you_paid_for_expense'
                            : 'activity.you_received_for_expense'
                          : e.expense.amount > 0n
                            ? 'activity.user_paid_for_expense'
                            : 'activity.user_received_for_expense',
                        {
                          user: displayName(e.expense.paidByUser),
                          amount: isolateLtr(toUIString(e.expense.amount)),
                          expense: e.expense.name,
                        },
                      )}
                    </p>
                  )}

                  {getPaymentString(
                    user,
                    e.expense.amount,
                    e.expense.paidBy,
                    e.amount,
                    e.expense.splitType === SplitType.SETTLEMENT,
                    t,
                    toUIString,
                    !!e.expense.deletedBy,
                  )}
                  <AddedByAgent apiKey={e.expense.reportedByApiKey} />
                  <p className="text-muted text-xs">{toUIDate(e.expense.expenseDate)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </MainLayout>
    </>
  );
};

ActivityPage.auth = true;

export const getStaticProps = withI18nStaticProps(['common']);

export default ActivityPage;
