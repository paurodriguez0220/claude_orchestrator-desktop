import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { NewTaskModal } from './new-task-modal';

const meta: Meta<typeof NewTaskModal> = {
  component: NewTaskModal,
  title: 'Components/NewTaskModal',
  args: { onClose: fn(), onSubmit: fn() },
};

export default meta;
type Story = StoryObj<typeof NewTaskModal>;

export const Open: Story = { args: { isOpen: true } };
export const Closed: Story = { args: { isOpen: false } };
