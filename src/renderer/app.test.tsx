import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RepoRecord, TaskRecord } from '../shared/types';

// TerminalTab renders a real xterm.js Terminal, which requires browser APIs
// (matchMedia, canvas) that jsdom doesn't implement. App's own tests aren't
// exercising terminal internals (see terminal-tab.test.tsx for that), so the
// library is mocked here the same way terminal-tab.test.tsx mocks it.
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function TerminalMock() {
    return {
      open: vi.fn(),
      write: vi.fn(),
      onData: vi.fn(),
      onResize: vi.fn(),
      loadAddon: vi.fn(),
      dispose: vi.fn(),
    };
  }),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(function FitAddonMock() {
    return { fit: vi.fn() };
  }),
}));

import { App } from './app';

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const repo: RepoRecord = { id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' };
const task: TaskRecord = {
  id: 'task-1',
  repoId: 'repo-1',
  title: 'Fix login bug',
  branch: 'task/fix-login-bug',
  worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
  status: 'todo',
  kind: 'worktree',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
};
const task2: TaskRecord = {
  id: 'task-2',
  repoId: 'repo-1',
  title: 'Add tests',
  branch: 'task/add-tests',
  worktreePath: 'C:\\demo-worktrees\\add-tests',
  status: 'todo',
  kind: 'worktree',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
};

const listRepos = vi.fn(async () => [repo]);
const listTasks = vi.fn(async () => [task, task2]);
const createTask = vi.fn(async () => task);
const openTask = vi.fn(async (): Promise<void> => undefined);
const removeTask = vi.fn(async () => undefined);
const closeTask = vi.fn(async () => undefined);
const getTaskNotes = vi.fn(async () => ({ body: 'notes', status: 'todo' as const }));
const setTaskNotes = vi.fn(async () => undefined);
const selectFolder = vi.fn(async (): Promise<string | undefined> => 'C:\\Users\\paulo.rodriguez\\Paulo\\demo-repo');
const addRepo = vi.fn(async () => repo);
const cloneRepo = vi.fn(async () => repo);
const listBranches = vi.fn(async () => [{ value: 'feature-x', label: 'feature-x', isRemote: false }]);
const fetchRepo = vi.fn(async () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('claudeOrchestrator', {
    listRepos,
    listTasks,
    createTask,
    openTask,
    closeTask,
    removeTask,
    selectFolder,
    addRepo,
    cloneRepo,
    listBranches,
    fetchRepo,
    getTaskNotes,
    setTaskNotes,
    sendPtyInput: vi.fn(),
    resizePty: vi.fn(),
    onPtyOutput: vi.fn(() => vi.fn()),
  });
});

describe('App', () => {
  it('loads repos and tasks on mount and renders the sidebar', async () => {
    render(<App />);
    expect(await screen.findByText('demo')).toBeInTheDocument();
    expect(await screen.findByText('Fix login bug')).toBeInTheDocument();
  });

  it('selecting a task opens it and shows its notes panel', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));
    expect(openTask).toHaveBeenCalledWith('task-1');
    expect(await screen.findByDisplayValue('notes')).toBeInTheDocument();
  });

  it('"Open Existing Repo" picks a folder via the native dialog and adds it', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open Existing Repo' }));
    expect(selectFolder).toHaveBeenCalledOnce();
    expect(addRepo).toHaveBeenCalledWith('C:\\Users\\paulo.rodriguez\\Paulo\\demo-repo');
  });

  it('does not call addRepo when the folder picker is cancelled', async () => {
    selectFolder.mockResolvedValueOnce(undefined);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open Existing Repo' }));
    expect(addRepo).not.toHaveBeenCalled();
  });

  it('shows a visible error when creating a task fails, instead of failing silently', async () => {
    createTask.mockRejectedValueOnce(new Error('git worktree add failed: fatal: branch already exists'));
    render(<App />);
    const newTaskButtons = await screen.findAllByRole('button', { name: 'New Task' });
    const firstNewTaskButton = newTaskButtons[0];
    if (!firstNewTaskButton) {
      throw new Error('Expected at least one "New Task" button to be rendered');
    }
    await userEvent.click(firstNewTaskButton);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix login bug');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('git worktree add failed: fatal: branch already exists');
  });

  it('removing a task calls removeTask and removes it from the list when confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await screen.findByText('Fix login bug');
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    const firstRemoveButton = removeButtons[0];
    if (!firstRemoveButton) {
      throw new Error('Expected at least one "Remove" button to be rendered');
    }
    await userEvent.click(firstRemoveButton);
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(removeTask).toHaveBeenCalledWith('task-1');
    await waitFor(() => expect(screen.queryByText('Fix login bug')).not.toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it('does not remove the task when the removal confirmation is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);
    await screen.findByText('Fix login bug');
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    const firstRemoveButton = removeButtons[0];
    if (!firstRemoveButton) {
      throw new Error('Expected at least one "Remove" button to be rendered');
    }
    await userEvent.click(firstRemoveButton);
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(removeTask).not.toHaveBeenCalled();
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('fetches branches for the repo when New Task is opened', async () => {
    render(<App />);
    const newTaskButtons = await screen.findAllByRole('button', { name: 'New Task' });
    const firstNewTaskButton = newTaskButtons[0];
    if (!firstNewTaskButton) {
      throw new Error('Expected at least one "New Task" button to be rendered');
    }
    await userEvent.click(firstNewTaskButton);
    expect(listBranches).toHaveBeenCalledWith('repo-1');
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    expect(await screen.findByRole('option', { name: 'feature-x' })).toBeInTheDocument();
  });

  it('creating a task with an existing branch selected forwards existingBranch to createTask', async () => {
    render(<App />);
    const newTaskButtons = await screen.findAllByRole('button', { name: 'New Task' });
    const firstNewTaskButton = newTaskButtons[0];
    if (!firstNewTaskButton) {
      throw new Error('Expected at least one "New Task" button to be rendered');
    }
    await userEvent.click(firstNewTaskButton);
    await userEvent.type(screen.getByLabelText('Title'), 'Resume feature work');
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    await userEvent.selectOptions(await screen.findByRole('combobox'), 'feature-x');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: 'repo-1', existingBranch: 'feature-x' }),
    );
  });

  it('dismissing the error banner clears the error message', async () => {
    createTask.mockRejectedValueOnce(new Error('git worktree add failed: fatal: branch already exists'));
    render(<App />);
    const newTaskButtons = await screen.findAllByRole('button', { name: 'New Task' });
    const firstNewTaskButton = newTaskButtons[0];
    if (!firstNewTaskButton) {
      throw new Error('Expected at least one "New Task" button to be rendered');
    }
    await userEvent.click(firstNewTaskButton);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix login bug');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('opening a second task adds a new tab without closing the first tab\'s terminal', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add tests' }));
    expect(openTask).toHaveBeenCalledWith('task-1');
    expect(openTask).toHaveBeenCalledWith('task-2');
    expect(screen.getByRole('button', { name: 'Close Fix login bug' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Add tests' })).toBeInTheDocument();
  });

  it('clicking an already-open task switches tabs without reopening the pty session or refetching notes', async () => {
    // mockImplementationOnce (not mockImplementation) so the override only
    // applies to these two calls and doesn't leak into later tests — plain
    // vi.clearAllMocks() in beforeEach clears call history but does not
    // reset a standing mockImplementation override.
    getTaskNotes
      .mockImplementationOnce(async () => ({ body: 'notes for task 1', status: 'todo' as const }))
      .mockImplementationOnce(async () => ({ body: 'notes for task 2', status: 'todo' as const }));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));
    expect(await screen.findByDisplayValue('notes for task 1')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Add tests' }));
    expect(await screen.findByDisplayValue('notes for task 2')).toBeInTheDocument();
    expect(getTaskNotes).toHaveBeenCalledTimes(2);
    openTask.mockClear();
    getTaskNotes.mockClear();
    const fixLoginBugButtons = screen.getAllByRole('button', { name: 'Fix login bug' });
    const sidebarButton = fixLoginBugButtons[0];
    if (!sidebarButton) {
      throw new Error('Expected a "Fix login bug" button to be rendered');
    }
    await userEvent.click(sidebarButton);
    expect(openTask).not.toHaveBeenCalled();
    expect(getTaskNotes).not.toHaveBeenCalled();
    // Proves a real per-task cache is used (not just a suppressed call):
    // task-1's own notes body is still shown after switching back to it,
    // rather than a stale/empty body.
    expect(await screen.findByDisplayValue('notes for task 1')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('notes for task 2')).not.toBeInTheDocument();
  });

  it('closing a tab calls closeTask and removes it, without affecting the sidebar', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add tests' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close Add tests' }));
    expect(closeTask).toHaveBeenCalledWith('task-2');
    expect(screen.queryByRole('button', { name: 'Close Add tests' })).not.toBeInTheDocument();
    expect(screen.getByText('Add tests')).toBeInTheDocument();
  });

  it('closing the sole open tab sets activeTaskId to undefined', async () => {
    render(<App />);
    const sidebarTaskButton = await screen.findByRole('button', { name: 'Fix login bug' });
    await userEvent.click(sidebarTaskButton);
    expect(sidebarTaskButton).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Close Fix login bug' }));

    expect(sidebarTaskButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('closing a tab that is not the active one leaves activeTaskId unchanged', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add tests' }));

    await userEvent.click(screen.getByRole('button', { name: 'Close Fix login bug' }));

    expect(closeTask).toHaveBeenCalledWith('task-1');
    const addTestsButtons = screen.getAllByRole('button', { name: 'Add tests' });
    addTestsButtons.forEach((button) => expect(button).toHaveAttribute('aria-pressed', 'true'));
  });

  it('shows the correct notes for each tab when switching, not a stale draft from the other tab', async () => {
    // mockImplementationOnce (not mockImplementation) so the override only
    // applies to these two calls and doesn't leak into later tests — plain
    // vi.clearAllMocks() in beforeEach clears call history but does not
    // reset a standing mockImplementation override.
    getTaskNotes
      .mockImplementationOnce(async () => ({ body: 'notes for task 1', status: 'todo' as const }))
      .mockImplementationOnce(async () => ({ body: 'notes for task 2', status: 'todo' as const }));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));
    expect(await screen.findByDisplayValue('notes for task 1')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Add tests' }));
    expect(await screen.findByDisplayValue('notes for task 2')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('notes for task 1')).not.toBeInTheDocument();
  });

  it('keeps the New Task modal open with a pending state until the new task session starts', async () => {
    const taskDeferred = createDeferred<TaskRecord>();
    createTask.mockReturnValueOnce(taskDeferred.promise);
    render(<App />);
    const newTaskButtons = await screen.findAllByRole('button', { name: 'New Task' });
    const firstNewTaskButton = newTaskButtons[0];
    if (!firstNewTaskButton) {
      throw new Error('Expected at least one "New Task" button to be rendered');
    }
    await userEvent.click(firstNewTaskButton);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix login bug');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));

    expect(await screen.findByRole('button', { name: /Creating/ })).toBeDisabled();
    expect(screen.getByRole('dialog', { name: 'New Task' })).toBeInTheDocument();

    taskDeferred.resolve(task);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Task' })).not.toBeInTheDocument());
  });

  it('shows a starting-session overlay while opening an existing task, then hides it', async () => {
    const openDeferred = createDeferred<void>();
    openTask.mockReturnValueOnce(openDeferred.promise);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));

    expect(await screen.findByText('Starting session…')).toBeInTheDocument();

    openDeferred.resolve();
    await waitFor(() => expect(screen.queryByText('Starting session…')).not.toBeInTheDocument());
  });

  it('keeps the Clone Repo modal open with a pending state until cloning finishes', async () => {
    const cloneDeferred = createDeferred<RepoRecord>();
    cloneRepo.mockReturnValueOnce(cloneDeferred.promise);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clone Repo' }));
    await userEvent.type(screen.getByLabelText('Git URL'), 'https://github.com/paurodriguez0220/demo.git');
    await userEvent.type(screen.getByLabelText('Local Name'), 'demo');
    await userEvent.click(screen.getByRole('button', { name: 'Clone' }));

    expect(await screen.findByRole('button', { name: /Cloning/ })).toBeDisabled();

    cloneDeferred.resolve(repo);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Clone Repo' })).not.toBeInTheDocument());
  });

  it('"Review Code" fetches the repo, lists branches, and opens the modal in review mode', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Review Code' }));
    expect(fetchRepo).toHaveBeenCalledWith('repo-1');
    expect(listBranches).toHaveBeenCalledWith('repo-1');
    expect(screen.queryByRole('radio', { name: 'Use existing branch' })).not.toBeInTheDocument();
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
  });

  it('creating a task from the review flow forwards kind "review" to createTask', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Review Code' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Review PR #42');
    await userEvent.selectOptions(await screen.findByRole('combobox'), 'feature-x');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: 'repo-1', existingBranch: 'feature-x', kind: 'review' }),
    );
  });
});
