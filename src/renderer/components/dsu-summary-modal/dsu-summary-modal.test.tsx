import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DsuSummaryModal } from './dsu-summary-modal';

describe('DsuSummaryModal', () => {
  it('does not render when isOpen is false', () => {
    render(<DsuSummaryModal isOpen={false} summary="" filePath={undefined} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the summary text and the saved file path', () => {
    render(
      <DsuSummaryModal
        isOpen
        summary={'## Fix login bug\n- Fixed the bug'}
        filePath="C:\\Users\\paulo.rodriguez\\claude-orchestrator\\dsu\\2026-07-09.md"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'DSU Summary' })).toBeInTheDocument();
    expect(screen.getByText(/Fixed the bug/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-09\.md/)).toBeInTheDocument();
  });

  it('calls onClose when Close is clicked', async () => {
    const onClose = vi.fn();
    render(<DsuSummaryModal isOpen summary="text" filePath={undefined} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
