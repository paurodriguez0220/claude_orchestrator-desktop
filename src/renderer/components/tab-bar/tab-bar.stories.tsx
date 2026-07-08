import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { TabBar } from './tab-bar';

const meta: Meta<typeof TabBar> = {
  component: TabBar,
  title: 'Components/TabBar',
  args: { onSelectTab: fn(), onCloseTab: fn() },
};

export default meta;
type Story = StoryObj<typeof TabBar>;

export const SingleTab: Story = {
  args: { tabs: [{ taskId: 'task-1', title: 'Fix login bug' }], activeTaskId: 'task-1' },
};

export const MultipleTabs: Story = {
  args: {
    tabs: [
      { taskId: 'task-1', title: 'Fix login bug' },
      { taskId: 'task-2', title: 'Add tests' },
    ],
    activeTaskId: 'task-2',
  },
};
