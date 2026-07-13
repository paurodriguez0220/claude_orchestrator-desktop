import type { TaskKind, TaskStatus } from './types';

export const IpcChannels = {
  RepoAdd: 'repo:add',
  RepoClone: 'repo:clone',
  RepoList: 'repo:list',
  RepoBranches: 'repo:branches',
  RepoFetch: 'repo:fetch',
  TaskCreate: 'task:create',
  TaskList: 'task:list',
  TaskOpen: 'task:open',
  TaskClose: 'task:close',
  TaskRemove: 'task:remove',
  TaskNotesGet: 'task:notes:get',
  TaskNotesSet: 'task:notes:set',
  TaskSetStatus: 'task:set-status',
  TaskSearch: 'task:search',
  PtyInput: 'pty:input',
  PtyOutput: 'pty:output',
  PtyResize: 'pty:resize',
  TaskFinishedStateChanged: 'task:finished-state-changed',
  DialogSelectFolder: 'dialog:select-folder',
  SaveClipboardImage: 'image:save-clipboard',
  GetAppVersion: 'app:get-version',
  GenerateDsuSummary: 'dsu:generate',
} as const;

export interface RepoAddRequest {
  path: string;
}

export interface RepoCloneRequest {
  url: string;
  name: string;
}

export interface BranchOption {
  value: string;
  label: string;
  isRemote: boolean;
}

export interface TaskCreateRequest {
  repoId?: string;
  title: string;
  adoId?: string;
  branch?: string;
  branchPrefix?: string;
  existingBranch?: string;
  kind?: TaskKind;
}

export interface TaskNotesSetRequest {
  taskId: string;
  body: string;
}

export interface TaskSetStatusRequest {
  taskId: string;
  status: TaskStatus;
}

export interface PtyInputRequest {
  taskId: string;
  data: string;
}

export interface PtyOutputEvent {
  taskId: string;
  data: string;
}

export interface TaskFinishedStateChangedEvent {
  taskId: string;
  finished: boolean;
}

export interface PtyResizeRequest {
  taskId: string;
  cols: number;
  rows: number;
}

export interface TaskNotesGetResponse {
  body: string;
  status: TaskStatus;
}

export interface DsuGenerateResponse {
  markdown: string;
  filePath: string;
}
