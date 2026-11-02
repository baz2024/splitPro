import React from 'react';

import { CHIP_IDLE, CHIP_SELECTED } from '~/components/ui/chipStyles';
import { cn } from '~/lib/utils';

export const DATAIO_NAMESPACES = ['dataio', 'common', 'categories', 'currencies'];

/** Rounded surface card used by both sections, as in the approved design. */
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={cn('border-border bg-surface rounded-[20px] border p-4', className)}>
    {children}
  </div>
);

export const SectionTitle: React.FC<{ id?: string; children: React.ReactNode }> = ({
  id,
  children,
}) => (
  <h2 id={id} className="text-muted px-1 text-xs font-semibold tracking-widest uppercase">
    {children}
  </h2>
);

interface ChoiceChipsProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** Single-choice pill chips with radio semantics. */
export const ChoiceChips = <T extends string>({
  label,
  value,
  options,
  onChange,
}: ChoiceChipsProps<T>) => (
  <fieldset className="flex flex-col gap-2">
    <legend className="text-muted mb-2 text-xs font-medium">{label}</legend>
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'focus-visible:ring-focus focus-visible:ring-offset-background min-h-11 rounded-full px-4 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              selected ? CHIP_SELECTED : CHIP_IDLE,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  </fieldset>
);

export const SELECT_CLASS =
  'bg-field-background border-field-border text-field-foreground focus-visible:ring-focus min-h-11 w-full min-w-0 rounded-xl border px-3 text-sm outline-none focus-visible:ring-2';

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  hint?: string;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  id,
  label,
  value,
  onChange,
  children,
  hint,
}) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-muted text-xs font-medium">
      {label}
    </label>
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={SELECT_CLASS}
      aria-describedby={hint ? `${id}-hint` : undefined}
    >
      {children}
    </select>
    {hint ? (
      <p id={`${id}-hint`} className="text-muted truncate text-xs" dir="auto">
        {hint}
      </p>
    ) : null}
  </div>
);
