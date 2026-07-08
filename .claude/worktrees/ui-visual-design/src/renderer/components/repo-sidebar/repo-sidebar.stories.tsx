import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { RepoSidebar } from './repo-sidebar';

const meta: Meta<typeof RepoSidebar> = {
  component: RepoSidebar,
  title: 'Components/RepoSidebar',
  args: {
    onSelectTask: fn(),
    onOpenRepoClick: fn(),
    onCloneRepoClick: fn(),
    onNewTaskClick: fn(),
    onRemoveTaskClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof RepoSidebar>;

export const Empty: Story = {
  args: { repos: [], tasksByRepoId: {}, selectedTaskId: undefined },
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
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
    },
    selectedTaskId: 'task-1',
  },
};
