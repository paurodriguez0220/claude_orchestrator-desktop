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

  it('RepoFetch rejects an unknown repoId', async () => {
    const handler = handlers.get(IpcChannels.RepoFetch);
    await expect(handler?.({}, 'nope')).rejects.toThrow('Unknown repo');
  });
});
