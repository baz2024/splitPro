import React from 'react';

import { findService, serviceInitials } from '~/lib/serviceCatalog';
import { cn } from '~/lib/utils';

const SIZES = {
  sm: 'size-8 rounded-lg text-[11px]',
  md: 'size-11 rounded-xl text-sm',
  lg: 'size-12 rounded-2xl text-base',
} as const;

interface ServiceBadgeProps {
  /** Catalog id or display name (e.g. an expense description). */
  service: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Square brand-coloured badge with the service's initials, as in the approved Safi designs. */
export const ServiceBadge: React.FC<ServiceBadgeProps> = ({ service, size = 'md', className }) => {
  const known = findService(service);
  const isVercel = 'vercel' === known?.id;

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold tracking-wide',
        SIZES[size],
        isVercel ? 'bg-white text-black' : 'text-white',
        className,
      )}
      style={isVercel ? undefined : { backgroundColor: known?.color ?? '#334155' }}
    >
      {serviceInitials(service)}
    </span>
  );
};
