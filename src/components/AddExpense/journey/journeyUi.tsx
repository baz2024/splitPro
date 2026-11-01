import { Button, Tabs } from '@heroui/react';
import { ChevronLeft, X } from 'lucide-react';
import React from 'react';

import { cn } from '~/lib/utils';

/**
 * Shared building blocks for the add-expense journey, matching the approved Figma screens:
 * a three-column header, a pill segmented control, grouped label/value rows and a pinned CTA.
 */

export const JourneyHeader: React.FC<{
  title: string;
  /** "close" shows an X (entry screens), "back" a chevron (follow-up screens). */
  leading: 'close' | 'back';
  leadingLabel: string;
  onLeading: () => void;
}> = ({ title, leading, leadingLabel, onLeading }) => (
  <header className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2">
    <Button
      isIconOnly
      variant="ghost"
      className="size-11"
      aria-label={leadingLabel}
      onPress={onLeading}
    >
      {'close' === leading ? (
        <X className="size-5" aria-hidden />
      ) : (
        <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
      )}
    </Button>
    <h1 className="truncate text-center text-base font-semibold">{title}</h1>
    <span className="size-11" aria-hidden />
  </header>
);

export interface SegmentItem<K extends string> {
  id: K;
  label: string;
  icon?: React.ReactNode;
}

/** Pill segmented control (Scan / Manual / Import, Equal / Shares / % / Exact). */
export const Segmented = <K extends string>({
  items,
  selected,
  onChange,
  ariaLabel,
}: {
  items: readonly SegmentItem<K>[];
  selected: K | null;
  onChange: (key: K) => void;
  ariaLabel: string;
}) => (
  <Tabs
    selectedKey={selected ?? undefined}
    onSelectionChange={(key) => {
      const match = items.find(({ id }) => id === key);
      if (match) {
        onChange(match.id);
      }
    }}
  >
    <Tabs.ListContainer className="bg-surface border-border rounded-2xl border">
      <Tabs.List aria-label={ariaLabel} className="w-full">
        {items.map(({ id, label, icon }) => (
          <Tabs.Tab
            key={id}
            id={id}
            className="text-muted data-[selected=true]:text-foreground min-h-11 flex-1 gap-1.5 text-sm data-[selected=true]:font-semibold"
          >
            {icon}
            {label}
            <Tabs.Indicator className="bg-surface-tertiary rounded-xl" />
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.ListContainer>
  </Tabs>
);

/** Rounded card with hairline separators between its rows. */
export const GroupedRows: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div
    className={cn(
      'bg-surface border-border divide-separator flex flex-col divide-y overflow-hidden rounded-2xl border',
      className,
    )}
  >
    {children}
  </div>
);

const ROW_CLASS =
  'flex min-h-13 w-full items-center justify-between gap-3 px-4 py-2 text-start text-sm';

/** Static row: muted label at the start, value aligned to the end. */
export const ValueRow: React.FC<{
  label: string;
  children: React.ReactNode;
  flagged?: boolean;
}> = ({ label, children, flagged = false }) => (
  <div className={cn(ROW_CLASS, flagged && 'bg-warning/10')}>
    <span className="text-muted shrink-0">{label}</span>
    <span className="text-foreground flex min-w-0 items-center justify-end gap-2 font-medium">
      {children}
    </span>
  </div>
);

/**
 * Tappable row used as a picker trigger. Spreads extra props so Radix/Vaul `asChild` triggers
 * can attach their handlers and refs.
 */
export const RowButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; flagged?: boolean }
>(({ label, flagged = false, children, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    // Drawer triggers (`asChild`) inject `justify-center text-center`. Merge them first so the
    // Row layout (label at start, value at end) wins.
    className={cn(
      className,
      ROW_CLASS,
      'hover:bg-surface-secondary focus-visible:ring-focus cursor-pointer focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
      flagged && 'bg-warning/10',
    )}
    {...props}
  >
    <span className="text-muted shrink-0">{label}</span>
    <span className="text-foreground flex min-w-0 items-center justify-end gap-2 truncate font-medium">
      {children}
    </span>
  </button>
));
RowButton.displayName = 'RowButton';

/** Full-width primary action pinned above the safe area. */
export const PinnedFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-background/95 fixed inset-x-0 bottom-0 z-20 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur">
    <div className="mx-auto max-w-md">{children}</div>
  </div>
);

/** Compact single-line pill for secondary actions (attach receipt, repeat). */
export const JOURNEY_PILL_CLASS =
  'bg-surface border-border focus-visible:ring-focus flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-2 disabled:opacity-60';

export const PRIMARY_CTA_CLASS = 'h-13 rounded-full text-base font-semibold';
