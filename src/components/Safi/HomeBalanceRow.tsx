import Link from 'next/link';
import React from 'react';

import { ConvertibleBalance } from '~/components/Expense/ConvertibleBalance';
import { EntityAvatar } from '~/components/ui/avatar';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';

import { Money } from './Money';

/**
 * A friend on the home list. A single-currency balance reads "owes you $X" / "you owe $X" with
 * colour on the number only; several currencies keep the converter.
 */
export const HomeBalanceRow: React.FC<{
  id: number;
  entity: { name?: string | null; image?: string | null; email?: string | null };
  balances: { currency: string; amount: bigint }[];
}> = ({ id, entity, balances }) => {
  const { t, displayName } = useTranslationWithUtils();
  const nonZero = balances.filter((balance) => 0n !== balance.amount);
  const single = 1 === nonZero.length ? nonZero[0] : undefined;

  const renderAmount = () => {
    if (0 === nonZero.length) {
      return <span className="text-muted text-sm">{t('ui.settled_up')}</span>;
    }
    if (!single) {
      return (
        // The converter is interactive; keep its taps from opening the friend page.
        <div
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
          }}
        >
          <ConvertibleBalance withText balances={balances} entityId={id} />
        </div>
      );
    }
    const isOwed = 0n < single.amount;
    return (
      <div className="flex flex-col items-end">
        <span className="text-muted text-xs">
          {isOwed ? t('audit_a.row.owes_you') : t('audit_a.row.you_owe')}
        </span>
        <Money
          amount={isOwed ? single.amount : -single.amount}
          currency={single.currency}
          tone={isOwed ? 'owed' : 'owe'}
        />
      </div>
    );
  };

  return (
    <Link
      href={`/balances/${id}`}
      className="focus-visible:ring-focus flex items-center justify-between gap-3 rounded-xl focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="flex min-w-0 items-center gap-3">
        <EntityAvatar entity={entity} size={35} />
        <div className="text-foreground truncate">{displayName(entity)}</div>
      </div>
      <div className="shrink-0 text-end">{renderAmount()}</div>
    </Link>
  );
};
