import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArchivedTasksModal } from './archived-tasks-modal';
import type { RepoRecord, TaskRecord } from '../../../shared/types';

const repos: RepoRecord[] = [{ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' }];

const task = (over: Partial<TaskRecord>): TaskRecord => ({
  id: 'task-1',
  repoId: 'repo-1',
  title: 'Fix login bug',
  branch: 'task/fix-login',
  worktreePath: 'C:\\w',
  status: 'done',
  kind: 'worktree',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
  ...over,
});

function renderModal(over: Partial<Parameters<typeof ArchivedTasksModal>[0]> = {}) {
  const props = {
    isOpen: true,
    repos,
    archivedTasksByRepoId: { 'repo-1': [task({})] },
    onSelectTask: vi.fn(),
    onUnarchive: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<ArchivedTasksModal {...props} />);
  return props;
}

describe('ArchivedTasksModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ArchivedTasksModal
        isOpen={false}
        repos={repos}
        archivedTasksByRepoId={{ 'repo-1': [task({})] }}
        onSelectTask={vi.fn()}
        onUnarchive={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists archived tasks grouped under their repo name', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Archived tasks' })).toBeInTheDocument();
    expect(screen.getByText('demo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fix login bug' })).toBeInTheDocument();
  });

  it('opens a task when its row is clicked', async () => {
    const props = renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Fix login bug' }));
    expect(props.onSelectTask).toHaveBeenCalledWith('task-1');
  });

  it('calls onUnarchive when the unarchive button is clicked', async () => {
    const props = renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive task' }));
    expect(props.onUnarchive).toHaveBeenCalledWith('task-1');
  });

  it('filters the list by title, branch, or repo (case-insensitive)', async () => {
    renderModal({
      archivedTasksByRepoId: {
        'repo-1': [
          task({ id: 'a', title: 'Fix login bug', branch: 'task/fix-login' }),
          task({ id: 'b', title: 'Export CSV', branch: 'task/export' }),
        ],
      },
    });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter archived tasks' }), 'export');
    expect(screen.queryByRole('button', { name: 'Fix login bug' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });

  it('shows an empty message when there are no archived tasks', () => {
    renderModal({ archivedTasksByRepoId: {} });
    expect(screen.getByText('No archived tasks.')).toBeInTheDocument();
  });

  it('shows a no-match message when a filter matches nothing', async () => {
    renderModal();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter archived tasks' }), 'zzz');
    expect(screen.getByText('No archived tasks match.')).toBeInTheDocument();
  });
});
