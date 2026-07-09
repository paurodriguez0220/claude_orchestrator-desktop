import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { DsuSummaryModal } from './dsu-summary-modal';

const meta: Meta<typeof DsuSummaryModal> = {
  component: DsuSummaryModal,
  title: 'Components/DsuSummaryModal',
  args: { onClose: fn(), onGenerate: fn(), isGenerating: false, summary: undefined, filePath: undefined },
};

export default meta;
type Story = StoryObj<typeof DsuSummaryModal>;

export const PickerOnly: Story = { args: { isOpen: true } };

export const Generating: Story = { args: { isOpen: true, isGenerating: true } };

export const WithSummary: Story = {
  args: {
    isOpen: true,
    summary:
      '## demo / task/fix-login-bug\n\n- Fixed a null check on the login form.\n\n## demo / task/search-bar\n\n- Wired up the task search input.',
    filePath: 'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\dsu\\2026-07-08.md',
  },
};

export const Closed: Story = { args: { isOpen: false } };
