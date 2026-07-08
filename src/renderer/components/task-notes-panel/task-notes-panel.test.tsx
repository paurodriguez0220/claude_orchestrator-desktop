import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskNotesPanel } from './task-notes-panel';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

describe('TaskNotesPanel', () => {
  it('renders the existing body', () => {
    render(<TaskNotesPanel body="existing notes" status="todo" onSave={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('existing notes');
  });

  it('calls onSave with the edited body when Save is clicked', async () => {
    const onSave = vi.fn();
    render(<TaskNotesPanel body="" status="todo" onSave={onSave} />);
    await userEvent.type(screen.getByRole('textbox'), 'new note');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('new note');
  });

  it('surfaces a save error instead of swallowing it', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('disk full'));
    render(<TaskNotesPanel body="" status="todo" onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('disk full')).toBeInTheDocument();
  });

  it('auto-saves unsaved edits when the panel unmounts (e.g. switching tabs)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<TaskNotesPanel body="" status="todo" onSave={onSave} />);
    await userEvent.type(screen.getByRole('textbox'), 'unsaved note');
    unmount();
    expect(onSave).toHaveBeenCalledWith('unsaved note');
  });

  it('does not auto-save on unmount when nothing was edited', () => {
    const onSave = vi.fn();
    const { unmount } = render(<TaskNotesPanel body="existing notes" status="todo" onSave={onSave} />);
    unmount();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not auto-save again on unmount after the edit was already saved via the Save button', async () => {
    const onSave = vi.fn();
    const { unmount } = render(<TaskNotesPanel body="" status="todo" onSave={onSave} />);
    await userEvent.type(screen.getByRole('textbox'), 'saved note');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    unmount();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('auto-saves unsaved edits every 5 minutes while editing', async () => {
    vi.useFakeTimers();
    try {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(<TaskNotesPanel body="" status="todo" onSave={onSave} />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'periodic note' } });
      await vi.advanceTimersByTimeAsync(FIVE_MINUTES_MS);
      expect(onSave).toHaveBeenCalledWith('periodic note');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not auto-save on the periodic timer when nothing changed', async () => {
    vi.useFakeTimers();
    try {
      const onSave = vi.fn();
      render(<TaskNotesPanel body="existing notes" status="todo" onSave={onSave} />);
      await vi.advanceTimersByTimeAsync(FIVE_MINUTES_MS);
      expect(onSave).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-save on unmount after a periodic autosave already captured the same edit', async () => {
    vi.useFakeTimers();
    try {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { unmount } = render(<TaskNotesPanel body="" status="todo" onSave={onSave} />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'periodic note' } });
      await vi.advanceTimersByTimeAsync(FIVE_MINUTES_MS);
      onSave.mockClear();
      unmount();
      expect(onSave).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
