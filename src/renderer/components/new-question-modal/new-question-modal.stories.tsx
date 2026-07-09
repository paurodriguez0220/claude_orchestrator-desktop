import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { NewQuestionModal } from './new-question-modal';

const meta: Meta<typeof NewQuestionModal> = {
  component: NewQuestionModal,
  title: 'Components/NewQuestionModal',
  args: { onClose: fn(), onSubmit: fn() },
};

export default meta;
type Story = StoryObj<typeof NewQuestionModal>;

export const Open: Story = { args: { isOpen: true, isSubmitting: false } };
export const Closed: Story = { args: { isOpen: false, isSubmitting: false } };
export const Submitting: Story = { args: { isOpen: true, isSubmitting: true } };
