/** @jest-environment jsdom */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { renderWithProviders } from '~/tests/helpers/render';
import { createMockRouter } from '~/tests/helpers/router';

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
import { toast } from 'sonner';

const mutateAsync = jest.fn();
const refetch = jest.fn().mockResolvedValue(undefined);
jest.mock('~/utils/api', () => ({
  api: {
    group: { create: { useMutation: () => ({ mutateAsync }) } },
    useUtils: () => ({ group: { getAllGroupsWithBalances: { refetch } } }),
  },
}));
import { CreateGroup } from './CreateGroup';

describe('CreateGroup', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({ id: 42 });
    jest.mocked(toast.error).mockClear();
  });

  it('validates an empty name without creating a group', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CreateGroup>
        <button>New group</button>
      </CreateGroup>,
    );
    await user.click(screen.getByRole('button', { name: 'New group' }));
    await user.click(await screen.findByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('creates the group, refreshes groups, navigates and closes the drawer', async () => {
    const user = userEvent.setup();
    const { router } = renderWithProviders(
      <CreateGroup>
        <button>New group</button>
      </CreateGroup>,
    );
    await user.click(screen.getByRole('button', { name: 'New group' }));
    await user.type(await screen.findByPlaceholderText('Group name'), 'Trip');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/projects/42'));
    expect(mutateAsync).toHaveBeenCalledWith({ name: 'Trip' });
    expect(refetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('creates one group when submitted again while saving', async () => {
    let finishSaving: (group: { id: number }) => void = () => undefined;
    mutateAsync.mockImplementation(
      () =>
        new Promise<{ id: number }>((resolve) => {
          finishSaving = resolve;
        }),
    );
    const user = userEvent.setup();
    const { router } = renderWithProviders(
      <CreateGroup>
        <button>New group</button>
      </CreateGroup>,
    );
    await user.click(screen.getByRole('button', { name: 'New group' }));
    const nameInput = await screen.findByPlaceholderText('Group name');
    await user.type(nameInput, 'Trip');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled());

    // Enter submits the form directly, so it isn't stopped by the disabled button.
    await user.type(nameInput, '{Enter}');
    finishSaving({ id: 42 });

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/projects/42'));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('stays locked until the new project page has loaded', async () => {
    let finishNavigation: (done: boolean) => void = () => undefined;
    const router = createMockRouter();
    jest.mocked(router.push).mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finishNavigation = resolve;
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <CreateGroup>
        <button>New group</button>
      </CreateGroup>,
      { router },
    );
    await user.click(screen.getByRole('button', { name: 'New group' }));
    await user.type(await screen.findByPlaceholderText('Group name'), 'Trip');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    finishNavigation(true);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('shows the error and allows another try when saving fails', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('Could not save'));
    const user = userEvent.setup();
    const { router } = renderWithProviders(
      <CreateGroup>
        <button>New group</button>
      </CreateGroup>,
    );
    await user.click(screen.getByRole('button', { name: 'New group' }));
    await user.type(await screen.findByPlaceholderText('Group name'), 'Trip');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not save'));
    expect(router.push).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/projects/42'));
    expect(mutateAsync).toHaveBeenCalledTimes(2);
  });

  it('cancels without submitting', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CreateGroup>
        <button>New group</button>
      </CreateGroup>,
    );
    await user.click(screen.getByRole('button', { name: 'New group' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
