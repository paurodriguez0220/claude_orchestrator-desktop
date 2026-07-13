import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewTaskModal } from './new-task-modal';

describe('NewTaskModal', () => {
  it('does not render when isOpen is false', () => {
    render(<NewTaskModal isOpen={false} mode="task" branches={[]} isSubmitting={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits title, optional adoId, and optional branch', async () => {
    const onSubmit = vi.fn();
    render(<NewTaskModal isOpen mode="task" branches={[]} isSubmitting={false} onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix login bug');
    await userEvent.type(screen.getByLabelText('ADO Task ID (optional)'), 'ADO-1234');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Fix login bug',
      adoId: 'ADO-1234',
      branch: undefined,
      branchPrefix: 'feature/',
      existingBranch: undefined,
    });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<NewTaskModal isOpen mode="task" branches={[]} isSubmitting={false} onClose={onClose} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('toggling to "Use existing branch" shows a branch picker populated from the branches prop', async () => {
    render(
      <NewTaskModal
        isOpen
        mode="task"
        branches={[
          { value: 'feature-x', label: 'feature-x', isRemote: false },
          { value: 'feature-y', label: 'origin/feature-y', isRemote: true },
        ]}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Branch folder' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'feature-x' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'origin/feature-y' })).toBeInTheDocument();
  });

  it('submits existingBranch (not branch) when in existing-branch mode', async () => {
    const onSubmit = vi.fn();
    render(
      <NewTaskModal
        isOpen
        mode="task"
        branches={[{ value: 'feature-x', label: 'feature-x', isRemote: false }]}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Resume feature work');
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'feature-x' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Resume feature work',
      adoId: undefined,
      branch: undefined,
      branchPrefix: undefined,
      existingBranch: 'feature-x',
    });
  });

  it('disables Cancel and Create Task and shows a spinner while isSubmitting', () => {
    render(<NewTaskModal isOpen mode="task" branches={[]} isSubmitting onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Creating/ })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('review mode hides the branch-mode toggle and always shows the existing-branch picker', async () => {
    render(
      <NewTaskModal
        isOpen
        mode="review"
        branches={[{ value: 'feature-x', label: 'feature-x', isRemote: false }]}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByRole('radio', { name: 'New branch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Use existing branch' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'feature-x' })).toBeInTheDocument();
  });

  it('review mode submits the selected existing branch', async () => {
    const onSubmit = vi.fn();
    render(
      <NewTaskModal
        isOpen
        mode="review"
        branches={[{ value: 'feature-x', label: 'feature-x', isRemote: false }]}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Review PR #42');
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'feature-x' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Review PR #42',
      adoId: undefined,
      branch: undefined,
      branchPrefix: undefined,
      existingBranch: 'feature-x',
    });
  });

  it('review mode disables Create Task until a branch is selected', async () => {
    render(
      <NewTaskModal
        isOpen
        mode="review"
        branches={[{ value: 'feature-x', label: 'feature-x', isRemote: false }]}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Review PR #42');
    expect(screen.getByRole('button', { name: 'Create Task' })).toBeDisabled();
  });

  it('review mode enables Create Task once a branch is selected and submits it', async () => {
    const onSubmit = vi.fn();
    render(
      <NewTaskModal
        isOpen
        mode="review"
        branches={[{ value: 'feature-x', label: 'feature-x', isRemote: false }]}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Review PR #42');
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'feature-x' }));
    expect(screen.getByRole('button', { name: 'Create Task' })).not.toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Review PR #42',
      adoId: undefined,
      branch: undefined,
      branchPrefix: undefined,
      existingBranch: 'feature-x',
    });
  });

  it('task mode with "Use existing branch" disables Create Task until a branch is selected', async () => {
    render(
      <NewTaskModal
        isOpen
        mode="task"
        branches={[{ value: 'feature-x', label: 'feature-x', isRemote: false }]}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Resume feature work');
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    expect(screen.getByRole('button', { name: 'Create Task' })).toBeDisabled();

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'feature-x' }));
    expect(screen.getByRole('button', { name: 'Create Task' })).not.toBeDisabled();
  });

  it('defaults the branch folder to feature/ and previews prefix + title slug', async () => {
    render(<NewTaskModal isOpen mode="task" branches={[]} isSubmitting={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix Login Bug');
    expect(screen.getByTestId('branch-preview')).toHaveTextContent('feature/fix-login-bug');
  });

  it('submits the selected folder as branchPrefix with no explicit branch', async () => {
    const onSubmit = vi.fn();
    render(<NewTaskModal isOpen mode="task" branches={[]} isSubmitting={false} onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix Login Bug');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Branch folder' }), 'fix/');
    expect(screen.getByTestId('branch-preview')).toHaveTextContent('fix/fix-login-bug');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Fix Login Bug',
      adoId: undefined,
      branch: undefined,
      branchPrefix: 'fix/',
      existingBranch: undefined,
    });
  });

  it('Custom… reveals a free-text branch field and submits it as branch (no prefix)', async () => {
    const onSubmit = vi.fn();
    render(<NewTaskModal isOpen mode="task" branches={[]} isSubmitting={false} onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix Login Bug');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Branch folder' }), 'custom');
    await userEvent.type(screen.getByLabelText('Branch (optional)'), 'hotfix/urgent');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Fix Login Bug',
      adoId: undefined,
      branch: 'hotfix/urgent',
      branchPrefix: undefined,
      existingBranch: undefined,
    });
  });
});
