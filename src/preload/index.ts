import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';
import type {
  RepoRecord,
  TaskRecord,
} from '../shared/types';
import type {
  TaskCreateRequest,
  TaskCreateResult,
  TaskNotesSetRequest,
  TaskSetStatusRequest,
  TaskNotesGetResponse,
  PtyOutputEvent,
  TaskFinishedStateChangedEvent,
  BranchOption,
  DsuGenerateResponse,
  AdoSyncResult,
} from '../shared/ipc-channels';

export interface ClaudeOrchestratorApi {
  selectFolder(): Promise<string | undefined>;
  addRepo(path: string): Promise<RepoRecord>;
  cloneRepo(url: string, name: string): Promise<RepoRecord>;
  listRepos(): Promise<RepoRecord[]>;
  listBranches(repoId: string): Promise<BranchOption[]>;
  fetchRepo(repoId: string): Promise<void>;
  setRepoUpdateBase(repoId: string, updateBaseOnCreate: boolean): Promise<void>;
  createRepoFolder(repoId: string, name: string): Promise<RepoRecord>;
  renameRepoFolder(repoId: string, folderId: string, name: string): Promise<RepoRecord>;
  deleteRepoFolder(repoId: string, folderId: string): Promise<RepoRecord>;
  setTaskFolder(taskId: string, folderId?: string): Promise<void>;
  createTask(request: TaskCreateRequest): Promise<TaskCreateResult>;
  listTasks(): Promise<TaskRecord[]>;
  openTask(taskId: string): Promise<void>;
  closeTask(taskId: string): Promise<void>;
  removeTask(taskId: string): Promise<void>;
  getTaskNotes(taskId: string): Promise<TaskNotesGetResponse>;
  setTaskNotes(request: TaskNotesSetRequest): Promise<void>;
  setTaskStatus(request: TaskSetStatusRequest): Promise<void>;
  linkAdo(taskId: string, adoId: string): Promise<string[]>;
  unlinkAdo(taskId: string, adoId: string): Promise<string[]>;
  taskSearch(query: string): Promise<string[]>;
  openTaskInEditor(taskId: string): Promise<void>;
  sendPtyInput(taskId: string, data: string): void;
  resizePty(taskId: string, cols: number, rows: number): void;
  onPtyOutput(listener: (event: PtyOutputEvent) => void): () => void;
  onTaskFinishedStateChanged(listener: (event: TaskFinishedStateChangedEvent) => void): () => void;
  saveClipboardImage(dataUrl: string): Promise<string>;
  readClipboardImage(): Promise<string | undefined>;
  getAppVersion(): Promise<string>;
  generateDsuSummary(date: string): Promise<DsuGenerateResponse>;
  getAdoConfig(): Promise<{ organization: string; project: string }>;
  syncTasksToAdo(taskId: string, dryRun: boolean): Promise<AdoSyncResult>;
}

const api: ClaudeOrchestratorApi = {
  selectFolder: () => ipcRenderer.invoke(IpcChannels.DialogSelectFolder),
  addRepo: (path) => ipcRenderer.invoke(IpcChannels.RepoAdd, { path }),
  cloneRepo: (url, name) => ipcRenderer.invoke(IpcChannels.RepoClone, { url, name }),
  listRepos: () => ipcRenderer.invoke(IpcChannels.RepoList),
  listBranches: (repoId) => ipcRenderer.invoke(IpcChannels.RepoBranches, repoId),
  fetchRepo: (repoId) => ipcRenderer.invoke(IpcChannels.RepoFetch, repoId),
  setRepoUpdateBase: (repoId, updateBaseOnCreate) =>
    ipcRenderer.invoke(IpcChannels.RepoSetUpdateBase, { repoId, updateBaseOnCreate }),
  createRepoFolder: (repoId, name) => ipcRenderer.invoke(IpcChannels.RepoFolderCreate, { repoId, name }),
  renameRepoFolder: (repoId, folderId, name) =>
    ipcRenderer.invoke(IpcChannels.RepoFolderRename, { repoId, folderId, name }),
  deleteRepoFolder: (repoId, folderId) =>
    ipcRenderer.invoke(IpcChannels.RepoFolderDelete, { repoId, folderId }),
  setTaskFolder: (taskId, folderId) => ipcRenderer.invoke(IpcChannels.TaskSetFolder, { taskId, folderId }),
  createTask: (request) => ipcRenderer.invoke(IpcChannels.TaskCreate, request),
  listTasks: () => ipcRenderer.invoke(IpcChannels.TaskList),
  openTask: (taskId) => ipcRenderer.invoke(IpcChannels.TaskOpen, taskId),
  closeTask: (taskId) => ipcRenderer.invoke(IpcChannels.TaskClose, taskId),
  removeTask: (taskId) => ipcRenderer.invoke(IpcChannels.TaskRemove, taskId),
  getTaskNotes: (taskId) => ipcRenderer.invoke(IpcChannels.TaskNotesGet, taskId),
  setTaskNotes: (request) => ipcRenderer.invoke(IpcChannels.TaskNotesSet, request),
  setTaskStatus: (request) => ipcRenderer.invoke(IpcChannels.TaskSetStatus, request),
  linkAdo: (taskId, adoId) => ipcRenderer.invoke(IpcChannels.TaskLinkAdo, { taskId, adoId }),
  unlinkAdo: (taskId, adoId) => ipcRenderer.invoke(IpcChannels.TaskUnlinkAdo, { taskId, adoId }),
  taskSearch: (query) => ipcRenderer.invoke(IpcChannels.TaskSearch, query),
  openTaskInEditor: (taskId) => ipcRenderer.invoke(IpcChannels.TaskOpenInEditor, taskId),
  sendPtyInput: (taskId, data) => ipcRenderer.send(IpcChannels.PtyInput, { taskId, data }),
  resizePty: (taskId, cols, rows) => ipcRenderer.send(IpcChannels.PtyResize, { taskId, cols, rows }),
  onPtyOutput: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: PtyOutputEvent): void => listener(payload);
    ipcRenderer.on(IpcChannels.PtyOutput, handler);
    return () => ipcRenderer.removeListener(IpcChannels.PtyOutput, handler);
  },
  onTaskFinishedStateChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: TaskFinishedStateChangedEvent): void =>
      listener(payload);
    ipcRenderer.on(IpcChannels.TaskFinishedStateChanged, handler);
    return () => ipcRenderer.removeListener(IpcChannels.TaskFinishedStateChanged, handler);
  },
  saveClipboardImage: (dataUrl) => ipcRenderer.invoke(IpcChannels.SaveClipboardImage, dataUrl),
  readClipboardImage: () => ipcRenderer.invoke(IpcChannels.ReadClipboardImage),
  getAppVersion: () => ipcRenderer.invoke(IpcChannels.GetAppVersion),
  generateDsuSummary: (date) => ipcRenderer.invoke(IpcChannels.GenerateDsuSummary, date),
  getAdoConfig: () => ipcRenderer.invoke(IpcChannels.AdoConfig),
  syncTasksToAdo: (taskId, dryRun) => ipcRenderer.invoke(IpcChannels.AdoSyncTasks, { taskId, dryRun }),
};

contextBridge.exposeInMainWorld('claudeOrchestrator', api);
