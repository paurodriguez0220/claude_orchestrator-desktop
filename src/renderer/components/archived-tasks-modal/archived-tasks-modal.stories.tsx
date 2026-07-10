import type { Meta, StoryObj } from '@storybook/react';
import { ArchivedTasksModal } from './archived-tasks-modal';

const meta: Meta<typeof ArchivedTasksModal> = {
  title: 'Components/ArchivedTasksModal',
  component: ArchivedTasksModal,
};
export default meta;

type Story = StoryObj<typeof ArchivedTasksModal>;

export const WithTasks: Story = {
  args: {
    isOpen: true,
    repos: [{ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' }],
    archivedTasksByRepoId: {
      'repo-1': [
        {
          id: 't1',
          repoId: 'repo-1',
          title: 'Fix login bug',
          branch: 'task/fix-login',
          worktreePath: 'C:\\w',
          status: 'done',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
        {
          id: 't2',
          repoId: 'repo-1',
          title: 'Export CSV',
          branch: 'task/export',
          worktreePath: 'C:\\w',
          status: 'done',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
    },
    onSelectTask: () => {},
    onUnarchive: () => {},
    onClose: () => {},
  },
};

export const Empty: Story = {
  args: { ...WithTasks.args, archivedTasksByRepoId: {} },
};
