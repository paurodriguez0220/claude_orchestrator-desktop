# Task: Multi-tab persistent terminals

**Status:** Defined

## Goal

Let multiple tasks' terminals stay open and switchable via tabs, without losing scrollback when switching away and back.

## Context

The backend already keeps a task's `claude`/`cmd.exe` process running in the background when you switch to a different task — nothing kills it. The gap is entirely in the renderer: `App` renders exactly one `TerminalTab` for `selectedTaskId`, so switching tasks unmounts the previous `TerminalTab` (disposing its xterm.js instance) and mounts a brand-new one for the next task. The underlying PTY process and its conversation are still alive, but the visible terminal starts blank — all prior scrollback is gone until new output arrives.

## Proposed Design

### State model

`App` replaces its single `selectedTaskId: string | undefined` with:
- `openTaskIds: string[]` — the list of tasks currently open as tabs, in open order.
- `activeTaskId: string | undefined` — which open tab is currently visible.

Clicking a task in the sidebar:
- If it's already in `openTaskIds`, just sets it as `activeTaskId` (switch to existing tab).
- If not, appends it to `openTaskIds` and sets it as `activeTaskId` (open a new tab), calling `openTask`/`getTaskNotes` exactly as today.

### Persistent terminal instances

Instead of conditionally rendering one `TerminalTab` for `activeTaskId`, `App` renders one `TerminalTab` **per entry in `openTaskIds`**, all mounted simultaneously. Each is wrapped in a container styled `hidden` unless its `taskId === activeTaskId`. Because a `TerminalTab` is never unmounted while its tab stays open, its xterm.js instance, PTY output subscription, and full scrollback persist exactly as-is when switching tabs — only visibility changes.

### Tab bar

A new row above the terminal area, rendered only when `openTaskIds.length > 0`: one pill per open task (its title), a close (×) button on each, and a highlighted state for the active tab. Clicking a tab sets it active; clicking × closes it.

### Closing a tab

Calls the existing `window.claudeOrchestrator.closeTask(taskId)` (kills the PTY session, matching today's behavior), removes the id from `openTaskIds`, and unmounts that `TerminalTab` (freeing its xterm instance). The task itself is untouched in the sidebar/store — reopening it later goes through the normal `openTask` flow (`claude --continue`, with the already-fixed no-conversation-fallback). If the closed tab was the active one, the last remaining entry in `openTaskIds` becomes active (or `undefined`/no active tab if none remain).

### Notes panel

Tied to whichever task is `activeTaskId`, fetched/saved the same way as today — with one targeted fix. `TaskNotesPanel` seeds its internal `draft` state via `useState(body)`, which only runs once at mount; it never resets when the `body` prop changes later. In the old single-selection model this was masked because switching tasks rarely kept the same `TaskNotesPanel` instance mounted across a prop-only change in a way that got exercised. Multi-tab switching makes this a real, easily-hit bug (switching from Task A to Task B would keep showing Task A's notes text). Fix: render `<TaskNotesPanel key={activeTaskId} .../>` so React remounts it (correctly reseeding `draft`) whenever the active tab changes — no changes needed to `TaskNotesPanel` itself.

### Non-goals

- No limit on the number of concurrently open tabs (YAGNI for a single-user tool).
- No tab reordering/drag-and-drop.
- No change to `TerminalTab`'s internal xterm/PTY logic — this is purely about *how many* instances exist and *which one is visible*, not how any single one works.

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multiple tasks can be open as tabs simultaneously, each with a persistent terminal (no lost scrollback on switch), with a tab bar to switch/close them.

**Architecture:** A new presentational `TabBar` component renders the open-tab strip. `App` replaces its single-`selectedTaskId` state with `openTaskIds`/`activeTaskId`, renders one `TerminalTab` per open id (hidden via CSS unless active), and keys `TaskNotesPanel` by `activeTaskId` to fix a stale-draft bug that multi-tab switching would otherwise expose constantly.

**Tech Stack:** Same as the rest of the project — TypeScript strict, React 18, Tailwind CSS tokens from the UI design pass, Vitest + React Testing Library.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one component per file, `JSX.Element` return types.
- Every color/spacing class must be an existing Tailwind design token (`graphite-*`/`clay-*`/`danger-*`) or a plain layout utility — no arbitrary hex values, no default-Tailwind-palette colors.
- Commit messages follow Conventional Commits (`<type>: <description>`).

---

### Task 1: TabBar component

**Files:**
- Create: `src/renderer/components/tab-bar/tab-bar.tsx`
- Create: `src/renderer/components/tab-bar/tab-bar.test.tsx`
- Create: `src/renderer/components/tab-bar/tab-bar.stories.tsx`

**Interfaces:**
- Produces: `TabBarTab { taskId: string; title: string }`, `TabBarProps { tabs: TabBarTab[]; activeTaskId: string | undefined; onSelectTab: (taskId: string) => void; onCloseTab: (taskId: string) => void }` / `TabBar`. Task 2 (`App`) consumes both.

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/components/tab-bar/tab-bar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabBar } from './tab-bar';

describe('TabBar', () => {
  it('renders a button per open task, marking the active one pressed', () => {
    render(
      <TabBar
        tabs={[
          { taskId: 'task-1', title: 'Fix login bug' },
          { taskId: 'task-2', title: 'Add tests' },
        ]}
        activeTaskId="task-2"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Fix login bug' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Add tests' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onSelectTab when a tab is clicked', async () => {
    const onSelectTab = vi.fn();
    render(
      <TabBar
        tabs={[{ taskId: 'task-1', title: 'Fix login bug' }]}
        activeTaskId={undefined}
        onSelectTab={onSelectTab}
        onCloseTab={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fix login bug' }));
    expect(onSelectTab).toHaveBeenCalledWith('task-1');
  });

  it('calls onCloseTab with the task id when close is clicked', async () => {
    const onCloseTab = vi.fn();
    render(
      <TabBar
        tabs={[{ taskId: 'task-1', title: 'Fix login bug' }]}
        activeTaskId="task-1"
        onSelectTab={vi.fn()}
        onCloseTab={onCloseTab}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close Fix login bug' }));
    expect(onCloseTab).toHaveBeenCalledWith('task-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:renderer -- tab-bar`
Expected: FAIL — `Cannot find module './tab-bar'`

- [ ] **Step 3: Implement TabBar**

Create `src/renderer/components/tab-bar/tab-bar.tsx`:

```tsx
export interface TabBarTab {
  taskId: string;
  title: string;
}

export interface TabBarProps {
  tabs: TabBarTab[];
  activeTaskId: string | undefined;
  onSelectTab: (taskId: string) => void;
  onCloseTab: (taskId: string) => void;
}

export function TabBar({ tabs, activeTaskId, onSelectTab, onCloseTab }: TabBarProps): JSX.Element {
  return (
    <div className="flex shrink-0 gap-1 border-b border-graphite-700 bg-graphite-800 px-2 pt-2">
      {tabs.map((tab) => (
        <div key={tab.taskId} className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={tab.taskId === activeTaskId}
            onClick={() => onSelectTab(tab.taskId)}
            className={
              tab.taskId === activeTaskId
                ? 'max-w-40 truncate rounded-t-md bg-graphite-900 px-3 py-2 text-sm font-medium text-clay-400'
                : 'max-w-40 truncate rounded-t-md px-3 py-2 text-sm text-graphite-400 hover:text-graphite-100'
            }
          >
            {tab.title}
          </button>
          <button
            type="button"
            onClick={() => onCloseTab(tab.taskId)}
            aria-label={`Close ${tab.title}`}
            className="rounded px-1 text-xs text-graphite-400 hover:bg-graphite-700 hover:text-graphite-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:renderer -- tab-bar`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the Storybook story**

Create `src/renderer/components/tab-bar/tab-bar.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { TabBar } from './tab-bar';

const meta: Meta<typeof TabBar> = {
  component: TabBar,
  title: 'Components/TabBar',
  args: { onSelectTab: fn(), onCloseTab: fn() },
};

export default meta;
type Story = StoryObj<typeof TabBar>;

export const SingleTab: Story = {
  args: { tabs: [{ taskId: 'task-1', title: 'Fix login bug' }], activeTaskId: 'task-1' },
};

export const MultipleTabs: Story = {
  args: {
    tabs: [
      { taskId: 'task-1', title: 'Fix login bug' },
      { taskId: 'task-2', title: 'Add tests' },
    ],
    activeTaskId: 'task-2',
  },
};
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/tab-bar
git commit -m "feat: add tab bar component for switching between open tasks"
```

---

### Task 2: App wiring — multi-tab state, persistent terminals, notes-panel fix

**Files:**
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/app.test.tsx`

**Interfaces:**
- Consumes: `TabBar`, `TabBarTab` (Task 1); existing `window.claudeOrchestrator.openTask`/`closeTask`/`getTaskNotes` (unchanged signatures).
- Produces: no new exports — this is the final integration point.

- [ ] **Step 1: Add a second task fixture and a shared closeTask mock in the test file**

Modify `src/renderer/app.test.tsx` — add a second task fixture (after the existing `task` const) and promote `closeTask` to a shared top-level mock so tests can assert on it:

```ts
const task2: TaskRecord = {
  id: 'task-2',
  repoId: 'repo-1',
  title: 'Add tests',
  branch: 'task/add-tests',
  worktreePath: 'C:\\demo-worktrees\\add-tests',
  status: 'todo',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
};
```

Update `listTasks` to return both tasks:

```ts
const listTasks = vi.fn(async () => [task, task2]);
```

Add a shared `closeTask` mock alongside the other shared mocks (near `const removeTask = ...`):

```ts
const closeTask = vi.fn(async () => undefined);
```

Update the `beforeEach`'s `vi.stubGlobal('claudeOrchestrator', { ... })` object to use the shared `closeTask` instead of an inline `vi.fn()`:

```ts
  vi.stubGlobal('claudeOrchestrator', {
    listRepos,
    listTasks,
    createTask,
    openTask,
    closeTask,
    removeTask,
    selectFolder,
    addRepo,
    cloneRepo,
    listBranches,
    getTaskNotes,
    setTaskNotes,
    sendPtyInput: vi.fn(),
    resizePty: vi.fn(),
    onPtyOutput: vi.fn(() => vi.fn()),
  });
```

- [ ] **Step 2: Write the failing tests for multi-tab behavior**

Add to `src/renderer/app.test.tsx` (inside the existing `describe('App', ...)` block):

```ts
  it('opening a second task adds a new tab without closing the first tab\'s terminal', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add tests' }));
    expect(openTask).toHaveBeenCalledWith('task-1');
    expect(openTask).toHaveBeenCalledWith('task-2');
    expect(screen.getByRole('button', { name: 'Close Fix login bug' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Add tests' })).toBeInTheDocument();
  });

  it('clicking an already-open task switches tabs without reopening the pty session', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add tests' }));
    openTask.mockClear();
    const fixLoginBugButtons = screen.getAllByRole('button', { name: 'Fix login bug' });
    const sidebarButton = fixLoginBugButtons[0];
    if (!sidebarButton) {
      throw new Error('Expected a "Fix login bug" button to be rendered');
    }
    await userEvent.click(sidebarButton);
    expect(openTask).not.toHaveBeenCalled();
  });

  it('closing a tab calls closeTask and removes it, without affecting the sidebar', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add tests' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close Add tests' }));
    expect(closeTask).toHaveBeenCalledWith('task-2');
    expect(screen.queryByRole('button', { name: 'Close Add tests' })).not.toBeInTheDocument();
    expect(screen.getByText('Add tests')).toBeInTheDocument();
  });

  it('shows the correct notes for each tab when switching, not a stale draft from the other tab', async () => {
    // mockImplementationOnce (not mockImplementation) so the override only
    // applies to these two calls and doesn't leak into later tests — plain
    // vi.clearAllMocks() in beforeEach clears call history but does not
    // reset a standing mockImplementation override.
    getTaskNotes
      .mockImplementationOnce(async () => ({ body: 'notes for task 1', status: 'todo' as const }))
      .mockImplementationOnce(async () => ({ body: 'notes for task 2', status: 'todo' as const }));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));
    expect(await screen.findByDisplayValue('notes for task 1')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Add tests' }));
    expect(await screen.findByDisplayValue('notes for task 2')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('notes for task 1')).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:renderer -- app`
Expected: FAIL — no tab bar exists yet, `App` still only tracks a single `selectedTaskId`

- [ ] **Step 4: Implement the multi-tab state and rendering**

Modify `src/renderer/app.tsx`. Add the `TabBar` import (alongside the other component imports):

```ts
import { TabBar } from './components/tab-bar/tab-bar';
```

Replace the `selectedTaskId` state declaration and add the new tab state (in place of `const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();`):

```ts
  const [openTaskIds, setOpenTaskIds] = useState<string[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>();
```

Replace `handleSelectTask`:

```ts
  async function handleSelectTask(taskId: string): Promise<void> {
    setErrorMessage(undefined);
    try {
      if (!openTaskIds.includes(taskId)) {
        await window.claudeOrchestrator.openTask(taskId);
        setOpenTaskIds((current) => [...current, taskId]);
      }
      const notes = await window.claudeOrchestrator.getTaskNotes(taskId);
      setNotesBody(notes.body);
      setNotesStatus(notes.status);
      setActiveTaskId(taskId);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }
```

Add a new `handleCloseTab` function (near `handleSelectTask`):

```ts
  async function handleCloseTab(taskId: string): Promise<void> {
    setErrorMessage(undefined);
    try {
      await window.claudeOrchestrator.closeTask(taskId);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
    const remaining = openTaskIds.filter((id) => id !== taskId);
    setOpenTaskIds(remaining);
    if (activeTaskId === taskId) {
      const fallback = remaining[remaining.length - 1];
      if (fallback !== undefined) {
        await handleSelectTask(fallback);
      } else {
        setActiveTaskId(undefined);
        setNotesBody('');
        setNotesStatus('todo');
      }
    }
  }
```

Update every remaining reference to `selectedTaskId` to `activeTaskId`, and every reference to `setSelectedTaskId(undefined)` (in `handleRemoveTask`) to also clear it from `openTaskIds`. Replace `handleRemoveTask`'s body:

```ts
  async function handleRemoveTask(taskId: string): Promise<void> {
    if (!window.confirm('Remove this task? This deletes its git worktree.')) {
      return;
    }
    setErrorMessage(undefined);
    try {
      await window.claudeOrchestrator.removeTask(taskId);
      setTasks((current) => current.filter((task) => task.id !== taskId));
      setOpenTaskIds((current) => current.filter((id) => id !== taskId));
      if (taskId === activeTaskId) {
        setActiveTaskId(undefined);
        setNotesBody('');
        setNotesStatus('todo');
      }
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }
```

Replace the `<RepoSidebar>` element's `selectedTaskId` prop with `activeTaskId`:

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
      />
```

Replace the `<main>` block (everything from `<main className="flex flex-1 overflow-hidden">` to its closing `</main>`):

```tsx
      <main className="flex flex-1 flex-col overflow-hidden">
        {openTaskIds.length > 0 && (
          <TabBar
            tabs={openTaskIds.map((id) => ({
              taskId: id,
              title: tasks.find((task) => task.id === id)?.title ?? '',
            }))}
            activeTaskId={activeTaskId}
            onSelectTab={(taskId) => void handleSelectTask(taskId)}
            onCloseTab={(taskId) => void handleCloseTab(taskId)}
          />
        )}
        <div className="flex flex-1 overflow-hidden">
          {openTaskIds.length > 0 ? (
            <>
              <div className="relative flex-1 overflow-hidden">
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
                    body={notesBody}
                    status={notesStatus}
                    onSave={(newBody) =>
                      window.claudeOrchestrator.setTaskNotes({ taskId: activeTaskId, body: newBody })
                    }
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
      </main>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:renderer -- app`
Expected: PASS (all pre-existing App tests plus the 4 new ones)

- [ ] **Step 6: Run the full test suite, typecheck, and build**

Run: `npm test`
Expected: PASS — every test across the whole app, no regressions

Run: `npm run typecheck`
Expected: clean

Run: `npm run build`
Expected: succeeds

- [ ] **Step 7: Update the manual smoke-test checklist**

Add to `docs/runbooks/manual-smoke-test.md`, as the next sequential step:

```markdown
14. Open two different tasks. Confirm both appear as tabs above the terminal, and switching between them preserves each terminal's visible scrollback (type something distinctive in one, switch to the other, switch back — the first tab's text should still be there). Close one tab's × — confirm it disappears from the tab bar but the task still appears in the sidebar, and reopening it resumes via `claude --continue`.
```

- [ ] **Step 8: Commit**

```bash
git add src/renderer/app.tsx src/renderer/app.test.tsx docs/runbooks/manual-smoke-test.md
git commit -m "feat: support multiple open task tabs with persistent terminals"
```

## Acceptance Criteria

- [ ] Opening a task from the sidebar adds a tab; clicking an already-open task's sidebar entry switches to its existing tab instead of duplicating it
- [ ] Switching between tabs preserves each terminal's visible scrollback (no blank/reset terminal on switch)
- [ ] Closing a tab (×) kills that task's PTY session and removes the tab, without affecting the task's presence in the sidebar
- [ ] Reopening a task after its tab was closed resumes via `claude --continue` as today
- [ ] Notes panel always reflects the currently active tab's task
- [ ] Every existing test continues to pass, updated only where `App`'s single-selection behavior is directly being replaced by multi-tab behavior

---
*Maintained by paurodriguez0220 · Last updated: 2026-07-08*
*Standards: https://github.com/paurodriguez0220/standards-docs*
