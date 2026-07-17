import type { TaskKind, TaskStatus, TaskRecord } from './types';

export const IpcChannels = {
  RepoAdd: 'repo:add',
  RepoClone: 'repo:clone',
  RepoList: 'repo:list',
  RepoBranches: 'repo:branches',
  RepoFetch: 'repo:fetch',
  RepoSetUpdateBase: 'repo:set-update-base',
  TaskCreate: 'task:create',
  TaskList: 'task:list',
  TaskOpen: 'task:open',
  TaskClose: 'task:close',
  TaskRemove: 'task:remove',
  TaskNotesGet: 'task:notes:get',
  TaskNotesSet: 'task:notes:set',
  TaskSetStatus: 'task:set-status',
  TaskLinkAdo: 'task:link-ado',
  TaskUnlinkAdo: 'task:unlink-ado',
  TaskSearch: 'task:search',
  TaskOpenInEditor: 'task:open-in-editor',
  PtyInput: 'pty:input',
  PtyOutput: 'pty:output',
  PtyResize: 'pty:resize',
  TaskFinishedStateChanged: 'task:finished-state-changed',
  DialogSelectFolder: 'dialog:select-folder',
  SaveClipboardImage: 'image:save-clipboard',
  ReadClipboardImage: 'image:read-clipboard',
  GetAppVersion: 'app:get-version',
  GenerateDsuSummary: 'dsu:generate',
  AdoConfig: 'ado:config',
  AdoSyncTasks: 'ado:sync-tasks',
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

// Task record returned from TaskCreate, optionally carrying a transient,
// non-persisted warning (e.g. the remote was unreachable and the worktree was
// branched from the local copy instead).
export interface TaskCreateResult extends TaskRecord {
  baseUpdateWarning?: string;
}

export interface RepoSetUpdateBaseRequest {
  repoId: string;
  updateBaseOnCreate: boolean;
}

export interface TaskNotesSetRequest {
  taskId: string;
  body: string;
}

export interface TaskSetStatusRequest {
  taskId: string;
  status: TaskStatus;
}

export interface TaskLinkAdoRequest {
  taskId: string;
  adoId: string;
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

export interface AdoCreateWorkItemRequest {
  type: string;
  title: string;
  description?: string;
  parentId?: number;
  assignee?: string;
}

export interface AdoCreateWorkItemResult {
  id: number;
  url: string;
}

export interface AdoSyncTasksRequest {
  taskId: string;
  dryRun: boolean;
}

export interface AdoSyncCreated {
  title: string;
  id: number;
  url: string;
}

export interface AdoSyncResult {
  parentId?: number;
  // Items that would be created (populated on a dry run, empty after a real sync).
  toCreate: Array<{ type: string; title: string }>;
  created: AdoSyncCreated[];
  // Count of items skipped because they already carry an ADO id.
  skipped: number;
}
