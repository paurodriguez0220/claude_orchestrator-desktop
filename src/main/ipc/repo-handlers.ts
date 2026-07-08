import { ipcMain, dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import { join, basename } from 'node:path';
import { IpcChannels } from '../../shared/ipc-channels';
import type { RepoAddRequest, RepoCloneRequest, BranchOption } from '../../shared/ipc-channels';
import type { RepoRecord } from '../../shared/types';
import { readStore, writeStore } from '../services/store';
import { cloneRepo, listBranches, fetchRepo } from '../services/git-service';
import { assertValidGitUrl, assertSafeFolderName } from '../services/slug';
import { getStorePath, getReposRoot } from '../paths';

export function registerRepoHandlers(): void {
  ipcMain.handle(IpcChannels.DialogSelectFolder, async (): Promise<string | undefined> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? undefined : result.filePaths[0];
  });

  ipcMain.handle(IpcChannels.RepoAdd, async (_event, request: RepoAddRequest): Promise<RepoRecord> => {
    const store = await readStore(getStorePath());
    const repo: RepoRecord = {
      id: randomUUID(),
      name: basename(request.path),
      path: request.path,
      createdAt: new Date().toISOString(),
    };
    store.repos.push(repo);
    await writeStore(getStorePath(), store);
    return repo;
  });

  ipcMain.handle(IpcChannels.RepoClone, async (_event, request: RepoCloneRequest): Promise<RepoRecord> => {
    assertValidGitUrl(request.url);
    assertSafeFolderName(request.name);
    const destinationPath = join(getReposRoot(), request.name);
    await cloneRepo(request.url, destinationPath);
    const store = await readStore(getStorePath());
    const repo: RepoRecord = {
      id: randomUUID(),
      name: request.name,
      path: destinationPath,
      remoteUrl: request.url,
      createdAt: new Date().toISOString(),
    };
    store.repos.push(repo);
    await writeStore(getStorePath(), store);
    return repo;
  });

  ipcMain.handle(IpcChannels.RepoList, async (): Promise<RepoRecord[]> => {
    const store = await readStore(getStorePath());
    return store.repos;
  });

  ipcMain.handle(IpcChannels.RepoBranches, async (_event, repoId: string): Promise<BranchOption[]> => {
    const store = await readStore(getStorePath());
    const repo = store.repos.find((candidate) => candidate.id === repoId);
    if (!repo) {
      throw new Error(`Unknown repo: ${repoId}`);
    }
    const { local, remote } = await listBranches(repo.path);
    const localSet = new Set(local);
    const options: BranchOption[] = local.map((name) => ({ value: name, label: name, isRemote: false }));
    for (const remoteRef of remote) {
      const slashIndex = remoteRef.indexOf('/');
      const bareName = slashIndex === -1 ? remoteRef : remoteRef.slice(slashIndex + 1);
      if (!localSet.has(bareName)) {
        options.push({ value: bareName, label: remoteRef, isRemote: true });
      }
    }
    return options;
  });

  ipcMain.handle(IpcChannels.RepoFetch, async (_event, repoId: string): Promise<void> => {
    const store = await readStore(getStorePath());
    const repo = store.repos.find((candidate) => candidate.id === repoId);
    if (!repo) {
      throw new Error(`Unknown repo: ${repoId}`);
    }
    await fetchRepo(repo.path);
  });
}
