import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoreData } from '../../shared/types';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
}));

let store: StoreData = { repos: [], tasks: [] };

vi.mock('../services/store', () => ({
  readStore: vi.fn(async () => store),
  writeStore: vi.fn(async (_path: string, data: StoreData) => {
    store = data;
  }),
}));

vi.mock('../services/git-service', () => ({
  addWorktree: vi.fn(async () => undefined),
  addWorktreeForExistingBranch: vi.fn(async () => undefined),
  removeWorktree: vi.fn(async () => undefined),
}));

vi.mock('../services/notes-service', () => ({
  readTaskNotes: vi.fn(async () => ({
    frontmatter: { title: 't', branch: 'b', worktreePath: 'C:\\w', status: 'todo' },
    body: 'existing notes',
  })),
  writeTaskNotes: vi.fn(async () => undefined),
  archiveTaskNotes: vi.fn(async () => undefined),
}));

const spawnClaudeSession = vi.fn();
const isSessionAlive = vi.fn().mockReturnValue(false);
const killSession = vi.fn();

vi.mock('../services/pty-manager', () => ({
  spawnClaudeSession: (...args: unknown[]) => spawnClaudeSession(...args),
  isSessionAlive: (...args: unknown[]) => isSessionAlive(...args),
  killSession: (...args: unknown[]) => killSession(...args),
}));

vi.mock('../paths', () => ({
  getStorePath: () => 'C:\\fake\\store.json',
  getTaskNotesPath: (taskId: string) => `C:\\fake\\tasks\\${taskId}.md`,
  getWorktreePath: (repoPath: string, repoName: string, slug: string) =>
    `${repoPath}\\..\\${repoName}-worktrees\\${slug}`,
}));

import { registerTaskHandlers } from './task-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { addWorktree, addWorktreeForExistingBranch, removeWorktree } from '../services/git-service';
import { readTaskNotes } from '../services/notes-service';

describe('task-handlers', () => {
  const onPtyData = vi.fn();

  beforeEach(() => {
    store = {
      repos: [{ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' }],
      tasks: [],
    };
    handlers.clear();
    spawnClaudeSession.mockClear();
    isSessionAlive.mockClear();
    killSession.mockClear();
    vi.mocked(addWorktree).mockClear();
    vi.mocked(addWorktreeForExistingBranch).mockClear();
    vi.mocked(removeWorktree).mockClear();
    vi.mocked(readTaskNotes).mockClear();
    registerTaskHandlers(onPtyData);
  });

  it('TaskCreate adds a worktree, stores a task record, and spawns a fresh session', async () => {
    const handler = handlers.get(IpcChannels.TaskCreate);
    const task = await handler?.({}, { repoId: 'repo-1', title: 'Fix login bug', adoId: 'ADO-1' });
    expect(addWorktree).toHaveBeenCalledWith('C:\\demo', 'C:\\demo\\..\\demo-worktrees\\fix-login-bug', 'task/fix-login-bug');
    expect(task).toMatchObject({ title: 'Fix login bug', adoId: 'ADO-1', status: 'todo' });
    expect(store.tasks).toHaveLength(1);
    expect(spawnClaudeSession).toHaveBeenCalledWith(
      expect.any(String),
      'C:\\demo\\..\\demo-worktrees\\fix-login-bug',
      false,
      onPtyData,
    );
  });

  it('TaskCreate rejects an unknown repoId', async () => {
    const handler = handlers.get(IpcChannels.TaskCreate);
    await expect(handler?.({}, { repoId: 'nope', title: 'x' })).rejects.toThrow('Unknown repo');
  });

  it('TaskCreate attaches to an existing branch instead of creating one when existingBranch is set', async () => {
    const handler = handlers.get(IpcChannels.TaskCreate);
    const task = await handler?.({}, { repoId: 'repo-1', title: 'Resume feature work', existingBranch: 'feature-x' });
    expect(addWorktreeForExistingBranch).toHaveBeenCalledWith('C:\\demo', 'C:\\demo\\..\\demo-worktrees\\feature-x', 'feature-x');
    expect(addWorktree).not.toHaveBeenCalled();
    expect(task).toMatchObject({ title: 'Resume feature work', branch: 'feature-x' });
  });

  it('TaskCreate tags the record with kind "review" when requested, and defaults to "worktree" otherwise', async () => {
    const handler = handlers.get(IpcChannels.TaskCreate);
    const defaultTask = await handler?.({}, { repoId: 'repo-1', title: 'Fix login bug' });
    expect(defaultTask).toMatchObject({ kind: 'worktree' });

    const reviewTask = await handler?.(
      {},
      { repoId: 'repo-1', title: 'Review PR #42', existingBranch: 'feature-x', kind: 'review' },
    );
    expect(reviewTask).toMatchObject({ kind: 'review', branch: 'feature-x' });
  });

  it('TaskCreate rejects creating a second task for a branch that already has one, without calling git', async () => {
    store.tasks.push({
      id: 'task-1',
      repoId: 'repo-1',
      title: 'Resume feature work',
      branch: 'feature-x',
      worktreePath: 'C:\\demo-worktrees\\feature-x',
      status: 'todo',
      kind: 'worktree',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    const handler = handlers.get(IpcChannels.TaskCreate);
    await expect(
      handler?.({}, { repoId: 'repo-1', title: 'Resume feature work again', existingBranch: 'feature-x' }),
    ).rejects.toThrow('A task for branch "feature-x" already exists');
    expect(addWorktreeForExistingBranch).not.toHaveBeenCalled();
    expect(addWorktree).not.toHaveBeenCalled();
    expect(store.tasks).toHaveLength(1);
  });

  it('TaskCreate rejects a duplicate generated branch name for a repeated title, without calling git', async () => {
    store.tasks.push({
      id: 'task-1',
      repoId: 'repo-1',
      title: 'Fix login bug',
      branch: 'task/fix-login-bug',
      worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
      status: 'todo',
      kind: 'worktree',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    const handler = handlers.get(IpcChannels.TaskCreate);
    await expect(handler?.({}, { repoId: 'repo-1', title: 'Fix login bug' })).rejects.toThrow(
      'A task for branch "task/fix-login-bug" already exists',
    );
    expect(addWorktree).not.toHaveBeenCalled();
    expect(store.tasks).toHaveLength(1);
  });

  it('TaskOpen resumes an existing task session when none is alive', async () => {
    store.tasks.push({
      id: 'task-1',
      repoId: 'repo-1',
      title: 'Fix login bug',
      branch: 'task/fix-login-bug',
      worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
      status: 'todo',
      kind: 'worktree',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    const handler = handlers.get(IpcChannels.TaskOpen);
    await handler?.({}, 'task-1');
    expect(spawnClaudeSession).toHaveBeenCalledWith('task-1', 'C:\\demo-worktrees\\fix-login-bug', true, onPtyData);
  });

  it('TaskOpen does nothing when a session is already alive', async () => {
    isSessionAlive.mockReturnValue(true);
    store.tasks.push({
      id: 'task-1',
      repoId: 'repo-1',
      title: 'Fix login bug',
      branch: 'task/fix-login-bug',
      worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
      status: 'todo',
      kind: 'worktree',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    const handler = handlers.get(IpcChannels.TaskOpen);
    await handler?.({}, 'task-1');
    expect(spawnClaudeSession).not.toHaveBeenCalled();
  });

  it('TaskRemove kills the session, removes the worktree, drops the task, and archives notes', async () => {
    store.tasks.push({
      id: 'task-1',
      repoId: 'repo-1',
      title: 'Fix login bug',
      branch: 'task/fix-login-bug',
      worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
      status: 'todo',
      kind: 'worktree',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    const handler = handlers.get(IpcChannels.TaskRemove);
    await handler?.({}, 'task-1');
    expect(killSession).toHaveBeenCalledWith('task-1');
    expect(removeWorktree).toHaveBeenCalledWith('C:\\demo', 'C:\\demo-worktrees\\fix-login-bug');
    expect(store.tasks).toHaveLength(0);
  });

  it('TaskSearch matches by title, branch, and adoId case-insensitively, without reading any notes file', async () => {
    store.tasks.push(
      {
        id: 'task-1',
        repoId: 'repo-1',
        title: 'Fix login bug',
        adoId: 'ADO-42',
        branch: 'task/fix-login-bug',
        worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
        status: 'todo',
        kind: 'worktree',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
      {
        id: 'task-2',
        repoId: 'repo-1',
        title: 'Add tests',
        branch: 'task/add-tests',
        worktreePath: 'C:\\demo-worktrees\\add-tests',
        status: 'todo',
        kind: 'worktree',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    );
    const handler = handlers.get(IpcChannels.TaskSearch);
    expect(await handler?.({}, 'LOGIN')).toEqual(['task-1']);
    expect(await handler?.({}, 'add-tests')).toEqual(['task-2']);
    expect(await handler?.({}, 'ado-42')).toEqual(['task-1']);
    expect(readTaskNotes).not.toHaveBeenCalled();
  });

  it('TaskSearch falls back to notes-body content when no in-memory field matches', async () => {
    store.tasks.push(
      {
        id: 'task-1',
        repoId: 'repo-1',
        title: 'Fix login bug',
        branch: 'task/fix-login-bug',
        worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
        status: 'todo',
        kind: 'worktree',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
      {
        id: 'task-2',
        repoId: 'repo-1',
        title: 'Add tests',
        branch: 'task/add-tests',
        worktreePath: 'C:\\demo-worktrees\\add-tests',
        status: 'todo',
        kind: 'worktree',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    );
    vi.mocked(readTaskNotes).mockImplementation(async (path: string) => ({
      frontmatter: { title: 't', branch: 'b', worktreePath: 'C:\\w', status: 'todo' as const, kind: 'worktree' as const },
      body: path.includes('task-1') ? 'Investigating the redirect loop' : '',
    }));
    const result = await handlers.get(IpcChannels.TaskSearch)?.({}, 'redirect');
    expect(result).toEqual(['task-1']);
    expect(readTaskNotes).toHaveBeenCalledTimes(2);
  });

  it('TaskSearch returns an empty array when nothing matches', async () => {
    store.tasks.push({
      id: 'task-1',
      repoId: 'repo-1',
      title: 'Fix login bug',
      branch: 'task/fix-login-bug',
      worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
      status: 'todo',
      kind: 'worktree',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    vi.mocked(readTaskNotes).mockResolvedValue({
      frontmatter: { title: 't', branch: 'b', worktreePath: 'C:\\w', status: 'todo', kind: 'worktree' },
      body: '',
    });
    expect(await handlers.get(IpcChannels.TaskSearch)?.({}, 'nonexistent')).toEqual([]);
  });

  it('TaskSearch skips a task whose notes file cannot be read instead of throwing', async () => {
    store.tasks.push({
      id: 'task-1',
      repoId: 'repo-1',
      title: 'Fix login bug',
      branch: 'task/fix-login-bug',
      worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
      status: 'todo',
      kind: 'worktree',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    vi.mocked(readTaskNotes).mockRejectedValue(Object.assign(new Error('not found'), { code: 'ENOENT' }));
    await expect(handlers.get(IpcChannels.TaskSearch)?.({}, 'redirect')).resolves.toEqual([]);
  });
});
