import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabBar } from './tab-bar';

describe('TabBar', () => {
  it('renders a button per open task, marking the active one pressed', () => {
    render(
      <TabBar
        tabs={[
          { taskId: 'task-1', title: 'Fix login bug' },
          { taskId: 'task-2', title: 'Add tests' },
        ]}
        activeTaskId="task-2"
        finishedTaskIds={[]}
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Fix login bug' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Add tests' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onSelectTab when a tab is clicked', async () => {
    const onSelectTab = vi.fn();
    render(
      <TabBar
        tabs={[{ taskId: 'task-1', title: 'Fix login bug' }]}
        activeTaskId={undefined}
        finishedTaskIds={[]}
        onSelectTab={onSelectTab}
        onCloseTab={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fix login bug' }));
    expect(onSelectTab).toHaveBeenCalledWith('task-1');
  });

  it('calls onCloseTab with the task id when close is clicked', async () => {
    const onCloseTab = vi.fn();
    render(
      <TabBar
        tabs={[{ taskId: 'task-1', title: 'Fix login bug' }]}
        activeTaskId="task-1"
        finishedTaskIds={[]}
        onSelectTab={vi.fn()}
        onCloseTab={onCloseTab}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close Fix login bug' }));
    expect(onCloseTab).toHaveBeenCalledWith('task-1');
  });

  it('shows a finished dot on a non-active tab whose taskId is in finishedTaskIds', () => {
    render(
      <TabBar
        tabs={[
          { taskId: 'task-1', title: 'Fix login bug' },
          { taskId: 'task-2', title: 'Add tests' },
        ]}
        activeTaskId="task-2"
        finishedTaskIds={['task-1']}
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );
    expect(screen.getByRole('status', { name: 'Fix login bug finished' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Add tests finished' })).not.toBeInTheDocument();
  });

  it('does not show a finished dot on the active tab even if its taskId is in finishedTaskIds', () => {
    render(
      <TabBar
        tabs={[{ taskId: 'task-1', title: 'Fix login bug' }]}
        activeTaskId="task-1"
        finishedTaskIds={['task-1']}
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );
    expect(screen.queryByRole('status', { name: 'Fix login bug finished' })).not.toBeInTheDocument();
  });
});
