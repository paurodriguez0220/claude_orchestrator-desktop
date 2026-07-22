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
    onArchiveTaskClick: fn(),
    onOpenArchivedClick: fn(),
    onToggleUpdateBase: fn(),
    onCreateFolder: fn(),
    onRenameFolder: fn(),
    onDeleteFolder: fn(),
    onAssignTaskToFolder: fn(),
    scratchTasks: [],
    appVersion: '0.1.0',
    removingTaskIds: [],
    isAddingRepo: false,
  },
};

export default meta;
type Story = StoryObj<typeof RepoSidebar>;

export const Empty: Story = {
  args: { repos: [], activeTasksByRepoId: {}, selectedTaskId: undefined, searchQuery: '' },
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
    selectedTaskId: 'task-1',
    searchQuery: '',
  },
};

export const WithBaseUpdateDisabled: Story = {
  args: {
    repos: [
      {
        id: 'repo-1',
        name: 'demo',
        path: 'C:\\demo',
        createdAt: '2026-07-08T00:00:00.000Z',
        updateBaseOnCreate: false,
      },
    ],
    activeTasksByRepoId: { 'repo-1': [] },
    selectedTaskId: undefined,
    searchQuery: '',
  },
};

export const WithFolders: Story = {
  args: {
    repos: [
      {
        id: 'repo-1',
        name: 'demo',
        path: 'C:\\demo',
        createdAt: '2026-07-08T00:00:00.000Z',
        folders: [
          { id: 'folder-1', name: 'Bug fixes' },
          { id: 'folder-2', name: 'Epic-123' },
        ],
      },
    ],
    activeTasksByRepoId: {
      'repo-1': [
        {
          id: 'task-1',
          repoId: 'repo-1',
          title: 'Fix login redirect',
          branch: 'fix/login-redirect',
          worktreePath: 'C:\\demo-worktrees\\login-redirect',
          status: 'todo',
          kind: 'worktree',
          folderId: 'folder-1',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
        {
          id: 'task-2',
          repoId: 'repo-1',
          title: 'Add audit log endpoint',
          branch: 'feature/audit-log',
          worktreePath: 'C:\\demo-worktrees\\audit-log',
          status: 'todo',
          kind: 'worktree',
          folderId: 'folder-2',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
        {
          id: 'task-3',
          repoId: 'repo-1',
          title: 'Ungrouped scratch work',
          branch: 'feature/scratch',
          worktreePath: 'C:\\demo-worktrees\\scratch',
          status: 'todo',
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
    selectedTaskId: undefined,
    searchQuery: 'login',
  },
};
