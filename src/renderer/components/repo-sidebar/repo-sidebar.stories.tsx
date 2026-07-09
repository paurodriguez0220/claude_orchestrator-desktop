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
    scratchTasks: [],
  },
};

export default meta;
type Story = StoryObj<typeof RepoSidebar>;

export const Empty: Story = {
  args: { repos: [], tasksByRepoId: {}, selectedTaskId: undefined, searchQuery: '' },
};

export const WithRepoAndTasks: Story = {
  args: {
    repos: [{ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' }],
    tasksByRepoId: {
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
    searchQuery: '',
  },
};

export const ActiveSearchWithNoMatchesInOneRepo: Story = {
  args: {
    repos: [
      { id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' },
      { id: 'repo-2', name: 'other-repo', path: 'C:\\other-repo', createdAt: '2026-07-08T00:00:00.000Z' },
    ],
    tasksByRepoId: {
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
