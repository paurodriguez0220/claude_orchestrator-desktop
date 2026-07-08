import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';
import type {
  RepoRecord,
  TaskRecord,
} from '../shared/types';
import type {
  TaskCreateRequest,
  TaskNotesSetRequest,
  TaskNotesGetResponse,
  PtyOutputEvent,
  BranchOption,
} from '../shared/ipc-channels';

export interface ClaudeOrchestratorApi {
  selectFolder(): Promise<string | undefined>;
  addRepo(path: string): Promise<RepoRecord>;
  cloneRepo(url: string, name: string): Promise<RepoRecord>;
  listRepos(): Promise<RepoRecord[]>;
  listBranches(repoId: string): Promise<BranchOption[]>;
  fetchRepo(repoId: string): Promise<void>;
  createTask(request: TaskCreateRequest): Promise<TaskRecord>;
  listTasks(): Promise<TaskRecord[]>;
  openTask(taskId: string): Promise<void>;
  closeTask(taskId: string): Promise<void>;
  removeTask(taskId: string): Promise<void>;
  getTaskNotes(taskId: string): Promise<TaskNotesGetResponse>;
  setTaskNotes(request: TaskNotesSetRequest): Promise<void>;
  sendPtyInput(taskId: string, data: string): void;
  resizePty(taskId: string, cols: number, rows: number): void;
  onPtyOutput(listener: (event: PtyOutputEvent) => void): () => void;
  saveClipboardImage(dataUrl: string): Promise<string>;
}

const api: ClaudeOrchestratorApi = {
  selectFolder: () => ipcRenderer.invoke(IpcChannels.DialogSelectFolder),
  addRepo: (path) => ipcRenderer.invoke(IpcChannels.RepoAdd, { path }),
  cloneRepo: (url, name) => ipcRenderer.invoke(IpcChannels.RepoClone, { url, name }),
  listRepos: () => ipcRenderer.invoke(IpcChannels.RepoList),
  listBranches: (repoId) => ipcRenderer.invoke(IpcChannels.RepoBranches, repoId),
  fetchRepo: (repoId) => ipcRenderer.invoke(IpcChannels.RepoFetch, repoId),
  createTask: (request) => ipcRenderer.invoke(IpcChannels.TaskCreate, request),
  listTasks: () => ipcRenderer.invoke(IpcChannels.TaskList),
  openTask: (taskId) => ipcRenderer.invoke(IpcChannels.TaskOpen, taskId),
  closeTask: (taskId) => ipcRenderer.invoke(IpcChannels.TaskClose, taskId),
  removeTask: (taskId) => ipcRenderer.invoke(IpcChannels.TaskRemove, taskId),
  getTaskNotes: (taskId) => ipcRenderer.invoke(IpcChannels.TaskNotesGet, taskId),
  setTaskNotes: (request) => ipcRenderer.invoke(IpcChannels.TaskNotesSet, request),
  sendPtyInput: (taskId, data) => ipcRenderer.send(IpcChannels.PtyInput, { taskId, data }),
  resizePty: (taskId, cols, rows) => ipcRenderer.send(IpcChannels.PtyResize, { taskId, cols, rows }),
  onPtyOutput: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: PtyOutputEvent): void => listener(payload);
    ipcRenderer.on(IpcChannels.PtyOutput, handler);
    return () => ipcRenderer.removeListener(IpcChannels.PtyOutput, handler);
  },
  saveClipboardImage: (dataUrl) => ipcRenderer.invoke(IpcChannels.SaveClipboardImage, dataUrl),
};

contextBridge.exposeInMainWorld('claudeOrchestrator', api);
