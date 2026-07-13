import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdoTasksModal } from './ado-tasks-modal';
import type { AdoWorkItem } from '../../../shared/ipc-channels';

const item: AdoWorkItem = {
  id: 101,
  title: 'Fix login',
  type: 'Bug',
  state: 'Active',
  areaPath: 'Proj\\Team',
  storyPoints: 3,
};

function renderModal(over: Partial<Parameters<typeof AdoTasksModal>[0]> = {}) {
  const props = {
    isOpen: true,
    tasks: [item],
    isLoading: false,
    orgUrlBase: 'https://dev.azure.com/myorg/MyProject',
    onCreateWorktree: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<AdoTasksModal {...props} />);
  return props;
}

describe('AdoTasksModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <AdoTasksModal
        isOpen={false}
        tasks={[item]}
        isLoading={false}
        orgUrlBase="https://dev.azure.com/myorg/MyProject"
        onCreateWorktree={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders each task title, state, type and a link containing the id', () => {
    renderModal();
    expect(screen.getByText('Fix login')).toBeInTheDocument();
    expect(screen.getByText(/Bug/)).toBeInTheDocument();
    expect(screen.getByText(/Active/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Open in ADO/i });
    expect(link).toHaveAttribute('href', 'https://dev.azure.com/myorg/MyProject/_workitems/edit/101');
  });

  it('shows the spinner while isLoading', () => {
    renderModal({ isLoading: true });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no tasks and not loading', () => {
    renderModal({ tasks: [] });
    expect(screen.getByText('No active ADO tasks.')).toBeInTheDocument();
  });

  it('calls onCreateWorktree with the item when "Create worktree" is clicked', async () => {
    const props = renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Create worktree' }));
    expect(props.onCreateWorktree).toHaveBeenCalledWith(item);
  });

  it('calls onClose when Close is clicked', async () => {
    const props = renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('does not set a fixed width on the root panel, so it fills the shared overlay instead of overflowing it', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Azure DevOps tasks' })).not.toHaveClass('w-[28rem]');
  });
});
