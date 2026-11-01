import { HandCoins } from 'lucide-react';
import Link from 'next/link';
import { Trans } from 'next-i18next';
import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cn } from '~/lib/utils';

import { Money, type MoneyTone } from './Money';

interface CurrencyAmount {
  currency: string;
  amount: bigint;
}

interface FriendBalance {
  friend: { id: number; name?: string | null; email?: string | null };
  currencies: CurrencyAmount[];
}

export type HeadlineKind =
  | { kind: 'settled' }
  | { kind: 'owed' | 'owe'; amounts: CurrencyAmount[]; friend: FriendBalance['friend'] | null }
  | { kind: 'mixed'; owed: CurrencyAmount[]; owe: CurrencyAmount[] };

const nonZero = (amounts: CurrencyAmount[] = []) => amounts.filter((a) => 0n !== a.amount);
const absolute = (amounts: CurrencyAmount[]) =>
  amounts.map(({ currency, amount }) => ({ currency, amount: 0n > amount ? -amount : amount }));

/**
 * Picks the one sentence the home screen opens with. Totals come from the cumulated balances;
 * a friend is named only when they are the single person on that side of the ledger.
 */
export const pickHeadline = ({
  youGet,
  youOwe,
  balances,
}: {
  youGet?: CurrencyAmount[];
  youOwe?: CurrencyAmount[];
  balances?: FriendBalance[];
}): HeadlineKind => {
  const owed = nonZero(youGet);
  const owe = absolute(nonZero(youOwe));
  const withBalance = (balances ?? []).filter((entry) => 0 < nonZero(entry.currencies).length);

  if (0 === owed.length && 0 === owe.length) {
    return { kind: 'settled' };
  }
  if (0 < owed.length && 0 < owe.length) {
    return { kind: 'mixed', owed, owe };
  }

  const kind = 0 < owed.length ? 'owed' : 'owe';
  const onlyFriend = 1 === withBalance.length ? (withBalance[0]?.friend ?? null) : null;
  return { kind, amounts: 0 < owed.length ? owed : owe, friend: onlyFriend };
};

const AmountList: React.FC<{ amounts: CurrencyAmount[]; tone: MoneyTone }> = ({
  amounts,
  tone,
}) => (
  <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
    {amounts.map((entry, index) => (
      <React.Fragment key={entry.currency}>
        {0 < index ? <span className="text-muted font-normal">+</span> : null}
        <Money amount={entry.amount} currency={entry.currency} tone={tone} />
      </React.Fragment>
    ))}
  </span>
);

/**
 * Home headline: "Overall, Dana owes you $1,978.44" with only the amount coloured, and a
 * Settle up button under it.
 */
export const BalanceHeadline: React.FC<{
  youGet?: CurrencyAmount[];
  youOwe?: CurrencyAmount[];
  balances?: FriendBalance[];
  /** Where Settle up goes when more than one person is involved. */
  listAnchor?: string;
  className?: string;
}> = ({ youGet, youOwe, balances, listAnchor = '#balances-list', className }) => {
  const { t, displayName } = useTranslationWithUtils();
  const headline = pickHeadline({ youGet, youOwe, balances });

  if ('settled' === headline.kind) {
    return (
      <section className={className}>
        <h2 className="text-foreground text-2xl leading-snug font-semibold">
          {t('audit_a.headline.settled')}
        </h2>
      </section>
    );
  }

  const renderSentence = () => {
    if ('mixed' === headline.kind) {
      return (
        <Trans
          t={t}
          i18nKey="audit_a.headline.mixed"
          components={{
            owed: <AmountList amounts={headline.owed} tone="owed" />,
            owe: <AmountList amounts={headline.owe} tone="owe" />,
          }}
        />
      );
    }
    const tone: MoneyTone = 'owed' === headline.kind ? 'owed' : 'owe';
    const amount = <AmountList amounts={headline.amounts} tone={tone} />;
    if (headline.friend) {
      return (
        <Trans
          t={t}
          i18nKey={
            'owed' === headline.kind
              ? 'audit_a.headline.owed_by_one'
              : 'audit_a.headline.owe_to_one'
          }
          values={{ name: displayName(headline.friend) }}
          components={{ amount }}
        />
      );
    }
    return (
      <Trans
        t={t}
        i18nKey={'owed' === headline.kind ? 'audit_a.headline.owed' : 'audit_a.headline.owe'}
        components={{ amount }}
      />
    );
  };

  const singleFriend = 'mixed' === headline.kind ? null : headline.friend;
  const settleHref = singleFriend ? `/balances/${singleFriend.id}` : listAnchor;

  return (
    <section className={cn('flex flex-col items-start gap-4', className)}>
      <h2 className="text-foreground text-2xl leading-snug font-semibold">{renderSentence()}</h2>
      <Link
        href={settleHref}
        className="bg-accent text-accent-foreground focus-visible:ring-focus focus-visible:ring-offset-background inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <HandCoins className="size-4" aria-hidden />
        {t('actions.settle_up')}
      </Link>
    </section>
  );
};
