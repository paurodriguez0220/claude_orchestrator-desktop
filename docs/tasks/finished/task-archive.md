# Task: Archive tasks marked done

**Status:** Done

## Goal

Reduce sidebar clutter by moving a task out of the active list the moment it's marked `'done'`, into a collapsed per-repo "Archived" section, without touching anything else about how the task behaves.

## Context

`TaskRecord`/`TaskNotesFrontmatter` already carry `status: 'todo' | 'in-progress' | 'blocked' | 'done'` (`src/shared/types.ts`), set today via a dropdown in `TaskNotesPanel`. As the sidebar accumulates tasks across repos (compounded by the incoming task-search-bar and Quick Questions features, which also add sidebar sections), tasks that are actually finished stay visually mixed in with active ones with no way to tuck them away.

## Proposed Design

### Trigger

Fully automatic, riding on the existing `status` field — no new UI action to archive/unarchive. The moment a task's `status` is `'done'`, it's archived. Setting it back to any other status un-archives it immediately. This is a pure view-level split of `tasksByRepoId`'s existing per-repo task list into active vs. done — no new field, no migration.

### Location

Each repo section in `RepoSidebar` gains a second, collapsed-by-default sub-list below its active tasks: "Archived (`N`)" as a toggle button; expanding it reveals the repo's `status: 'done'` tasks in the same row style as active tasks. No persistence of the expanded/collapsed state across app restarts (YAGNI for v1) — every section starts collapsed each launch.

### Behavior once archived

Archived rows keep every capability an active row has: clicking still calls `onSelectTask` (opens/selects its tab exactly as today), "Remove" still calls `onRemoveTaskClick`. Only the row's position/visibility changes — nothing about task removal, tab behavior, or notes changes.

### Open tabs

Unaffected. Marking the currently-open task `'done'` does not close its tab or change `openTaskIds`/`activeTaskId` — archiving is a sidebar-list concern only, orthogonal to which tabs are open.

## Non-Goals

- No new "Archive" button/action — status changes are the only trigger.
- No archiving of `'todo'`/`'in-progress'`/`'blocked'` tasks regardless of age — only `'done'` matters for v1.
- No cross-repo global archive view (mirrors the per-repo decision already made for this feature; a global rollup is not part of this design).
- No persisted collapse/expand state across restarts.
- No auto-closing or auto-removing of a task's tab/worktree when archived — archiving never deletes anything, it only changes where a task is listed.

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `status: 'done'` tasks out of each repo's active task list into a collapsed, per-repo "Archived (N)" sub-section, with zero change to click/remove/tab behavior.

**Architecture:** `RepoSidebar` takes two per-repo task maps instead of one (`activeTasksByRepoId`, `archivedTasksByRepoId`) and renders a collapsed-by-default toggle + sub-list for archived tasks, using the same row markup as active tasks, tracked via local component state (`expandedRepoIds`). `App` computes both maps from its existing `tasks` array — a second view-level split by `status`, replacing the current single `tasksByRepoId` reduce — and passes them down. No new state field on `TaskRecord`, no IPC change, no persistence.

**Tech Stack:** Same as the rest of the project — TypeScript strict, React 18, Tailwind CSS tokens, Vitest + React Testing Library.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one component per file, `JSX.Element` return types.
- Styling uses Tailwind CSS v4 tokens (`graphite-*`, `clay-*`) — no arbitrary hex values.
- No persistence of expand/collapse state — every repo's Archived section starts collapsed on every mount (component-local `useState`, not derived from any persisted source).
- Archived task rows must expose the exact same interactive surface as active rows (`onSelectTask`, `onRemoveTaskClick`, the `'review'` kind badge) — no reduced functionality, no separate code path for behavior.
- `App`'s `openTaskIds`/`activeTaskId` state and tab-open/close logic are untouched by this feature — archiving is purely a sidebar-list concern, orthogonal to which tabs are open.

---

### Task 1: RepoSidebar renders a collapsed "Archived (N)" sub-section per repo

**Files:**
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.tsx`
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx`
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.stories.tsx`

**Interfaces:**
- Produces: `RepoSidebarProps` drops `tasksByRepoId` and gains two required fields: `activeTasksByRepoId: Record<string, TaskRecord[]>` and `archivedTasksByRepoId: Record<string, TaskRecord[]>`. Every other prop is unchanged.

- [ ] **Step 1: Update existing tests to the new prop shape**

In `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx`, replace every `tasksByRepoId={{ 'repo-1': [task] }}` with `activeTasksByRepoId={{ 'repo-1': [task] }}\n        archivedTasksByRepoId={{}}`, and every `tasksByRepoId={{}}` with `activeTasksByRepoId={{}}\n        archivedTasksByRepoId={{}}`, across all 7 existing `it(...)` blocks. For example, the first test becomes:

```tsx
it('renders each repo and its tasks', () => {
  render(
    <RepoSidebar
      repos={[repo]}
      activeTasksByRepoId={{ 'repo-1': [task] }}
      archivedTasksByRepoId={{}}
      selectedTaskId={undefined}
      onSelectTask={vi.fn()}
      onOpenRepoClick={vi.fn()}
      onCloneRepoClick={vi.fn()}
      onNewTaskClick={vi.fn()}
      onRemoveTaskClick={vi.fn()}
      onReviewCodeClick={vi.fn()}
    />,
  );
  expect(screen.getByText('demo')).toBeInTheDocument();
  expect(screen.getByText('Fix login bug')).toBeInTheDocument();
});
```

Apply the same mechanical prop-rename to the other 6 tests ('calls onSelectTask when a task is clicked', 'calls onOpenRepoClick...', 'calls onCloneRepoClick...', 'calls onRemoveTaskClick...', 'calls onReviewCodeClick...', 'shows a "Review" badge...'), keeping every other prop, assertion, and task fixture unchanged.

- [ ] **Step 2: Add a `doneTask` fixture and write the new failing tests**

Add this fixture right after the existing `task` fixture in the same file:

```tsx
const doneTask: TaskRecord = { ...task, id: 'task-3', title: 'Ship release notes', status: 'done' };
```

Append these five tests inside the existing `describe('RepoSidebar', ...)` block:

```tsx
  it('does not render an "Archived" toggle when a repo has no archived tasks', () => {
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{}}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Archived/ })).not.toBeInTheDocument();
  });

  it('renders a collapsed "Archived (N)" toggle and hides archived tasks by default', () => {
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{ 'repo-1': [doneTask] }}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Archived (1)' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Ship release notes' })).not.toBeInTheDocument();
  });

  it('expands the archived list and shows the archived task when the toggle is clicked', async () => {
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{ 'repo-1': [doneTask] }}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Archived (1)' }));
    expect(screen.getByRole('button', { name: 'Ship release notes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archived (1)' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('calls onSelectTask with the archived task id when it is clicked after expanding', async () => {
    const onSelectTask = vi.fn();
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{ 'repo-1': [doneTask] }}
        selectedTaskId={undefined}
        onSelectTask={onSelectTask}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Archived (1)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ship release notes' }));
    expect(onSelectTask).toHaveBeenCalledWith('task-3');
  });

  it('calls onRemoveTaskClick with the archived task id when Remove is clicked after expanding', async () => {
    const onRemoveTaskClick = vi.fn();
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{ 'repo-1': [doneTask] }}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={onRemoveTaskClick}
        onReviewCodeClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Archived (1)' }));
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    const archivedRemoveButton = removeButtons[removeButtons.length - 1];
    if (!archivedRemoveButton) {
      throw new Error('Expected an archived task Remove button to be rendered');
    }
    await userEvent.click(archivedRemoveButton);
    expect(onRemoveTaskClick).toHaveBeenCalledWith('task-3');
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:renderer -- repo-sidebar`
Expected: FAIL — the component still destructures a `tasksByRepoId` prop that none of the updated tests pass, so `(tasksByRepoId[repo.id] ?? [])` throws on every test (`tasksByRepoId` is `undefined`), and there is no "Archived" toggle at all yet.

- [ ] **Step 4: Implement**

Replace the full contents of `src/renderer/components/repo-sidebar/repo-sidebar.tsx`:

```tsx
import { useState } from 'react';
import type { RepoRecord, TaskRecord } from '../../../shared/types';

export interface RepoSidebarProps {
  repos: RepoRecord[];
  activeTasksByRepoId: Record<string, TaskRecord[]>;
  archivedTasksByRepoId: Record<string, TaskRecord[]>;
  selectedTaskId: string | undefined;
  onSelectTask: (taskId: string) => void;
  onOpenRepoClick: () => void;
  onCloneRepoClick: () => void;
  onNewTaskClick: (repoId: string) => void;
  onRemoveTaskClick: (taskId: string) => void;
  onReviewCodeClick: (repoId: string) => void;
}

interface TaskRowProps {
  task: TaskRecord;
  selectedTaskId: string | undefined;
  onSelectTask: (taskId: string) => void;
  onRemoveTaskClick: (taskId: string) => void;
}

function TaskRow({ task, selectedTaskId, onSelectTask, onRemoveTaskClick }: TaskRowProps): JSX.Element {
  return (
    <li className="flex items-center justify-between gap-2">
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
  );
}

export function RepoSidebar({
  repos,
  activeTasksByRepoId,
  archivedTasksByRepoId,
  selectedTaskId,
  onSelectTask,
  onOpenRepoClick,
  onCloneRepoClick,
  onNewTaskClick,
  onRemoveTaskClick,
  onReviewCodeClick,
}: RepoSidebarProps): JSX.Element {
  const [expandedRepoIds, setExpandedRepoIds] = useState<Set<string>>(new Set());

  function toggleArchived(repoId: string): void {
    setExpandedRepoIds((current) => {
      const next = new Set(current);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else {
        next.add(repoId);
      }
      return next;
    });
  }

  return (
    <nav
      aria-label="Repositories"
      className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-graphite-700 bg-graphite-800 p-4"
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onOpenRepoClick}
          className="flex-1 rounded-md border border-graphite-600 px-3 py-2 text-sm font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400"
        >
          Open Existing Repo
        </button>
        <button
          type="button"
          onClick={onCloneRepoClick}
          className="flex-1 rounded-md border border-graphite-600 px-3 py-2 text-sm font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400"
        >
          Clone Repo
        </button>
      </div>
      <ul className="flex flex-col gap-3">
        {repos.map((repo) => {
          const archivedTasks = archivedTasksByRepoId[repo.id] ?? [];
          const isExpanded = expandedRepoIds.has(repo.id);
          return (
            <li key={repo.id} className="flex flex-col gap-1">
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
              <ul className="flex flex-col gap-1 pl-2">
                {(activeTasksByRepoId[repo.id] ?? []).map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={onSelectTask}
                    onRemoveTaskClick={onRemoveTaskClick}
                  />
                ))}
              </ul>
              {archivedTasks.length > 0 && (
                <div className="pl-2">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleArchived(repo.id)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-graphite-400 hover:text-graphite-100"
                  >
                    <span aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
                    {`Archived (${archivedTasks.length})`}
                  </button>
                  {isExpanded && (
                    <ul className="flex flex-col gap-1 pl-2">
                      {archivedTasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          selectedTaskId={selectedTaskId}
                          onSelectTask={onSelectTask}
                          onRemoveTaskClick={onRemoveTaskClick}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm run test:renderer -- repo-sidebar`
Expected: PASS (12 tests)

- [ ] **Step 6: Update the Storybook stories**

Replace the full contents of `src/renderer/components/repo-sidebar/repo-sidebar.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { RepoSidebar } from './repo-sidebar';

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
  },
};

export default meta;
type Story = StoryObj<typeof RepoSidebar>;

export const Empty: Story = {
  args: { repos: [], activeTasksByRepoId: {}, archivedTasksByRepoId: {}, selectedTaskId: undefined },
};

export const WithRepoAndTasks: Story = {
  args: {
    repos: [{ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' }],
    activeTasksByRepoId: {
      'repo-1': [
        {
          id: 'task-1',
          repoId: 'repo-1',
          title: 'Fix login bug',
          branch: 'task/fix-login-bug',
          worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
          status: 'todo',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
    },
    archivedTasksByRepoId: {},
    selectedTaskId: 'task-1',
  },
};

export const WithArchivedTasks: Story = {
  args: {
    repos: [{ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' }],
    activeTasksByRepoId: {
      'repo-1': [
        {
          id: 'task-1',
          repoId: 'repo-1',
          title: 'Fix login bug',
          branch: 'task/fix-login-bug',
          worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
          status: 'todo',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
    },
    archivedTasksByRepoId: {
      'repo-1': [
        {
          id: 'task-2',
          repoId: 'repo-1',
          title: 'Ship release notes',
          branch: 'task/ship-release-notes',
          worktreePath: 'C:\\demo-worktrees\\ship-release-notes',
          status: 'done',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
    },
    selectedTaskId: 'task-1',
  },
};
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/repo-sidebar
git commit -m "feat: collapse done tasks into an Archived sub-section in RepoSidebar"
```

---

### Task 2: Wire active/archived task grouping into App

**Files:**
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/app.test.tsx`

**Interfaces:**
- Consumes: `RepoSidebar`'s `activeTasksByRepoId`/`archivedTasksByRepoId` props from Task 1.
- Produces: no new exports — this task only changes `App`'s internal grouping logic and what it passes to `RepoSidebar`.

This task depends on Task 1 being complete first (it passes `activeTasksByRepoId`/`archivedTasksByRepoId` to `RepoSidebar`, which only exist as props once Task 1 lands).

- [ ] **Step 1: Write the failing tests**

Add this fixture in `src/renderer/app.test.tsx`, right after the existing `task2` fixture:

```tsx
const doneTask: TaskRecord = { ...task2, id: 'task-3', title: 'Ship release notes', status: 'done' };
```

Append these two tests inside the existing `describe('App', ...)` block:

```tsx
  it('keeps a done task out of the active list and lists it under a collapsed Archived toggle', async () => {
    listTasks.mockResolvedValueOnce([task, doneTask]);
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Fix login bug' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ship release notes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archived (1)' })).toBeInTheDocument();
  });

  it('selecting an archived task after expanding the Archived section still opens its tab', async () => {
    listTasks.mockResolvedValueOnce([task, doneTask]);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Archived (1)' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ship release notes' }));
    expect(openTask).toHaveBeenCalledWith('task-3');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:renderer -- app`
Expected: FAIL — every test in the file errors, not just the two new ones. `App` still passes only the old `tasksByRepoId` prop to `RepoSidebar`, which no longer reads it; `RepoSidebar` now destructures `activeTasksByRepoId`/`archivedTasksByRepoId`, both `undefined` here, so `activeTasksByRepoId[repo.id]` throws a `TypeError` on first render.

- [ ] **Step 3: Implement**

In `src/renderer/app.tsx`, replace the single `tasksByRepoId` reduce:

```tsx
  const tasksByRepoId = tasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
    (acc[task.repoId] ??= []).push(task);
    return acc;
  }, {});
```

with two reduces split by `status`:

```tsx
  const activeTasksByRepoId = tasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
    if (task.status !== 'done') {
      (acc[task.repoId] ??= []).push(task);
    }
    return acc;
  }, {});

  const archivedTasksByRepoId = tasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
    if (task.status === 'done') {
      (acc[task.repoId] ??= []).push(task);
    }
    return acc;
  }, {});
```

Then update the `RepoSidebar` element:

```tsx
        <RepoSidebar
          repos={repos}
          activeTasksByRepoId={activeTasksByRepoId}
          archivedTasksByRepoId={archivedTasksByRepoId}
          selectedTaskId={activeTaskId}
          onSelectTask={(taskId) => void handleSelectTask(taskId)}
          onOpenRepoClick={() => void handleOpenRepoClick()}
          onCloneRepoClick={() => setIsCloneModalOpen(true)}
          onNewTaskClick={(repoId) => void handleNewTaskClick(repoId)}
          onRemoveTaskClick={(taskId) => void handleRemoveTask(taskId)}
          onReviewCodeClick={(repoId) => void handleReviewCodeClick(repoId)}
        />
```

Everything else in the file (state, handlers, `TabBar`/`TerminalTab`/`TaskNotesPanel` rendering) stays exactly as-is.

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm run test:renderer -- app`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app.tsx src/renderer/app.test.tsx
git commit -m "feat: split App's task grouping into active and archived per repo"
```

---
*Added: 2026-07-09*
*Standards: https://github.com/paurodriguez0220/standards-docs*
