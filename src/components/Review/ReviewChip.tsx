import React from 'react';

import { cn } from '~/lib/utils';

import { useReviewTranslation } from './useReviewTranslation';

/** Small warning-token "Review" chip for expense rows (Figma screen 6). */
export const ReviewChip: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useReviewTranslation();

  return (
    <span
      title={t('chip_label')}
      aria-label={t('chip_label')}
      className={cn(
        'bg-warning/15 text-warning border-warning/30 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] leading-4 font-semibold',
        className,
      )}
    >
      {t('chip')}
    </span>
  );
};
