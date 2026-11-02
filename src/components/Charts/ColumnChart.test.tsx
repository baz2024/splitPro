import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ColumnChart, referenceLabelPlacement } from './ColumnChart';

const data = [
  { key: 'a', label: 'Oct', fullLabel: 'October', value: 1200, display: '$1,200' },
  {
    key: 'b',
    label: 'Nov',
    fullLabel: 'November',
    value: 1800,
    display: '$1,800',
    highlight: true,
  },
];

// Static markup keeps the test in node; jsdom rejects the inline `transform` style.
const renderChart = (props: Partial<React.ComponentProps<typeof ColumnChart>> = {}) =>
  renderToStaticMarkup(
    <ColumnChart
      data={data}
      formatTick={(value) => `$${value}`}
      ariaLabel="Spend"
      tableHeaders={['Month', 'Amount']}
      tableToggleLabel="View as table"
      {...props}
    />,
  );

describe('referenceLabelPlacement', () => {
  it('should put the label below a line near the top of the plot', () => {
    expect(referenceLabelPlacement(100)).toBe('below');
    expect(referenceLabelPlacement(90)).toBe('below');
  });

  it('should keep the label above lower lines', () => {
    expect(referenceLabelPlacement(50)).toBe('above');
    expect(referenceLabelPlacement(85)).toBe('above');
  });
});

describe('ColumnChart', () => {
  describe('Budget line', () => {
    it('should draw the budget label inside the plot when the budget is the axis top', () => {
      // Budget $2,000 is the nice top of the axis, so the line sits at 100%.
      const html = renderChart({ reference: { value: 2000, label: 'Budget $2,000' } });
      expect(html).toMatch(/data-testid="column-chart-reference-label" class="[^"]*top-full/);
      expect(html).toContain('Budget $2,000');
    });
  });

  describe('Average line', () => {
    it('should draw a dotted average line with a legend', () => {
      const html = renderChart({ average: { value: 1500, label: 'Average $1,500' } });
      expect(html).toMatch(/data-testid="column-chart-average" class="[^"]*border-dotted/);
      expect(html).toContain('Average $1,500');
    });

    it('should skip the line without an average', () => {
      expect(renderChart({ average: null })).not.toContain('column-chart-average');
    });
  });
});
