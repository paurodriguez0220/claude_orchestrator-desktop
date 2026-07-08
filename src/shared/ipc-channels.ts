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
  PtyInput: 'pty:input',
  PtyOutput: 'pty:output',
  PtyResize: 'pty:resize',
  DialogSelectFolder: 'dialog:select-folder',
  SaveClipboardImage: 'image:save-clipboard',
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
  repoId: string;
  title: string;
  adoId?: string;
  branch?: string;
  existingBranch?: string;
  kind?: TaskKind;
}

export interface TaskNotesSetRequest {
  taskId: string;
  body: string;
}

export interface PtyInputRequest {
  taskId: string;
  data: string;
}

export interface PtyOutputEvent {
  taskId: string;
  data: string;
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
