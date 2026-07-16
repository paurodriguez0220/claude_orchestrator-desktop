export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done';

export type TaskKind = 'worktree' | 'review' | 'scratch';

export interface RepoRecord {
  id: string;
  name: string;
  path: string;
  remoteUrl?: string;
  createdAt: string;
  // When true or undefined, new-branch tasks fetch and branch from the repo's
  // remote default branch so they start fresh. When false, they branch from the
  // main clone's current HEAD (the pre-fetch legacy behaviour).
  updateBaseOnCreate?: boolean;
}

export interface TaskRecord {
  id: string;
  repoId?: string;
  title: string;
  // ADO work item ids linked to this worktree. A worktree often spans a parent
  // plus several child items, so this is a list. Legacy records that stored a
  // single `adoId` string are migrated to a one-element array on read.
  adoIds?: string[];
  branch?: string;
  worktreePath: string;
  status: TaskStatus;
  kind: TaskKind;
  createdAt: string;
  updatedAt: string;
}

export interface StoreData {
  repos: RepoRecord[];
  tasks: TaskRecord[];
}

export interface TaskNotesFrontmatter {
  title: string;
  adoIds?: string[];
  branch?: string;
  worktreePath: string;
  status: TaskStatus;
  kind: TaskKind;
}

export interface TaskNotes {
  frontmatter: TaskNotesFrontmatter;
  body: string;
}

// One work item parsed from a worktree's `tasks.md`. `adoId` is present only
// when the source line carried a trailing `#<id>` marker — the signal the sync
// step uses to update an existing item rather than create a new one. `checked`
// carries the checkbox state through unchanged; it is not an ADO field.
export interface ParsedWorkItem {
  type: string;
  title: string;
  description?: string;
  adoId?: number;
  checked: boolean;
}

// The structured result of parsing a `tasks.md` file. `parentId` comes from the
// frontmatter `adoParent`; `featureTitle` is the first `#` heading (context only).
export interface ParsedTasks {
  parentId?: number;
  featureTitle?: string;
  items: ParsedWorkItem[];
}
