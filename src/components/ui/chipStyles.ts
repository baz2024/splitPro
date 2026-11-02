/**
 * Shared selected / idle looks for pill chips (filters, billing cadence, plan picks).
 * Selected chips use the brand accent in both themes so every picker reads the same way.
 * Both states carry a 1px border so toggling never shifts the layout.
 */
export const CHIP_SELECTED = 'bg-accent text-accent-foreground border border-transparent';

export const CHIP_IDLE = 'border-border text-muted hover:text-foreground border bg-transparent';
