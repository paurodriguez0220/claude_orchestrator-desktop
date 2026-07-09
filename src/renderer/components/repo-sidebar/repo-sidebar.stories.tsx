import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { RepoSidebar } from './repo-sidebar';

const meta: Meta<typeof RepoSidebar> = {
  component: RepoSidebar,
  title: 'Components/RepoSidebar',
  args: {
    onSearchQueryChange: fn(),
    onSelectTask: fn(),
    onOpenRepoClick: fn(),
    onCloneRepoClick: fn(),
    onNewTaskClick: fn(),
    onRemoveTaskClick: fn(),
    onReviewCodeClick: fn(),
    onNewQuestionClick: fn(),
    onGenerateDsuClick: fn(),
    scratchTasks: [],
    appVersion: '0.1.0',
  },
};

export default meta;
type Story = StoryObj<typeof RepoSidebar>;

export const Empty: Story = {
  args: { repos: [], activeTasksByRepoId: {}, archivedTasksByRepoId: {}, selectedTaskId: undefined, searchQuery: '' },
};

export const WithRepoAndTasks: Story = {
  args: {
    repos: [{ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' }],
    activeTasksByRepoId: {
      'repo-1': [
        {
          id: 'task-1',
          repoId: 'repo-1',
          title: 'Fix login bug',
          branch: 'task/fix-login-bug',
          worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
          status: 'todo',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
    },
    archivedTasksByRepoId: {},
    selectedTaskId: 'task-1',
  },
};

export const WithReviewTask: Story = {
  args: {
    repos: [{ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' }],
    activeTasksByRepoId: {
      'repo-1': [
        {
          id: 'task-1',
          repoId: 'repo-1',
          title: 'Fix login bug',
          branch: 'task/fix-login-bug',
          worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
          status: 'todo',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
        {
          id: 'task-2',
          repoId: 'repo-1',
          title: 'Review PR #42',
          branch: 'review/pr-42',
          worktreePath: 'C:\\demo-worktrees\\review-pr-42',
          status: 'todo',
          kind: 'review',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
    },
    archivedTasksByRepoId: {},
    selectedTaskId: 'task-1',
    searchQuery: '',
  },
};

export const WithArchivedTasks: Story = {
  args: {
    repos: [{ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' }],
    activeTasksByRepoId: {
      'repo-1': [
        {
          id: 'task-1',
          repoId: 'repo-1',
          title: 'Fix login bug',
          branch: 'task/fix-login-bug',
          worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
          status: 'todo',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
    },
    archivedTasksByRepoId: {
      'repo-1': [
        {
          id: 'task-2',
          repoId: 'repo-1',
          title: 'Ship release notes',
          branch: 'task/ship-release-notes',
          worktreePath: 'C:\\demo-worktrees\\ship-release-notes',
          status: 'done',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
    },
    selectedTaskId: 'task-1',
    searchQuery: '',
  },
};

export const ActiveSearchWithNoMatchesInOneRepo: Story = {
  args: {
    repos: [
      { id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' },
      { id: 'repo-2', name: 'other-repo', path: 'C:\\other-repo', createdAt: '2026-07-08T00:00:00.000Z' },
    ],
    activeTasksByRepoId: {
      'repo-1': [
        {
          id: 'task-1',
          repoId: 'repo-1',
          title: 'Fix login bug',
          branch: 'task/fix-login-bug',
          worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
          status: 'todo',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
      'repo-2': [],
    },
    archivedTasksByRepoId: {},
    selectedTaskId: undefined,
    searchQuery: 'login',
  },
};
