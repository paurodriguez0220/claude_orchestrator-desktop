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

describe('RepoSidebar', () => {
  it('renders each repo and its tasks', () => {
    render(
      <RepoSidebar
        repos={[repo]}
        tasksByRepoId={{ 'repo-1': [task] }}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
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
        tasksByRepoId={{ 'repo-1': [task] }}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
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
        tasksByRepoId={{}}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
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
        tasksByRepoId={{}}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
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
        tasksByRepoId={{ 'repo-1': [task] }}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
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
        tasksByRepoId={{ 'repo-1': [task] }}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
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
        tasksByRepoId={{ 'repo-1': [task, reviewTask] }}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
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

  it('renders the search input and forwards typed text via onSearchQueryChange', async () => {
    const onSearchQueryChange = vi.fn();
    render(
      <RepoSidebar
        repos={[repo]}
        tasksByRepoId={{ 'repo-1': [task] }}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={onSearchQueryChange}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'x');
    expect(onSearchQueryChange).toHaveBeenCalledWith('x');
  });

  it('hides a repo with zero matching tasks while a search query is active', () => {
    const otherRepo: RepoRecord = { ...repo, id: 'repo-2', name: 'other-repo' };
    render(
      <RepoSidebar
        repos={[repo, otherRepo]}
        tasksByRepoId={{ 'repo-1': [task], 'repo-2': [] }}
        selectedTaskId={undefined}
        searchQuery="login"
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    expect(screen.getByText('demo')).toBeInTheDocument();
    expect(screen.queryByText('other-repo')).not.toBeInTheDocument();
  });

  it('shows a repo with zero tasks when the search query is empty (not an active search)', () => {
    const emptyRepo: RepoRecord = { ...repo, id: 'repo-2', name: 'empty-repo' };
    render(
      <RepoSidebar
        repos={[emptyRepo]}
        tasksByRepoId={{}}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    expect(screen.getByText('empty-repo')).toBeInTheDocument();
  });
});
