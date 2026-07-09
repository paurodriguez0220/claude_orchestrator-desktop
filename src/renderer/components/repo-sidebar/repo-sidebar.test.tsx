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
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
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
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={onSelectTask}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
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
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={onOpenRepoClick}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
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
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={onCloneRepoClick}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clone Repo' }));
    expect(onCloneRepoClick).toHaveBeenCalledOnce();
  });

  it('calls onRemoveTaskClick with the task id when "Remove task" is clicked', async () => {
    const onRemoveTaskClick = vi.fn();
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{}}
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={onRemoveTaskClick}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove task' }));
    expect(onRemoveTaskClick).toHaveBeenCalledWith('task-1');
  });

  it('calls onReviewCodeClick with the repo id when "Review Code" is clicked', async () => {
    const onReviewCodeClick = vi.fn();
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{}}
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={onReviewCodeClick}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
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
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
      />,
    );
    expect(screen.getByRole('img', { name: 'Review' })).toBeInTheDocument();
  });

  it('renders the search input and forwards typed text via onSearchQueryChange', async () => {
    const onSearchQueryChange = vi.fn();
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{}}
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={onSearchQueryChange}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
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
        activeTasksByRepoId={{ 'repo-1': [task], 'repo-2': [] }}
        archivedTasksByRepoId={{}}
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery="login"
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
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
        activeTasksByRepoId={{}}
        archivedTasksByRepoId={{}}
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
      />,
    );
    expect(screen.getByText('empty-repo')).toBeInTheDocument();
  });

  it('renders scratch tasks in a Quick Questions section, showing only title and status', () => {
    const scratchTask: TaskRecord = {
      id: 'task-4',
      title: 'What does this error mean?',
      worktreePath: 'C:\\scratch\\task-4',
      status: 'in-progress',
      kind: 'scratch',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    };
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{}}
        scratchTasks={[scratchTask]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Quick Questions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'What does this error mean?' })).toBeInTheDocument();
    expect(screen.getByText('in-progress')).toBeInTheDocument();
  });

  it('calls onRemoveTaskClick with the scratch task id when "Remove question" is clicked', async () => {
    const onRemoveTaskClick = vi.fn();
    const scratchTask: TaskRecord = {
      id: 'task-4',
      title: 'What does this error mean?',
      worktreePath: 'C:\\scratch\\task-4',
      status: 'in-progress',
      kind: 'scratch',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    };
    render(
      <RepoSidebar
        repos={[]}
        activeTasksByRepoId={{}}
        archivedTasksByRepoId={{}}
        scratchTasks={[scratchTask]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={onRemoveTaskClick}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove question' }));
    expect(onRemoveTaskClick).toHaveBeenCalledWith('task-4');
  });

  it('calls onNewQuestionClick when "New Question" is clicked', async () => {
    const onNewQuestionClick = vi.fn();
    render(
      <RepoSidebar
        repos={[]}
        activeTasksByRepoId={{}}
        archivedTasksByRepoId={{}}
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={onNewQuestionClick}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'New Question' }));
    expect(onNewQuestionClick).toHaveBeenCalledOnce();
  });

  it('does not render an "Archived" toggle when a repo has no archived tasks', () => {
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{}}
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
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
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
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
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
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
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={onSelectTask}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
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
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={onRemoveTaskClick}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Archived (1)' }));
    const removeButtons = screen.getAllByRole('button', { name: 'Remove task' });
    const archivedRemoveButton = removeButtons[removeButtons.length - 1];
    if (!archivedRemoveButton) {
      throw new Error('Expected an archived task Remove button to be rendered');
    }
    await userEvent.click(archivedRemoveButton);
    expect(onRemoveTaskClick).toHaveBeenCalledWith('task-3');
  });

  it('shows the app version in the footer once it is known', () => {
    render(
      <RepoSidebar
        repos={[]}
        activeTasksByRepoId={{}}
        archivedTasksByRepoId={{}}
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion="1.2.3"
        onGenerateDsuClick={vi.fn()}
      />,
    );
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
  });

  it('shows no version footer while the version has not resolved yet', () => {
    render(
      <RepoSidebar
        repos={[]}
        activeTasksByRepoId={{}}
        archivedTasksByRepoId={{}}
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={vi.fn()}
      />,
    );
    expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument();
  });

  it('calls onGenerateDsuClick when "Generate DSU" is clicked', async () => {
    const onGenerateDsuClick = vi.fn();
    render(
      <RepoSidebar
        repos={[]}
        activeTasksByRepoId={{}}
        archivedTasksByRepoId={{}}
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        appVersion={undefined}
        onGenerateDsuClick={onGenerateDsuClick}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Generate DSU' }));
    expect(onGenerateDsuClick).toHaveBeenCalledOnce();
  });
});
