import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepoSidebar } from './repo-sidebar';
import type { RepoRecord, TaskRecord } from '../../../shared/types';

const repo: RepoRecord = { id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' };
const task: TaskRecord = {
  id: 'task-1',
  repoId: 'repo-1',
  title: 'Fix login bug',
  branch: 'task/fix-login-bug',
  worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
  status: 'todo',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
};

describe('RepoSidebar', () => {
  it('renders each repo and its tasks', () => {
    render(
      <RepoSidebar
        repos={[repo]}
        tasksByRepoId={{ 'repo-1': [task] }}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
      />,
    );
    expect(screen.getByText('demo')).toBeInTheDocument();
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
  });

  it('calls onSelectTask when a task is clicked', async () => {
    const onSelectTask = vi.fn();
    render(
      <RepoSidebar
        repos={[repo]}
        tasksByRepoId={{ 'repo-1': [task] }}
        selectedTaskId={undefined}
        onSelectTask={onSelectTask}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fix login bug' }));
    expect(onSelectTask).toHaveBeenCalledWith('task-1');
  });

  it('calls onOpenRepoClick when "Open Existing Repo" is clicked', async () => {
    const onOpenRepoClick = vi.fn();
    render(
      <RepoSidebar
        repos={[]}
        tasksByRepoId={{}}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={onOpenRepoClick}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open Existing Repo' }));
    expect(onOpenRepoClick).toHaveBeenCalledOnce();
  });

  it('calls onCloneRepoClick when "Clone Repo" is clicked', async () => {
    const onCloneRepoClick = vi.fn();
    render(
      <RepoSidebar
        repos={[]}
        tasksByRepoId={{}}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={onCloneRepoClick}
        onNewTaskClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clone Repo' }));
    expect(onCloneRepoClick).toHaveBeenCalledOnce();
  });
});
