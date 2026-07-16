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
  adoId?: string;
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
  adoId?: string;
  branch?: string;
  worktreePath: string;
  status: TaskStatus;
  kind: TaskKind;
}

export interface TaskNotes {
  frontmatter: TaskNotesFrontmatter;
  body: string;
}
