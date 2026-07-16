import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SyncTasksButton } from './sync-tasks-button';
import type { AdoSyncResult } from '../../../shared/ipc-channels';

afterEach(cleanup);

const dryResult: AdoSyncResult = {
  parentId: 500,
  toCreate: [
    { type: 'Task', title: 'Alpha' },
    { type: 'Bug', title: 'Beta' },
  ],
  created: [],
  skipped: 1,
};

const syncResult: AdoSyncResult = {
  parentId: 500,
  toCreate: [],
  created: [
    { title: 'Alpha', id: 900, url: 'http://ado/900' },
    { title: 'Beta', id: 901, url: 'http://ado/901' },
  ],
  skipped: 1,
};

describe('SyncTasksButton', () => {
  it('runs a dry run on click and shows how many items would be created before syncing', async () => {
    const onDryRun = vi.fn().mockResolvedValue(dryResult);
    render(<SyncTasksButton onDryRun={onDryRun} onSync={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /sync tasks\.md to ado/i }));
    expect(onDryRun).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByText(/create 2 work item/i)).toBeInTheDocument());
    expect(screen.getByText(/#500/)).toBeInTheDocument();
  });

  it('only calls onSync after the user confirms the preview', async () => {
    const onSync = vi.fn().mockResolvedValue(syncResult);
    render(<SyncTasksButton onDryRun={vi.fn().mockResolvedValue(dryResult)} onSync={onSync} />);
    await userEvent.click(screen.getByRole('button', { name: /sync tasks\.md to ado/i }));
    await screen.findByText(/create 2 work item/i);
    expect(onSync).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    expect(onSync).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole('link', { name: /900/ })).toBeInTheDocument());
  });

  it('cancels the preview without syncing', async () => {
    const onSync = vi.fn();
    render(<SyncTasksButton onDryRun={vi.fn().mockResolvedValue(dryResult)} onSync={onSync} />);
    await userEvent.click(screen.getByRole('button', { name: /sync tasks\.md to ado/i }));
    await screen.findByText(/create 2 work item/i);
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onSync).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /sync tasks\.md to ado/i })).toBeInTheDocument();
  });

  it('reports when there is nothing to create and offers no confirm', async () => {
    const empty: AdoSyncResult = { parentId: 500, toCreate: [], created: [], skipped: 3 };
    render(<SyncTasksButton onDryRun={vi.fn().mockResolvedValue(empty)} onSync={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /sync tasks\.md to ado/i }));
    await waitFor(() => expect(screen.getByText(/nothing to create/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^confirm$/i })).not.toBeInTheDocument();
  });

  it('surfaces an error from the dry run', async () => {
    render(
      <SyncTasksButton onDryRun={vi.fn().mockRejectedValue(new Error('No tasks.md found'))} onSync={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /sync tasks\.md to ado/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No tasks.md found'));
  });
});
