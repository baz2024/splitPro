/** @jest-environment jsdom */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';

import { renderWithProviders } from '~/tests/helpers/render';

jest.mock('next-i18next', () => ({
  useTranslation: require('./testUtils').useScanTestTranslation,
}));

import { ScanItemRow } from './ScanItemRow';
import { makeScanItem, plainText } from './testUtils';
import { type ScanDraft, type ScanItemError, type ScanListItem } from './types';

const TODAY = { year: 2026, month: 11, day: 2 };

const Harness: React.FC<{
  item: ScanListItem;
  onChange?: (draft: ScanDraft) => void;
  initial?: ScanDraft;
  error?: ScanItemError;
  showMissing?: boolean;
  duplicateOfName?: string;
}> = ({ item, onChange, initial, error, showMissing, duplicateOfName }) => {
  const [draft, setDraft] = useState<ScanDraft | undefined>(initial);
  return (
    <ul>
      <ScanItemRow
        item={item}
        draft={draft}
        today={TODAY}
        error={error}
        showMissing={showMissing}
        duplicateOfName={duplicateOfName}
        onDraftChange={(next) => {
          setDraft(next);
          onChange?.(next);
        }}
      />
    </ul>
  );
};

describe('ScanItemRow', () => {
  describe('decision chips', () => {
    it('starts with nothing picked and records a click', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      renderWithProviders(<Harness item={makeScanItem()} onChange={onChange} />);

      const group = screen.getByRole('radiogroup', { name: 'What to do with Figma' });
      const radios = screen.getAllByRole('radio');
      expect(group).toBeInTheDocument();
      expect(radios.map((radio) => radio.textContent)).toEqual([
        'Using it',
        'Not sure',
        'Cancel it',
        'Not a subscription',
      ]);
      expect(radios.every((radio) => 'false' === radio.getAttribute('aria-checked'))).toBe(true);

      await user.click(screen.getByRole('radio', { name: 'Not sure' }));
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ decision: 'not_sure' }));
      expect(screen.getByRole('radio', { name: 'Not sure' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });

    it('is one tab stop and moves with the arrow keys', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Harness item={makeScanItem()} />);

      await user.tab();
      expect(screen.getByRole('radio', { name: 'Using it' })).toHaveFocus();
      expect(
        screen.getAllByRole('radio').filter((radio) => '0' === radio.getAttribute('tabindex')),
      ).toHaveLength(1);

      await user.keyboard('{ArrowRight}');
      const notSure = screen.getByRole('radio', { name: 'Not sure' });
      expect(notSure).toHaveFocus();
      expect(notSure).toHaveAttribute('aria-checked', 'true');

      await user.keyboard('{ArrowLeft}{ArrowLeft}');
      const last = screen.getByRole('radio', { name: 'Not a subscription' });
      expect(last).toHaveFocus();
      expect(last).toHaveAttribute('aria-checked', 'true');
    });
  });

  describe('details', () => {
    it('shows price, start, renewal and flags', () => {
      renderWithProviders(
        <Harness
          item={makeScanItem({
            amountMinor: 2500n,
            previousAmountMinor: 2000n,
            flags: ['price_rise', 'duplicate'],
            duplicateOf: 'statement:figma:USD:monthly:1',
            vendor: {
              vendorId: 'raycast',
              name: 'Raycast',
              category: 'software',
              known: true,
              via: 'paddle',
            },
            nextRenewal: { year: 2026, month: 11, day: 5 },
            confidence: 'low',
          })}
          duplicateOfName="Raycast Pro"
        />,
      );
      const row = screen.getByTestId('scan-item');
      const text = plainText(row);
      expect(text).toContain('$25/mo');
      expect(text).toContain('via Paddle');
      expect(text).toContain('Since Mar 2025');
      expect(text).toContain('Renews in 3 days');
      expect(text).toContain('Price up $20.00 → $25.00');
      expect(text).toContain('Duplicate of Raycast Pro');
      expect(text).toContain('Check this one');
    });

    it('counts down a trial that ends soon', () => {
      renderWithProviders(
        <Harness
          item={makeScanItem({
            flags: ['trial'],
            cadence: null,
            amountMinor: 0n,
            nextRenewal: { year: 2026, month: 11, day: 4 },
          })}
        />,
      );
      const text = plainText(screen.getByTestId('scan-item'));
      expect(text).toContain('Trial ends in 2 days');
      expect(text).toContain('Price unknown');
    });
  });

  describe('trial prices', () => {
    const trial = makeScanItem({ flags: ['trial'], cadence: null, amountMinor: 0n });

    it('asks for the price once a save was attempted', () => {
      renderWithProviders(<Harness item={trial} initial={{ decision: 'using' }} showMissing />);
      expect(screen.getByLabelText('Price after the trial · USD')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Add the price to save this one.');
    });

    it('clears the error when a price is typed and picks a monthly cycle', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      renderWithProviders(
        <Harness item={trial} initial={{ decision: 'using' }} showMissing onChange={onChange} />,
      );
      await user.type(screen.getByLabelText('Price after the trial · USD'), '12');
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ decision: 'using', amountMinor: 1200n, cadence: 'monthly' }),
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows an error returned by the server', () => {
      renderWithProviders(<Harness item={makeScanItem()} error="failed" />);
      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't save this one. Please try again.",
      );
    });
  });
});
