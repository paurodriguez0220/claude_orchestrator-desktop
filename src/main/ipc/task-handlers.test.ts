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

const queueDsuAutoRegenerate = vi.fn();

vi.mock('../services/dsu-orchestrator', () => ({
  queueDsuAutoRegenerate: (...args: unknown[]) => queueDsuAutoRegenerate(...args),
}));

import { registerTaskHandlers } from './task-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { addWorktree, addWorktreeForExistingBranch, removeWorktree } from '../services/git-service';
import { readTaskNotes, writeTaskNotes } from '../services/notes-service';
import { writeStore } from '../services/store';
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
    vi.mocked(readTaskNotes).mockClear();
    vi.mocked(mkdir).mockClear();
    vi.mocked(rm).mockClear();
    queueDsuAutoRegenerate.mockClear();
    registerTaskHandlers(onPtyData);
  });

  it('TaskCreate adds a worktree, stores a task record, and spawns a fresh session', async () => {
    const handler = handlers.get(IpcChannels.TaskCreate);
    const task = await handler?.({}, { repoId: 'repo-1', title: 'Fix login bug', adoId: 'ADO-1' });
    expect(addWorktree).toHaveBeenCalledWith('C:\\demo', 'C:\\demo\\..\\demo-worktrees\\fix-login-bug', 'feature/fix-login-bug');
    expect(task).toMatchObject({ title: 'Fix login bug', adoId: 'ADO-1', status: 'todo' });
    expect(store.tasks).toHaveLength(1);
    expect(spawnClaudeSession).toHaveBeenCalledWith(
      expect.any(String),
      'C:\\demo\\..\\demo-worktrees\\fix-login-bug',
      false,
      onPtyData,
    );
  });

  it('TaskCreate composes the branch from branchPrefix + slug', async () => {
    const handler = handlers.get(IpcChannels.TaskCreate);
    const task = await handler?.({}, { repoId: 'repo-1', title: 'Fix login bug', branchPrefix: 'fix/' });
    expect(addWorktree).toHaveBeenCalledWith('C:\\demo', 'C:\\demo\\..\\demo-worktrees\\fix-login-bug', 'fix/fix-login-bug');
    expect(task).toMatchObject({ branch: 'fix/fix-login-bug' });
  });

  it('TaskCreate lets an explicit branch override the prefix', async () => {
    const handler = handlers.get(IpcChannels.TaskCreate);
    const task = await handler?.({}, { repoId: 'repo-1', title: 'Fix login bug', branchPrefix: 'fix/', branch: 'hotfix/custom' });
    expect(addWorktree).toHaveBeenCalledWith('C:\\demo', 'C:\\demo\\..\\demo-worktrees\\fix-login-bug', 'hotfix/custom');
    expect(task).toMatchObject({ branch: 'hotfix/custom' });
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
      branch: 'feature/fix-login-bug',
      worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
      status: 'todo',
      kind: 'worktree',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    const handler = handlers.get(IpcChannels.TaskCreate);
    await expect(handler?.({}, { repoId: 'repo-1', title: 'Fix login bug' })).rejects.toThrow(
      'A task for branch "feature/fix-login-bug" already exists',
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

  it('TaskSetStatus rewrites the notes frontmatter status without touching the body', async () => {
    vi.mocked(readTaskNotes).mockResolvedValueOnce({
      frontmatter: { title: 't', branch: 'b', worktreePath: 'C:\\w', status: 'todo', kind: 'worktree' },
      body: 'existing notes',
    });
    const handler = handlers.get(IpcChannels.TaskSetStatus);
    await handler?.({}, { taskId: 'task-1', status: 'done' });
    expect(vi.mocked(writeTaskNotes)).toHaveBeenCalledWith(
      'C:\\fake\\tasks\\task-1.md',
      expect.objectContaining({
        body: 'existing notes',
        frontmatter: expect.objectContaining({ status: 'done', title: 't' }),
      }),
    );
  });

  it('TaskSetStatus also persists the new status onto the matching task in store.json', async () => {
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
    vi.mocked(readTaskNotes).mockResolvedValueOnce({
      frontmatter: { title: 't', branch: 'b', worktreePath: 'C:\\w', status: 'todo', kind: 'worktree' },
      body: 'existing notes',
    });
    const handler = handlers.get(IpcChannels.TaskSetStatus);
    await handler?.({}, { taskId: 'task-1', status: 'done' });
    expect(store.tasks.find((task) => task.id === 'task-1')).toMatchObject({ status: 'done' });
    expect(vi.mocked(writeStore)).toHaveBeenCalled();
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

  it('TaskClose queues a DSU auto-regenerate for a worktree task', async () => {
    store.tasks = [
      {
        id: 'task-1',
        repoId: 'repo-1',
        title: 'Fix login bug',
        worktreePath: 'C:\\w',
        status: 'todo',
        kind: 'worktree',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    ];
    const handler = handlers.get(IpcChannels.TaskClose);
    await handler?.({}, 'task-1');
    expect(killSession).toHaveBeenCalledWith('task-1');
    expect(queueDsuAutoRegenerate).toHaveBeenCalledOnce();
  });

  it('TaskClose does not queue a DSU auto-regenerate for a scratch task', async () => {
    store.tasks = [
      {
        id: 'task-1',
        title: 'Quick question',
        worktreePath: 'C:\\fake\\scratch\\task-1',
        status: 'todo',
        kind: 'scratch',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    ];
    const handler = handlers.get(IpcChannels.TaskClose);
    await handler?.({}, 'task-1');
    expect(queueDsuAutoRegenerate).not.toHaveBeenCalled();
  });

  it('TaskRemove queues a DSU auto-regenerate for a worktree task', async () => {
    store.tasks = [
      {
        id: 'task-1',
        repoId: 'repo-1',
        title: 'Fix login bug',
        worktreePath: 'C:\\w',
        status: 'todo',
        kind: 'worktree',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    ];
    const handler = handlers.get(IpcChannels.TaskRemove);
    await handler?.({}, 'task-1');
    expect(queueDsuAutoRegenerate).toHaveBeenCalledOnce();
  });

  it('TaskRemove does not queue a DSU auto-regenerate for a scratch task', async () => {
    store.tasks = [
      {
        id: 'task-1',
        title: 'Quick question',
        worktreePath: 'C:\\fake\\scratch\\task-1',
        status: 'todo',
        kind: 'scratch',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    ];
    const handler = handlers.get(IpcChannels.TaskRemove);
    await handler?.({}, 'task-1');
    expect(queueDsuAutoRegenerate).not.toHaveBeenCalled();
  });
});
