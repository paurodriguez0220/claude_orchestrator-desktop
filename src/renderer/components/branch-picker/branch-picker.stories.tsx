import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { BranchPicker } from './branch-picker';

const meta: Meta<typeof BranchPicker> = {
  component: BranchPicker,
  title: 'Components/BranchPicker',
  args: { id: 'branch-picker-story', label: 'Existing Branch', value: '', onChange: fn() },
};

export default meta;
type Story = StoryObj<typeof BranchPicker>;

export const Empty: Story = { args: { branches: [] } };
export const WithBranches: Story = {
  args: {
    branches: [
      { value: 'main', label: 'main', isRemote: false },
      { value: 'feature-x', label: 'feature-x', isRemote: false },
      { value: 'feature-y', label: 'origin/feature-y', isRemote: true },
    ],
  },
};
