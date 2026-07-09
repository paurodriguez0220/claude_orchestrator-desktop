import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { TaskSearchInput } from './task-search-input';

const meta: Meta<typeof TaskSearchInput> = {
  component: TaskSearchInput,
  title: 'Components/TaskSearchInput',
  args: {
    onChange: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof TaskSearchInput>;

export const Empty: Story = {
  args: { value: '' },
};

export const WithQuery: Story = {
  args: { value: 'login' },
};
