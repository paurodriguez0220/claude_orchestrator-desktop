import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoreData } from '../../shared/types';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

const showOpenDialogMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
  dialog: {
    showOpenDialog: (...args: unknown[]) => showOpenDialogMock(...args),
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
  cloneRepo: vi.fn(async () => undefined),
  listBranches: vi.fn(async () => ({ local: ['main', 'feature-x'], remote: ['origin/main', 'origin/feature-y'] })),
  fetchRepo: vi.fn(async () => undefined),
}));

vi.mock('../paths', () => ({
  getStorePath: () => 'C:\\fake\\store.json',
  getReposRoot: () => 'C:\\fake\\repos',
}));

import { registerRepoHandlers } from './repo-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { cloneRepo, listBranches, fetchRepo } from '../services/git-service';

describe('repo-handlers', () => {
  beforeEach(() => {
    store = { repos: [], tasks: [] };
    handlers.clear();
    registerRepoHandlers();
  });

  it('RepoAdd stores a repo record pointing at the given path', async () => {
    const handler = handlers.get(IpcChannels.RepoAdd);
    const repo = await handler?.({}, { path: 'C:\\Users\\paulo.rodriguez\\Paulo\\demo-repo' });
    expect(repo).toMatchObject({ name: 'demo-repo', path: 'C:\\Users\\paulo.rodriguez\\Paulo\\demo-repo' });
    expect(store.repos).toHaveLength(1);
  });

  it('RepoClone rejects an unsafe URL before calling git', async () => {
    const handler = handlers.get(IpcChannels.RepoClone);
    await expect(handler?.({}, { url: 'https://x; rm -rf /', name: 'evil' })).rejects.toThrow('Invalid git URL');
    expect(cloneRepo).not.toHaveBeenCalled();
  });

  it('RepoClone rejects an unsafe folder name before calling git', async () => {
    const handler = handlers.get(IpcChannels.RepoClone);
    await expect(
      handler?.({}, { url: 'https://github.com/paurodriguez0220/demo.git', name: '../../evil' }),
    ).rejects.toThrow();
    expect(cloneRepo).not.toHaveBeenCalled();
  });

  it('RepoClone clones into the repos root and stores a repo record', async () => {
    const handler = handlers.get(IpcChannels.RepoClone);
    const repo = await handler?.({}, { url: 'https://github.com/paurodriguez0220/demo.git', name: 'demo' });
    expect(cloneRepo).toHaveBeenCalledWith('https://github.com/paurodriguez0220/demo.git', 'C:\\fake\\repos\\demo');
    expect(repo).toMatchObject({ name: 'demo', remoteUrl: 'https://github.com/paurodriguez0220/demo.git' });
  });

  it('RepoList returns the current repos', async () => {
    store.repos.push({ id: '1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' });
    const handler = handlers.get(IpcChannels.RepoList);
    const result = await handler?.({});
    expect(result).toEqual(store.repos);
  });

  it('RepoBranches returns local branches plus remote-only branches with bare values', async () => {
    store.repos.push({ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' });
    const handler = handlers.get(IpcChannels.RepoBranches);
    const result = await handler?.({}, 'repo-1');
    expect(listBranches).toHaveBeenCalledWith('C:\\demo');
    expect(result).toEqual([
      { value: 'main', label: 'main', isRemote: false },
      { value: 'feature-x', label: 'feature-x', isRemote: false },
      { value: 'feature-y', label: 'origin/feature-y', isRemote: true },
    ]);
  });

  it('RepoBranches excludes a remote branch that already has a local counterpart', async () => {
    store.repos.push({ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' });
    vi.mocked(listBranches).mockResolvedValueOnce({
      local: ['main'],
      remote: ['origin/main'],
    });
    const handler = handlers.get(IpcChannels.RepoBranches);
    const result = await handler?.({}, 'repo-1');
    expect(result).toEqual([{ value: 'main', label: 'main', isRemote: false }]);
  });

  it('RepoBranches rejects an unknown repoId', async () => {
    const handler = handlers.get(IpcChannels.RepoBranches);
    await expect(handler?.({}, 'nope')).rejects.toThrow('Unknown repo');
  });

  it('DialogSelectFolder returns the chosen path', async () => {
    showOpenDialogMock.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\Users\\paulo.rodriguez\\Paulo\\demo-repo'] });
    const handler = handlers.get(IpcChannels.DialogSelectFolder);
    const result = await handler?.({});
    expect(result).toBe('C:\\Users\\paulo.rodriguez\\Paulo\\demo-repo');
  });

  it('DialogSelectFolder returns undefined when the user cancels', async () => {
    showOpenDialogMock.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    const handler = handlers.get(IpcChannels.DialogSelectFolder);
    const result = await handler?.({});
    expect(result).toBeUndefined();
  });

  it('RepoFetch runs git fetch for the given repo', async () => {
    store.repos.push({ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' });
    const handler = handlers.get(IpcChannels.RepoFetch);
    await handler?.({}, 'repo-1');
    expect(fetchRepo).toHaveBeenCalledWith('C:\\demo');
  });

  it('RepoSetUpdateBase persists updateBaseOnCreate onto the matching repo', async () => {
    store.repos.push({ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' });
    const handler = handlers.get(IpcChannels.RepoSetUpdateBase);
    await handler?.({}, { repoId: 'repo-1', updateBaseOnCreate: false });
    expect(store.repos.find((repo) => repo.id === 'repo-1')?.updateBaseOnCreate).toBe(false);
  });

  it('RepoSetUpdateBase rejects an unknown repoId', async () => {
    const handler = handlers.get(IpcChannels.RepoSetUpdateBase);
    await expect(handler?.({}, { repoId: 'nope', updateBaseOnCreate: true })).rejects.toThrow('Unknown repo');
  });

  it('RepoFolderCreate appends a folder with the given name and a generated id', async () => {
    store.repos.push({ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' });
    const handler = handlers.get(IpcChannels.RepoFolderCreate);
    await handler?.({}, { repoId: 'repo-1', name: 'Bug fixes' });
    const folders = store.repos.find((repo) => repo.id === 'repo-1')?.folders ?? [];
    expect(folders).toHaveLength(1);
    expect(folders[0]).toMatchObject({ name: 'Bug fixes' });
    expect(typeof folders[0]?.id).toBe('string');
  });

  it('RepoFolderRename updates the matching folder name', async () => {
    store.repos.push({
      id: 'repo-1',
      name: 'demo',
      path: 'C:\\demo',
      createdAt: '2026-07-08T00:00:00.000Z',
      folders: [{ id: 'folder-1', name: 'Old' }],
    });
    const handler = handlers.get(IpcChannels.RepoFolderRename);
    await handler?.({}, { repoId: 'repo-1', folderId: 'folder-1', name: 'New' });
    expect(store.repos.find((repo) => repo.id === 'repo-1')?.folders?.[0]?.name).toBe('New');
  });

  it('RepoFolderDelete removes the folder and clears folderId on its tasks, leaving worktrees alone', async () => {
    store.repos.push({
      id: 'repo-1',
      name: 'demo',
      path: 'C:\\demo',
      createdAt: '2026-07-08T00:00:00.000Z',
      folders: [{ id: 'folder-1', name: 'Bugs' }],
    });
    store.tasks.push({
      id: 'task-1',
      repoId: 'repo-1',
      title: 'Fix login bug',
      branch: 'feature/fix-login-bug',
      worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
      status: 'todo',
      kind: 'worktree',
      folderId: 'folder-1',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    const handler = handlers.get(IpcChannels.RepoFolderDelete);
    await handler?.({}, { repoId: 'repo-1', folderId: 'folder-1' });
    expect(store.repos.find((repo) => repo.id === 'repo-1')?.folders).toHaveLength(0);
    expect(store.tasks.find((task) => task.id === 'task-1')?.folderId).toBeUndefined();
  });

  it('RepoFolderCreate rejects an unknown repoId', async () => {
    const handler = handlers.get(IpcChannels.RepoFolderCreate);
    await expect(handler?.({}, { repoId: 'nope', name: 'x' })).rejects.toThrow('Unknown repo');
  });

  it('RepoFetch rejects an unknown repoId', async () => {
    const handler = handlers.get(IpcChannels.RepoFetch);
    await expect(handler?.({}, 'nope')).rejects.toThrow('Unknown repo');
  });
});
