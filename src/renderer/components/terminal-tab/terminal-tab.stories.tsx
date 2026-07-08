import type { Meta, StoryObj } from '@storybook/react';
import { TerminalTab } from './terminal-tab';

const meta: Meta<typeof TerminalTab> = {
  component: TerminalTab,
  title: 'Components/TerminalTab',
};

export default meta;
type Story = StoryObj<typeof TerminalTab>;

export const Default: Story = {
  args: { taskId: 'story-task-1' },
};
