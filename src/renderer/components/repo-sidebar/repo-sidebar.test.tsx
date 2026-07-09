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
  kind: 'worktree',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
};
const doneTask: TaskRecord = { ...task, id: 'task-3', title: 'Ship release notes', status: 'done' };

describe('RepoSidebar', () => {
  it('renders each repo and its tasks', () => {
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{}}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
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
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{}}
        selectedTaskId={undefined}
        onSelectTask={onSelectTask}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
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
        activeTasksByRepoId={{}}
        archivedTasksByRepoId={{}}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={onOpenRepoClick}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
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
        activeTasksByRepoId={{}}
        archivedTasksByRepoId={{}}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={onCloneRepoClick}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clone Repo' }));
    expect(onCloneRepoClick).toHaveBeenCalledOnce();
  });

  it('calls onRemoveTaskClick with the task id when "Remove" is clicked', async () => {
    const onRemoveTaskClick = vi.fn();
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{}}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={onRemoveTaskClick}
        onReviewCodeClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemoveTaskClick).toHaveBeenCalledWith('task-1');
  });

  it('calls onReviewCodeClick with the repo id when "Review Code" is clicked', async () => {
    const onReviewCodeClick = vi.fn();
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{}}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={onReviewCodeClick}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review Code' }));
    expect(onReviewCodeClick).toHaveBeenCalledWith('repo-1');
  });

  it('shows a "Review" badge next to a task whose kind is "review"', () => {
    const reviewTask: TaskRecord = { ...task, id: 'task-2', title: 'Review PR #42', kind: 'review' };
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task, reviewTask] }}
        archivedTasksByRepoId={{}}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Review', { selector: 'span' })).toBeInTheDocument();
  });

  it('does not render an "Archived" toggle when a repo has no archived tasks', () => {
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{}}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Archived/ })).not.toBeInTheDocument();
  });

  it('renders a collapsed "Archived (N)" toggle and hides archived tasks by default', () => {
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{ 'repo-1': [doneTask] }}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Archived (1)' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Ship release notes' })).not.toBeInTheDocument();
  });

  it('expands the archived list and shows the archived task when the toggle is clicked', async () => {
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{ 'repo-1': [doneTask] }}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Archived (1)' }));
    expect(screen.getByRole('button', { name: 'Ship release notes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archived (1)' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('calls onSelectTask with the archived task id when it is clicked after expanding', async () => {
    const onSelectTask = vi.fn();
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{ 'repo-1': [doneTask] }}
        selectedTaskId={undefined}
        onSelectTask={onSelectTask}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Archived (1)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ship release notes' }));
    expect(onSelectTask).toHaveBeenCalledWith('task-3');
  });

  it('calls onRemoveTaskClick with the archived task id when Remove is clicked after expanding', async () => {
    const onRemoveTaskClick = vi.fn();
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{ 'repo-1': [doneTask] }}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={onRemoveTaskClick}
        onReviewCodeClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Archived (1)' }));
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    const archivedRemoveButton = removeButtons[removeButtons.length - 1];
    if (!archivedRemoveButton) {
      throw new Error('Expected an archived task Remove button to be rendered');
    }
    await userEvent.click(archivedRemoveButton);
    expect(onRemoveTaskClick).toHaveBeenCalledWith('task-3');
  });
});
