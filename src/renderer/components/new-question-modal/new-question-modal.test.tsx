import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewQuestionModal } from './new-question-modal';

describe('NewQuestionModal', () => {
  it('does not render when isOpen is false', () => {
    render(<NewQuestionModal isOpen={false} isSubmitting={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits the title', async () => {
    const onSubmit = vi.fn();
    render(<NewQuestionModal isOpen isSubmitting={false} onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), 'What does this error mean?');
    await userEvent.click(screen.getByRole('button', { name: 'Create Question' }));
    expect(onSubmit).toHaveBeenCalledWith({ title: 'What does this error mean?' });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<NewQuestionModal isOpen isSubmitting={false} onClose={onClose} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disables Cancel and Create Question and shows a spinner while isSubmitting', () => {
    render(<NewQuestionModal isOpen isSubmitting onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Creating/ })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
