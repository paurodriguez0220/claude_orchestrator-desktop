import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BranchPicker } from './branch-picker';

const branches = [
  { value: 'feature-x', label: 'feature-x', isRemote: false },
  { value: 'feature-y', label: 'origin/feature-y', isRemote: true },
];

describe('BranchPicker', () => {
  it('renders a labeled combobox with the listbox closed until focused', () => {
    render(<BranchPicker id="branch" label="Existing Branch" branches={branches} value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Existing Branch')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows every branch once the input is focused', async () => {
    render(<BranchPicker id="branch" label="Existing Branch" branches={branches} value="" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'feature-x' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'origin/feature-y' })).toBeInTheDocument();
  });

  it('filters the options as the user types', async () => {
    render(<BranchPicker id="branch" label="Existing Branch" branches={branches} value="" onChange={vi.fn()} />);
    await userEvent.type(screen.getByRole('combobox'), 'feature-x');
    expect(screen.getByRole('option', { name: 'feature-x' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'origin/feature-y' })).not.toBeInTheDocument();
  });

  it('shows "No matching branches" when nothing matches the query', async () => {
    render(<BranchPicker id="branch" label="Existing Branch" branches={branches} value="" onChange={vi.fn()} />);
    await userEvent.type(screen.getByRole('combobox'), 'nonexistent');
    expect(screen.getByText('No matching branches')).toBeInTheDocument();
  });

  it('clicking an option calls onChange with its value, fills the input with its label, and closes the listbox', async () => {
    const onChange = vi.fn();
    render(<BranchPicker id="branch" label="Existing Branch" branches={branches} value="" onChange={onChange} />);
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'origin/feature-y' }));
    expect(onChange).toHaveBeenCalledWith('feature-y');
    expect(screen.getByRole('combobox')).toHaveValue('origin/feature-y');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('typing after a selection clears the committed value until a branch is picked again', async () => {
    const onChange = vi.fn();
    render(<BranchPicker id="branch" label="Existing Branch" branches={branches} value="feature-x" onChange={onChange} />);
    await userEvent.type(screen.getByRole('combobox'), 'x');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('pressing Escape closes the listbox', async () => {
    render(<BranchPicker id="branch" label="Existing Branch" branches={branches} value="" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
