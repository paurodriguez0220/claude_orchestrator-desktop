# Task: Code Review task kind (first slice)

**Status:** Done

## Goal

Ship a usable "Review Code" flow now: a repo gets a "Review Code" button that fetches the latest branches, lets you pick one, and creates a task tagged `kind: 'review'` (shown with a badge in the sidebar) — using the existing isolated-worktree mechanism, no new branch creation.

## Context

This is the first slice of the design in `docs/tasks/defined/task-groups-code-review-and-quick-questions.md`. That design also covers **Quick Questions** (scratch, repo-less tasks) and a **searchable branch picker** component — both are deferred to a follow-up so this slice ships fast. This slice keeps the existing plain `<select>` branch dropdown as-is.

## Scope for this slice

- `TaskRecord`/`TaskNotesFrontmatter` gain `kind: 'worktree' | 'review'` (not the full `'worktree' | 'review' | 'scratch'` from the original design — `'scratch'` is deferred with Quick Questions). `repoId`/`branch` stay **required** (unchanged) — only `'scratch'` tasks would need them optional, and that's out of scope here.
- A new `RepoFetch` IPC channel runs `git fetch` in a repo, so a just-pushed PR branch is selectable without the user fetching manually outside the app.
- `NewTaskModal` gains a `mode: 'task' | 'review'` prop. In `'review'` mode, the "New branch" vs. "Use existing branch" radio toggle is hidden entirely (a review always targets something that already exists) and the existing-branch dropdown is always shown.
- `RepoSidebar` gains a "Review Code" button next to "New Task" per repo, and a small "Review" badge on task list items where `task.kind === 'review'`.
- `App` gains a `handleReviewCodeClick(repoId)` that calls `fetchRepo` then `listBranches`, opens `NewTaskModal` in `'review'` mode, and passes `kind: 'review'` through to `createTask`.

## Deferred to a follow-up (not in this slice)

- Quick Questions (scratch, repo-less tasks) — needs `kind: 'scratch'`, optional `repoId`/`branch`, a scratch-folder lifecycle, and a new sidebar section.
- The searchable branch picker component — this slice keeps the plain `<select>`.

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working "Review Code" button per repo that fetches branches, lets you pick one, and creates a `kind: 'review'` task using the existing worktree-for-existing-branch mechanism.

**Architecture:** `TaskRecord`/`TaskNotesFrontmatter` gain a `kind` field (backend, Task 1). `git-service.ts`/`repo-handlers.ts`/preload gain a `fetchRepo`/`RepoFetch` round trip (Task 2). `TaskCreate` tags new records with `kind` (Task 3). `NewTaskModal` gains a `mode` prop (Task 4). `RepoSidebar` gains the Review Code button and badge (Task 5). `App` wires it all together (Task 6).

**Tech Stack:** Same as the rest of the project — TypeScript strict, React 18, Tailwind CSS tokens, Vitest + React Testing Library, `execFile`-based git service.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one component per file, `JSX.Element` return types.
- Never build a shell command by string-interpolating user input — `execFile`/`spawn` with argument arrays only.
- Styling uses Tailwind CSS v4 tokens (`graphite-*`, `clay-*`, `danger-*`) — no arbitrary hex values.
- A task created without an explicit `kind` defaults to `'worktree'` — every existing task record (on disk, with no `kind` field at all) must keep working exactly as today.

---

### Task 1: `kind` field on TaskRecord and notes frontmatter

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/services/notes-service.ts`
- Modify: `src/main/services/notes-service.test.ts`

**Interfaces:**
- Produces: `export type TaskKind = 'worktree' | 'review';` in `types.ts`. `TaskRecord.kind: TaskKind`. `TaskNotesFrontmatter.kind: TaskKind`.

- [ ] **Step 1: Write the failing test**

Add this test to `src/main/services/notes-service.test.ts`, inside the existing `describe('serializeTaskNotes / parseTaskNotes', ...)` block:

```ts
it('round-trips a review-kind task', () => {
  const reviewSample: TaskNotes = {
    frontmatter: {
      title: 'Review PR #42',
      branch: 'feature-x',
      worktreePath: 'C:\\repo-worktrees\\feature-x',
      status: 'todo',
      kind: 'review',
    },
    body: '',
  };
  const raw = serializeTaskNotes(reviewSample);
  expect(parseTaskNotes(raw)).toEqual(reviewSample);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- notes-service`
Expected: FAIL — `kind` is not a valid property of `TaskNotesFrontmatter` (TypeScript error) or the round-trip drops `kind` (runtime mismatch)

- [ ] **Step 3: Add the `kind` field to the shared types**

In `src/shared/types.ts`, add the new type right after `TaskStatus`, and add `kind` to both `TaskRecord` and `TaskNotesFrontmatter`:

```ts
export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done';

export type TaskKind = 'worktree' | 'review';

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
  branch: string;
  worktreePath: string;
  status: TaskStatus;
  kind: TaskKind;
}

export interface TaskNotes {
  frontmatter: TaskNotesFrontmatter;
  body: string;
}
```

- [ ] **Step 4: Update `serializeTaskNotes`/`parseTaskNotes` to round-trip `kind`**

In `src/main/services/notes-service.ts`, update `serializeTaskNotes` to also write `kind`:

```ts
export function serializeTaskNotes(notes: TaskNotes): string {
  const lines = ['---', `title: ${notes.frontmatter.title}`];
  if (notes.frontmatter.adoId) {
    lines.push(`adoId: ${notes.frontmatter.adoId}`);
  }
  lines.push(`branch: ${notes.frontmatter.branch}`);
  lines.push(`worktreePath: ${notes.frontmatter.worktreePath}`);
  lines.push(`status: ${notes.frontmatter.status}`);
  lines.push(`kind: ${notes.frontmatter.kind}`);
  lines.push('---', '', notes.body);
  return lines.join('\n');
}
```

Update `parseTaskNotes` to read `kind`, defaulting to `'worktree'` for existing files on disk that predate this field (the Global Constraint: old records must keep working):

```ts
export function parseTaskNotes(raw: string): TaskNotes {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!match || match.length < 3) {
    throw new Error('Invalid task notes format: missing frontmatter');
  }
  const frontmatterBlock = match[1]!;
  const body = match[2]!;
  const fields: Record<string, string> = {};
  for (const line of frontmatterBlock.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    fields[key] = value;
  }
  return {
    frontmatter: {
      title: fields.title ?? '',
      adoId: fields.adoId,
      branch: fields.branch ?? '',
      worktreePath: fields.worktreePath ?? '',
      status: (fields.status as TaskStatus) ?? 'todo',
      kind: (fields.kind as TaskKind) ?? 'worktree',
    },
    body: body.trim(),
  };
}
```

Add `TaskKind` to the existing `import type { TaskNotes, TaskStatus } from '../../shared/types';` line at the top of the file.

- [ ] **Step 5: Update the existing round-trip test fixture**

The existing `sample` fixture in `notes-service.test.ts` (used by "round-trips frontmatter and body" and the `readTaskNotes`/`writeTaskNotes`/`archiveTaskNotes` tests) now needs a `kind` field, since `TaskNotesFrontmatter.kind` is required. Update it:

```ts
const sample: TaskNotes = {
  frontmatter: {
    title: 'Fix login bug',
    adoId: 'ADO-1234',
    branch: 'task/fix-login-bug',
    worktreePath: 'C:\\repo-worktrees\\fix-login-bug',
    status: 'todo',
    kind: 'worktree',
  },
  body: 'Started investigating the redirect loop.',
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:main -- notes-service`
Expected: PASS (all tests, including the new review-kind test)

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test`
Expected: FAIL is expected here — other files that construct a `TaskRecord`/`TaskNotesFrontmatter` object literal (e.g. `task-handlers.ts`, and every test file with a `TaskRecord`/`TaskNotesFrontmatter` fixture) will now fail to typecheck because `kind` is a new required field they don't set yet. This is expected and will be fixed by Task 3 (for `task-handlers.ts`) — do NOT fix other files in this task. Confirm via `npm run typecheck` that the ONLY errors are "Property 'kind' is missing" in files other than the four this task touches.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/main/services/notes-service.ts src/main/services/notes-service.test.ts
git commit -m "feat: add TaskKind ('worktree' | 'review') to TaskRecord and notes frontmatter"
```

---

### Task 2: `fetchRepo` and the `RepoFetch` IPC channel

**Files:**
- Modify: `src/main/services/git-service.ts`
- Modify: `src/main/services/git-service.test.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc/repo-handlers.ts`
- Modify: `src/main/ipc/repo-handlers.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.test.ts`

**Interfaces:**
- Produces: `fetchRepo(repoPath: string): Promise<void>` in `git-service.ts`. `IpcChannels.RepoFetch = 'repo:fetch'` in `ipc-channels.ts`. A `RepoFetch` handler in `repo-handlers.ts` that calls `fetchRepo(repo.path)` for a given `repoId` (rejecting an unknown `repoId`, same pattern as `RepoBranches`). `fetchRepo(repoId: string): Promise<void>` added to the preload's `ClaudeOrchestratorApi`.

- [ ] **Step 1: Write the failing git-service test**

Add this test to `src/main/services/git-service.test.ts`, inside the existing `describe('git-service', ...)` block, and add `fetchRepo` to the existing import line from `./git-service`:

```ts
it('fetchRepo calls git fetch with cwd set to the repo path, and enables long paths', async () => {
  await fetchRepo('C:\\repo');
  expect(execFileMock).toHaveBeenCalledWith(
    'git',
    ['-c', 'core.longpaths=true', 'fetch'],
    { cwd: 'C:\\repo' },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- git-service`
Expected: FAIL — `fetchRepo` is not exported by `./git-service`

- [ ] **Step 3: Implement `fetchRepo`**

Add to `src/main/services/git-service.ts`, right after the existing `listBranches` function:

```ts
export async function fetchRepo(repoPath: string): Promise<void> {
  await runGit(['fetch'], repoPath);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:main -- git-service`
Expected: PASS

- [ ] **Step 5: Add the IPC channel**

In `src/shared/ipc-channels.ts`, add `RepoFetch` to the `IpcChannels` object, right after `RepoBranches`:

```ts
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
} as const;
```

- [ ] **Step 6: Write the failing repo-handlers test**

Add this test to `src/main/ipc/repo-handlers.test.ts`, inside the existing `describe('repo-handlers', ...)` block, and add `fetchRepo` to the existing `vi.mock('../services/git-service', ...)` mock and to the `import { cloneRepo, listBranches } from '../services/git-service';` line:

```ts
it('RepoFetch runs git fetch for the given repo', async () => {
  store.repos.push({ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' });
  const handler = handlers.get(IpcChannels.RepoFetch);
  await handler?.({}, 'repo-1');
  expect(fetchRepo).toHaveBeenCalledWith('C:\\demo');
});

it('RepoFetch rejects an unknown repoId', async () => {
  const handler = handlers.get(IpcChannels.RepoFetch);
  await expect(handler?.({}, 'nope')).rejects.toThrow('Unknown repo');
});
```

Update the `vi.mock('../services/git-service', ...)` call at the top of the file to also mock `fetchRepo`:

```ts
vi.mock('../services/git-service', () => ({
  cloneRepo: vi.fn(async () => undefined),
  listBranches: vi.fn(async () => ({ local: ['main', 'feature-x'], remote: ['origin/main', 'origin/feature-y'] })),
  fetchRepo: vi.fn(async () => undefined),
}));
```

- [ ] **Step 7: Run tests to verify the new ones fail**

Run: `npm run test:main -- repo-handlers`
Expected: existing tests pass; the 2 new tests fail — `IpcChannels.RepoFetch` handler is not registered yet

- [ ] **Step 8: Implement the handler**

Add to `src/main/ipc/repo-handlers.ts`, right after the existing `RepoBranches` handler (inside `registerRepoHandlers`), and add `fetchRepo` to the existing `import { cloneRepo, listBranches } from '../services/git-service';` line:

```ts
  ipcMain.handle(IpcChannels.RepoFetch, async (_event, repoId: string): Promise<void> => {
    const store = await readStore(getStorePath());
    const repo = store.repos.find((candidate) => candidate.id === repoId);
    if (!repo) {
      throw new Error(`Unknown repo: ${repoId}`);
    }
    await fetchRepo(repo.path);
  });
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm run test:main -- repo-handlers`
Expected: PASS (all tests)

- [ ] **Step 10: Write the failing preload test**

Add this test to `src/preload/index.test.ts`:

```ts
it('fetchRepo invokes the RepoFetch channel with the repoId', async () => {
  await import('./index');
  const call = exposeInMainWorld.mock.calls[0];
  if (!call) throw new Error('exposeInMainWorld not called');
  const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (api.fetchRepo as any)('repo-1');
  expect(ipcRendererInvoke).toHaveBeenCalledWith('repo:fetch', 'repo-1');
});
```

- [ ] **Step 11: Run test to verify it fails**

Run: `npm run test:renderer -- preload`
Expected: FAIL — `fetchRepo` is not a property of the exposed API

Note: check `package.json`/`vitest` config for which script actually runs `src/preload/index.test.ts` if `test:renderer` doesn't cover it — this project's existing convention (see the file's current test count) determines the right command; use whichever of `npm run test:main`/`npm run test:renderer` already runs `preload/index.test.ts` today.

- [ ] **Step 12: Implement**

In `src/preload/index.ts`, add `fetchRepo` to the `ClaudeOrchestratorApi` interface (right after `listBranches`) and to the `api` object implementation:

```ts
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
};
```

- [ ] **Step 13: Run tests to verify they pass**

Run whichever command Step 11 identified as covering `preload/index.test.ts`.
Expected: PASS (all tests)

- [ ] **Step 14: Run the full suite and typecheck**

Run: `npm test`
Expected: pre-existing failures from Task 1 (missing `kind` field elsewhere) are unchanged by this task; no NEW failures introduced by this task's own files

Run: `npm run typecheck`
Expected: no new errors beyond the ones already expected from Task 1

- [ ] **Step 15: Commit**

```bash
git add src/main/services/git-service.ts src/main/services/git-service.test.ts src/shared/ipc-channels.ts src/main/ipc/repo-handlers.ts src/main/ipc/repo-handlers.test.ts src/preload/index.ts src/preload/index.test.ts
git commit -m "feat: add fetchRepo and the RepoFetch IPC channel"
```

---

### Task 3: Tag created tasks with `kind`

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc/task-handlers.ts`
- Modify: `src/main/ipc/task-handlers.test.ts`

**Interfaces:**
- Consumes: `TaskKind` from `src/shared/types.ts` (Task 1).
- Produces: `TaskCreateRequest.kind?: TaskKind` (defaults to `'worktree'` when omitted). Every `TaskRecord` returned by `TaskCreate` now has a `kind` field. This task also fixes the typecheck failures Task 1 left in `task-handlers.ts`.

- [ ] **Step 1: Write the failing test**

Add this test to `src/main/ipc/task-handlers.test.ts`, inside the existing `describe('task-handlers', ...)` block:

```ts
it('TaskCreate tags the record with kind "review" when requested, and defaults to "worktree" otherwise', async () => {
  const handler = handlers.get(IpcChannels.TaskCreate);
  const defaultTask = await handler?.({}, { repoId: 'repo-1', title: 'Fix login bug' });
  expect(defaultTask).toMatchObject({ kind: 'worktree' });

  const reviewTask = await handler?.(
    {},
    { repoId: 'repo-1', title: 'Review PR #42', existingBranch: 'feature-x', kind: 'review' },
  );
  expect(reviewTask).toMatchObject({ kind: 'review', branch: 'feature-x' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- task-handlers`
Expected: FAIL — `defaultTask`/`reviewTask` have no `kind` property yet

- [ ] **Step 3: Implement**

In `src/main/ipc/task-handlers.ts`, add `kind: request.kind ?? 'worktree'` to the `task` object literal inside the `TaskCreate` handler, and pass the same value into the notes frontmatter written right after it:

```ts
    const now = new Date().toISOString();
    const task: TaskRecord = {
      id: randomUUID(),
      repoId: repo.id,
      title: request.title,
      adoId: request.adoId,
      branch,
      worktreePath,
      status: 'todo',
      kind: request.kind ?? 'worktree',
      createdAt: now,
      updatedAt: now,
    };
    store.tasks.push(task);
    await writeStore(getStorePath(), store);
    await writeTaskNotes(getTaskNotesPath(task.id), {
      frontmatter: {
        title: task.title,
        adoId: task.adoId,
        branch: task.branch,
        worktreePath: task.worktreePath,
        status: task.status,
        kind: task.kind,
      },
      body: '',
    });
```

Add `kind?: TaskKind` to `TaskCreateRequest` in `src/shared/ipc-channels.ts`:

```ts
export interface TaskCreateRequest {
  repoId: string;
  title: string;
  adoId?: string;
  branch?: string;
  existingBranch?: string;
  kind?: TaskKind;
}
```

Add `TaskKind` to the existing `import type { TaskStatus } from './types';` line at the top of `ipc-channels.ts` (making it `import type { TaskKind, TaskStatus } from './types';`), and add the same to the `import type { TaskCreateRequest, TaskNotesSetRequest, TaskNotesGetResponse } from '../../shared/ipc-channels';` line in `task-handlers.ts` if `TaskKind` is referenced there directly (it isn't in the snippet above, since `request.kind` is already typed via `TaskCreateRequest` — no separate import needed in `task-handlers.ts`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:main -- task-handlers`
Expected: PASS (all tests)

- [ ] **Step 5: Fix the other pre-existing `TaskRecord` fixtures in this file**

`task-handlers.test.ts` has several other tests (`TaskOpen resumes...`, `TaskOpen does nothing...`, `TaskRemove kills...`, and the two duplicate-branch tests) that push a plain `TaskRecord` object literal directly onto `store.tasks` via `store.tasks.push({ id: 'task-1', repoId: 'repo-1', title: ..., branch: ..., worktreePath: ..., status: 'todo', createdAt: ..., updatedAt: ... })`. `TaskRecord` now requires `kind`, so add `kind: 'worktree',` (right after `status: 'todo',`) to every one of these object literals in the file.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test`
Expected: all `src/main/**` tests pass. Renderer tests will still show the pre-existing Task-1-introduced `kind`-missing failures in renderer test fixtures — that's expected, fixed by Task 6.

Run: `npm run typecheck`
Expected: no errors remaining under `src/main/**` or `src/shared/**`; renderer-side errors about missing `kind` in test fixtures are expected until Task 6.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/ipc/task-handlers.ts src/main/ipc/task-handlers.test.ts
git commit -m "feat: tag created tasks with kind, defaulting to worktree"
```

---

### Task 4: `NewTaskModal` review mode

**Files:**
- Modify: `src/renderer/components/new-task-modal/new-task-modal.tsx`
- Modify: `src/renderer/components/new-task-modal/new-task-modal.test.tsx`

**Interfaces:**
- Produces: `NewTaskModalProps` gains a new required field `mode: 'task' | 'review'`. In `'review'` mode, the branch-mode radio fieldset (`New branch` / `Use existing branch`) and the "Branch (optional)" free-text input are not rendered at all — only the "Existing Branch" `<select>` (populated from the `branches` prop, same as today) is shown, and `handleSubmit` always sends `existingBranch: selectedExistingBranch || undefined, branch: undefined` regardless of the (now-hidden) `useExistingBranch` state. `NewTaskFields`'s shape is unchanged.

- [ ] **Step 1: Update existing tests to pass the new required prop**

`mode` is a new required prop. Add `mode="task"` to every existing `render(<NewTaskModal ... />)` call in `src/renderer/components/new-task-modal/new-task-modal.test.tsx` (all 6 of them — this preserves today's default behavior, since `'task'` mode renders exactly what the component renders today).

- [ ] **Step 2: Write the new failing tests**

Append inside the existing `describe('NewTaskModal', ...)` block:

```tsx
it('review mode hides the branch-mode toggle and always shows the existing-branch select', () => {
  render(
    <NewTaskModal
      isOpen
      mode="review"
      branches={[{ value: 'feature-x', label: 'feature-x', isRemote: false }]}
      isSubmitting={false}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
    />,
  );
  expect(screen.queryByRole('radio', { name: 'New branch' })).not.toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: 'Use existing branch' })).not.toBeInTheDocument();
  expect(screen.getByRole('combobox')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'feature-x' })).toBeInTheDocument();
});

it('review mode submits the selected existing branch', async () => {
  const onSubmit = vi.fn();
  render(
    <NewTaskModal
      isOpen
      mode="review"
      branches={[{ value: 'feature-x', label: 'feature-x', isRemote: false }]}
      isSubmitting={false}
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />,
  );
  await userEvent.type(screen.getByLabelText('Title'), 'Review PR #42');
  await userEvent.selectOptions(screen.getByRole('combobox'), 'feature-x');
  await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
  expect(onSubmit).toHaveBeenCalledWith({
    title: 'Review PR #42',
    adoId: undefined,
    branch: undefined,
    existingBranch: 'feature-x',
  });
});
```

- [ ] **Step 3: Run tests to verify the new ones fail and the rest still pass**

Run: `npm run test:renderer -- new-task-modal`
Expected: 6 existing tests pass (with `mode="task"` added); 2 new tests fail — `mode` prop isn't handled yet, and the branch-mode toggle always renders today

- [ ] **Step 4: Implement**

In `src/renderer/components/new-task-modal/new-task-modal.tsx`, add `mode` to the props interface and destructure it:

```tsx
export interface NewTaskModalProps {
  isOpen: boolean;
  branches: BranchOption[];
  isSubmitting: boolean;
  mode: 'task' | 'review';
  onClose: () => void;
  onSubmit: (fields: NewTaskFields) => void;
}
```

```tsx
export function NewTaskModal({
  isOpen,
  branches,
  isSubmitting,
  mode,
  onClose,
  onSubmit,
}: NewTaskModalProps): JSX.Element | null {
```

Update `handleSubmit` so review mode always sends the existing-branch fields regardless of the `useExistingBranch` toggle state (which won't exist in the UI for review mode, but the state variable itself is harmless to keep):

```tsx
  function handleSubmit(): void {
    const useExisting = mode === 'review' || useExistingBranch;
    onSubmit({
      title,
      adoId: adoId || undefined,
      branch: useExisting ? undefined : branch || undefined,
      existingBranch: useExisting ? selectedExistingBranch || undefined : undefined,
    });
  }
```

Replace the branch-mode `<fieldset>` and the two conditional branch-input blocks (everything from `<fieldset className="flex flex-col gap-2">` through the closing of the `useExistingBranch ? (...) : (...)` ternary) with:

```tsx
        {mode === 'task' && (
          <fieldset className="flex flex-col gap-2">
            <legend className={fieldLabelClasses}>Branch</legend>
            <label className="flex items-center gap-2 text-sm text-graphite-100">
              <input
                type="radio"
                name="branch-mode"
                checked={!useExistingBranch}
                onChange={() => setUseExistingBranch(false)}
                className="accent-clay-500"
              />
              New branch
            </label>
            <label className="flex items-center gap-2 text-sm text-graphite-100">
              <input
                type="radio"
                name="branch-mode"
                checked={useExistingBranch}
                onChange={() => setUseExistingBranch(true)}
                className="accent-clay-500"
              />
              Use existing branch
            </label>
          </fieldset>
        )}

        {mode === 'review' || useExistingBranch ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="new-task-existing-branch" className={fieldLabelClasses}>
              Existing Branch
            </label>
            <select
              id="new-task-existing-branch"
              value={selectedExistingBranch}
              onChange={(event) => setSelectedExistingBranch(event.target.value)}
              className={fieldInputClasses}
            >
              <option value="">Select a branch</option>
              {branches.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor="new-task-branch" className={fieldLabelClasses}>
              Branch (optional)
            </label>
            <input
              id="new-task-branch"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              className={fieldInputClasses}
            />
          </div>
        )}
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm run test:renderer -- new-task-modal`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/new-task-modal
git commit -m "feat: add a review mode to NewTaskModal that always uses an existing branch"
```

---

### Task 5: Review Code button and badge in the sidebar

**Files:**
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.tsx`
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx`

**Interfaces:**
- Consumes: `TaskRecord.kind` from `src/shared/types.ts` (Task 1).
- Produces: `RepoSidebarProps` gains a new required field `onReviewCodeClick: (repoId: string) => void`.

- [ ] **Step 1: Update the existing test fixture and all render calls**

The `task` fixture in `repo-sidebar.test.tsx` now needs a `kind: 'worktree'` field (required by `TaskRecord`). Add `onReviewCodeClick={vi.fn()}` to all 5 existing `render(<RepoSidebar ... />)` calls in that file.

- [ ] **Step 2: Write the new failing tests**

Append inside the existing `describe('RepoSidebar', ...)` block:

```tsx
it('calls onReviewCodeClick with the repo id when "Review Code" is clicked', async () => {
  const onReviewCodeClick = vi.fn();
  render(
    <RepoSidebar
      repos={[repo]}
      tasksByRepoId={{ 'repo-1': [task] }}
      selectedTaskId={undefined}
      onSelectTask={vi.fn()}
      onOpenRepoClick={vi.fn()}
      onCloneRepoClick={vi.fn()}
      onNewTaskClick={vi.fn()}
      onRemoveTaskClick={vi.fn()}
      onReviewCodeClick={onReviewCodeClick}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Review Code' }));
  expect(onReviewCodeClick).toHaveBeenCalledWith('repo-1');
});

it('shows a "Review" badge next to a task whose kind is "review"', () => {
  const reviewTask: TaskRecord = { ...task, id: 'task-2', title: 'Review PR #42', kind: 'review' };
  render(
    <RepoSidebar
      repos={[repo]}
      tasksByRepoId={{ 'repo-1': [task, reviewTask] }}
      selectedTaskId={undefined}
      onSelectTask={vi.fn()}
      onOpenRepoClick={vi.fn()}
      onCloneRepoClick={vi.fn()}
      onNewTaskClick={vi.fn()}
      onRemoveTaskClick={vi.fn()}
      onReviewCodeClick={vi.fn()}
    />,
  );
  expect(screen.getByText('Review', { selector: 'span' })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify the new ones fail and the rest still pass**

Run: `npm run test:renderer -- repo-sidebar`
Expected: 5 existing tests fail to typecheck/pass until `kind`/`onReviewCodeClick` are added per Step 1; after Step 1, those 5 pass and the 2 new tests fail — no "Review Code" button or badge rendered yet

- [ ] **Step 4: Implement**

In `src/renderer/components/repo-sidebar/repo-sidebar.tsx`, add `onReviewCodeClick` to the props interface and destructure it:

```tsx
export interface RepoSidebarProps {
  repos: RepoRecord[];
  tasksByRepoId: Record<string, TaskRecord[]>;
  selectedTaskId: string | undefined;
  onSelectTask: (taskId: string) => void;
  onOpenRepoClick: () => void;
  onCloneRepoClick: () => void;
  onNewTaskClick: (repoId: string) => void;
  onRemoveTaskClick: (taskId: string) => void;
  onReviewCodeClick: (repoId: string) => void;
}

export function RepoSidebar({
  repos,
  tasksByRepoId,
  selectedTaskId,
  onSelectTask,
  onOpenRepoClick,
  onCloneRepoClick,
  onNewTaskClick,
  onRemoveTaskClick,
  onReviewCodeClick,
}: RepoSidebarProps): JSX.Element {
```

Add a "Review Code" button next to "New Task" (inside the per-repo `<div className="flex items-center justify-between gap-2">`):

```tsx
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-graphite-100">{repo.name}</span>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => onReviewCodeClick(repo.id)}
                  className="rounded-md border border-graphite-600 px-2 py-1 text-xs font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400"
                >
                  Review Code
                </button>
                <button
                  type="button"
                  onClick={() => onNewTaskClick(repo.id)}
                  className="rounded-md bg-clay-600 px-2 py-1 text-xs font-medium text-graphite-100 hover:bg-clay-500"
                >
                  New Task
                </button>
              </div>
            </div>
```

Add the "Review" badge next to a task's title (inside the task `<li>`, alongside the existing task-title button):

```tsx
                <li key={task.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-pressed={task.id === selectedTaskId}
                    onClick={() => onSelectTask(task.id)}
                    className={
                      task.id === selectedTaskId
                        ? 'flex-1 truncate rounded-md bg-clay-600/20 px-2 py-1 text-left text-sm font-medium text-clay-400'
                        : 'flex-1 truncate rounded-md px-2 py-1 text-left text-sm text-graphite-200 hover:bg-graphite-700'
                    }
                  >
                    {task.title}
                  </button>
                  {task.kind === 'review' && (
                    <span className="shrink-0 rounded-full bg-clay-600/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-clay-400">
                      Review
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveTaskClick(task.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-xs text-graphite-400 hover:text-danger-400"
                  >
                    Remove
                  </button>
                </li>
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm run test:renderer -- repo-sidebar`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/repo-sidebar
git commit -m "feat: add a Review Code button and a Review badge to the sidebar"
```

---

### Task 6: Wire the review flow into App

**Files:**
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/app.test.tsx`
- Modify: `docs/runbooks/manual-smoke-test.md`

**Interfaces:**
- Consumes: `RepoSidebar`'s `onReviewCodeClick` prop (Task 5), `NewTaskModal`'s `mode` prop (Task 4), `window.claudeOrchestrator.fetchRepo` (Task 2), `TaskCreateRequest.kind` (Task 3).
- Produces: no new exports — internal `App` state and rendering only.

This is the final task; it depends on Tasks 1–5 all being merged first.

- [ ] **Step 1: Update the app.test.tsx fixtures and mocks**

The `task`/`task2` fixtures in `src/renderer/app.test.tsx` now need a `kind: 'worktree'` field (required by `TaskRecord`). Add a `fetchRepo: vi.fn(async () => undefined)` mock alongside the existing mocks (e.g. near `listBranches`), and add `fetchRepo` to the `vi.stubGlobal('claudeOrchestrator', { ... })` object in `beforeEach`.

- [ ] **Step 2: Write the new failing tests**

Append inside the existing `describe('App', ...)` block:

```tsx
it('"Review Code" fetches the repo, lists branches, and opens the modal in review mode', async () => {
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Review Code' }));
  expect(fetchRepo).toHaveBeenCalledWith('repo-1');
  expect(listBranches).toHaveBeenCalledWith('repo-1');
  expect(screen.queryByRole('radio', { name: 'Use existing branch' })).not.toBeInTheDocument();
  expect(await screen.findByRole('combobox')).toBeInTheDocument();
});

it('creating a task from the review flow forwards kind "review" to createTask', async () => {
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Review Code' }));
  await userEvent.type(screen.getByLabelText('Title'), 'Review PR #42');
  await userEvent.selectOptions(await screen.findByRole('combobox'), 'feature-x');
  await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
  expect(createTask).toHaveBeenCalledWith(
    expect.objectContaining({ repoId: 'repo-1', existingBranch: 'feature-x', kind: 'review' }),
  );
});
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npm run test:renderer -- app.test`
Expected: existing tests fail to typecheck/pass until Step 1's fixture updates land; after that, they pass and the 2 new tests fail — no "Review Code" button wired up yet

- [ ] **Step 4: Implement**

In `src/renderer/app.tsx`, add a `newTaskMode` state variable alongside the existing `newTaskRepoId`:

```tsx
  const [newTaskRepoId, setNewTaskRepoId] = useState<string | undefined>();
  const [newTaskMode, setNewTaskMode] = useState<'task' | 'review'>('task');
```

Add a new handler, right after `handleNewTaskClick`:

```tsx
  async function handleReviewCodeClick(repoId: string): Promise<void> {
    setErrorMessage(undefined);
    setNewTaskMode('review');
    setNewTaskRepoId(repoId);
    try {
      await window.claudeOrchestrator.fetchRepo(repoId);
      const options = await window.claudeOrchestrator.listBranches(repoId);
      setBranches(options);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }
```

Update `handleNewTaskClick` to reset the mode back to `'task'` (since it's the same modal/state being reused for both flows):

```tsx
  async function handleNewTaskClick(repoId: string): Promise<void> {
    setErrorMessage(undefined);
    setNewTaskMode('task');
    setNewTaskRepoId(repoId);
    try {
      const options = await window.claudeOrchestrator.listBranches(repoId);
      setBranches(options);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }
```

Update `handleCreateTask` to pass `kind` through when in review mode:

```tsx
  async function handleCreateTask(fields: NewTaskFields): Promise<void> {
    if (!newTaskRepoId) {
      return;
    }
    setErrorMessage(undefined);
    setIsSubmittingModal(true);
    try {
      const task = await window.claudeOrchestrator.createTask({
        repoId: newTaskRepoId,
        ...fields,
        kind: newTaskMode === 'review' ? 'review' : undefined,
      });
      setTasks((current) => [...current, task]);
      await handleSelectTask(task.id);
      setNewTaskRepoId(undefined);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    } finally {
      setIsSubmittingModal(false);
    }
  }
```

Update the `<RepoSidebar>` and `<NewTaskModal>` JSX usages:

```tsx
      <RepoSidebar
        repos={repos}
        tasksByRepoId={tasksByRepoId}
        selectedTaskId={activeTaskId}
        onSelectTask={(taskId) => void handleSelectTask(taskId)}
        onOpenRepoClick={() => void handleOpenRepoClick()}
        onCloneRepoClick={() => setIsCloneModalOpen(true)}
        onNewTaskClick={(repoId) => void handleNewTaskClick(repoId)}
        onRemoveTaskClick={(taskId) => void handleRemoveTask(taskId)}
        onReviewCodeClick={(repoId) => void handleReviewCodeClick(repoId)}
      />
      <NewTaskModal
        isOpen={newTaskRepoId !== undefined}
        branches={branches}
        isSubmitting={isSubmittingModal}
        mode={newTaskMode}
        onClose={() => setNewTaskRepoId(undefined)}
        onSubmit={(fields) => void handleCreateTask(fields)}
      />
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm run test:renderer -- app.test`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests pass (main + renderer) — this is the point where every `kind`-related typecheck gap from Tasks 1–5 is fully resolved

Run: `npm run typecheck`
Expected: no errors anywhere

- [ ] **Step 7: Add a manual smoke-test step**

Add a new step to `docs/runbooks/manual-smoke-test.md` (append after the last existing numbered step, incrementing the number to 17):

```
17. Click "Review Code" on a repo with at least one branch you haven't opened a worktree for — confirm it runs a `git fetch` (check timestamps/output in a separate terminal) before the branch dropdown appears, that there's no "New branch"/"Use existing branch" toggle (only the dropdown), and that after picking a branch and submitting, the new task shows a "Review" badge next to its title in the sidebar.
```

- [ ] **Step 8: Commit**

```bash
git add src/renderer/app.tsx src/renderer/app.test.tsx docs/runbooks/manual-smoke-test.md
git commit -m "feat: wire the Review Code flow into App"
```
