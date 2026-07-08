import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskNotesPanel } from './task-notes-panel';

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
    const onSave = vi.fn();
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
});
