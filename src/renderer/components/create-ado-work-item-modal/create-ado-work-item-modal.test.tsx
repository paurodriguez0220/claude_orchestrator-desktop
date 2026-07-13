import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateAdoWorkItemModal } from './create-ado-work-item-modal';

describe('CreateAdoWorkItemModal', () => {
  it('does not render when isOpen is false', () => {
    render(
      <CreateAdoWorkItemModal
        isOpen={false}
        isSubmitting={false}
        result={undefined}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not call onSubmit merely on open', () => {
    const onSubmit = vi.fn();
    render(
      <CreateAdoWorkItemModal
        isOpen
        isSubmitting={false}
        result={undefined}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('defaults the type field to "Task" and disables Create until title is also filled', () => {
    render(
      <CreateAdoWorkItemModal
        isOpen
        isSubmitting={false}
        result={undefined}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Type')).toHaveValue('Task');
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('disables Create when type is cleared, even with a title filled in', async () => {
    render(
      <CreateAdoWorkItemModal
        isOpen
        isSubmitting={false}
        result={undefined}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Fix login bug');
    await userEvent.clear(screen.getByLabelText('Type'));
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('submits trimmed required fields with optional fields omitted when left blank', async () => {
    const onSubmit = vi.fn();
    render(
      <CreateAdoWorkItemModal
        isOpen
        isSubmitting={false}
        result={undefined}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), '  Fix login bug  ');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'Task',
      title: 'Fix login bug',
      description: undefined,
      parentId: undefined,
      assignee: undefined,
    });
  });

  it('submits description, parentId (parsed to a number), and assignee when provided', async () => {
    const onSubmit = vi.fn();
    render(
      <CreateAdoWorkItemModal
        isOpen
        isSubmitting={false}
        result={undefined}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Fix login bug');
    await userEvent.type(screen.getByLabelText('Description (optional)'), 'Some details');
    await userEvent.type(screen.getByLabelText('Parent ID (optional)'), '999');
    await userEvent.type(screen.getByLabelText('Assignee (optional)'), 'paulo.rodriguez@fefundinfo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'Task',
      title: 'Fix login bug',
      description: 'Some details',
      parentId: 999,
      assignee: 'paulo.rodriguez@fefundinfo.com',
    });
  });

  it('shows a spinner and disables Create/Cancel while isSubmitting', () => {
    render(
      <CreateAdoWorkItemModal
        isOpen
        isSubmitting
        result={undefined}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Creating/ })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows the created id and a link to result.url once result is set', () => {
    render(
      <CreateAdoWorkItemModal
        isOpen
        isSubmitting={false}
        result={{ id: 501, url: 'https://dev.azure.com/myorg/MyProject/_workitems/edit/501' }}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Created #501/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /501/ })).toHaveAttribute(
      'href',
      'https://dev.azure.com/myorg/MyProject/_workitems/edit/501',
    );
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(
      <CreateAdoWorkItemModal
        isOpen
        isSubmitting={false}
        result={undefined}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
