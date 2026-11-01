/** @jest-environment jsdom */

import { screen } from '@testing-library/react';
import React from 'react';

import { renderWithProviders } from '~/tests/helpers/render';
import { createMockRouter } from '~/tests/helpers/router';
import MainLayout from './MainLayout';

it('marks the active navigation section for nested routes', () => {
  renderWithProviders(
    <MainLayout title="Overview">
      <p>Content</p>
    </MainLayout>,
    {
      router: createMockRouter({ pathname: '/groups/[groupId]', asPath: '/groups/7' }),
    },
  );
  expect(screen.getByText('Content')).toBeInTheDocument();
  // Groups are projects: their sub-pages keep the Projects tab active.
  const projectLinks = screen.getAllByRole('link', { name: 'Projects' });
  expect(projectLinks).toHaveLength(2);
  projectLinks.forEach((link) => {
    expect(link).toHaveAttribute('href', '/projects');
    expect(link).toHaveAttribute('aria-current', 'page');
  });
  screen.getAllByRole('link', { name: 'Balances' }).forEach((link) => {
    expect(link).not.toHaveAttribute('aria-current');
  });
});

it('shows the five tabs in design order', () => {
  renderWithProviders(
    <MainLayout>
      <p>Content</p>
    </MainLayout>,
    { router: createMockRouter({ pathname: '/balances', asPath: '/balances' }) },
  );
  const [, mobileNav] = screen.getAllByRole('navigation');
  const hrefs = Array.from(mobileNav?.querySelectorAll('a') ?? []).map((link) =>
    link.getAttribute('href'),
  );
  expect(hrefs).toEqual(['/balances', '/projects', '/add', '/activity', '/account']);
});
