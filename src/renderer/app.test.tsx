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

const repo: RepoRecord = { id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' };
const task: TaskRecord = {
  id: 'task-1',
  repoId: 'repo-1',
  title: 'Fix login bug',
  branch: 'task/fix-login-bug',
  worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
  status: 'todo',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
};

const listRepos = vi.fn(async () => [repo]);
const listTasks = vi.fn(async () => [task]);
const createTask = vi.fn(async () => task);
const openTask = vi.fn(async () => undefined);
const removeTask = vi.fn(async () => undefined);
const getTaskNotes = vi.fn(async () => ({ body: 'notes', status: 'todo' as const }));
const setTaskNotes = vi.fn(async () => undefined);
const selectFolder = vi.fn(async (): Promise<string | undefined> => 'C:\\Users\\paulo.rodriguez\\Paulo\\demo-repo');
const addRepo = vi.fn(async () => repo);
const cloneRepo = vi.fn(async () => repo);
const listBranches = vi.fn(async () => [{ value: 'feature-x', label: 'feature-x', isRemote: false }]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('claudeOrchestrator', {
    listRepos,
    listTasks,
    createTask,
    openTask,
    closeTask: vi.fn(),
    removeTask,
    selectFolder,
    addRepo,
    cloneRepo,
    listBranches,
    getTaskNotes,
    setTaskNotes,
    sendPtyInput: vi.fn(),
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
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(removeTask).toHaveBeenCalledWith('task-1');
    await waitFor(() => expect(screen.queryByText('Fix login bug')).not.toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it('does not remove the task when the removal confirmation is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);
    await screen.findByText('Fix login bug');
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
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
});
