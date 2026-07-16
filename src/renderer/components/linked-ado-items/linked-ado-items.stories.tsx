import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { LinkedAdoItems } from './linked-ado-items';

const meta: Meta<typeof LinkedAdoItems> = {
  component: LinkedAdoItems,
  title: 'Components/LinkedAdoItems',
  args: { orgUrlBase: 'https://dev.azure.com/org/project', onLink: fn(), onUnlink: fn() },
  decorators: [
    (Story) => (
      <div className="w-80 bg-graphite-800">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof LinkedAdoItems>;

export const Empty: Story = { args: { adoIds: [] } };
export const OneItem: Story = { args: { adoIds: ['12345'] } };
export const ParentPlusChildren: Story = { args: { adoIds: ['12345', '12346', '12347'] } };
