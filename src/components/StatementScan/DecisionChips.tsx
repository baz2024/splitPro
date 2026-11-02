import { useTranslation } from 'next-i18next';
import React, { useRef } from 'react';

import { CHIP_IDLE, CHIP_SELECTED } from '~/components/ui/chipStyles';
import { cn } from '~/lib/utils';
import { SCAN_DECISIONS, type ScanDecision } from '~/server/statementScan/types';

import { STATEMENT_SCAN_NAMESPACES } from './types';

interface DecisionChipsProps {
  label: string;
  value: ScanDecision | null;
  onChange: (value: ScanDecision) => void;
  disabled?: boolean;
}

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * The four quick decisions as one radio group: Tab enters at the picked chip (or the first one
 * when nothing is picked yet), arrow keys move and pick, like native radio buttons.
 */
export const DecisionChips: React.FC<DecisionChipsProps> = ({
  label,
  value,
  onChange,
  disabled = false,
}) => {
  const { t, i18n } = useTranslation(STATEMENT_SCAN_NAMESPACES);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabStop = null === value ? 0 : SCAN_DECISIONS.indexOf(value);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = NEXT_KEYS.has(event.key);
    if (!forward && !PREVIOUS_KEYS.has(event.key)) {
      return;
    }
    event.preventDefault();
    // Left and right swap meaning in right-to-left layouts; up and down never do.
    const rtl = 'rtl' === i18n.dir();
    const horizontal = 'ArrowLeft' === event.key || 'ArrowRight' === event.key;
    const step = (forward ? 1 : -1) * (rtl && horizontal ? -1 : 1);
    const next = (index + step + SCAN_DECISIONS.length) % SCAN_DECISIONS.length;
    const decision = SCAN_DECISIONS[next];
    if (undefined === decision) {
      return;
    }
    onChange(decision);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
      {SCAN_DECISIONS.map((decision, index) => {
        const selected = decision === value;
        return (
          <button
            key={decision}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(decision)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'focus-visible:ring-focus focus-visible:ring-offset-surface min-h-11 min-w-0 rounded-full px-2 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50',
              selected ? CHIP_SELECTED : CHIP_IDLE,
              // The way out of the list: quieter than the three real choices, on its own line.
              'not_subscription' === decision && 'col-span-2 justify-self-start px-3.5',
              'not_subscription' === decision && !selected && 'border-transparent',
            )}
          >
            {t(`item.decision.${decision}`)}
          </button>
        );
      })}
    </div>
  );
};
