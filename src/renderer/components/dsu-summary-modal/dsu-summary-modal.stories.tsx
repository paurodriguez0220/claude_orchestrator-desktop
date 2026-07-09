import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { DsuSummaryModal } from './dsu-summary-modal';

const meta: Meta<typeof DsuSummaryModal> = {
  component: DsuSummaryModal,
  title: 'Components/DsuSummaryModal',
  args: { onClose: fn() },
};

export default meta;
type Story = StoryObj<typeof DsuSummaryModal>;

export const Open: Story = {
  args: {
    isOpen: true,
    summary:
      '## Fix login bug\n\n- Fixed a null check on the login form.\n\n## Add search bar\n\n- Wired up the task search input.',
    filePath: 'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\dsu\\2026-07-09.md',
  },
};

export const Closed: Story = { args: { isOpen: false, summary: '', filePath: undefined } };
