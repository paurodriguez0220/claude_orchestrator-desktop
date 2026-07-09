# Task: Task search bar

**Status:** Defined

## Goal

Let you find a task by typing a keyword related to it — its title, notes content, branch name, or ADO ticket id — instead of scanning the sidebar by eye.

## Context

The sidebar lists every task nested under its repo, with no way to filter or search. As the number of managed repos/tasks grows, finding "that task about the health check endpoint" means visually scanning every repo's task list. Task notes bodies (the free-text content in the right-pane panel) only exist as `.md` files on disk — the renderer never holds all of them in memory (only the currently-open tabs' notes are cached, per the multi-tab feature) — so a body search has to happen in the main process.

## Proposed Design

### Search scope

A match against any of: task title, notes body (the `.md` file's content after frontmatter), branch name, or ADO ticket id. Case-insensitive substring match — no fuzzy matching, no ranking, matching the simple conventions used everywhere else in this app.

### Search execution

A new `TaskSearch` IPC channel takes a query string and returns the list of matching task ids. The handler reads the store for title/branch/adoId matching (already in memory) and reads each task's notes file via the existing `readTaskNotes`/`notes-service.ts` for body matching, combining both into one result set — no new file format or duplicate storage of notes content.

### UI

A search input at the top of the sidebar, above the repo list. As you type, the input is debounced (~250ms after the last keystroke) before calling `TaskSearch`, to avoid firing on every keystroke. While a query is active, each repo's task list is filtered down to just the matching ids (via the returned array of task ids intersected with `tasksByRepoId`); a repo with zero matches under an active query doesn't render at all. Clearing the search box (empty string) restores the full, unfiltered view instantly, without a `TaskSearch` round-trip.

## Non-Goals

- No search-result snippets/highlighting of the matched text.
- No fuzzy matching or relevance ranking — plain substring match only.
- No keyboard shortcut to focus the search box (e.g. `Ctrl+K`) for v1.
- No caching of search results across queries — every non-empty query triggers a fresh `TaskSearch` call.

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing in a sidebar search box filters the visible tasks to ones matching the query in title, notes body, branch, or ADO id.

**Architecture:** A new `TaskSearch` IPC channel and its main-process handler combine an in-memory store scan (title/branch/adoId) with per-task notes-file reads (body) to return matching task ids. `App` debounces the search input and intersects the result with its existing `tasksByRepoId` grouping before passing it to `RepoSidebar`.

**Tech Stack:** Same as the rest of the project — TypeScript strict, React 18, Tailwind CSS tokens, Vitest + React Testing Library.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one component per file, `JSX.Element` return types.
- Styling uses Tailwind CSS v4 tokens (`graphite-*`, `clay-*`, `danger-*`) — no arbitrary hex values.
- Matching is case-insensitive substring only — no new dependency (e.g. a fuzzy-search library) for this.

---

### Task 1: `TaskSearch` IPC channel + main-process handler

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc/task-handlers.ts`
- Modify: `src/main/ipc/task-handlers.test.ts`

**Interfaces:**
- Produces: `IpcChannels.TaskSearch` = `'task:search'`, a new entry in the existing `IpcChannels` const object. Request: a plain `string` query. Response: `Promise<string[]>` — the matching task ids.
- Consumes: `readStore`/`getStorePath` (in-memory title/branch/adoId scan) and `readTaskNotes`/`getTaskNotesPath` (per-task notes-body read), all already imported into `task-handlers.ts`.

- [ ] **Step 1: Write the failing tests**

In `src/main/ipc/task-handlers.test.ts`, add this import right after the existing `import { addWorktree, addWorktreeForExistingBranch, removeWorktree } from '../services/git-service';` line:

```ts
import { readTaskNotes } from '../services/notes-service';
```

Then add `vi.mocked(readTaskNotes).mockClear();` to the existing `beforeEach` block, right after the existing `vi.mocked(removeWorktree).mockClear();` line, so it reads:

```ts
    vi.mocked(addWorktree).mockClear();
    vi.mocked(addWorktreeForExistingBranch).mockClear();
    vi.mocked(removeWorktree).mockClear();
    vi.mocked(readTaskNotes).mockClear();
    registerTaskHandlers(onPtyData);
```

Finally, append these four tests inside the existing `describe('task-handlers', ...)` block, right before its closing `});`:

```ts
  it('TaskSearch matches by title, branch, and adoId case-insensitively, without reading any notes file', async () => {
    store.tasks.push(
      {
        id: 'task-1',
        repoId: 'repo-1',
        title: 'Fix login bug',
        adoId: 'ADO-42',
        branch: 'task/fix-login-bug',
        worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
        status: 'todo',
        kind: 'worktree',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
      {
        id: 'task-2',
        repoId: 'repo-1',
        title: 'Add tests',
        branch: 'task/add-tests',
        worktreePath: 'C:\\demo-worktrees\\add-tests',
        status: 'todo',
        kind: 'worktree',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    );
    const handler = handlers.get(IpcChannels.TaskSearch);
    expect(await handler?.({}, 'LOGIN')).toEqual(['task-1']);
    expect(await handler?.({}, 'add-tests')).toEqual(['task-2']);
    expect(await handler?.({}, 'ado-42')).toEqual(['task-1']);
    expect(readTaskNotes).not.toHaveBeenCalled();
  });

  it('TaskSearch falls back to notes-body content when no in-memory field matches', async () => {
    store.tasks.push(
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
      {
        id: 'task-2',
        repoId: 'repo-1',
        title: 'Add tests',
        branch: 'task/add-tests',
        worktreePath: 'C:\\demo-worktrees\\add-tests',
        status: 'todo',
        kind: 'worktree',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    );
    vi.mocked(readTaskNotes).mockImplementation(async (path: string) => ({
      frontmatter: { title: 't', branch: 'b', worktreePath: 'C:\\w', status: 'todo' as const },
      body: path.includes('task-1') ? 'Investigating the redirect loop' : '',
    }));
    const result = await handlers.get(IpcChannels.TaskSearch)?.({}, 'redirect');
    expect(result).toEqual(['task-1']);
    expect(readTaskNotes).toHaveBeenCalledTimes(2);
  });

  it('TaskSearch returns an empty array when nothing matches', async () => {
    store.tasks.push({
      id: 'task-1',
      repoId: 'repo-1',
      title: 'Fix login bug',
      branch: 'task/fix-login-bug',
      worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
      status: 'todo',
      kind: 'worktree',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    vi.mocked(readTaskNotes).mockResolvedValue({
      frontmatter: { title: 't', branch: 'b', worktreePath: 'C:\\w', status: 'todo' },
      body: '',
    });
    expect(await handlers.get(IpcChannels.TaskSearch)?.({}, 'nonexistent')).toEqual([]);
  });

  it('TaskSearch skips a task whose notes file cannot be read instead of throwing', async () => {
    store.tasks.push({
      id: 'task-1',
      repoId: 'repo-1',
      title: 'Fix login bug',
      branch: 'task/fix-login-bug',
      worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
      status: 'todo',
      kind: 'worktree',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    vi.mocked(readTaskNotes).mockRejectedValue(Object.assign(new Error('not found'), { code: 'ENOENT' }));
    await expect(handlers.get(IpcChannels.TaskSearch)?.({}, 'redirect')).resolves.toEqual([]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- task-handlers`
Expected: FAIL — `IpcChannels.TaskSearch` is `undefined`, so `handlers.get(IpcChannels.TaskSearch)` returns `undefined` and every assertion against the handler's result fails.

- [ ] **Step 3: Implement**

In `src/shared/ipc-channels.ts`, add the new channel right after `TaskNotesSet: 'task:notes:set',`:

```ts
  TaskNotesSet: 'task:notes:set',
  TaskSearch: 'task:search',
```

In `src/main/ipc/task-handlers.ts`, add this handler inside `registerTaskHandlers`, right after the existing `TaskNotesSet` handler and before the function's closing `}`:

```ts
  ipcMain.handle(IpcChannels.TaskSearch, async (_event, query: string): Promise<string[]> => {
    const store = await readStore(getStorePath());
    const needle = query.toLowerCase();
    const matchingIds: string[] = [];
    for (const task of store.tasks) {
      const matchesInMemory =
        task.title.toLowerCase().includes(needle) ||
        task.branch.toLowerCase().includes(needle) ||
        (task.adoId ?? '').toLowerCase().includes(needle);
      if (matchesInMemory) {
        matchingIds.push(task.id);
        continue;
      }
      let body = '';
      try {
        body = (await readTaskNotes(getTaskNotesPath(task.id))).body;
      } catch {
        body = '';
      }
      if (body.toLowerCase().includes(needle)) {
        matchingIds.push(task.id);
      }
    }
    return matchingIds;
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- task-handlers`
Expected: PASS (all tests, including the 4 new ones)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests pass

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/ipc/task-handlers.ts src/main/ipc/task-handlers.test.ts
git commit -m "feat: add TaskSearch IPC channel matching title, branch, adoId, and notes body"
```

---

### Task 2: Preload exposure of `taskSearch`

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.test.ts`

**Interfaces:**
- Consumes: `IpcChannels.TaskSearch` from Task 1.
- Produces: `ClaudeOrchestratorApi.taskSearch(query: string): Promise<string[]>`, a new method on the existing `ClaudeOrchestratorApi` interface and `api` object, exposed on `window.claudeOrchestrator` (picked up automatically by `src/renderer/window.d.ts`, which types `window.claudeOrchestrator` as `ClaudeOrchestratorApi` — no change needed there).

- [ ] **Step 1: Write the failing test**

Append this test inside the existing `describe('preload', ...)` block in `src/preload/index.test.ts`, after the last existing `it(...)`:

```ts
  it('taskSearch invokes the TaskSearch channel with the query string', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.taskSearch as any)('login');
    expect(ipcRendererInvoke).toHaveBeenCalledWith('task:search', 'login');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- preload`
Expected: FAIL — `api.taskSearch` is `undefined`, so calling it throws `TypeError: api.taskSearch is not a function`

- [ ] **Step 3: Implement**

In `src/preload/index.ts`, add the method to the `ClaudeOrchestratorApi` interface right after `setTaskNotes(request: TaskNotesSetRequest): Promise<void>;`:

```ts
  setTaskNotes(request: TaskNotesSetRequest): Promise<void>;
  taskSearch(query: string): Promise<string[]>;
```

Then add the implementation to the `api` object right after `setTaskNotes: (request) => ipcRenderer.invoke(IpcChannels.TaskNotesSet, request),`:

```ts
  setTaskNotes: (request) => ipcRenderer.invoke(IpcChannels.TaskNotesSet, request),
  taskSearch: (query) => ipcRenderer.invoke(IpcChannels.TaskSearch, query),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:main -- preload`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests pass

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/preload/index.ts src/preload/index.test.ts
git commit -m "feat: expose taskSearch on the preload API"
```

---

### Task 3: `TaskSearchInput` component

**Files:**
- Create: `src/renderer/components/task-search-input/task-search-input.tsx`
- Test: `src/renderer/components/task-search-input/task-search-input.test.tsx`
- Create: `src/renderer/components/task-search-input/task-search-input.stories.tsx`

**Interfaces:**
- Produces: `TaskSearchInput({ value, onChange }: TaskSearchInputProps): JSX.Element` — a labeled `<input type="search">` (accessible name "Search tasks" via an associated `sr-only` label). `value` is the current query string; `onChange(value: string)` fires on every keystroke. No internal state, no debouncing — this component is purely controlled, matching "Props in, events out."

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/task-search-input/task-search-input.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskSearchInput } from './task-search-input';

describe('TaskSearchInput', () => {
  it('renders the current value in a labeled search box', () => {
    render(<TaskSearchInput value="login" onChange={vi.fn()} />);
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('login');
  });

  it('calls onChange with the new value when typed into', async () => {
    const onChange = vi.fn();
    render(<TaskSearchInput value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'x');
    expect(onChange).toHaveBeenCalledWith('x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer -- task-search-input`
Expected: FAIL — cannot find module `./task-search-input` (file doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/components/task-search-input/task-search-input.tsx`:

```tsx
export interface TaskSearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function TaskSearchInput({ value, onChange }: TaskSearchInputProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="task-search-input" className="sr-only">
        Search tasks
      </label>
      <input
        id="task-search-input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search tasks…"
        className="rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-sm text-graphite-100 placeholder:text-graphite-400 focus:border-clay-500 focus:outline-none"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:renderer -- task-search-input`
Expected: PASS (2 tests)

- [ ] **Step 5: Add the Storybook story**

Create `src/renderer/components/task-search-input/task-search-input.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { TaskSearchInput } from './task-search-input';

const meta: Meta<typeof TaskSearchInput> = {
  component: TaskSearchInput,
  title: 'Components/TaskSearchInput',
  args: {
    onChange: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof TaskSearchInput>;

export const Empty: Story = {
  args: { value: '' },
};

export const WithQuery: Story = {
  args: { value: 'login' },
};
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/task-search-input
git commit -m "feat: add TaskSearchInput component"
```

---

### Task 4: Filter repos/tasks in `RepoSidebar`

**Files:**
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.tsx`
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx`
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.stories.tsx`

**Interfaces:**
- Consumes: `TaskSearchInput` from Task 3 (`import { TaskSearchInput } from '../task-search-input/task-search-input';`).
- Produces: `RepoSidebarProps` gains two new required fields: `searchQuery: string` and `onSearchQueryChange: (value: string) => void`. Behavior: renders `TaskSearchInput` between the toolbar buttons and the repo list; when `searchQuery.trim() !== ''`, any repo whose `tasksByRepoId[repo.id]` is empty is not rendered at all (the actual match filtering of `tasksByRepoId` happens upstream, in `App`, per Task 5 — `RepoSidebar` only decides whether a now-empty repo should still render).

- [ ] **Step 1: Update existing tests to pass the two new required props**

`searchQuery` and `onSearchQueryChange` are new required props, so every existing `render(<RepoSidebar ... />)` call in `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx` needs `searchQuery=""` and `onSearchQueryChange={vi.fn()}` added. Apply this to all 7 existing `it(...)` blocks in that file — e.g. the first one becomes:

```tsx
  it('renders each repo and its tasks', () => {
    render(
      <RepoSidebar
        repos={[repo]}
        tasksByRepoId={{ 'repo-1': [task] }}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
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

Do the same (`searchQuery=""` and `onSearchQueryChange={vi.fn()}`, inserted right after `selectedTaskId={...}`) for the other 6 `render(<RepoSidebar ... />)` calls in that file, keeping every other prop/assertion unchanged.

- [ ] **Step 2: Write the new failing tests**

Append these three tests inside the existing `describe('RepoSidebar', ...)` block:

```tsx
  it('renders the search input and forwards typed text via onSearchQueryChange', async () => {
    const onSearchQueryChange = vi.fn();
    render(
      <RepoSidebar
        repos={[repo]}
        tasksByRepoId={{ 'repo-1': [task] }}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={onSearchQueryChange}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'x');
    expect(onSearchQueryChange).toHaveBeenCalledWith('x');
  });

  it('hides a repo with zero matching tasks while a search query is active', () => {
    const otherRepo: RepoRecord = { ...repo, id: 'repo-2', name: 'other-repo' };
    render(
      <RepoSidebar
        repos={[repo, otherRepo]}
        tasksByRepoId={{ 'repo-1': [task], 'repo-2': [] }}
        selectedTaskId={undefined}
        searchQuery="login"
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    expect(screen.getByText('demo')).toBeInTheDocument();
    expect(screen.queryByText('other-repo')).not.toBeInTheDocument();
  });

  it('shows a repo with zero tasks when the search query is empty (not an active search)', () => {
    const emptyRepo: RepoRecord = { ...repo, id: 'repo-2', name: 'empty-repo' };
    render(
      <RepoSidebar
        repos={[emptyRepo]}
        tasksByRepoId={{}}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
      />,
    );
    expect(screen.getByText('empty-repo')).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run tests to verify the new ones fail and the rest still pass**

Run: `npm run test:renderer -- repo-sidebar`
Expected: the 7 existing tests pass (with the two new props added); the 3 new tests fail — `searchQuery`/`onSearchQueryChange` aren't accepted, no search box is rendered, and no repo is ever hidden

- [ ] **Step 4: Implement**

Replace the full contents of `src/renderer/components/repo-sidebar/repo-sidebar.tsx` with:

```tsx
import type { RepoRecord, TaskRecord } from '../../../shared/types';
import { TaskSearchInput } from '../task-search-input/task-search-input';

export interface RepoSidebarProps {
  repos: RepoRecord[];
  tasksByRepoId: Record<string, TaskRecord[]>;
  selectedTaskId: string | undefined;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
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
  searchQuery,
  onSearchQueryChange,
  onSelectTask,
  onOpenRepoClick,
  onCloneRepoClick,
  onNewTaskClick,
  onRemoveTaskClick,
  onReviewCodeClick,
}: RepoSidebarProps): JSX.Element {
  const isSearchActive = searchQuery.trim() !== '';
  const visibleRepos = isSearchActive
    ? repos.filter((repo) => (tasksByRepoId[repo.id] ?? []).length > 0)
    : repos;

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
      <TaskSearchInput value={searchQuery} onChange={onSearchQueryChange} />
      <ul className="flex flex-col gap-3">
        {visibleRepos.map((repo) => (
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
              {(tasksByRepoId[repo.id] ?? []).map((task) => (
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
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm run test:renderer -- repo-sidebar`
Expected: PASS (all 10 tests)

- [ ] **Step 6: Update the Storybook stories**

Replace the full contents of `src/renderer/components/repo-sidebar/repo-sidebar.stories.tsx` with:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { RepoSidebar } from './repo-sidebar';

const meta: Meta<typeof RepoSidebar> = {
  component: RepoSidebar,
  title: 'Components/RepoSidebar',
  args: {
    onSearchQueryChange: fn(),
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
  args: { repos: [], tasksByRepoId: {}, selectedTaskId: undefined, searchQuery: '' },
};

export const WithRepoAndTasks: Story = {
  args: {
    repos: [{ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' }],
    tasksByRepoId: {
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
    selectedTaskId: 'task-1',
    searchQuery: '',
  },
};

export const ActiveSearchWithNoMatchesInOneRepo: Story = {
  args: {
    repos: [
      { id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' },
      { id: 'repo-2', name: 'other-repo', path: 'C:\\other-repo', createdAt: '2026-07-08T00:00:00.000Z' },
    ],
    tasksByRepoId: {
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
      'repo-2': [],
    },
    selectedTaskId: undefined,
    searchQuery: 'login',
  },
};
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests pass

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/repo-sidebar
git commit -m "feat: render a search box in RepoSidebar and hide repos with zero matches"
```

---

### Task 5: Debounced search wiring in `App`

**Files:**
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/app.test.tsx`
- Modify: `docs/runbooks/manual-smoke-test.md`

**Interfaces:**
- Consumes: `window.claudeOrchestrator.taskSearch(query: string): Promise<string[]>` (Task 2), `RepoSidebar`'s new `searchQuery`/`onSearchQueryChange` props (Task 4).
- Produces: no new exports — this task only changes `App`'s internal state and rendering.

This task depends on Tasks 1–4 being merged first (it calls `window.claudeOrchestrator.taskSearch` and passes `searchQuery`/`onSearchQueryChange` to `RepoSidebar`, which only compile once those exist).

- [ ] **Step 1: Write the failing tests**

In `src/renderer/app.test.tsx`, add this mock near the other `const ... = vi.fn(...)` declarations, right after `const fetchRepo = vi.fn(async () => undefined);`:

```tsx
const taskSearch = vi.fn(async (): Promise<string[]> => []);
```

Add `taskSearch,` to the `vi.stubGlobal('claudeOrchestrator', { ... })` object in `beforeEach`, right after the existing `fetchRepo,` line.

Then append these two tests inside the existing `describe('App', ...)` block:

```tsx
  it('debounces typing in the search box before calling taskSearch, and filters the sidebar to the results', async () => {
    taskSearch.mockResolvedValueOnce(['task-2']);
    render(<App />);
    await screen.findByText('Fix login bug');
    const searchBox = screen.getByRole('searchbox', { name: 'Search tasks' });

    await userEvent.type(searchBox, 'tests');
    expect(taskSearch).not.toHaveBeenCalled();

    expect(await screen.findByText('Add tests')).toBeInTheDocument();
    expect(taskSearch).toHaveBeenCalledWith('tests');
    expect(screen.queryByText('Fix login bug')).not.toBeInTheDocument();
  });

  it('clearing the search box restores the full task list without a new taskSearch call', async () => {
    taskSearch.mockResolvedValueOnce(['task-2']);
    render(<App />);
    await screen.findByText('Fix login bug');
    const searchBox = screen.getByRole('searchbox', { name: 'Search tasks' });

    await userEvent.type(searchBox, 'tests');
    expect(await screen.findByText('Add tests')).toBeInTheDocument();

    taskSearch.mockClear();
    await userEvent.clear(searchBox);

    expect(await screen.findByText('Fix login bug')).toBeInTheDocument();
    expect(screen.getByText('Add tests')).toBeInTheDocument();
    expect(taskSearch).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail and the rest still pass**

Run: `npm run test:renderer -- app.test`
Expected: existing tests still pass; the 2 new tests fail — `RepoSidebar` doesn't accept/render a search box yet, and `App` never calls `taskSearch`

- [ ] **Step 3: Implement — add state**

In `src/renderer/app.tsx`, add two new state variables right after the existing `const [loadingTaskId, setLoadingTaskId] = useState<string | undefined>();` line:

```tsx
  const [searchQuery, setSearchQuery] = useState('');
  const [matchingTaskIds, setMatchingTaskIds] = useState<string[] | undefined>();
```

- [ ] **Step 4: Implement — add the debounced search effect**

In `src/renderer/app.tsx`, add a new `useEffect` right after the existing one that loads repos and tasks on mount (right after its closing `}, []);`):

```tsx
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed === '') {
      setMatchingTaskIds(undefined);
      return;
    }
    const timeoutId = setTimeout(() => {
      window.claudeOrchestrator
        .taskSearch(searchQuery)
        .then(setMatchingTaskIds)
        .catch((err: unknown) => setErrorMessage(toErrorMessage(err)));
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);
```

- [ ] **Step 5: Implement — compute the filtered grouping**

In `src/renderer/app.tsx`, replace the existing `tasksByRepoId` block:

```tsx
  const tasksByRepoId = tasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
    (acc[task.repoId] ??= []).push(task);
    return acc;
  }, {});
```

with:

```tsx
  const tasksByRepoId = tasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
    (acc[task.repoId] ??= []).push(task);
    return acc;
  }, {});

  const filteredTasksByRepoId =
    matchingTaskIds === undefined
      ? tasksByRepoId
      : Object.fromEntries(
          Object.entries(tasksByRepoId).map(([repoId, repoTasks]) => [
            repoId,
            repoTasks.filter((task) => matchingTaskIds.includes(task.id)),
          ]),
        );
```

- [ ] **Step 6: Implement — pass the new props to `RepoSidebar`**

In `src/renderer/app.tsx`, replace the existing `<RepoSidebar ... />` usage:

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
```

with:

```tsx
      <RepoSidebar
        repos={repos}
        tasksByRepoId={filteredTasksByRepoId}
        selectedTaskId={activeTaskId}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSelectTask={(taskId) => void handleSelectTask(taskId)}
        onOpenRepoClick={() => void handleOpenRepoClick()}
        onCloneRepoClick={() => setIsCloneModalOpen(true)}
        onNewTaskClick={(repoId) => void handleNewTaskClick(repoId)}
        onRemoveTaskClick={(taskId) => void handleRemoveTask(taskId)}
        onReviewCodeClick={(repoId) => void handleReviewCodeClick(repoId)}
      />
```

- [ ] **Step 7: Run tests to verify all pass**

Run: `npm run test:renderer -- app.test`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 8: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests pass (main + renderer)

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 9: Update the manual smoke-test runbook**

Add a new step to `docs/runbooks/manual-smoke-test.md` (append after the last existing numbered step, incrementing the number to 19):

```
19. Create at least two tasks with different titles across two repos, one with notes body text that doesn't appear in its title. Type a keyword from one task's title into the new sidebar search box — confirm only matching tasks (and their repos) remain visible, other repos with no matches disappear entirely, and nothing is filtered until ~250ms after you stop typing. Clear the search box — confirm every repo/task reappears instantly. Type a keyword that only appears in a task's notes body (not its title/branch/ADO id) — confirm that task still shows up.
```

- [ ] **Step 10: Commit**

```bash
git add src/renderer/app.tsx src/renderer/app.test.tsx docs/runbooks/manual-smoke-test.md
git commit -m "feat: wire a debounced task search box into the sidebar"
```
