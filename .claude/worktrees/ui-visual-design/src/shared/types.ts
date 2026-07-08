export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done';

export interface RepoRecord {
  id: string;
  name: string;
  path: string;
  remoteUrl?: string;
  createdAt: string;
}

export interface TaskRecord {
  id: string;
  repoId: string;
  title: string;
  adoId?: string;
  branch: string;
  worktreePath: string;
  status: TaskStatus;
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
  branch: string;
  worktreePath: string;
  status: TaskStatus;
}

export interface TaskNotes {
  frontmatter: TaskNotesFrontmatter;
  body: string;
}
