import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewTaskModal } from './new-task-modal';

describe('NewTaskModal', () => {
  it('does not render when isOpen is false', () => {
    render(<NewTaskModal isOpen={false} branches={[]} isSubmitting={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits title, optional adoId, and optional branch', async () => {
    const onSubmit = vi.fn();
    render(<NewTaskModal isOpen branches={[]} isSubmitting={false} onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix login bug');
    await userEvent.type(screen.getByLabelText('ADO Task ID (optional)'), 'ADO-1234');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Fix login bug',
      adoId: 'ADO-1234',
      branch: undefined,
      existingBranch: undefined,
    });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<NewTaskModal isOpen branches={[]} isSubmitting={false} onClose={onClose} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('toggling to "Use existing branch" shows a select populated from the branches prop', async () => {
    render(
      <NewTaskModal
        isOpen
        branches={[
          { value: 'feature-x', label: 'feature-x', isRemote: false },
          { value: 'feature-y', label: 'origin/feature-y', isRemote: true },
        ]}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'feature-x' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'origin/feature-y' })).toBeInTheDocument();
  });

  it('submits existingBranch (not branch) when in existing-branch mode', async () => {
    const onSubmit = vi.fn();
    render(
      <NewTaskModal
        isOpen
        branches={[{ value: 'feature-x', label: 'feature-x', isRemote: false }]}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Resume feature work');
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    await userEvent.selectOptions(screen.getByRole('combobox'), 'feature-x');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Resume feature work',
      adoId: undefined,
      branch: undefined,
      existingBranch: 'feature-x',
    });
  });

  it('disables Cancel and Create Task and shows a spinner while isSubmitting', () => {
    render(<NewTaskModal isOpen branches={[]} isSubmitting onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Creating/ })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
