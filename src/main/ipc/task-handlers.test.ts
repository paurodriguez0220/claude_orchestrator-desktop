import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoreData, TaskRecord } from '../../shared/types';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
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
  getScratchPath: (taskId: string) => `C:\\fake\\scratch\\${taskId}`,
}));

import { registerTaskHandlers } from './task-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { addWorktree, addWorktreeForExistingBranch, removeWorktree } from '../services/git-service';
import { mkdir, rm } from 'node:fs/promises';

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
    vi.mocked(mkdir).mockClear();
    vi.mocked(rm).mockClear();
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

  it('TaskCreate creates an empty scratch directory and stores a task with no repoId/branch, without calling git', async () => {
    const handler = handlers.get(IpcChannels.TaskCreate);
    const task = await handler?.({}, { title: 'What does this error mean?', kind: 'scratch' });
    expect(mkdir).toHaveBeenCalledWith('C:\\fake\\scratch\\' + (task as TaskRecord).id, { recursive: true });
    expect(task).toMatchObject({ title: 'What does this error mean?', kind: 'scratch', status: 'todo' });
    expect((task as TaskRecord).repoId).toBeUndefined();
    expect((task as TaskRecord).branch).toBeUndefined();
    expect(addWorktree).not.toHaveBeenCalled();
    expect(addWorktreeForExistingBranch).not.toHaveBeenCalled();
    expect(store.tasks).toHaveLength(1);
  });

  it('TaskRemove deletes the scratch directory recursively instead of calling removeWorktree, for a scratch task', async () => {
    store.tasks.push({
      id: 'task-2',
      title: 'What does this error mean?',
      worktreePath: 'C:\\fake\\scratch\\task-2',
      status: 'todo',
      kind: 'scratch',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    const handler = handlers.get(IpcChannels.TaskRemove);
    await handler?.({}, 'task-2');
    expect(rm).toHaveBeenCalledWith('C:\\fake\\scratch\\task-2', { recursive: true, force: true });
    expect(removeWorktree).not.toHaveBeenCalled();
    expect(store.tasks).toHaveLength(0);
  });
});
