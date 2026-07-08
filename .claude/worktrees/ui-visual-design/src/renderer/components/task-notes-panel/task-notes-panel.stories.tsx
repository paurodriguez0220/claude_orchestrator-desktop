import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { TaskNotesPanel } from './task-notes-panel';

const meta: Meta<typeof TaskNotesPanel> = {
  component: TaskNotesPanel,
  title: 'Components/TaskNotesPanel',
  args: { onSave: fn() },
};

export default meta;
type Story = StoryObj<typeof TaskNotesPanel>;

export const Empty: Story = { args: { body: '', status: 'todo' } };
export const WithNotes: Story = { args: { body: 'Started investigating the redirect loop.', status: 'in-progress' } };
