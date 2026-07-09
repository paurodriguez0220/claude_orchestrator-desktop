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
const repoB: RepoRecord = { id: 'repo-2', name: 'other', path: 'C:\\other', createdAt: '2026-07-08T00:00:00.000Z' };
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
const doneTask: TaskRecord = { ...task2, id: 'task-3', title: 'Ship release notes', status: 'done' };

const scratchTask: TaskRecord = {
  id: 'task-3',
  title: 'What does this error mean?',
  worktreePath: 'C:\\scratch\\task-3',
  status: 'todo',
  kind: 'scratch',
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
const taskSearch = vi.fn(async (): Promise<string[]> => []);

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
    taskSearch,
    getTaskNotes,
    setTaskNotes,
    sendPtyInput: vi.fn(),
    resizePty: vi.fn(),
    onPtyOutput: vi.fn(() => vi.fn()),
    onTaskFinishedStateChanged: vi.fn(() => vi.fn()),
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
    await userEvent.click(await screen.findByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'feature-x' })).toBeInTheDocument();
  });

  it('ignores a stale listBranches response from a previously opened repo\'s modal', async () => {
    listRepos.mockResolvedValueOnce([repo, repoB]);
    const branchesA = createDeferred<{ value: string; label: string; isRemote: boolean }[]>();
    const branchesB = createDeferred<{ value: string; label: string; isRemote: boolean }[]>();
    listBranches.mockReturnValueOnce(branchesA.promise).mockReturnValueOnce(branchesB.promise);
    render(<App />);

    const newTaskButtons = await screen.findAllByRole('button', { name: 'New Task' });
    const [repoAButton, repoBButton] = newTaskButtons;
    if (!repoAButton || !repoBButton) {
      throw new Error('Expected two "New Task" buttons to be rendered');
    }

    // Open repo A's modal (kicks off its listBranches call), close it, then
    // open repo B's modal (kicks off a second listBranches call) before A's
    // response has arrived.
    await userEvent.click(repoAButton);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(repoBButton);

    // Resolve B's response first, then A's stale one arrives after — A's
    // result must not clobber what's shown for B.
    branchesB.resolve([{ value: 'feature-b', label: 'feature-b', isRemote: false }]);
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    await userEvent.click(await screen.findByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'feature-b' })).toBeInTheDocument();

    branchesA.resolve([{ value: 'feature-a', label: 'feature-a', isRemote: false }]);
    await waitFor(() => expect(listBranches).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('option', { name: 'feature-b' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'feature-a' })).not.toBeInTheDocument();
  });

  it('clears the branch list when the New Task modal is closed, so a reopened modal never briefly shows a stale list', async () => {
    const branchesReopen = createDeferred<{ value: string; label: string; isRemote: boolean }[]>();
    listBranches.mockResolvedValueOnce([{ value: 'feature-x', label: 'feature-x', isRemote: false }]);
    listBranches.mockReturnValueOnce(branchesReopen.promise);
    render(<App />);
    const newTaskButtons = await screen.findAllByRole('button', { name: 'New Task' });
    const firstNewTaskButton = newTaskButtons[0];
    if (!firstNewTaskButton) {
      throw new Error('Expected at least one "New Task" button to be rendered');
    }
    await userEvent.click(firstNewTaskButton);
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    await userEvent.click(await screen.findByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'feature-x' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(firstNewTaskButton);
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    await userEvent.click(await screen.findByRole('combobox'));
    // The reopen's listBranches call hasn't resolved yet — the picker must
    // not still be showing the previous, now-stale branch list.
    expect(screen.queryByRole('option', { name: 'feature-x' })).not.toBeInTheDocument();

    branchesReopen.resolve([{ value: 'feature-y', label: 'feature-y', isRemote: false }]);
    expect(await screen.findByRole('option', { name: 'feature-y' })).toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'feature-x' }));
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
    await userEvent.click(await screen.findByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'feature-x' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: 'repo-1', existingBranch: 'feature-x', kind: 'review' }),
    );
  });

  it('shows a finished dot on a background tab when the main process reports it finished, and clears it when that tab becomes active', async () => {
    let finishedListener: ((event: { taskId: string; finished: boolean }) => void) | undefined;
    const onTaskFinishedStateChanged = vi.fn(
      (listener: (event: { taskId: string; finished: boolean }) => void) => {
        finishedListener = listener;
        return vi.fn();
      },
    );
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
      onTaskFinishedStateChanged,
    });

    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add tests' }));

    expect(finishedListener).toBeDefined();
    finishedListener?.({ taskId: 'task-1', finished: true });

    expect(await screen.findByRole('status', { name: 'Fix login bug finished' })).toBeInTheDocument();

    // Both tabs are now open, so the sidebar and the tab bar each render a
    // "Fix login bug" button — mirrors the disambiguation already used
    // elsewhere in this file (e.g. the "clicking an already-open task"
    // test) rather than the plan's ambiguous getByRole, which would throw
    // once a second tab is open.
    const fixLoginBugButtons = screen.getAllByRole('button', { name: 'Fix login bug' });
    const sidebarButton = fixLoginBugButtons[0];
    if (!sidebarButton) {
      throw new Error('Expected a "Fix login bug" button to be rendered');
    }
    await userEvent.click(sidebarButton);
    expect(screen.queryByRole('status', { name: 'Fix login bug finished' })).not.toBeInTheDocument();
  });

  it('debounces typing in the search box before calling taskSearch, and filters the sidebar to the results', async () => {
    taskSearch.mockResolvedValueOnce(['task-2']);
    render(<App />);
    await screen.findByText('Fix login bug');
    const searchBox = screen.getByRole('searchbox', { name: 'Search tasks' });

    await userEvent.type(searchBox, 'tests');
    expect(taskSearch).not.toHaveBeenCalled();

    // "Add tests" is already rendered before the debounced search resolves
    // (both tasks show until filtering kicks in), so waiting on its
    // appearance would resolve immediately without exercising the debounce.
    // "Fix login bug" disappearing can only happen once the debounced
    // taskSearch call resolves and the sidebar is actually filtered.
    await waitFor(() => expect(screen.queryByText('Fix login bug')).not.toBeInTheDocument());
    expect(taskSearch).toHaveBeenCalledWith('tests');
    expect(screen.getByText('Add tests')).toBeInTheDocument();
  });

  it('clearing the search box restores the full task list without a new taskSearch call', async () => {
    taskSearch.mockResolvedValueOnce(['task-2']);
    render(<App />);
    await screen.findByText('Fix login bug');
    const searchBox = screen.getByRole('searchbox', { name: 'Search tasks' });

    await userEvent.type(searchBox, 'tests');
    expect(await screen.findByText('Add tests')).toBeInTheDocument();

    taskSearch.mockClear();
    await userEvent.clear(searchBox);

    expect(await screen.findByText('Fix login bug')).toBeInTheDocument();
    expect(screen.getByText('Add tests')).toBeInTheDocument();
    expect(taskSearch).not.toHaveBeenCalled();
  });

  it('renders the Quick Questions section with scratch tasks, separate from the per-repo tree', async () => {
    listTasks.mockResolvedValueOnce([task, task2, scratchTask]);
    render(<App />);
    expect(await screen.findByText('Quick Questions')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'What does this error mean?' })).toBeInTheDocument();
  });

  it('"+ New Question" creates a scratch task with no repoId and opens it', async () => {
    createTask.mockResolvedValueOnce(scratchTask);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '+ New Question' }));
    await userEvent.type(screen.getByLabelText('Title'), 'What does this error mean?');
    await userEvent.click(screen.getByRole('button', { name: 'Create Question' }));
    expect(createTask).toHaveBeenCalledWith({ title: 'What does this error mean?', kind: 'scratch' });
    expect(openTask).toHaveBeenCalledWith('task-3');
  });

  it('removing a scratch task shows a scratch-specific confirmation and calls removeTask', async () => {
    listTasks.mockResolvedValueOnce([task, task2, scratchTask]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await screen.findByText('What does this error mean?');
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    const scratchRemoveButton = removeButtons[removeButtons.length - 1];
    if (!scratchRemoveButton) {
      throw new Error('Expected a "Remove" button for the scratch task to be rendered');
    }
    await userEvent.click(scratchRemoveButton);
    expect(confirmSpy).toHaveBeenCalledWith('Remove this question? This deletes its scratch folder.');
    expect(removeTask).toHaveBeenCalledWith('task-3');
    confirmSpy.mockRestore();
  });

  it('keeps a done task out of the active list and lists it under a collapsed Archived toggle', async () => {
    listTasks.mockResolvedValueOnce([task, doneTask]);
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Fix login bug' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ship release notes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archived (1)' })).toBeInTheDocument();
  });

  it('selecting an archived task after expanding the Archived section still opens its tab', async () => {
    listTasks.mockResolvedValueOnce([task, doneTask]);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Archived (1)' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ship release notes' }));
    expect(openTask).toHaveBeenCalledWith('task-3');
  });
});
