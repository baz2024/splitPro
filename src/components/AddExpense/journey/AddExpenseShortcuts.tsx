import { buttonVariants } from '@heroui/react';
import { Camera, PencilLine } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import React from 'react';

import { cn } from '~/lib/utils';

/** Screen 6 entry points: "Scan receipt" and "Add manually" deep links into /add. */
export const AddExpenseShortcuts: React.FC<{
  groupId?: number;
  friendId?: number;
  disabled?: boolean;
  className?: string;
}> = ({ groupId, friendId, disabled = false, className }) => {
  const { t } = useTranslation();

  const href = (mode: 'scan' | 'manual') => {
    const params = new URLSearchParams({ mode });
    if (undefined !== groupId) {
      params.set('groupId', String(groupId));
    }
    if (undefined !== friendId) {
      params.set('friendId', String(friendId));
    }
    return `/add?${params.toString()}`;
  };

  const linkClass = (variant: 'primary' | 'secondary') =>
    cn(
      buttonVariants({ variant, size: 'md' }),
      'min-h-11 flex-1 gap-2',
      disabled && 'pointer-events-none opacity-50',
    );

  return (
    <div className={cn('flex w-full max-w-md gap-2', className)}>
      <Link
        href={href('scan')}
        className={linkClass('primary')}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : undefined}
      >
        <Camera className="size-4" aria-hidden />
        {t('add_journey.shortcuts.scan')}
      </Link>
      <Link
        href={href('manual')}
        className={linkClass('secondary')}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : undefined}
      >
        <PencilLine className="size-4" aria-hidden />
        {t('add_journey.shortcuts.manual')}
      </Link>
    </div>
  );
};
