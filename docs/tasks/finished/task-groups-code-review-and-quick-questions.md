# Task: Code Review tasks, Quick Questions, and a searchable branch picker

**Status:** Done

## Goal

Support two task "kinds" beyond today's single git-worktree-per-task model — **Code Review** tasks (for reviewing an existing branch without the ceremony of a full "new task" flow) and **Quick Questions** (ad-hoc `claude` sessions with no repo/branch association at all) — and make branch selection searchable, since both the existing "select existing branch" flow and the new Review flow need to pick a branch from a potentially long list.

## Context

Every task today is backed by a git worktree on a branch inside a managed repo (`TaskRecord.repoId`/`branch`/`worktreePath` are all required, and `TaskCreate` always calls `addWorktree`/`addWorktreeForExistingBranch`). Two real workflows don't fit that model well:

- **Code review**: reviewing a teammate's PR branch is read-heavy, not a new unit of work — creating a full "task" with a title/ADO id for it feels heavier than needed, and reviewing a brand-new PR branch fails today because `listBranches` only reads branches git already knows about locally (`git branch`/`git branch -r`), never `git fetch`.
- **Quick questions**: a one-off `claude` question ("what does this error mean") has no natural repo/branch to attach to, but still benefits from the existing terminal/notes/multi-tab machinery.

## Proposed Design

### Task kinds

`TaskRecord` (and `TaskNotesFrontmatter`) gain a `kind: 'worktree' | 'review' | 'scratch'` field. `repoId` and `branch` become optional — only `'scratch'` tasks omit them. Existing tasks/notes on disk predate this field; both are treated as `kind: 'worktree'` when absent (read-time default, not a migration script — nothing is rewritten on disk until the task is next saved).

- **`'worktree'`** — today's behavior, unchanged.
- **`'review'`** — structurally identical to a `'worktree'` task created via "use existing branch" (same `addWorktreeForExistingBranch` call, same fields populated). The only differences are (a) the tag itself, shown as a small "Review" badge in the sidebar, and (b) the creation flow runs `git fetch` first so a just-pushed PR branch is selectable immediately. No new backend removal/close logic — a review task is removed exactly like a worktree task.
- **`'scratch'`** — no `repoId`, no `branch`. `TaskCreate` creates a fresh empty directory at `<runtime-data-root>/scratch/<taskId>/` (no git operations at all) and uses that as `worktreePath` (the field stays the generic "directory claude runs in", regardless of kind). `TaskRemove` for a scratch task deletes that directory recursively (safe — it's an app-owned disposable folder, never a real repo) instead of calling `removeWorktree`.

### Code Review UI

Each repo section in the sidebar gets a second button, "Review Code", next to "New Task". It opens the existing `NewTaskModal` pre-set to "use existing branch" with the "create new branch" option hidden entirely (a review always targets something that already exists). Opening it triggers a new `RepoFetch` IPC call (`git fetch` in that repo) before populating the branch dropdown, so newly-pushed branches are selectable without the user having to fetch manually outside the app. The created task is tagged `kind: 'review'`. Review tasks render in the same per-repo task list as regular tasks (not a separate section), with a small "Review" badge next to the title.

### Quick Questions UI

A new, always-visible section in the sidebar, below the repo list: a "Quick Questions" heading, a "+ New Question" button, and a flat list of scratch tasks (title + status only — no repo/branch shown, since they have none). A scratch task uses the exact same `TerminalTab`/`TabBar`/`TaskNotesPanel`/multi-tab/autosave machinery as any other task, since it's still a normal `TaskRecord` entry in the same `tasks` array — `App`'s `tasksByRepoId` grouping just needs to also produce a separate flat list of `kind: 'scratch'` tasks (which have no `repoId` to group by) and pass it to `RepoSidebar` alongside the per-repo tree. Creating one opens a minimal modal with just a Title field (no branch, no ADO id, no repo picker).

### Searchable branch picker

The existing-branch `<select>` (used today by `NewTaskModal`'s "use existing branch" mode, and now also by the Review flow) becomes a filterable combobox: an input box that filters the branch list as you type, with the matching branches shown below for selection. One component, reused by both call sites — no behavior change to what gets submitted (still a branch name string).

## Non-Goals

- No fetch-on-every-branch-list-open for the regular "use existing branch" flow — auto-fetch is scoped to the new Review flow only (the regular flow's existing fetch gap is unchanged, filed separately if it becomes a problem).
- No editing/changing a task's `kind` after creation.
- No cross-repo search or global task filter (that's the separate, already-discussed task-notes search bar — not part of this design).
- No branch reordering, favoriting, or recency sorting in the searchable picker — plain substring filter only.
- No limit on the number of Quick Question tasks (YAGNI, matches the existing no-limit-on-open-tabs precedent).

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `kind`-tagged tasks (`worktree` | `review` | `scratch`), the Review Code and Quick Questions UI flows, and a shared searchable branch picker.

**Architecture:** `TaskRecord`/`TaskNotesFrontmatter` gain an optional-on-read `kind` field, with `repoId`/`branch` becoming optional (`'scratch'` tasks omit both). `TaskCreateRequest` gains an optional `kind` and its `repoId` becomes optional too (required for `'worktree'`/`'review'`, absent for `'scratch'`). `TaskCreate`/`TaskRemove` branch on `kind` for scratch-folder vs. worktree handling; `'review'` reuses the existing worktree-for-existing-branch path unchanged. A new `RepoFetch` IPC channel wraps `git fetch`. A new `BranchPicker` presentational component (filterable combobox) replaces the plain `<select>` in `NewTaskModal`. `App`/`RepoSidebar` gain a parallel "Quick Questions" list alongside the per-repo tree.

**Tech Stack:** Same as the rest of the project — TypeScript strict, React 18, Tailwind CSS tokens, Vitest + React Testing Library, `execFile`-based git service.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one component per file, `JSX.Element` return types.
- Never build a shell command by string-interpolating user input — `execFile`/`spawn` with argument arrays only (per this repo's `CLAUDE.md`).
- Never force-remove a git worktree without explicit confirmation (unchanged from today — review/worktree removal reuses the existing confirmed-removal flow; only the new scratch-folder deletion path is new, and it's app-owned disposable storage, not a worktree).
- Styling uses Tailwind CSS v4 tokens (`graphite-*`, `clay-*`, `danger-*`) — no arbitrary hex values.

---

### Task 1: `'scratch'` `TaskKind` and optional `repoId`/`branch` across shared types

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/services/notes-service.ts`
- Test: `src/main/services/notes-service.test.ts`

**Interfaces:**
- Produces: `TaskKind = 'worktree' | 'review' | 'scratch'` (was `'worktree' | 'review'`); `TaskRecord.repoId?: string` and `TaskRecord.branch?: string` (both were required); `TaskNotesFrontmatter.branch?: string` (was required); `TaskCreateRequest.repoId?: string` (was required). No other fields on any of these interfaces change.

- [ ] **Step 1: Write the failing test**

Append to the existing `describe('serializeTaskNotes / parseTaskNotes', ...)` block in `src/main/services/notes-service.test.ts`:

```tsx
  it('round-trips a scratch-kind task with no branch', () => {
    const scratchSample: TaskNotes = {
      frontmatter: {
        title: 'What does this error mean?',
        worktreePath: 'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\scratch\\task-9',
        status: 'todo',
        kind: 'scratch',
      },
      body: '',
    };
    const raw = serializeTaskNotes(scratchSample);
    expect(parseTaskNotes(raw)).toEqual(scratchSample);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:main -- notes-service`
Expected: FAIL — `serializeTaskNotes` currently prints `branch: undefined` unconditionally (`notes.frontmatter.branch` is `undefined` for the scratch sample, but the line is pushed regardless), and `parseTaskNotes` currently defaults a missing/unparseable branch to `''` via `fields.branch ?? ''`. The round-tripped object ends up with `branch: 'undefined'` (the literal string, since the line `branch: undefined` was written and then parsed back as text) instead of matching `scratchSample`, which has no `branch` key at all. (Vitest runs through esbuild, which strips TypeScript types without type-checking, so the interface not yet allowing an absent `branch` doesn't surface as a compile error here — the mismatch only shows up as this runtime assertion failure.)

- [ ] **Step 3: Write the minimal implementation**

In `src/shared/types.ts`, change:

```ts
export type TaskKind = 'worktree' | 'review' | 'scratch';

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
```

and:

```ts
export interface TaskNotesFrontmatter {
  title: string;
  adoId?: string;
  branch?: string;
  worktreePath: string;
  status: TaskStatus;
  kind: TaskKind;
}
```

In `src/shared/ipc-channels.ts`, change `TaskCreateRequest`:

```ts
export interface TaskCreateRequest {
  repoId?: string;
  title: string;
  adoId?: string;
  branch?: string;
  existingBranch?: string;
  kind?: TaskKind;
}
```

In `src/main/services/notes-service.ts`, update `serializeTaskNotes` to only emit the `branch:` line when a branch is present (mirroring the existing `adoId` handling):

```ts
export function serializeTaskNotes(notes: TaskNotes): string {
  const lines = ['---', `title: ${notes.frontmatter.title}`];
  if (notes.frontmatter.adoId) {
    lines.push(`adoId: ${notes.frontmatter.adoId}`);
  }
  if (notes.frontmatter.branch !== undefined) {
    lines.push(`branch: ${notes.frontmatter.branch}`);
  }
  lines.push(`worktreePath: ${notes.frontmatter.worktreePath}`);
  lines.push(`status: ${notes.frontmatter.status}`);
  lines.push(`kind: ${notes.frontmatter.kind}`);
  lines.push('---', '', notes.body);
  return lines.join('\n');
}
```

And update `parseTaskNotes` to leave `branch` as `undefined` when the line is absent, instead of defaulting to `''`:

```ts
  return {
    frontmatter: {
      title: fields.title ?? '',
      adoId: fields.adoId,
      branch: fields.branch,
      worktreePath: fields.worktreePath ?? '',
      status: (fields.status as TaskStatus) ?? 'todo',
      kind: (fields.kind as TaskKind) ?? 'worktree',
    },
    body: body.trim(),
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:main -- notes-service`
Expected: PASS (3 tests in the `serializeTaskNotes / parseTaskNotes` describe block, plus the unaffected `readTaskNotes / writeTaskNotes / archiveTaskNotes` block — 5 total)

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts src/main/services/notes-service.ts src/main/services/notes-service.test.ts
git commit -m "feat: add scratch TaskKind and make repoId/branch optional"
```

---

### Task 2: Scratch-folder create/remove logic in `TaskCreate`/`TaskRemove`

This task depends on Task 1 (`TaskRecord.repoId`/`branch` optional, `TaskCreateRequest.repoId` optional) being in place first.

**Files:**
- Modify: `src/main/paths.ts`
- Modify: `src/main/paths.test.ts`
- Modify: `src/main/ipc/task-handlers.ts`
- Modify: `src/main/ipc/task-handlers.test.ts`

**Interfaces:**
- Consumes: optional `repoId`/`branch` on `TaskRecord`, optional `repoId` on `TaskCreateRequest` (Task 1).
- Produces: `getScratchPath(taskId: string): string` — new named export from `src/main/paths.ts`, returning `<runtime-data-root>/scratch/<taskId>`. `TaskCreate` and `TaskRemove` (already-registered IPC handlers, unchanged signatures) now branch on `request.kind === 'scratch'` / `task.kind === 'scratch'`. No other exports change.

- [ ] **Step 1: Write the failing test**

Add to `src/main/paths.test.ts` (and add `getScratchPath` to the existing import line):

```ts
import { getRuntimeDataRoot, getStorePath, getReposRoot, getTaskNotesPath, getTaskTranscriptPath, getWorktreePath, getPastedImagesDir, getScratchPath } from './paths';
```

```ts
  it('getScratchPath returns scratch/<id> under the runtime root', () => {
    expect(getScratchPath('task-9')).toBe(join(getRuntimeDataRoot(), 'scratch', 'task-9'));
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:main -- paths`
Expected: FAIL — `getScratchPath` is not exported from `./paths` yet.

- [ ] **Step 3: Write the minimal implementation**

Add to `src/main/paths.ts`:

```ts
export function getScratchPath(taskId: string): string {
  return join(getRuntimeDataRoot(), 'scratch', taskId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:main -- paths`
Expected: PASS (8 tests)

- [ ] **Step 5: Write the failing tests for `task-handlers`**

In `src/main/ipc/task-handlers.test.ts`, add a mock for `node:fs/promises` near the top (after the `electron` mock, before the `import { registerTaskHandlers } ...` line):

```ts
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
}));
```

Add `getScratchPath` to the existing `../paths` mock:

```ts
vi.mock('../paths', () => ({
  getStorePath: () => 'C:\\fake\\store.json',
  getTaskNotesPath: (taskId: string) => `C:\\fake\\tasks\\${taskId}.md`,
  getWorktreePath: (repoPath: string, repoName: string, slug: string) =>
    `${repoPath}\\..\\${repoName}-worktrees\\${slug}`,
  getScratchPath: (taskId: string) => `C:\\fake\\scratch\\${taskId}`,
}));
```

Add `mkdir` and `rm` to the existing import from `node:fs/promises`, and to the `beforeEach` mock-clearing block:

```ts
import { mkdir, rm } from 'node:fs/promises';
```

```ts
  beforeEach(() => {
    store = {
      repos: [{ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' }],
      tasks: [],
    };
    handlers.clear();
    spawnClaudeSession.mockClear();
    isSessionAlive.mockClear();
    killSession.mockClear();
    vi.mocked(addWorktree).mockClear();
    vi.mocked(addWorktreeForExistingBranch).mockClear();
    vi.mocked(removeWorktree).mockClear();
    vi.mocked(mkdir).mockClear();
    vi.mocked(rm).mockClear();
    registerTaskHandlers(onPtyData);
  });
```

Then append two new `it` blocks inside the `describe('task-handlers', ...)` block:

```ts
  it('TaskCreate creates an empty scratch directory and stores a task with no repoId/branch, without calling git', async () => {
    const handler = handlers.get(IpcChannels.TaskCreate);
    const task = await handler?.({}, { title: 'What does this error mean?', kind: 'scratch' });
    expect(mkdir).toHaveBeenCalledWith('C:\\fake\\scratch\\' + (task as TaskRecord).id, { recursive: true });
    expect(task).toMatchObject({ title: 'What does this error mean?', kind: 'scratch', status: 'todo' });
    expect((task as TaskRecord).repoId).toBeUndefined();
    expect((task as TaskRecord).branch).toBeUndefined();
    expect(addWorktree).not.toHaveBeenCalled();
    expect(addWorktreeForExistingBranch).not.toHaveBeenCalled();
    expect(store.tasks).toHaveLength(1);
  });

  it('TaskRemove deletes the scratch directory recursively instead of calling removeWorktree, for a scratch task', async () => {
    store.tasks.push({
      id: 'task-2',
      title: 'What does this error mean?',
      worktreePath: 'C:\\fake\\scratch\\task-2',
      status: 'todo',
      kind: 'scratch',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    const handler = handlers.get(IpcChannels.TaskRemove);
    await handler?.({}, 'task-2');
    expect(rm).toHaveBeenCalledWith('C:\\fake\\scratch\\task-2', { recursive: true, force: true });
    expect(removeWorktree).not.toHaveBeenCalled();
    expect(store.tasks).toHaveLength(0);
  });
```

Add `import type { TaskRecord } from '../../shared/types';` to the top of the test file (next to the existing `import type { StoreData } from '../../shared/types';`, or combine into one type-only import line).

- [ ] **Step 6: Run the tests to verify the two new ones fail**

Run: `npm run test:main -- task-handlers`
Expected: 8 existing tests pass, 2 new tests fail — `TaskCreate` still requires `repoId` and throws `Unknown repo: undefined`; `TaskRemove` still always calls `removeWorktree` and looks up a repo by `task.repoId` (`undefined` for the scratch task), throwing `Unknown repo: undefined`.

- [ ] **Step 7: Implement**

In `src/main/ipc/task-handlers.ts`, add the new imports:

```ts
import { mkdir, rm } from 'node:fs/promises';
```

```ts
import { getStorePath, getTaskNotesPath, getWorktreePath, getScratchPath } from '../paths';
```

Replace the `TaskCreate` handler body with:

```ts
  ipcMain.handle(IpcChannels.TaskCreate, async (_event, request: TaskCreateRequest): Promise<TaskRecord> => {
    const store = await readStore(getStorePath());

    if (request.kind === 'scratch') {
      const taskId = randomUUID();
      const worktreePath = getScratchPath(taskId);
      await mkdir(worktreePath, { recursive: true });

      const now = new Date().toISOString();
      const task: TaskRecord = {
        id: taskId,
        title: request.title,
        adoId: request.adoId,
        worktreePath,
        status: 'todo',
        kind: 'scratch',
        createdAt: now,
        updatedAt: now,
      };
      store.tasks.push(task);
      await writeStore(getStorePath(), store);
      await writeTaskNotes(getTaskNotesPath(task.id), {
        frontmatter: {
          title: task.title,
          adoId: task.adoId,
          worktreePath: task.worktreePath,
          status: task.status,
          kind: task.kind,
        },
        body: '',
      });
      spawnClaudeSession(task.id, task.worktreePath, false, onPtyData);
      return task;
    }

    const repo = store.repos.find((candidate) => candidate.id === request.repoId);
    if (!repo) {
      throw new Error(`Unknown repo: ${request.repoId}`);
    }
    const existingBranch = request.existingBranch;
    const slug = existingBranch !== undefined ? slugify(existingBranch) : slugify(request.title);
    const branch = existingBranch !== undefined ? existingBranch : (request.branch ?? `task/${slug}`);
    assertSafeBranchName(branch);

    const duplicateTask = store.tasks.find(
      (candidate) => candidate.repoId === repo.id && candidate.branch === branch,
    );
    if (duplicateTask) {
      throw new Error(
        `A task for branch "${branch}" already exists ("${duplicateTask.title}"). Open it from the sidebar instead of creating a new one.`,
      );
    }

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
    spawnClaudeSession(task.id, task.worktreePath, false, onPtyData);
    return task;
  });
```

Replace the `TaskRemove` handler body with:

```ts
  ipcMain.handle(IpcChannels.TaskRemove, async (_event, taskId: string): Promise<void> => {
    const store = await readStore(getStorePath());
    const task = store.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    killSession(taskId);
    if (task.kind === 'scratch') {
      await rm(task.worktreePath, { recursive: true, force: true });
    } else {
      const repo = store.repos.find((candidate) => candidate.id === task.repoId);
      if (!repo) {
        throw new Error(`Unknown repo: ${task.repoId}`);
      }
      await removeWorktree(repo.path, task.worktreePath);
    }
    store.tasks = store.tasks.filter((candidate) => candidate.id !== taskId);
    await writeStore(getStorePath(), store);
    await archiveTaskNotes(getTaskNotesPath(taskId));
  });
```

- [ ] **Step 8: Run the tests to verify all pass**

Run: `npm run test:main -- task-handlers`
Expected: PASS (10 tests)

- [ ] **Step 9: Commit**

```bash
git add src/main/paths.ts src/main/paths.test.ts src/main/ipc/task-handlers.ts src/main/ipc/task-handlers.test.ts
git commit -m "feat: create/remove a disposable scratch folder for kind 'scratch' tasks"
```

---

### Task 3: `NewQuestionModal` component

A scratch task's creation form is just a title — no branch mode toggle, no ADO id, no repo picker. `NewTaskModal` already juggles two modes (`'task'` and `'review'`) across ~165 lines, each adding its own conditional branches for the ADO field, the branch-mode fieldset, and the existing-branch picker; bolting on a third mode would mean threading a `mode === 'scratch'` check through most of those branches (hiding ADO id, hiding the branch fieldset entirely, changing the dialog's `aria-label` and heading) and would touch — and risk regressing — the 13 existing tests in `new-task-modal.test.tsx` that cover the `'task'`/`'review'` modes. A dedicated `NewQuestionModal` with a single `Title` field is a handful of lines, matches the "one component, one responsibility" principle, and leaves `NewTaskModal` (and its tests) completely untouched. Building it as its own component is the less invasive option and is what this task does.

**Files:**
- Create: `src/renderer/components/new-question-modal/new-question-modal.tsx`
- Test: `src/renderer/components/new-question-modal/new-question-modal.test.tsx`
- Create: `src/renderer/components/new-question-modal/new-question-modal.stories.tsx`

**Interfaces:**
- Consumes: `ModalOverlay` (`../modal-overlay/modal-overlay`), `Spinner` (`../spinner/spinner`).
- Produces: `NewQuestionFields { title: string }` and `NewQuestionModal({ isOpen, isSubmitting, onClose, onSubmit }: NewQuestionModalProps): JSX.Element | null`, where `NewQuestionModalProps { isOpen: boolean; isSubmitting: boolean; onClose: () => void; onSubmit: (fields: NewQuestionFields) => void }`.

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/components/new-question-modal/new-question-modal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewQuestionModal } from './new-question-modal';

describe('NewQuestionModal', () => {
  it('does not render when isOpen is false', () => {
    render(<NewQuestionModal isOpen={false} isSubmitting={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits the title', async () => {
    const onSubmit = vi.fn();
    render(<NewQuestionModal isOpen isSubmitting={false} onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), 'What does this error mean?');
    await userEvent.click(screen.getByRole('button', { name: 'Create Question' }));
    expect(onSubmit).toHaveBeenCalledWith({ title: 'What does this error mean?' });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<NewQuestionModal isOpen isSubmitting={false} onClose={onClose} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disables Cancel and Create Question and shows a spinner while isSubmitting', () => {
    render(<NewQuestionModal isOpen isSubmitting onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Creating/ })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:renderer -- new-question-modal`
Expected: FAIL — cannot find module `./new-question-modal` (file doesn't exist yet)

- [ ] **Step 3: Write the minimal implementation**

Create `src/renderer/components/new-question-modal/new-question-modal.tsx`:

```tsx
import { useState } from 'react';
import { ModalOverlay } from '../modal-overlay/modal-overlay';
import { Spinner } from '../spinner/spinner';

export interface NewQuestionFields {
  title: string;
}

export interface NewQuestionModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (fields: NewQuestionFields) => void;
}

const fieldInputClasses =
  'rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-graphite-100 focus:border-clay-500 focus:outline-none';
const fieldLabelClasses = 'text-sm font-medium text-graphite-400';

export function NewQuestionModal({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: NewQuestionModalProps): JSX.Element | null {
  const [title, setTitle] = useState('');

  if (!isOpen) {
    return null;
  }

  function handleSubmit(): void {
    onSubmit({ title });
  }

  return (
    <ModalOverlay>
      <div role="dialog" aria-label="New Question" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-graphite-100">New Question</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="new-question-title" className={fieldLabelClasses}>
            Title
          </label>
          <input
            id="new-question-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={fieldInputClasses}
          />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md px-4 py-2 text-sm font-medium text-graphite-400 hover:text-graphite-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-md bg-clay-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:bg-clay-500 disabled:opacity-50"
          >
            {isSubmitting && <Spinner />}
            {isSubmitting ? 'Creating…' : 'Create Question'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:renderer -- new-question-modal`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the Storybook story**

Create `src/renderer/components/new-question-modal/new-question-modal.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { NewQuestionModal } from './new-question-modal';

const meta: Meta<typeof NewQuestionModal> = {
  component: NewQuestionModal,
  title: 'Components/NewQuestionModal',
  args: { onClose: fn(), onSubmit: fn() },
};

export default meta;
type Story = StoryObj<typeof NewQuestionModal>;

export const Open: Story = { args: { isOpen: true, isSubmitting: false } };
export const Closed: Story = { args: { isOpen: false, isSubmitting: false } };
export const Submitting: Story = { args: { isOpen: true, isSubmitting: true } };
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/new-question-modal
git commit -m "feat: add NewQuestionModal for creating scratch tasks"
```

---

### Task 4: Quick Questions sidebar section and `App` wiring

This task depends on Task 1 (`'scratch'` kind, optional `repoId`) and Task 3 (`NewQuestionModal`).

**Files:**
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.tsx`
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx`
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.stories.tsx`
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/app.test.tsx`

**Interfaces:**
- Consumes: `NewQuestionModal`/`NewQuestionFields` (Task 3).
- Produces: `RepoSidebarProps` gains `scratchTasks: TaskRecord[]` and `onNewQuestionClick: () => void`. No other prop changes. `App` gains no new exports (internal state/rendering only).

- [ ] **Step 1: Write the failing tests for `RepoSidebar`**

Add `scratchTasks={[]}` and `onNewQuestionClick={vi.fn()}` next to the existing `onReviewCodeClick={...}` prop in all 7 existing `render(<RepoSidebar ... />)` calls in `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx`. The first one becomes:

```tsx
  it('renders each repo and its tasks', () => {
    render(
      <RepoSidebar
        repos={[repo]}
        tasksByRepoId={{ 'repo-1': [task] }}
        scratchTasks={[]}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
      />,
    );
    expect(screen.getByText('demo')).toBeInTheDocument();
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
  });
```

Apply the same two props (`scratchTasks={[]}` and `onNewQuestionClick={vi.fn()}`, or `onNewQuestionClick={onNewQuestionClick}` for the one test that already asserts on a specific callback) to the other 6 render calls, keeping every other prop/assertion unchanged.

Then append two new tests inside the `describe('RepoSidebar', ...)` block:

```tsx
  it('renders scratch tasks in a Quick Questions section, showing only title and status', () => {
    const scratchTask: TaskRecord = {
      id: 'task-3',
      title: 'What does this error mean?',
      worktreePath: 'C:\\scratch\\task-3',
      status: 'in-progress',
      kind: 'scratch',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    };
    render(
      <RepoSidebar
        repos={[repo]}
        tasksByRepoId={{ 'repo-1': [task] }}
        scratchTasks={[scratchTask]}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Quick Questions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'What does this error mean?' })).toBeInTheDocument();
    expect(screen.getByText('in-progress')).toBeInTheDocument();
  });

  it('calls onNewQuestionClick when "+ New Question" is clicked', async () => {
    const onNewQuestionClick = vi.fn();
    render(
      <RepoSidebar
        repos={[]}
        tasksByRepoId={{}}
        scratchTasks={[]}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={onNewQuestionClick}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '+ New Question' }));
    expect(onNewQuestionClick).toHaveBeenCalledOnce();
  });
```

- [ ] **Step 2: Run the tests to verify the two new ones fail (and the updated ones still pass)**

Run: `npm run test:renderer -- repo-sidebar`
Expected: 7 existing tests pass (with the two new props added), 2 new tests fail — `RepoSidebar` doesn't accept `scratchTasks`/`onNewQuestionClick` yet and renders no "Quick Questions" section or "+ New Question" button.

- [ ] **Step 3: Implement**

In `src/renderer/components/repo-sidebar/repo-sidebar.tsx`, update the props interface and function signature:

```tsx
export interface RepoSidebarProps {
  repos: RepoRecord[];
  tasksByRepoId: Record<string, TaskRecord[]>;
  scratchTasks: TaskRecord[];
  selectedTaskId: string | undefined;
  onSelectTask: (taskId: string) => void;
  onOpenRepoClick: () => void;
  onCloneRepoClick: () => void;
  onNewTaskClick: (repoId: string) => void;
  onRemoveTaskClick: (taskId: string) => void;
  onReviewCodeClick: (repoId: string) => void;
  onNewQuestionClick: () => void;
}

export function RepoSidebar({
  repos,
  tasksByRepoId,
  scratchTasks,
  selectedTaskId,
  onSelectTask,
  onOpenRepoClick,
  onCloneRepoClick,
  onNewTaskClick,
  onRemoveTaskClick,
  onReviewCodeClick,
  onNewQuestionClick,
}: RepoSidebarProps): JSX.Element {
```

Insert a new section between the closing `</ul>` of the repo list and the closing `</nav>`:

```tsx
      </ul>
      <div className="flex flex-col gap-2 border-t border-graphite-700 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-graphite-100">Quick Questions</h2>
          <button
            type="button"
            onClick={onNewQuestionClick}
            className="rounded-md bg-clay-600 px-2 py-1 text-xs font-medium text-graphite-100 hover:bg-clay-500"
          >
            + New Question
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {scratchTasks.map((task) => (
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
              <span className="shrink-0 text-xs text-graphite-400">{task.status}</span>
              <button
                type="button"
                onClick={() => onRemoveTaskClick(task.id)}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-graphite-400 hover:text-danger-400"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
```

In `src/renderer/components/repo-sidebar/repo-sidebar.stories.tsx`, add the two new args to `meta.args` (applies to every story):

```tsx
const meta: Meta<typeof RepoSidebar> = {
  component: RepoSidebar,
  title: 'Components/RepoSidebar',
  args: {
    onSelectTask: fn(),
    onOpenRepoClick: fn(),
    onCloneRepoClick: fn(),
    onNewTaskClick: fn(),
    onRemoveTaskClick: fn(),
    onReviewCodeClick: fn(),
    onNewQuestionClick: fn(),
    scratchTasks: [],
  },
};
```

- [ ] **Step 4: Run the tests to verify all pass**

Run: `npm run test:renderer -- repo-sidebar`
Expected: PASS (9 tests)

- [ ] **Step 5: Write the failing tests for `App`**

Add a `scratchTask` fixture next to the existing `task`/`task2` fixtures in `src/renderer/app.test.tsx`:

```tsx
const scratchTask: TaskRecord = {
  id: 'task-3',
  title: 'What does this error mean?',
  worktreePath: 'C:\\scratch\\task-3',
  status: 'todo',
  kind: 'scratch',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
};
```

Append three new tests inside the `describe('App', ...)` block:

```tsx
  it('renders the Quick Questions section with scratch tasks, separate from the per-repo tree', async () => {
    listTasks.mockResolvedValueOnce([task, task2, scratchTask]);
    render(<App />);
    expect(await screen.findByText('Quick Questions')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'What does this error mean?' })).toBeInTheDocument();
  });

  it('"+ New Question" creates a scratch task with no repoId and opens it', async () => {
    createTask.mockResolvedValueOnce(scratchTask);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '+ New Question' }));
    await userEvent.type(screen.getByLabelText('Title'), 'What does this error mean?');
    await userEvent.click(screen.getByRole('button', { name: 'Create Question' }));
    expect(createTask).toHaveBeenCalledWith({ title: 'What does this error mean?', kind: 'scratch' });
    expect(openTask).toHaveBeenCalledWith('task-3');
  });

  it('removing a scratch task shows a scratch-specific confirmation and calls removeTask', async () => {
    listTasks.mockResolvedValueOnce([task, task2, scratchTask]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await screen.findByText('What does this error mean?');
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    const scratchRemoveButton = removeButtons[removeButtons.length - 1];
    if (!scratchRemoveButton) {
      throw new Error('Expected a "Remove" button for the scratch task to be rendered');
    }
    await userEvent.click(scratchRemoveButton);
    expect(confirmSpy).toHaveBeenCalledWith('Remove this question? This deletes its scratch folder.');
    expect(removeTask).toHaveBeenCalledWith('task-3');
    confirmSpy.mockRestore();
  });
```

- [ ] **Step 6: Run the tests to verify the three new ones fail**

Run: `npm run test:renderer -- app`
Expected: existing tests pass, 3 new tests fail — `App` doesn't render a "Quick Questions" section, doesn't render a "+ New Question" button, and always confirms removal with "Remove this task? This deletes its git worktree." regardless of kind.

- [ ] **Step 7: Implement**

In `src/renderer/app.tsx`, add the new import next to the other modal imports:

```tsx
import { NewQuestionModal } from './components/new-question-modal/new-question-modal';
```

and add `NewQuestionFields` to the existing type-only import line (or as its own line):

```tsx
import type { NewQuestionFields } from './components/new-question-modal/new-question-modal';
```

Add a new piece of state next to `isCloneModalOpen`:

```tsx
  const [isNewQuestionModalOpen, setIsNewQuestionModalOpen] = useState(false);
```

Add a new handler after `handleCreateTask`:

```tsx
  async function handleCreateQuestion(fields: NewQuestionFields): Promise<void> {
    setErrorMessage(undefined);
    setIsSubmittingModal(true);
    try {
      const task = await window.claudeOrchestrator.createTask({ title: fields.title, kind: 'scratch' });
      setTasks((current) => [...current, task]);
      await handleSelectTask(task.id);
      setIsNewQuestionModalOpen(false);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    } finally {
      setIsSubmittingModal(false);
    }
  }
```

Update `handleRemoveTask` to look up the task first and vary the confirmation message by kind:

```tsx
  async function handleRemoveTask(taskId: string): Promise<void> {
    const task = tasks.find((candidate) => candidate.id === taskId);
    const confirmMessage =
      task?.kind === 'scratch'
        ? 'Remove this question? This deletes its scratch folder.'
        : 'Remove this task? This deletes its git worktree.';
    if (!window.confirm(confirmMessage)) {
      return;
    }
    setErrorMessage(undefined);
    try {
      await window.claudeOrchestrator.removeTask(taskId);
      setTasks((current) => current.filter((candidate) => candidate.id !== taskId));
      setOpenTaskIds((current) => current.filter((id) => id !== taskId));
      if (taskId === activeTaskId) {
        setActiveTaskId(undefined);
      }
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }
```

Update the `tasksByRepoId` grouping so tasks with no `repoId` (scratch tasks) don't land in a bogus `"undefined"` bucket, and derive the scratch list next to it:

```tsx
  const tasksByRepoId = tasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
    if (task.repoId === undefined) {
      return acc;
    }
    (acc[task.repoId] ??= []).push(task);
    return acc;
  }, {});
  const scratchTasks = tasks.filter((task) => task.kind === 'scratch');
```

Pass the two new props to `RepoSidebar`:

```tsx
      <RepoSidebar
        repos={repos}
        tasksByRepoId={tasksByRepoId}
        scratchTasks={scratchTasks}
        selectedTaskId={activeTaskId}
        onSelectTask={(taskId) => void handleSelectTask(taskId)}
        onOpenRepoClick={() => void handleOpenRepoClick()}
        onCloneRepoClick={() => setIsCloneModalOpen(true)}
        onNewTaskClick={(repoId) => void handleNewTaskClick(repoId)}
        onRemoveTaskClick={(taskId) => void handleRemoveTask(taskId)}
        onReviewCodeClick={(repoId) => void handleReviewCodeClick(repoId)}
        onNewQuestionClick={() => setIsNewQuestionModalOpen(true)}
      />
```

Render the new modal next to `CloneRepoModal`:

```tsx
      <NewQuestionModal
        isOpen={isNewQuestionModalOpen}
        isSubmitting={isSubmittingModal}
        onClose={() => setIsNewQuestionModalOpen(false)}
        onSubmit={(fields) => void handleCreateQuestion(fields)}
      />
```

- [ ] **Step 8: Run the tests to verify all pass**

Run: `npm run test:renderer -- app`
Expected: PASS (all existing tests + 3 new ones)

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/repo-sidebar/repo-sidebar.tsx src/renderer/components/repo-sidebar/repo-sidebar.test.tsx src/renderer/components/repo-sidebar/repo-sidebar.stories.tsx src/renderer/app.tsx src/renderer/app.test.tsx
git commit -m "feat: add Quick Questions sidebar section for scratch tasks"
```

---

### Task 5: `BranchPicker` filterable combobox component

**Files:**
- Create: `src/renderer/components/branch-picker/branch-picker.tsx`
- Test: `src/renderer/components/branch-picker/branch-picker.test.tsx`
- Create: `src/renderer/components/branch-picker/branch-picker.stories.tsx`

**Interfaces:**
- Consumes: `BranchOption` from `../../../shared/ipc-channels` (unchanged — `{ value: string; label: string; isRemote: boolean }`).
- Produces: `BranchPicker({ id, label, branches, value, onChange }: BranchPickerProps): JSX.Element`, where `BranchPickerProps { id: string; label: string; branches: BranchOption[]; value: string; onChange: (value: string) => void }`. A controlled component: `value` is the committed branch name (or `''` if none is selected yet); `onChange` fires with a branch's `value` when the user picks it from the list, and with `''` whenever the user types (invalidating the previous selection until they pick again).

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/components/branch-picker/branch-picker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BranchPicker } from './branch-picker';

const branches = [
  { value: 'feature-x', label: 'feature-x', isRemote: false },
  { value: 'feature-y', label: 'origin/feature-y', isRemote: true },
];

describe('BranchPicker', () => {
  it('renders a labeled combobox with the listbox closed until focused', () => {
    render(<BranchPicker id="branch" label="Existing Branch" branches={branches} value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Existing Branch')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows every branch once the input is focused', async () => {
    render(<BranchPicker id="branch" label="Existing Branch" branches={branches} value="" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'feature-x' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'origin/feature-y' })).toBeInTheDocument();
  });

  it('filters the options as the user types', async () => {
    render(<BranchPicker id="branch" label="Existing Branch" branches={branches} value="" onChange={vi.fn()} />);
    await userEvent.type(screen.getByRole('combobox'), 'feature-x');
    expect(screen.getByRole('option', { name: 'feature-x' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'origin/feature-y' })).not.toBeInTheDocument();
  });

  it('shows "No matching branches" when nothing matches the query', async () => {
    render(<BranchPicker id="branch" label="Existing Branch" branches={branches} value="" onChange={vi.fn()} />);
    await userEvent.type(screen.getByRole('combobox'), 'nonexistent');
    expect(screen.getByText('No matching branches')).toBeInTheDocument();
  });

  it('clicking an option calls onChange with its value, fills the input with its label, and closes the listbox', async () => {
    const onChange = vi.fn();
    render(<BranchPicker id="branch" label="Existing Branch" branches={branches} value="" onChange={onChange} />);
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'origin/feature-y' }));
    expect(onChange).toHaveBeenCalledWith('feature-y');
    expect(screen.getByRole('combobox')).toHaveValue('origin/feature-y');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('typing after a selection clears the committed value until a branch is picked again', async () => {
    const onChange = vi.fn();
    render(<BranchPicker id="branch" label="Existing Branch" branches={branches} value="feature-x" onChange={onChange} />);
    await userEvent.type(screen.getByRole('combobox'), 'x');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('pressing Escape closes the listbox', async () => {
    render(<BranchPicker id="branch" label="Existing Branch" branches={branches} value="" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:renderer -- branch-picker`
Expected: FAIL — cannot find module `./branch-picker` (file doesn't exist yet)

- [ ] **Step 3: Write the minimal implementation**

Create `src/renderer/components/branch-picker/branch-picker.tsx`:

```tsx
import { useState } from 'react';
import type { BranchOption } from '../../../shared/ipc-channels';

export interface BranchPickerProps {
  id: string;
  label: string;
  branches: BranchOption[];
  value: string;
  onChange: (value: string) => void;
}

const fieldInputClasses =
  'rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-graphite-100 focus:border-clay-500 focus:outline-none';
const fieldLabelClasses = 'text-sm font-medium text-graphite-400';

export function BranchPicker({ id, label, branches, value, onChange }: BranchPickerProps): JSX.Element {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const listboxId = `${id}-listbox`;

  const filtered = branches.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));

  function selectBranch(option: BranchOption): void {
    onChange(option.value);
    setQuery(option.label);
    setIsOpen(false);
  }

  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className={fieldLabelClasses}>
        {label}
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
          onChange('');
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        className={fieldInputClasses}
      />
      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute top-full z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-graphite-600 bg-graphite-900 shadow-lg"
        >
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-graphite-400">No matching branches</li>}
          {filtered.map((option) => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                onClick={() => selectBranch(option)}
                className="block w-full px-3 py-2 text-left text-sm text-graphite-100 hover:bg-graphite-700"
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:renderer -- branch-picker`
Expected: PASS (7 tests)

- [ ] **Step 5: Add the Storybook story**

Create `src/renderer/components/branch-picker/branch-picker.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { BranchPicker } from './branch-picker';

const meta: Meta<typeof BranchPicker> = {
  component: BranchPicker,
  title: 'Components/BranchPicker',
  args: { id: 'branch-picker-story', label: 'Existing Branch', value: '', onChange: fn() },
};

export default meta;
type Story = StoryObj<typeof BranchPicker>;

export const Empty: Story = { args: { branches: [] } };
export const WithBranches: Story = {
  args: {
    branches: [
      { value: 'main', label: 'main', isRemote: false },
      { value: 'feature-x', label: 'feature-x', isRemote: false },
      { value: 'feature-y', label: 'origin/feature-y', isRemote: true },
    ],
  },
};
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/branch-picker
git commit -m "feat: add BranchPicker filterable combobox component"
```

---

### Task 6: Wire `BranchPicker` into `NewTaskModal` (both existing-branch and Review call sites)

This task depends on Task 5 (`BranchPicker`).

**Files:**
- Modify: `src/renderer/components/new-task-modal/new-task-modal.tsx`
- Modify: `src/renderer/components/new-task-modal/new-task-modal.test.tsx`
- Modify: `src/renderer/app.test.tsx`

**Interfaces:**
- Consumes: `BranchPicker` (Task 5).
- Produces: no changes to `NewTaskModalProps` or `NewTaskFields` — the plain `<select>` used for both the "use existing branch" toggle (`mode === 'task'`) and the Review flow (`mode === 'review'`) is replaced by one `BranchPicker` instance (both modes already share the same conditional render branch, so this is a single call site in the file). Submitted value is unchanged: `existingBranch` is still a branch name string.

- [ ] **Step 1: Update the affected tests first**

The interaction model changes from "pick from a native `<select>`" (`userEvent.selectOptions`) to "type/click into a `BranchPicker`" (`userEvent.click`/`userEvent.type` then click a `role="option"`). Replace the following `it` blocks in `src/renderer/components/new-task-modal/new-task-modal.test.tsx` with the versions below (all other tests in the file are unaffected and stay as-is):

```tsx
  it('toggling to "Use existing branch" shows a branch picker populated from the branches prop', async () => {
    render(
      <NewTaskModal
        isOpen
        mode="task"
        branches={[
          { value: 'feature-x', label: 'feature-x', isRemote: false },
          { value: 'feature-y', label: 'origin/feature-y', isRemote: true },
        ]}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'feature-x' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'origin/feature-y' })).toBeInTheDocument();
  });

  it('submits existingBranch (not branch) when in existing-branch mode', async () => {
    const onSubmit = vi.fn();
    render(
      <NewTaskModal
        isOpen
        mode="task"
        branches={[{ value: 'feature-x', label: 'feature-x', isRemote: false }]}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Resume feature work');
    await userEvent.click(screen.getByRole('radio', { name: 'Use existing branch' }));
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'feature-x' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Resume feature work',
      adoId: undefined,
      branch: undefined,
      existingBranch: 'feature-x',
    });
  });
```

```tsx
  it('review mode hides the branch-mode toggle and always shows the existing-branch picker', async () => {
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
    await userEvent.click(screen.getByRole('combobox'));
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
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'feature-x' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Review PR #42',
      adoId: undefined,
      branch: undefined,
      existingBranch: 'feature-x',
    });
  });
```

```tsx
  it('review mode enables Create Task once a branch is selected and submits it', async () => {
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
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'feature-x' }));
    expect(screen.getByRole('button', { name: 'Create Task' })).not.toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Review PR #42',
      adoId: undefined,
      branch: undefined,
      existingBranch: 'feature-x',
    });
  });
```

(`'review mode disables Create Task until a branch is selected'` and `'task mode with "Use existing branch" disables Create Task until a branch is selected'` don't interact with the combobox's options and are unaffected — leave them exactly as they are.)

Also update these two tests in `src/renderer/app.test.tsx`:

```tsx
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
    await userEvent.click(await screen.findByRole('combobox'));
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
    await userEvent.click(await screen.findByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'feature-x' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: 'repo-1', existingBranch: 'feature-x' }),
    );
  });
```

And this one:

```tsx
  it('creating a task from the review flow forwards kind "review" to createTask', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Review Code' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Review PR #42');
    await userEvent.click(await screen.findByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'feature-x' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: 'repo-1', existingBranch: 'feature-x', kind: 'review' }),
    );
  });
```

(`'"Review Code" fetches the repo, lists branches, and opens the modal in review mode'` only checks that a combobox is present, not its options — unaffected, leave as-is.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:renderer -- new-task-modal app`
Expected: FAIL — the native `<select>`'s `<option>` elements can't be meaningfully clicked the way a real popup listbox can be (there's no `role="listbox"` shown on focus, and clicking a hidden `<option>` doesn't update the select's value the way `userEvent.selectOptions` did), so every updated test that clicks an option after focusing the combobox fails.

- [ ] **Step 3: Implement**

In `src/renderer/components/new-task-modal/new-task-modal.tsx`, add the import:

```tsx
import { BranchPicker } from '../branch-picker/branch-picker';
```

Replace the existing-branch block:

```tsx
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
```

with:

```tsx
        {mode === 'review' || useExistingBranch ? (
          <BranchPicker
            id="new-task-existing-branch"
            label="Existing Branch"
            branches={branches}
            value={selectedExistingBranch}
            onChange={setSelectedExistingBranch}
          />
        ) : (
```

Everything else in the file (state, `handleSubmit`, the title/ADO/branch-mode fieldset, the footer buttons) stays exactly as-is.

- [ ] **Step 4: Run the tests to verify all pass**

Run: `npm run test:renderer -- new-task-modal app`
Expected: PASS (all tests in both files)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/new-task-modal/new-task-modal.tsx src/renderer/components/new-task-modal/new-task-modal.test.tsx src/renderer/app.test.tsx
git commit -m "feat: replace the existing-branch select with the searchable BranchPicker"
```
