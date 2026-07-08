import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewTaskModal } from './new-task-modal';

describe('NewTaskModal', () => {
  it('does not render when isOpen is false', () => {
    render(<NewTaskModal isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits title, optional adoId, and optional branch', async () => {
    const onSubmit = vi.fn();
    render(<NewTaskModal isOpen onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix login bug');
    await userEvent.type(screen.getByLabelText('ADO Task ID (optional)'), 'ADO-1234');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Fix login bug', adoId: 'ADO-1234', branch: undefined });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<NewTaskModal isOpen onClose={onClose} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
