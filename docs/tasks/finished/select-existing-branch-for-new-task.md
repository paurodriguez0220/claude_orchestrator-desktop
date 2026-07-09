# Task: Select an existing branch when creating a new task

**Status:** Done

## Goal

Let "New Task" attach a worktree to an already-existing branch, instead of always creating a brand-new one.

## Context

Today, `TaskCreate` always runs `git worktree add <path> -b <branch>`, which fails if `<branch>` already exists. There's no way to open a task against a branch you (or a teammate, via a remote) already have — e.g. resuming work on a branch created outside this app, or picking up a previous task's branch again.

## Proposed Design

### Backend

- New IPC channel `repo:branches` — lists a repo's branches:
  - Local: `git branch --format=%(refname:short)`
  - Remote-tracking: `git branch -r --format=%(refname:short)`, excluding the `<remote>/HEAD` pointer entry
  - Remote-only branches are exposed with a display label like `origin/feature-x` but an underlying bare-name value (`feature-x`) — letting git's own checkout DWIM behavior create the local tracking branch automatically the first time it's used in `git worktree add`.
- `src/main/services/git-service.ts`: new `addWorktreeForExistingBranch(repoPath, worktreePath, branch): Promise<void>` — identical to `addWorktree` but omits `-b` (attaches to an existing branch/ref instead of creating one).
- `TaskCreateRequest` (`src/shared/ipc-channels.ts`) gains an optional `existingBranch?: string`. In `TaskCreate` (`src/main/ipc/task-handlers.ts`):
  - If `existingBranch` is present: skip the title-based branch-name generation, still run `assertSafeBranchName` on it (defense in depth, even though it came from a real git ref), derive the worktree folder slug from the **branch name** (not the task title), and call `addWorktreeForExistingBranch`.
  - If absent: unchanged — today's create-new-branch flow.

### Renderer

- `NewTaskModal`: add a "New branch" / "Use existing branch" toggle.
  - "New branch" mode: unchanged (title + optional ADO id + optional branch name text field).
  - "Use existing branch" mode: the branch text field is replaced by a `<select>` populated from a new `branches: BranchOption[]` prop (remote-only entries labeled `origin/name`, value `name`).
- `App`: when "New Task" is clicked for a repo, calls `window.claudeOrchestrator.listBranches(repoId)` and passes the result to `NewTaskModal`. On submit, forwards `existingBranch` (if that mode was used) instead of a new branch name.

### Error handling

No new error-handling code — a branch already checked out in another worktree, or any other git failure, surfaces through the existing generic `GitCommandError` → visible-error-message path built in the MVP.

### Testing

- `git-service.test.ts`: `addWorktreeForExistingBranch` asserts the argument array (no `-b`); `listBranches` asserts correct parsing of local/remote output and correct exclusion of `<remote>/HEAD`.
- `repo-handlers.test.ts`: `RepoBranches` handler test.
- `task-handlers.test.ts`: `TaskCreate` with `existingBranch` set — asserts `addWorktreeForExistingBranch` is called (not `addWorktree`), and the worktree slug comes from the branch name.
- `new-task-modal.test.tsx`: toggling to "Use existing branch" swaps in the select; submitting in that mode calls `onSubmit` with `existingBranch` set.
- `app.test.tsx`: opening "New Task" fetches branches; submitting with an existing branch selected calls `createTask` with `existingBranch`.

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New Task can attach a worktree to an existing local or remote-tracking branch, selected from a real list, instead of only ever creating a new branch.

**Architecture:** Extend the existing IPC contract with a `repo:branches` channel and an optional `existingBranch` field on `TaskCreateRequest`; add a git-service function that omits `-b`; branch the `TaskCreate` handler on whether `existingBranch` is present; surface the choice in `NewTaskModal` via a mode toggle, fetched and wired through `App`.

**Tech Stack:** Same as the existing project — TypeScript strict, Electron main/preload/renderer, Vitest + React Testing Library.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions (`!`).
- Named exports only. No barrel files. Kebab-case filenames.
- Every git invocation uses `execFile` with an argument array — never a shell string.
- Commit messages follow Conventional Commits (`<type>: <description>`).
- This repo's local git identity stays `paurodriguez0220` / `paurodriguez0220@gmail.com` — never the corporate identity.

---

### Task 1: Shared contract + git-service additions

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/services/git-service.ts`
- Modify: `src/main/services/git-service.test.ts`

**Interfaces:**
- Produces: `IpcChannels.RepoBranches` (`'repo:branches'`), `BranchOption { value: string; label: string; isRemote: boolean }` (exported from `src/shared/ipc-channels.ts`), `TaskCreateRequest.existingBranch?: string`, `addWorktreeForExistingBranch(repoPath: string, worktreePath: string, branch: string): Promise<void>`, `listBranches(repoPath: string): Promise<{ local: string[]; remote: string[] }>` (both exported from `src/main/services/git-service.ts`). Tasks 2–6 all depend on these exact names.

- [ ] **Step 1: Add the new channel, type, and request field**

Modify `src/shared/ipc-channels.ts` — add `RepoBranches` to the `IpcChannels` object (after `RepoList`):

```ts
export const IpcChannels = {
  RepoAdd: 'repo:add',
  RepoClone: 'repo:clone',
  RepoList: 'repo:list',
  RepoBranches: 'repo:branches',
  TaskCreate: 'task:create',
  TaskList: 'task:list',
  TaskOpen: 'task:open',
  TaskClose: 'task:close',
  TaskRemove: 'task:remove',
  TaskNotesGet: 'task:notes:get',
  TaskNotesSet: 'task:notes:set',
  PtyInput: 'pty:input',
  PtyOutput: 'pty:output',
  DialogSelectFolder: 'dialog:select-folder',
} as const;
```

Add a new `BranchOption` interface (anywhere among the other interfaces in the file) and extend `TaskCreateRequest`:

```ts
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
}
```

- [ ] **Step 2: Write the failing tests for git-service additions**

Add to `src/main/services/git-service.test.ts` (inside the existing `describe('git-service', ...)` block, and extend the existing top import line):

```ts
import { cloneRepo, addWorktree, addWorktreeForExistingBranch, removeWorktree, listBranches, GitCommandError } from './git-service';
```

Add these tests (after the existing `removeWorktree` test, before the `GitCommandError`-wrapping test):

```ts
  it('addWorktreeForExistingBranch calls git worktree add without -b', async () => {
    await addWorktreeForExistingBranch('C:\\repo', 'C:\\repo-worktrees\\slug', 'feature-x');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['worktree', 'add', 'C:\\repo-worktrees\\slug', 'feature-x'],
      { cwd: 'C:\\repo' },
    );
  });

  it('listBranches returns parsed local and remote branch names, excluding the remote HEAD pointer', async () => {
    execFileMock.mockImplementation((...args: unknown[]) => {
      const gitArgs = args[0] as string[];
      if (gitArgs[0] === 'branch' && gitArgs[1] === '--format=%(refname:short)') {
        return { stdout: 'main\nfeature-x\n', stderr: '' };
      }
      return { stdout: 'origin/HEAD\norigin/main\norigin/feature-y\n', stderr: '' };
    });
    const result = await listBranches('C:\\repo');
    expect(result).toEqual({
      local: ['main', 'feature-x'],
      remote: ['origin/main', 'origin/feature-y'],
    });
  });
```

Note: `listBranches` needs its own execFile mock return shape (it reads `stdout`), which differs from the callback-style mock the other tests in this file use. Adjust the top-of-file `vi.mock('node:child_process', ...)` factory to support both call styles — the existing tests call `execFile(cmd, args, callback)` (last arg is a callback), while `listBranches` will call `execFile(cmd, args, options, callback)` via `promisify`, expecting the callback to receive `(err, { stdout, stderr })`. Since `execFileAsync` (the existing `promisify(execFile)` in the source file) already normalizes this, no test-file changes to the mock's calling convention are needed — only add the `mockImplementation` above, which drives what the callback receives. Run the tests once written (Step 3) and adjust the mock only if it doesn't work as written; keep the fix mechanical (same pattern already used elsewhere in this file), don't change the tests' intent.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:main -- git-service`
Expected: FAIL — `addWorktreeForExistingBranch`/`listBranches` are not exported from `./git-service`

- [ ] **Step 4: Implement the git-service additions**

Modify `src/main/services/git-service.ts` — add a capture-output variant of the internal `runGit` helper, then the two new exported functions:

```ts
async function runGitCapture(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout;
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    throw new GitCommandError(`git ${args.join(' ')} failed`, stderr);
  }
}

export async function addWorktreeForExistingBranch(
  repoPath: string,
  worktreePath: string,
  branch: string,
): Promise<void> {
  await runGit(['worktree', 'add', worktreePath, branch], repoPath);
}

export async function listBranches(repoPath: string): Promise<{ local: string[]; remote: string[] }> {
  const localOutput = await runGitCapture(['branch', '--format=%(refname:short)'], repoPath);
  const remoteOutput = await runGitCapture(['branch', '-r', '--format=%(refname:short)'], repoPath);
  const local = localOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const remote = remoteOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith('/HEAD'));
  return { local, remote };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:main -- git-service`
Expected: PASS (6 tests: the 4 existing plus the 2 new ones)

- [ ] **Step 6: Run the full main-process suite and typecheck**

Run: `npm run test:main`
Expected: PASS (no regressions in Tasks that already consume `git-service.ts`)

Run: `npm run typecheck`
Expected: clean

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/services/git-service.ts src/main/services/git-service.test.ts
git commit -m "feat: add repo:branches channel and existing-branch git-service support"
```

---

### Task 2: Repo IPC handler for listing branches

**Files:**
- Modify: `src/main/ipc/repo-handlers.ts`
- Modify: `src/main/ipc/repo-handlers.test.ts`

**Interfaces:**
- Consumes: `IpcChannels.RepoBranches`, `BranchOption` (Task 1); `listBranches` (Task 1); `readStore` (existing); `getStorePath` (existing).
- Produces: `registerRepoHandlers()` now additionally registers `IpcChannels.RepoBranches`, taking a bare `repoId: string` argument (same calling convention as `TaskOpen`/`TaskClose`/`TaskRemove` elsewhere in this codebase — not wrapped in a request object) and resolving to `BranchOption[]`.

- [ ] **Step 1: Write the failing tests**

Add to `src/main/ipc/repo-handlers.test.ts` — extend the `vi.mock('../services/git-service', ...)` factory to include `listBranches`:

```ts
vi.mock('../services/git-service', () => ({
  cloneRepo: vi.fn(async () => undefined),
  listBranches: vi.fn(async () => ({ local: ['main', 'feature-x'], remote: ['origin/main', 'origin/feature-y'] })),
}));
```

Add `listBranches` to the import line below the mocks:

```ts
import { cloneRepo, listBranches } from '../services/git-service';
```

Add these tests (inside the existing `describe('repo-handlers', ...)` block, after the `RepoList` test):

```ts
  it('RepoBranches returns local branches plus remote-only branches with bare values', async () => {
    store.repos.push({ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' });
    const handler = handlers.get(IpcChannels.RepoBranches);
    const result = await handler?.({}, 'repo-1');
    expect(listBranches).toHaveBeenCalledWith('C:\\demo');
    expect(result).toEqual([
      { value: 'main', label: 'main', isRemote: false },
      { value: 'feature-x', label: 'feature-x', isRemote: false },
      { value: 'feature-y', label: 'origin/feature-y', isRemote: true },
    ]);
  });

  it('RepoBranches excludes a remote branch that already has a local counterpart', async () => {
    store.repos.push({ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' });
    vi.mocked(listBranches).mockResolvedValueOnce({
      local: ['main'],
      remote: ['origin/main'],
    });
    const handler = handlers.get(IpcChannels.RepoBranches);
    const result = await handler?.({}, 'repo-1');
    expect(result).toEqual([{ value: 'main', label: 'main', isRemote: false }]);
  });

  it('RepoBranches rejects an unknown repoId', async () => {
    const handler = handlers.get(IpcChannels.RepoBranches);
    await expect(handler?.({}, 'nope')).rejects.toThrow('Unknown repo');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- repo-handlers`
Expected: FAIL — `IpcChannels.RepoBranches` handler not registered (handler is `undefined`)

- [ ] **Step 3: Implement the handler**

Modify `src/main/ipc/repo-handlers.ts` — add the `listBranches` import and a `BranchOption` type import, and register the new handler inside `registerRepoHandlers()` (after the `RepoList` handler):

```ts
import { cloneRepo, listBranches } from '../services/git-service';
import type { BranchOption } from '../../shared/ipc-channels';
```

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- repo-handlers`
Expected: PASS (8 tests: the 5 existing plus the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/repo-handlers.ts src/main/ipc/repo-handlers.test.ts
git commit -m "feat: add repo:branches ipc handler"
```

---

### Task 3: TaskCreate existing-branch support

**Files:**
- Modify: `src/main/ipc/task-handlers.ts`
- Modify: `src/main/ipc/task-handlers.test.ts`

**Interfaces:**
- Consumes: `addWorktreeForExistingBranch` (Task 1); `TaskCreateRequest.existingBranch` (Task 1).
- Produces: `TaskCreate` handler now branches on `request.existingBranch`; no new exported names.

- [ ] **Step 1: Write the failing test**

Modify the `vi.mock('../services/git-service', ...)` factory in `src/main/ipc/task-handlers.test.ts` to add `addWorktreeForExistingBranch`:

```ts
vi.mock('../services/git-service', () => ({
  addWorktree: vi.fn(async () => undefined),
  addWorktreeForExistingBranch: vi.fn(async () => undefined),
  removeWorktree: vi.fn(async () => undefined),
}));
```

Update the import line below the mocks:

```ts
import { addWorktree, addWorktreeForExistingBranch, removeWorktree } from '../services/git-service';
```

Add this test (inside the existing `describe('task-handlers', ...)` block, after the `TaskCreate rejects an unknown repoId` test):

```ts
  it('TaskCreate attaches to an existing branch instead of creating one when existingBranch is set', async () => {
    const handler = handlers.get(IpcChannels.TaskCreate);
    const task = await handler?.({}, { repoId: 'repo-1', title: 'Resume feature work', existingBranch: 'feature-x' });
    expect(addWorktreeForExistingBranch).toHaveBeenCalledWith('C:\\demo', 'C:\\demo\\..\\demo-worktrees\\feature-x', 'feature-x');
    expect(addWorktree).not.toHaveBeenCalled();
    expect(task).toMatchObject({ title: 'Resume feature work', branch: 'feature-x' });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- task-handlers`
Expected: FAIL — `addWorktreeForExistingBranch` is not called (current handler always calls `addWorktree`), or the worktree path doesn't match (current handler slugifies the title, not the branch)

- [ ] **Step 3: Implement the branching logic**

Modify `src/main/ipc/task-handlers.ts` — update the import and the `TaskCreate` handler body:

```ts
import { addWorktree, addWorktreeForExistingBranch, removeWorktree } from '../services/git-service';
```

Replace the `TaskCreate` handler's branch/slug/worktree-creation section:

```ts
  ipcMain.handle(IpcChannels.TaskCreate, async (_event, request: TaskCreateRequest): Promise<TaskRecord> => {
    const store = await readStore(getStorePath());
    const repo = store.repos.find((candidate) => candidate.id === request.repoId);
    if (!repo) {
      throw new Error(`Unknown repo: ${request.repoId}`);
    }

    const existingBranch = request.existingBranch;
    const slug = existingBranch !== undefined ? slugify(existingBranch) : slugify(request.title);
    const branch = existingBranch !== undefined ? existingBranch : (request.branch ?? `task/${slug}`);
    assertSafeBranchName(branch);
    const worktreePath = getWorktreePath(repo.path, repo.name, slug);

    if (existingBranch !== undefined) {
      await addWorktreeForExistingBranch(repo.path, worktreePath, branch);
    } else {
      await addWorktree(repo.path, worktreePath, branch);
    }

    const now = new Date().toISOString();
    const task: TaskRecord = {
      id: randomUUID(),
      repoId: repo.id,
      title: request.title,
      adoId: request.adoId,
      branch,
      worktreePath,
      status: 'todo',
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
      },
      body: '',
    });
    spawnClaudeSession(task.id, task.worktreePath, false, onPtyData);
    return task;
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- task-handlers`
Expected: PASS (6 tests: the 5 existing plus the 1 new one)

- [ ] **Step 5: Run the full main-process suite and typecheck**

Run: `npm run test:main`
Expected: PASS

Run: `npm run typecheck`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/task-handlers.ts src/main/ipc/task-handlers.test.ts
git commit -m "feat: support creating a task against an existing branch"
```

---

### Task 4: Preload listBranches method

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.test.ts`

**Interfaces:**
- Consumes: `IpcChannels.RepoBranches`, `BranchOption` (Task 1).
- Produces: `ClaudeOrchestratorApi.listBranches(repoId: string): Promise<BranchOption[]>`, consumed by Task 6 (`App`).

- [ ] **Step 1: Write the failing test**

Add to `src/preload/index.test.ts` (inside the existing `describe('preload', ...)` block, after the `selectFolder` test):

```ts
  it('listBranches invokes the RepoBranches channel with the repoId', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.listBranches as any)('repo-1');
    expect(ipcRendererInvoke).toHaveBeenCalledWith('repo:branches', 'repo-1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- preload`
Expected: FAIL — `api.listBranches` is `undefined`

- [ ] **Step 3: Implement the preload method**

Modify `src/preload/index.ts` — add `BranchOption` to the type import from `../shared/ipc-channels`, add the method to the `ClaudeOrchestratorApi` interface, and add its implementation:

```ts
import type {
  TaskCreateRequest,
  TaskNotesSetRequest,
  TaskNotesGetResponse,
  PtyOutputEvent,
  BranchOption,
} from '../shared/ipc-channels';
```

```ts
export interface ClaudeOrchestratorApi {
  selectFolder(): Promise<string | undefined>;
  addRepo(path: string): Promise<RepoRecord>;
  cloneRepo(url: string, name: string): Promise<RepoRecord>;
  listRepos(): Promise<RepoRecord[]>;
  listBranches(repoId: string): Promise<BranchOption[]>;
  createTask(request: TaskCreateRequest): Promise<TaskRecord>;
  listTasks(): Promise<TaskRecord[]>;
  openTask(taskId: string): Promise<void>;
  closeTask(taskId: string): Promise<void>;
  removeTask(taskId: string): Promise<void>;
  getTaskNotes(taskId: string): Promise<TaskNotesGetResponse>;
  setTaskNotes(request: TaskNotesSetRequest): Promise<void>;
  sendPtyInput(taskId: string, data: string): void;
  onPtyOutput(listener: (event: PtyOutputEvent) => void): () => void;
}
```

```ts
const api: ClaudeOrchestratorApi = {
  selectFolder: () => ipcRenderer.invoke(IpcChannels.DialogSelectFolder),
  addRepo: (path) => ipcRenderer.invoke(IpcChannels.RepoAdd, { path }),
  cloneRepo: (url, name) => ipcRenderer.invoke(IpcChannels.RepoClone, { url, name }),
  listRepos: () => ipcRenderer.invoke(IpcChannels.RepoList),
  listBranches: (repoId) => ipcRenderer.invoke(IpcChannels.RepoBranches, repoId),
  createTask: (request) => ipcRenderer.invoke(IpcChannels.TaskCreate, request),
  listTasks: () => ipcRenderer.invoke(IpcChannels.TaskList),
  openTask: (taskId) => ipcRenderer.invoke(IpcChannels.TaskOpen, taskId),
  closeTask: (taskId) => ipcRenderer.invoke(IpcChannels.TaskClose, taskId),
  removeTask: (taskId) => ipcRenderer.invoke(IpcChannels.TaskRemove, taskId),
  getTaskNotes: (taskId) => ipcRenderer.invoke(IpcChannels.TaskNotesGet, taskId),
  setTaskNotes: (request) => ipcRenderer.invoke(IpcChannels.TaskNotesSet, request),
  sendPtyInput: (taskId, data) => ipcRenderer.send(IpcChannels.PtyInput, { taskId, data }),
  onPtyOutput: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: PtyOutputEvent): void => listener(payload);
    ipcRenderer.on(IpcChannels.PtyOutput, handler);
    return () => ipcRenderer.removeListener(IpcChannels.PtyOutput, handler);
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:main -- preload`
Expected: PASS (6 tests: the 5 existing plus the 1 new one)

- [ ] **Step 5: Run the full main-process suite and typecheck**

Run: `npm run test:main`
Expected: PASS

Run: `npm run typecheck`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add src/preload/index.ts src/preload/index.test.ts
git commit -m "feat: expose listBranches on the preload api"
```

---

### Task 5: NewTaskModal branch-mode toggle

**Files:**
- Modify: `src/renderer/components/new-task-modal/new-task-modal.tsx`
- Modify: `src/renderer/components/new-task-modal/new-task-modal.test.tsx`
- Modify: `src/renderer/components/new-task-modal/new-task-modal.stories.tsx`

**Interfaces:**
- Consumes: `BranchOption` (Task 1).
- Produces: `NewTaskFields` now has `existingBranch: string | undefined` alongside `branch`; `NewTaskModalProps` now requires a `branches: BranchOption[]` prop. Task 6 (`App`) depends on both.

- [ ] **Step 1: Update the existing tests for the new required prop and field**

Modify `src/renderer/components/new-task-modal/new-task-modal.test.tsx` — add `branches={[]}` to the three existing `render(<NewTaskModal ... />)` calls, and update the submit assertion to include `existingBranch: undefined`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewTaskModal } from './new-task-modal';

describe('NewTaskModal', () => {
  it('does not render when isOpen is false', () => {
    render(<NewTaskModal isOpen={false} branches={[]} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits title, optional adoId, and optional branch', async () => {
    const onSubmit = vi.fn();
    render(<NewTaskModal isOpen branches={[]} onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix login bug');
    await userEvent.type(screen.getByLabelText('ADO Task ID (optional)'), 'ADO-1234');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Fix login bug',
      adoId: 'ADO-1234',
      branch: undefined,
      existingBranch: undefined,
    });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<NewTaskModal isOpen branches={[]} onClose={onClose} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('toggling to "Use existing branch" shows a select populated from the branches prop', async () => {
    render(
      <NewTaskModal
        isOpen
        branches={[
          { value: 'feature-x', label: 'feature-x', isRemote: false },
          { value: 'feature-y', label: 'origin/feature-y', isRemote: true },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'feature-x' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'origin/feature-y' })).toBeInTheDocument();
  });

  it('submits existingBranch (not branch) when in existing-branch mode', async () => {
    const onSubmit = vi.fn();
    render(
      <NewTaskModal
        isOpen
        branches={[{ value: 'feature-x', label: 'feature-x', isRemote: false }]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Resume feature work');
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    await userEvent.selectOptions(screen.getByRole('combobox'), 'feature-x');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Resume feature work',
      adoId: undefined,
      branch: undefined,
      existingBranch: 'feature-x',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm run test:renderer -- new-task-modal`
Expected: FAIL — `branches` prop doesn't exist yet, "Use existing branch" radio not found

- [ ] **Step 3: Implement the toggle**

Replace the contents of `src/renderer/components/new-task-modal/new-task-modal.tsx`:

```tsx
import { useState } from 'react';
import type { BranchOption } from '../../../shared/ipc-channels';

export interface NewTaskFields {
  title: string;
  adoId: string | undefined;
  branch: string | undefined;
  existingBranch: string | undefined;
}

export interface NewTaskModalProps {
  isOpen: boolean;
  branches: BranchOption[];
  onClose: () => void;
  onSubmit: (fields: NewTaskFields) => void;
}

export function NewTaskModal({ isOpen, branches, onClose, onSubmit }: NewTaskModalProps): JSX.Element | null {
  const [title, setTitle] = useState('');
  const [adoId, setAdoId] = useState('');
  const [branch, setBranch] = useState('');
  const [useExistingBranch, setUseExistingBranch] = useState(false);
  const [selectedExistingBranch, setSelectedExistingBranch] = useState('');

  if (!isOpen) {
    return null;
  }

  function handleSubmit(): void {
    onSubmit({
      title,
      adoId: adoId || undefined,
      branch: useExistingBranch ? undefined : branch || undefined,
      existingBranch: useExistingBranch ? selectedExistingBranch || undefined : undefined,
    });
  }

  return (
    <div role="dialog" aria-label="New Task">
      <label htmlFor="new-task-title">Title</label>
      <input id="new-task-title" value={title} onChange={(event) => setTitle(event.target.value)} />

      <label htmlFor="new-task-ado-id">ADO Task ID (optional)</label>
      <input id="new-task-ado-id" value={adoId} onChange={(event) => setAdoId(event.target.value)} />

      <fieldset>
        <legend>Branch</legend>
        <label>
          <input
            type="radio"
            name="branch-mode"
            checked={!useExistingBranch}
            onChange={() => setUseExistingBranch(false)}
          />
          New branch
        </label>
        <label>
          <input
            type="radio"
            name="branch-mode"
            checked={useExistingBranch}
            onChange={() => setUseExistingBranch(true)}
          />
          Use existing branch
        </label>
      </fieldset>

      {useExistingBranch ? (
        <>
          <label htmlFor="new-task-existing-branch">Existing Branch</label>
          <select
            id="new-task-existing-branch"
            value={selectedExistingBranch}
            onChange={(event) => setSelectedExistingBranch(event.target.value)}
          >
            <option value="">Select a branch</option>
            {branches.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <label htmlFor="new-task-branch">Branch (optional)</label>
          <input id="new-task-branch" value={branch} onChange={(event) => setBranch(event.target.value)} />
        </>
      )}

      <button type="button" onClick={handleSubmit}>
        Create Task
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:renderer -- new-task-modal`
Expected: PASS (5 tests: the 3 existing plus the 2 new ones)

- [ ] **Step 5: Update the Storybook story**

Replace the contents of `src/renderer/components/new-task-modal/new-task-modal.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { NewTaskModal } from './new-task-modal';

const meta: Meta<typeof NewTaskModal> = {
  component: NewTaskModal,
  title: 'Components/NewTaskModal',
  args: { onClose: fn(), onSubmit: fn() },
};

export default meta;
type Story = StoryObj<typeof NewTaskModal>;

export const Open: Story = { args: { isOpen: true, branches: [] } };
export const Closed: Story = { args: { isOpen: false, branches: [] } };
export const WithExistingBranches: Story = {
  args: {
    isOpen: true,
    branches: [
      { value: 'feature-x', label: 'feature-x', isRemote: false },
      { value: 'feature-y', label: 'origin/feature-y', isRemote: true },
    ],
  },
};
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/new-task-modal
git commit -m "feat: add existing-branch toggle to new task modal"
```

---

### Task 6: App wiring — fetch branches and submit existingBranch

**Files:**
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/app.test.tsx`

**Interfaces:**
- Consumes: `window.claudeOrchestrator.listBranches` (Task 4); `NewTaskModal`'s `branches` prop and `NewTaskFields.existingBranch` (Task 5).
- Produces: no new exports — this is the final integration point for this feature.

- [ ] **Step 1: Write the failing tests**

Add to `src/renderer/app.test.tsx` — add a `listBranches` mock alongside the other `window.claudeOrchestrator` mocks:

```ts
const listBranches = vi.fn(async () => [{ value: 'feature-x', label: 'feature-x', isRemote: false }]);
```

Add it to the `vi.stubGlobal('claudeOrchestrator', { ... })` object in `beforeEach`:

```ts
  vi.stubGlobal('claudeOrchestrator', {
    listRepos,
    listTasks,
    createTask,
    openTask,
    closeTask: vi.fn(),
    removeTask,
    selectFolder,
    addRepo,
    cloneRepo,
    listBranches,
    getTaskNotes,
    setTaskNotes,
    sendPtyInput: vi.fn(),
    onPtyOutput: vi.fn(() => vi.fn()),
  });
```

Add these tests (inside the existing `describe('App', ...)` block):

```ts
  it('fetches branches for the repo when New Task is opened', async () => {
    render(<App />);
    const newTaskButtons = await screen.findAllByRole('button', { name: 'New Task' });
    const firstNewTaskButton = newTaskButtons[0];
    if (!firstNewTaskButton) {
      throw new Error('Expected at least one "New Task" button to be rendered');
    }
    await userEvent.click(firstNewTaskButton);
    expect(listBranches).toHaveBeenCalledWith('repo-1');
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    expect(await screen.findByRole('option', { name: 'feature-x' })).toBeInTheDocument();
  });

  it('creating a task with an existing branch selected forwards existingBranch to createTask', async () => {
    render(<App />);
    const newTaskButtons = await screen.findAllByRole('button', { name: 'New Task' });
    const firstNewTaskButton = newTaskButtons[0];
    if (!firstNewTaskButton) {
      throw new Error('Expected at least one "New Task" button to be rendered');
    }
    await userEvent.click(firstNewTaskButton);
    await userEvent.type(screen.getByLabelText('Title'), 'Resume feature work');
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    await userEvent.selectOptions(await screen.findByRole('combobox'), 'feature-x');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: 'repo-1', existingBranch: 'feature-x' }),
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:renderer -- app`
Expected: FAIL — `NewTaskModal` isn't passed a `branches` prop yet, `listBranches` is never called

- [ ] **Step 3: Wire branch fetching and existingBranch submission**

Modify `src/renderer/app.tsx` — add a `branches` state, fetch it in `onNewTaskClick`, and pass it through to `NewTaskModal`. Update the imports, state, handlers, and JSX as follows:

Add to the state declarations (after `newTaskRepoId`):

```ts
  const [branches, setBranches] = useState<import('../shared/ipc-channels').BranchOption[]>([]);
```

Replace `onNewTaskClick={setNewTaskRepoId}` on `RepoSidebar` with a handler that also fetches branches:

```ts
        onNewTaskClick={(repoId) => void handleNewTaskClick(repoId)}
```

Add the new handler function (near `handleCreateTask`):

```ts
  async function handleNewTaskClick(repoId: string): Promise<void> {
    setErrorMessage(undefined);
    setNewTaskRepoId(repoId);
    try {
      const options = await window.claudeOrchestrator.listBranches(repoId);
      setBranches(options);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }
```

Update `handleCreateTask`'s parameter type to include `existingBranch` and forward it:

```ts
  async function handleCreateTask(fields: {
    title: string;
    adoId: string | undefined;
    branch: string | undefined;
    existingBranch: string | undefined;
  }): Promise<void> {
    if (!newTaskRepoId) {
      return;
    }
    setErrorMessage(undefined);
    try {
      const task = await window.claudeOrchestrator.createTask({ repoId: newTaskRepoId, ...fields });
      setTasks((current) => [...current, task]);
      setNewTaskRepoId(undefined);
      await handleSelectTask(task.id);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }
```

Update the `<NewTaskModal>` element to pass `branches`:

```tsx
      <NewTaskModal
        isOpen={newTaskRepoId !== undefined}
        branches={branches}
        onClose={() => setNewTaskRepoId(undefined)}
        onSubmit={(fields) => void handleCreateTask(fields)}
      />
```

For cleanliness, move the `BranchOption` type import to the top-level import block instead of an inline `import(...)` type — add it to the existing `import type { RepoRecord, TaskRecord, TaskStatus } from '../shared/types';` line's neighboring imports:

```ts
import type { RepoRecord, TaskRecord, TaskStatus } from '../shared/types';
import type { BranchOption } from '../shared/ipc-channels';
```

And use `BranchOption[]` (not the inline `import(...)` form) for the state:

```ts
  const [branches, setBranches] = useState<BranchOption[]>([]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:renderer -- app`
Expected: PASS (9 tests: the 7 existing plus the 2 new ones)

- [ ] **Step 5: Run the full test suite and build**

Run: `npm test`
Expected: PASS — every test across both this feature and the original 15-task MVP is green

Run: `npm run build`
Expected: succeeds (typecheck + bundle)

- [ ] **Step 6: Add a manual verification step for the remote-branch DWIM behavior**

Unit tests mock `execFile`, so they can't verify git's real checkout DWIM behavior (creating a local tracking branch the first time a remote-only branch is used). Add this step to `docs/runbooks/manual-smoke-test.md`, after the existing numbered steps (renumber if needed so it reads as the next sequential step):

```markdown
12. Select an existing branch when creating a task: pick a repo with at least one branch you haven't opened a worktree for, click "New Task", toggle "Use existing branch", pick that branch, submit. Confirm `git worktree list` shows the new worktree checked out on that exact branch (no `-b` was used to create a *new* branch of the same name). Then, in that same repo, run `git fetch` and pick a branch that only exists as `origin/<name>` (not yet local) from the dropdown — after creating the task, run `git branch` in the repo and confirm a new local branch `<name>` now exists, tracking `origin/<name>`.
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/app.tsx src/renderer/app.test.tsx docs/runbooks/manual-smoke-test.md
git commit -m "feat: wire existing-branch selection through the app shell"
```

## Acceptance Criteria

- [ ] New Task modal has a working "New branch" / "Use existing branch" toggle
- [ ] Existing-branch mode lists real local and remote-tracking branches for the selected repo
- [ ] Selecting a local existing branch and submitting attaches a worktree to it (`git worktree add <path> <branch>`, no `-b`)
- [ ] Selecting a remote-only branch attaches a worktree and creates the local tracking branch (verified via `git branch` after)
- [ ] Worktree folder name is derived from the branch name in existing-branch mode
- [ ] Git errors (e.g. branch already checked out elsewhere) surface visibly in the UI, same as other flows
- [ ] "New branch" mode behavior is unchanged from today

---
*Maintained by paurodriguez0220 · Last updated: 2026-07-08*
*Standards: https://github.com/paurodriguez0220/standards-docs*
