import { Search } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { ServiceBadge } from '~/components/Safi/ServiceBadge';
import { cn } from '~/lib/utils';
import { type ServiceInfo } from '~/lib/serviceCatalog';

export const OTHER_SERVICE = 'other';

const TILE =
  'bg-surface text-foreground flex h-[76px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border px-1 text-[11px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** Four-column grid of service tiles plus a dashed "Other" tile, as in the Add cost design. */
export const ServiceGrid: React.FC<{
  services: readonly ServiceInfo[];
  /** Selected service id, or OTHER_SERVICE. */
  selected: string | null;
  onSelect: (id: string) => void;
}> = ({ services, selected, onSelect }) => {
  const { t } = useTranslation('addcost');

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="addcost-service-heading">
      <h2
        id="addcost-service-heading"
        className="text-muted px-1 text-xs font-semibold tracking-widest uppercase"
      >
        {t('service.heading')}
      </h2>
      <div className="grid grid-cols-4 gap-2.5">
        {services.map((service) => {
          const isSelected = service.id === selected;
          return (
            <button
              key={service.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(service.id)}
              className={cn(
                TILE,
                isSelected
                  ? 'border-accent ring-accent ring-1'
                  : 'border-border hover:bg-surface-secondary',
              )}
            >
              <ServiceBadge service={service.id} size="sm" />
              <span className="w-full truncate text-center">{service.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={OTHER_SERVICE === selected}
          onClick={() => onSelect(OTHER_SERVICE)}
          className={cn(
            TILE,
            'border-dashed bg-transparent',
            OTHER_SERVICE === selected
              ? 'border-accent ring-accent text-foreground border-solid ring-1'
              : 'border-border text-muted hover:text-foreground',
          )}
        >
          <Search className="size-5" aria-hidden />
          <span>{t('service.other')}</span>
        </button>
      </div>
    </section>
  );
};
