import React from 'react';

import { findService, serviceColor, serviceInitials } from '~/lib/serviceCatalog';
import { cn } from '~/lib/utils';

/** One squircle shape at every size (corner radius ≈ 30% of the side). */
const SIZES = {
  sm: 'size-8 rounded-[10px] text-[11px]',
  md: 'size-11 rounded-[14px] text-sm',
  lg: 'size-12 rounded-[15px] text-base',
} as const;

interface ServiceBadgeProps {
  /** Catalog id or display name (e.g. an expense description). */
  service: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * Brand-coloured initials badge. No logos are drawn or loaded: the catalog colour (or a stable
 * colour picked from the name for unknown services) with a soft top highlight and inner edge,
 * so known and unknown services share one consistent shape.
 */
export const ServiceBadge: React.FC<ServiceBadgeProps> = ({ service, size = 'md', className }) => {
  const known = findService(service);
  const isVercel = 'vercel' === known?.id;
  const color = serviceColor(service);

  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold tracking-wide shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)] select-none',
        SIZES[size],
        isVercel
          ? 'ring-border bg-white text-black ring-1 ring-inset dark:ring-0'
          : 'text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.25)]',
        className,
      )}
      style={
        isVercel
          ? undefined
          : {
              backgroundColor: color,
              backgroundImage:
                'linear-gradient(180deg, rgb(255 255 255 / 0.16) 0%, rgb(255 255 255 / 0) 55%)',
            }
      }
    >
      {serviceInitials(service)}
    </span>
  );
};
