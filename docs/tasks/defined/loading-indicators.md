# Task: Loading indicators for create/clone/open

**Status:** Defined

## Goal

Give visible feedback for the app's three slowest async actions — creating a task, cloning a repo, and opening an existing task's terminal — so the UI never looks frozen or silently clickable while git/PTY work happens in the background.

## Context

`NewTaskModal`'s "Create Task" button and `CloneRepoModal`'s "Clone" button both call `onSubmit` synchronously with no pending state: the modal stays open, fully interactive, and unchanged in appearance while `App`'s `handleCreateTask`/`handleCloneRepo` run their async work (`git worktree add`, `git clone`, spawning `claude` via node-pty) — inviting a double-click and giving no signal that anything is happening. Selecting an already-existing task from the sidebar has the same gap: `handleSelectTask`'s `openTask` call can take a moment (PTY/`claude` startup), during which the terminal pane shows nothing new.

## Proposed Design

### Modal submission state

`App` tracks `isSubmittingModal: boolean`, set `true` when `handleCreateTask`/`handleCloneRepo` starts and `false` in a `finally` once the whole async chain settles (success or error). `handleCreateTask`'s existing early modal-close (`setNewTaskRepoId(undefined)` right after `createTask` resolves, before `handleSelectTask` runs) moves to after `handleSelectTask` completes, so the modal stays open — with its pending state visible — for the full "create task, then open its terminal" chain, not just the worktree-creation part.

`NewTaskModal`/`CloneRepoModal` each gain an `isSubmitting: boolean` prop: while `true`, both the Cancel and the submit button (`Create Task`/`Clone`) are `disabled`, and the submit button's label switches to `Creating…`/`Cloning…` with a small spinner.

### Opening an existing task

`App` tracks `loadingTaskId: string | undefined` — set to a task's id when `handleSelectTask` begins the "not yet open" branch (the one that calls `openTask`), cleared once that branch's `await`s settle. While a task's id matches `loadingTaskId` and it's the `activeTaskId`, the terminal pane renders a loading overlay ("Starting session…" + spinner) on top of/instead of its `TerminalTab`.

### Shared component

A small presentational `Spinner` component (`src/renderer/components/spinner/spinner.tsx`) — an animated Tailwind spinner, no props beyond an optional size/className — used in all three places above for visual consistency.

## Non-Goals

- No progress percentage/ETA for git clone (no reliable signal to compute one from `execFile`'s current usage) — indeterminate spinner only.
- No changes to error handling/display — the existing `errorMessage` banner is unchanged; this is purely about the in-flight state, not failure states.
- No loading indicator for notes save/autosave (already near-instant, not reported as confusing).

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visible pending/loading state for task creation, repo cloning, and opening an existing task's terminal.

**Architecture:** `App` gains `isSubmittingModal`/`loadingTaskId` state, threaded into `NewTaskModal`/`CloneRepoModal` as an `isSubmitting` prop and into the terminal-pane rendering as a conditional overlay. A new shared `Spinner` component backs all three.

**Tech Stack:** Same as the rest of the project — TypeScript strict, React 18, Tailwind CSS tokens, Vitest + React Testing Library.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one component per file, `JSX.Element` return types.
- Styling uses Tailwind CSS v4 tokens (`graphite-*`, `clay-*`, `danger-*`) — no arbitrary hex values.
- Disabled buttons must remain reachable/labeled for accessibility (no `aria-hidden` on a disabled-but-visible control).

---

### Task 1: Spinner component

**Files:**
- Create: `src/renderer/components/spinner/spinner.tsx`
- Test: `src/renderer/components/spinner/spinner.test.tsx`
- Create: `src/renderer/components/spinner/spinner.stories.tsx`

**Interfaces:**
- Produces: `Spinner({ className }: { className?: string }): JSX.Element` — an inline `<span role="status" aria-label="Loading">` styled as a spinning ring using Tailwind's built-in `animate-spin` utility (no custom Tailwind config needed). `className` is optional and appended to the default classes (for callers that need spacing, e.g. `gap-2` next to text).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/spinner/spinner.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from './spinner';

describe('Spinner', () => {
  it('renders an accessible loading indicator', () => {
    render(<Spinner />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer -- spinner`
Expected: FAIL — cannot find module `./spinner` (file doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/components/spinner/spinner.tsx`:

```tsx
export interface SpinnerProps {
  className?: string;
}

export function Spinner({ className }: SpinnerProps): JSX.Element {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-graphite-600 border-t-clay-500 ${className ?? ''}`}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:renderer -- spinner`
Expected: PASS (1 test)

- [ ] **Step 5: Add the Storybook story**

Create `src/renderer/components/spinner/spinner.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Spinner } from './spinner';

const meta: Meta<typeof Spinner> = {
  component: Spinner,
  title: 'Components/Spinner',
};

export default meta;
type Story = StoryObj<typeof Spinner>;

export const Default: Story = {};
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/spinner
git commit -m "feat: add Spinner component for in-flight loading states"
```

---

### Task 2: NewTaskModal pending state

**Files:**
- Modify: `src/renderer/components/new-task-modal/new-task-modal.tsx`
- Modify: `src/renderer/components/new-task-modal/new-task-modal.test.tsx`

**Interfaces:**
- Consumes: `Spinner` from Task 1 (`import { Spinner } from '../spinner/spinner';`).
- Produces: `NewTaskModalProps` gains a new required field `isSubmitting: boolean`. No other prop or the `NewTaskFields` shape changes.

- [ ] **Step 1: Update existing tests to pass the new required prop**

`isSubmitting` is a new required prop, so every existing `render(<NewTaskModal ... />)` call in `src/renderer/components/new-task-modal/new-task-modal.test.tsx` needs `isSubmitting={false}` added. Apply this to all 5 existing `it(...)` blocks in that file — e.g. the first one becomes:

```tsx
it('does not render when isOpen is false', () => {
  render(<NewTaskModal isOpen={false} branches={[]} isSubmitting={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
```

Do the same (`isSubmitting={false}`) for the other 4 `render(<NewTaskModal ... />)` calls in that file, keeping every other prop/assertion unchanged.

- [ ] **Step 2: Write the new failing test**

Append to `src/renderer/components/new-task-modal/new-task-modal.test.tsx`, inside the existing `describe('NewTaskModal', ...)` block:

```tsx
  it('disables Cancel and Create Task and shows a spinner while isSubmitting', () => {
    render(<NewTaskModal isOpen branches={[]} isSubmitting onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Creating/ })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run tests to verify the new one fails and the rest still pass**

Run: `npm run test:renderer -- new-task-modal`
Expected: 5 pass (with `isSubmitting={false}` added), 1 fails — no `isSubmitting` prop handling yet, button still says "Create Task" with no `disabled` attribute

- [ ] **Step 4: Implement**

In `src/renderer/components/new-task-modal/new-task-modal.tsx`, add the import, extend the props interface, destructure the new prop, and update the two footer buttons:

```tsx
import { useState } from 'react';
import type { BranchOption } from '../../../shared/ipc-channels';
import { ModalOverlay } from '../modal-overlay/modal-overlay';
import { Spinner } from '../spinner/spinner';

export interface NewTaskFields {
  title: string;
  adoId: string | undefined;
  branch: string | undefined;
  existingBranch: string | undefined;
}

export interface NewTaskModalProps {
  isOpen: boolean;
  branches: BranchOption[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (fields: NewTaskFields) => void;
}
```

```tsx
export function NewTaskModal({
  isOpen,
  branches,
  isSubmitting,
  onClose,
  onSubmit,
}: NewTaskModalProps): JSX.Element | null {
```

Replace the existing footer buttons block (the `<div className="mt-2 flex justify-end gap-2">...</div>` at the end of the dialog) with:

```tsx
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
            {isSubmitting ? 'Creating…' : 'Create Task'}
          </button>
        </div>
```

Everything else in the file (state, `handleSubmit`, the title/ADO/branch fields) stays exactly as-is.

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm run test:renderer -- new-task-modal`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/new-task-modal
git commit -m "feat: add pending state to NewTaskModal"
```

---

### Task 3: CloneRepoModal pending state

**Files:**
- Modify: `src/renderer/components/clone-repo-modal/clone-repo-modal.tsx`
- Modify: `src/renderer/components/clone-repo-modal/clone-repo-modal.test.tsx`

**Interfaces:**
- Consumes: `Spinner` from Task 1 (`import { Spinner } from '../spinner/spinner';`).
- Produces: `CloneRepoModalProps` gains a new required field `isSubmitting: boolean`. `CloneRepoFields` is unchanged.

- [ ] **Step 1: Update existing tests to pass the new required prop**

Add `isSubmitting={false}` to all 3 existing `render(<CloneRepoModal ... />)` calls in `src/renderer/components/clone-repo-modal/clone-repo-modal.test.tsx`. First one becomes:

```tsx
it('does not render when isOpen is false', () => {
  render(<CloneRepoModal isOpen={false} isSubmitting={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Write the new failing test**

Append inside the existing `describe('CloneRepoModal', ...)` block:

```tsx
  it('disables Cancel and Clone and shows a spinner while isSubmitting', () => {
    render(<CloneRepoModal isOpen isSubmitting onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Cloning/ })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run tests to verify the new one fails and the rest still pass**

Run: `npm run test:renderer -- clone-repo-modal`
Expected: 3 pass (with `isSubmitting={false}` added), 1 fails

- [ ] **Step 4: Implement**

In `src/renderer/components/clone-repo-modal/clone-repo-modal.tsx`:

```tsx
import { useState } from 'react';
import { ModalOverlay } from '../modal-overlay/modal-overlay';
import { Spinner } from '../spinner/spinner';

export interface CloneRepoFields {
  url: string;
  name: string;
}

export interface CloneRepoModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (fields: CloneRepoFields) => void;
}
```

```tsx
export function CloneRepoModal({ isOpen, isSubmitting, onClose, onSubmit }: CloneRepoModalProps): JSX.Element | null {
```

Replace the footer buttons block with:

```tsx
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
            onClick={() => onSubmit({ url, name })}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-md bg-clay-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:bg-clay-500 disabled:opacity-50"
          >
            {isSubmitting && <Spinner />}
            {isSubmitting ? 'Cloning…' : 'Clone'}
          </button>
        </div>
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm run test:renderer -- clone-repo-modal`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/clone-repo-modal
git commit -m "feat: add pending state to CloneRepoModal"
```

---

### Task 4: Wire pending state into App

**Files:**
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/app.test.tsx`

**Interfaces:**
- Consumes: `NewTaskModal`'s and `CloneRepoModal`'s new `isSubmitting` prop (Tasks 2 and 3), `Spinner` from Task 1.
- Produces: no new exports — this task only changes `App`'s internal state and rendering.

This task depends on Tasks 1–3 being merged first (it passes `isSubmitting` to both modals, which only compile once those props exist).

- [ ] **Step 1: Write the failing tests**

Add this helper near the top of `src/renderer/app.test.tsx`, after the existing `vi.mock(...)` calls and before the `repo`/`task` fixtures:

```tsx
function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
```

Then append these three tests inside the existing `describe('App', ...)` block:

```tsx
  it('keeps the New Task modal open with a pending state until the new task session starts', async () => {
    const taskDeferred = createDeferred<TaskRecord>();
    createTask.mockReturnValueOnce(taskDeferred.promise);
    render(<App />);
    const newTaskButtons = await screen.findAllByRole('button', { name: 'New Task' });
    const firstNewTaskButton = newTaskButtons[0];
    if (!firstNewTaskButton) {
      throw new Error('Expected at least one "New Task" button to be rendered');
    }
    await userEvent.click(firstNewTaskButton);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix login bug');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));

    expect(await screen.findByRole('button', { name: /Creating/ })).toBeDisabled();
    expect(screen.getByRole('dialog', { name: 'New Task' })).toBeInTheDocument();

    taskDeferred.resolve(task);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Task' })).not.toBeInTheDocument());
  });

  it('shows a starting-session overlay while opening an existing task, then hides it', async () => {
    const openDeferred = createDeferred<void>();
    openTask.mockReturnValueOnce(openDeferred.promise);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));

    expect(await screen.findByText('Starting session…')).toBeInTheDocument();

    openDeferred.resolve();
    await waitFor(() => expect(screen.queryByText('Starting session…')).not.toBeInTheDocument());
  });

  it('keeps the Clone Repo modal open with a pending state until cloning finishes', async () => {
    const cloneDeferred = createDeferred<RepoRecord>();
    cloneRepo.mockReturnValueOnce(cloneDeferred.promise);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clone Repo' }));
    await userEvent.type(screen.getByLabelText('Git URL'), 'https://github.com/paurodriguez0220/demo.git');
    await userEvent.type(screen.getByLabelText('Local Name'), 'demo');
    await userEvent.click(screen.getByRole('button', { name: 'Clone' }));

    expect(await screen.findByRole('button', { name: /Cloning/ })).toBeDisabled();

    cloneDeferred.resolve(repo);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Clone Repo' })).not.toBeInTheDocument());
  });
```

- [ ] **Step 2: Run tests to verify the three new ones fail**

Run: `npm run test:renderer -- app.test`
Expected: existing tests still pass; the 3 new tests fail (`isSubmitting` prop doesn't exist on the modals yet / no loading overlay rendered / modal closes immediately instead of waiting)

- [ ] **Step 3: Implement — add state and import Spinner**

In `src/renderer/app.tsx`, add the import and two new state variables:

```tsx
import { TabBar } from './components/tab-bar/tab-bar';
import { Spinner } from './components/spinner/spinner';
```

```tsx
  const [isSubmittingModal, setIsSubmittingModal] = useState(false);
  const [loadingTaskId, setLoadingTaskId] = useState<string | undefined>();
```

(add these two lines right after the existing `const [errorMessage, setErrorMessage] = useState<string | undefined>();` line)

- [ ] **Step 4: Implement — update handleSelectTask**

Replace the existing `handleSelectTask` function with:

```tsx
  async function handleSelectTask(taskId: string): Promise<void> {
    setErrorMessage(undefined);
    try {
      if (!openTaskIds.includes(taskId)) {
        setLoadingTaskId(taskId);
        try {
          await window.claudeOrchestrator.openTask(taskId);
          setOpenTaskIds((current) => [...current, taskId]);
          const notes = await window.claudeOrchestrator.getTaskNotes(taskId);
          setNotesByTaskId((current) => ({ ...current, [taskId]: notes }));
        } finally {
          setLoadingTaskId(undefined);
        }
      }
      setActiveTaskId(taskId);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }
```

- [ ] **Step 5: Implement — update handleCreateTask and handleCloneRepo**

Replace `handleCreateTask` with:

```tsx
  async function handleCreateTask(fields: NewTaskFields): Promise<void> {
    if (!newTaskRepoId) {
      return;
    }
    setErrorMessage(undefined);
    setIsSubmittingModal(true);
    try {
      const task = await window.claudeOrchestrator.createTask({ repoId: newTaskRepoId, ...fields });
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

Note the modal-close line (`setNewTaskRepoId(undefined)`) moved to after `await handleSelectTask(task.id)` instead of right after `createTask` resolves — this is intentional so the modal's pending state stays visible for the whole "create, then open" chain.

Replace `handleCloneRepo` with:

```tsx
  async function handleCloneRepo(fields: { url: string; name: string }): Promise<void> {
    setErrorMessage(undefined);
    setIsSubmittingModal(true);
    try {
      const repo = await window.claudeOrchestrator.cloneRepo(fields.url, fields.name);
      setRepos((current) => [...current, repo]);
      setIsCloneModalOpen(false);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    } finally {
      setIsSubmittingModal(false);
    }
  }
```

- [ ] **Step 6: Implement — pass isSubmitting to both modals**

Update the `NewTaskModal` and `CloneRepoModal` JSX usages:

```tsx
      <NewTaskModal
        isOpen={newTaskRepoId !== undefined}
        branches={branches}
        isSubmitting={isSubmittingModal}
        onClose={() => setNewTaskRepoId(undefined)}
        onSubmit={(fields) => void handleCreateTask(fields)}
      />
      <CloneRepoModal
        isOpen={isCloneModalOpen}
        isSubmitting={isSubmittingModal}
        onClose={() => setIsCloneModalOpen(false)}
        onSubmit={(fields) => void handleCloneRepo(fields)}
      />
```

- [ ] **Step 7: Implement — add the loading overlay to the terminal pane**

Replace the terminal-area block (the `<div className="flex flex-1 overflow-hidden">...</div>` that contains the `openTaskIds.length > 0 ? (...) : (...)` ternary) with:

```tsx
        <div className="flex flex-1 overflow-hidden">
          {openTaskIds.length > 0 || loadingTaskId !== undefined ? (
            <>
              <div className="relative flex-1 overflow-hidden">
                {loadingTaskId !== undefined && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-graphite-900/80 text-sm text-graphite-100">
                    <Spinner />
                    <span>Starting session…</span>
                  </div>
                )}
                {openTaskIds.map((id) => (
                  <div key={id} className={id === activeTaskId ? 'h-full w-full' : 'hidden'}>
                    <TerminalTab taskId={id} />
                  </div>
                ))}
              </div>
              {activeTaskId !== undefined && (
                <div className="w-80 shrink-0 overflow-y-auto border-l border-graphite-700 bg-graphite-800">
                  <TaskNotesPanel
                    key={activeTaskId}
                    body={notesByTaskId[activeTaskId]?.body ?? ''}
                    status={notesByTaskId[activeTaskId]?.status ?? 'todo'}
                    onSave={async (newBody) => {
                      await window.claudeOrchestrator.setTaskNotes({ taskId: activeTaskId, body: newBody });
                      setNotesByTaskId((current) => ({
                        ...current,
                        [activeTaskId]: { body: newBody, status: current[activeTaskId]?.status ?? 'todo' },
                      }));
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-graphite-400">
              Select or create a task to get started.
            </div>
          )}
        </div>
```

The condition changed from `openTaskIds.length > 0` to `openTaskIds.length > 0 || loadingTaskId !== undefined` — this matters for opening the very first task ever: at that moment `openTaskIds` is still empty (the id isn't pushed until `openTask` resolves), so without this change the loading overlay would never get a chance to render for a first-ever task open.

- [ ] **Step 8: Run tests to verify all pass**

Run: `npm run test:renderer -- app.test`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 9: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests pass (main + renderer)

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 10: Update the manual smoke-test runbook**

Add a new step to `docs/runbooks/manual-smoke-test.md` (append after the last existing numbered step, incrementing the number):

```
15. Click "New Task", fill in a title, click "Create Task" — confirm the button shows "Creating…" and is disabled, and the modal doesn't close until the new task's terminal appears. Click on an already-existing task in the sidebar — confirm a brief "Starting session…" overlay appears over the terminal pane before it becomes interactive.
```

- [ ] **Step 11: Commit**

```bash
git add src/renderer/app.tsx src/renderer/app.test.tsx docs/runbooks/manual-smoke-test.md
git commit -m "feat: show loading indicators while creating tasks, cloning repos, and opening terminals"
```
