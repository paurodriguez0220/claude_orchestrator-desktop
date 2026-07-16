import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LinkedAdoItems } from './linked-ado-items';

const orgUrlBase = 'https://dev.azure.com/org/project';

afterEach(cleanup);

describe('LinkedAdoItems', () => {
  it('renders each linked id as an "open in ADO" link', () => {
    render(<LinkedAdoItems adoIds={['1234', '5678']} orgUrlBase={orgUrlBase} onLink={vi.fn()} onUnlink={vi.fn()} />);
    expect(screen.getByRole('link', { name: /1234/ })).toHaveAttribute(
      'href',
      `${orgUrlBase}/_workitems/edit/1234`,
    );
    expect(screen.getByRole('link', { name: /5678/ })).toHaveAttribute(
      'href',
      `${orgUrlBase}/_workitems/edit/5678`,
    );
  });

  it('shows an empty-state hint when there are no linked items', () => {
    render(<LinkedAdoItems adoIds={[]} orgUrlBase={orgUrlBase} onLink={vi.fn()} onUnlink={vi.fn()} />);
    expect(screen.getByText(/no linked ado items/i)).toBeInTheDocument();
  });

  it('calls onUnlink with the id when its remove button is clicked', async () => {
    const onUnlink = vi.fn();
    render(<LinkedAdoItems adoIds={['1234']} orgUrlBase={orgUrlBase} onLink={vi.fn()} onUnlink={onUnlink} />);
    await userEvent.click(screen.getByRole('button', { name: 'Unlink 1234' }));
    expect(onUnlink).toHaveBeenCalledWith('1234');
  });

  it('calls onLink with the trimmed id typed into the add field', async () => {
    const onLink = vi.fn();
    render(<LinkedAdoItems adoIds={[]} orgUrlBase={orgUrlBase} onLink={onLink} onUnlink={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('ADO work item id'), '  9999  ');
    await userEvent.click(screen.getByRole('button', { name: 'Link ADO item' }));
    expect(onLink).toHaveBeenCalledWith('9999');
  });

  it('does not call onLink for a blank id', async () => {
    const onLink = vi.fn();
    render(<LinkedAdoItems adoIds={[]} orgUrlBase={orgUrlBase} onLink={onLink} onUnlink={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Link ADO item' }));
    expect(onLink).not.toHaveBeenCalled();
  });

  it('clears the add field after a successful link', async () => {
    render(<LinkedAdoItems adoIds={[]} orgUrlBase={orgUrlBase} onLink={vi.fn()} onUnlink={vi.fn()} />);
    const input = screen.getByLabelText('ADO work item id');
    await userEvent.type(input, '4242');
    await userEvent.click(screen.getByRole('button', { name: 'Link ADO item' }));
    expect(input).toHaveValue('');
  });
});
