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
}));

vi.mock('../paths', () => ({
  getStorePath: () => 'C:\\fake\\store.json',
  getReposRoot: () => 'C:\\fake\\repos',
}));

import { registerRepoHandlers } from './repo-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { cloneRepo } from '../services/git-service';

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
});
