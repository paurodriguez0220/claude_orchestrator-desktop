import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getLastWorkingDayStamp, toDateStamp } from '../../../shared/dates';
import { DsuSummaryModal } from './dsu-summary-modal';

function renderModal(overrides: Partial<Parameters<typeof DsuSummaryModal>[0]> = {}): void {
  render(
    <DsuSummaryModal
      isOpen
      summary={undefined}
      filePath={undefined}
      isGenerating={false}
      onGenerate={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

describe('DsuSummaryModal', () => {
  it('does not render when isOpen is false', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('defaults the date input to the last working day and caps it at today', () => {
    renderModal();
    const input = screen.getByLabelText('Day to summarize');
    expect(input).toHaveValue(getLastWorkingDayStamp(new Date()));
    expect(input).toHaveAttribute('max', toDateStamp(new Date()));
  });

  it('calls onGenerate with the picked date when Generate is clicked', async () => {
    const onGenerate = vi.fn();
    renderModal({ onGenerate });
    fireEvent.change(screen.getByLabelText('Day to summarize'), { target: { value: '2026-07-06' } });
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(onGenerate).toHaveBeenCalledWith('2026-07-06');
  });

  it('disables the Generate button and shows a spinner while isGenerating', () => {
    renderModal({ isGenerating: true });
    expect(screen.getByRole('button', { name: /Generating/ })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('renders the summary text and saved file path once provided', () => {
    renderModal({
      summary: '## demo / task-x\n- Fixed the bug',
      filePath: 'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\dsu\\2026-07-08.md',
    });
    expect(screen.getByText(/Fixed the bug/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-08\.md/)).toBeInTheDocument();
  });

  it('calls onClose when Close is clicked', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
