/** @jest-environment jsdom */

import { screen } from '@testing-library/react';
import React from 'react';

import { type ScanTotals } from '~/server/statementScan/types';
import { renderWithProviders } from '~/tests/helpers/render';

jest.mock('next-i18next', () => ({
  useTranslation: require('./testUtils').useScanTestTranslation,
}));

import { ReportHeader } from './ReportHeader';
import { plainText } from './testUtils';

const totals = (overrides: Partial<ScanTotals> = {}): ScanTotals => ({
  currency: 'USD',
  yearlyMinor: 486000n,
  atRiskYearlyMinor: 114000n,
  subscriptions: 12,
  counts: { trial: 2, duplicate: 1, price_rise: 0, annual_soon: 3 },
  ...overrides,
});

const REPORT = {
  from: { year: 2026, month: 1, day: 3 },
  to: { year: 2026, month: 11, day: 1 },
  scannedRows: 240,
};

describe('ReportHeader', () => {
  it('leads with the yearly amount at risk and the total found', () => {
    renderWithProviders(<ReportHeader totals={[totals()]} report={REPORT} />);
    expect(plainText(screen.getByTestId('scan-headline'))).toBe('$1,140/yr at risk');
    expect(
      screen.getByText(
        (_, node) =>
          'P' === node?.tagName && 'of $4,860/yr across 12 subscriptions' === plainText(node),
      ),
    ).toBeInTheDocument();
    expect(plainText(screen.getByText(/240 rows/))).toBe('Jan – Nov 2026 · 240 rows');
  });

  it('shows a tile only for flags that have items', () => {
    renderWithProviders(<ReportHeader totals={[totals()]} report={REPORT} />);
    const tiles = screen.getAllByRole('listitem').map((tile) => tile.textContent);
    expect(tiles).toEqual(['2Trials ending soon', '1Duplicates', '3Annual renewals soon']);
    expect(screen.queryByText('Price rises')).not.toBeInTheDocument();
  });

  it('says nothing looks wasted when no flags are set', () => {
    renderWithProviders(
      <ReportHeader
        totals={[
          totals({
            atRiskYearlyMinor: 0n,
            counts: { trial: 0, duplicate: 0, price_rise: 0, annual_soon: 0 },
          }),
        ]}
        report={null}
      />,
    );
    expect(plainText(screen.getByTestId('scan-headline'))).toBe('$4,860/yr in subscriptions');
    expect(
      screen.getByText('Nothing looks wasted — nice. Confirm what you still use below.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('explains when the file had no subscriptions', () => {
    renderWithProviders(<ReportHeader totals={[]} report={REPORT} />);
    expect(screen.getByText(/No subscriptions found in this file/)).toBeInTheDocument();
  });
});
