import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloneRepoModal } from './clone-repo-modal';

describe('CloneRepoModal', () => {
  it('does not render when isOpen is false', () => {
    render(<CloneRepoModal isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits the url and name', async () => {
    const onSubmit = vi.fn();
    render(<CloneRepoModal isOpen onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Git URL'), 'https://github.com/paurodriguez0220/demo.git');
    await userEvent.type(screen.getByLabelText('Local Name'), 'demo');
    await userEvent.click(screen.getByRole('button', { name: 'Clone' }));
    expect(onSubmit).toHaveBeenCalledWith({ url: 'https://github.com/paurodriguez0220/demo.git', name: 'demo' });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<CloneRepoModal isOpen onClose={onClose} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
