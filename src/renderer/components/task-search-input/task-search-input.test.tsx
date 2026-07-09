import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskSearchInput } from './task-search-input';

describe('TaskSearchInput', () => {
  it('renders the current value in a labeled search box', () => {
    render(<TaskSearchInput value="login" onChange={vi.fn()} />);
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('login');
  });

  it('calls onChange with the new value when typed into', async () => {
    const onChange = vi.fn();
    render(<TaskSearchInput value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'x');
    expect(onChange).toHaveBeenCalledWith('x');
  });
});
