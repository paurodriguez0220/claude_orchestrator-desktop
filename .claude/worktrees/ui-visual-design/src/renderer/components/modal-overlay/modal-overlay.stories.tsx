import type { Meta, StoryObj } from '@storybook/react';
import { ModalOverlay } from './modal-overlay';

const meta: Meta<typeof ModalOverlay> = {
  component: ModalOverlay,
  title: 'Components/ModalOverlay',
};

export default meta;
type Story = StoryObj<typeof ModalOverlay>;

export const Default: Story = {
  args: {
    children: <p className="text-graphite-100">Example modal content</p>,
  },
};
