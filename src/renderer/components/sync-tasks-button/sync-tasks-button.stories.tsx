import type { Meta, StoryObj } from '@storybook/react';
import { SyncTasksButton } from './sync-tasks-button';
import type { AdoSyncResult } from '../../../shared/ipc-channels';

const preview: AdoSyncResult = {
  parentId: 12345,
  toCreate: [
    { type: 'Task', title: 'Set up the data model' },
    { type: 'Bug', title: 'Blank description on large payloads' },
  ],
  created: [],
  skipped: 1,
};

const synced: AdoSyncResult = {
  parentId: 12345,
  toCreate: [],
  created: [
    { title: 'Set up the data model', id: 900, url: 'https://dev.azure.com/org/project/_workitems/edit/900' },
    { title: 'Blank description', id: 901, url: 'https://dev.azure.com/org/project/_workitems/edit/901' },
  ],
  skipped: 1,
};

const meta: Meta<typeof SyncTasksButton> = {
  component: SyncTasksButton,
  title: 'Components/SyncTasksButton',
  args: {
    onDryRun: () => Promise.resolve(preview),
    onSync: () => Promise.resolve(synced),
  },
  decorators: [
    (Story) => (
      <div className="w-80 bg-graphite-800 p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SyncTasksButton>;

export const Default: Story = {};
export const NothingToCreate: Story = {
  args: { onDryRun: () => Promise.resolve({ parentId: 12345, toCreate: [], created: [], skipped: 3 }) },
};
