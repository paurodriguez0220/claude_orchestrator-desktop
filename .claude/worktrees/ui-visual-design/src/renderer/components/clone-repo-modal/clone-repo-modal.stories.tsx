import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { CloneRepoModal } from './clone-repo-modal';

const meta: Meta<typeof CloneRepoModal> = {
  component: CloneRepoModal,
  title: 'Components/CloneRepoModal',
  args: { onClose: fn(), onSubmit: fn() },
};

export default meta;
type Story = StoryObj<typeof CloneRepoModal>;

export const Open: Story = { args: { isOpen: true } };
export const Closed: Story = { args: { isOpen: false } };
