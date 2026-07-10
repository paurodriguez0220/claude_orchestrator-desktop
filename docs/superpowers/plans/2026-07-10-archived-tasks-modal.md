# Archived Tasks Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app "archive" action that hides a task from the sidebar (reusing `status: 'done'`), plus a top-bar modal that lists, filters, opens, and unarchives archived tasks across all repos.

**Architecture:** A new `task:set-status` IPC persists a task's status into its notes frontmatter via `notes-service`. The renderer gains an archive icon on each active task row, an "Archived" toolbar icon that opens a new presentational `ArchivedTasksModal`, and drops the per-repo inline "Archived (N)" section. `app.tsx` owns archive/unarchive handlers and the modal's open state.

**Tech Stack:** TypeScript strict, Electron IPC, React 18, Tailwind v4 tokens, lucide-react, Vitest + React Testing Library.

## Global Constraints

- TypeScript `strict: true`. No `any` (except the existing preload-test cast pattern). Named exports only, kebab-case filenames, `JSX.Element` return types on components.
- Never string-interpolate user input into shell commands (not relevant here — no shelling out).
- Styling uses Tailwind tokens (`graphite-*`, `clay-*`, `danger-*`) — no arbitrary hex colors.
- Icon buttons carry `aria-label` + `title`; icons themselves are `aria-hidden` (except role="img" indicators like the review badge).
- Run the affected suite after every task; commit only green.
- Archive = set `status` to `'done'`; Unarchive = set `status` to `'todo'`. The sidebar split (`app.tsx`) already keys active vs archived on `status === 'done'`.

---

### Task 1: `task:set-status` IPC — persist a task's status to frontmatter

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc/task-handlers.ts`
- Modify: `src/main/ipc/task-handlers.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.test.ts`

**Interfaces:**
- Produces: channel constant `TaskSetStatus: 'task:set-status'`; `interface TaskSetStatusRequest { taskId: string; status: TaskStatus }`.
- Produces: preload facade method `setTaskStatus(request: TaskSetStatusRequest): Promise<void>`.

- [ ] **Step 1: Write the failing main-process test**

In `src/main/ipc/task-handlers.test.ts`, add inside the top-level `describe` (after the existing notes tests):

```ts
it('TaskSetStatus rewrites the notes frontmatter status without touching the body', async () => {
  const { readTaskNotes, writeTaskNotes } = await import('../services/notes-service');
  vi.mocked(readTaskNotes).mockResolvedValueOnce({
    frontmatter: { title: 't', branch: 'b', worktreePath: 'C:\\w', status: 'todo', kind: 'worktree' },
    body: 'existing notes',
  });
  registerIpcHandlers();
  const handler = handlers.get('task:set-status');
  await handler?.({}, { taskId: 'task-1', status: 'done' });
  expect(vi.mocked(writeTaskNotes)).toHaveBeenCalledWith(
    'C:\\fake\\tasks\\task-1.md',
    expect.objectContaining({
      body: 'existing notes',
      frontmatter: expect.objectContaining({ status: 'done', title: 't' }),
    }),
  );
});
```

> Note: match the existing file's convention for how handlers get registered (it calls the module's `registerIpcHandlers()` — reuse whatever the surrounding tests call; if they import a differently-named register function, use that exact name).

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:main -- task-handlers`
Expected: FAIL — `handlers.get('task:set-status')` is `undefined`.

- [ ] **Step 3: Add the channel + request type**

In `src/shared/ipc-channels.ts`, add to the `IpcChannels` object (after `TaskSearch`):

```ts
  TaskSetStatus: 'task:set-status',
```

And add the request interface (near `TaskNotesSetRequest`):

```ts
export interface TaskSetStatusRequest {
  taskId: string;
  status: TaskStatus;
}
```

(`TaskStatus` is already imported at the top of the file.)

- [ ] **Step 4: Add the main handler**

In `src/main/ipc/task-handlers.ts`, add near the other notes handlers (after `TaskNotesSet`). Ensure `TaskSetStatusRequest` is added to the existing `ipc-channels` type import:

```ts
  ipcMain.handle(
    IpcChannels.TaskSetStatus,
    async (_event, request: TaskSetStatusRequest): Promise<void> => {
      const notesPath = getTaskNotesPath(request.taskId);
      const notes = await readTaskNotes(notesPath);
      await writeTaskNotes(notesPath, {
        ...notes,
        frontmatter: { ...notes.frontmatter, status: request.status },
      });
    },
  );
```

- [ ] **Step 5: Run the main test to verify it passes**

Run: `npm run test:main -- task-handlers`
Expected: PASS.

- [ ] **Step 6: Write the failing preload test**

In `src/preload/index.test.ts`, add:

```ts
it('setTaskStatus invokes the TaskSetStatus channel with the request', async () => {
  await import('./index');
  const call = exposeInMainWorld.mock.calls[0];
  if (!call) throw new Error('exposeInMainWorld not called');
  const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (api.setTaskStatus as any)({ taskId: 'task-1', status: 'done' });
  expect(ipcRendererInvoke).toHaveBeenCalledWith('task:set-status', { taskId: 'task-1', status: 'done' });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm run test:main -- preload`
Expected: FAIL — `api.setTaskStatus` is not a function.

- [ ] **Step 8: Expose it on the preload facade**

In `src/preload/index.ts`: add `TaskSetStatusRequest` to the type import from `../shared/ipc-channels`, add to the interface (after `setTaskNotes`):

```ts
  setTaskStatus(request: TaskSetStatusRequest): Promise<void>;
```

and add to the implementation object (after `setTaskNotes`):

```ts
  setTaskStatus: (request) => ipcRenderer.invoke(IpcChannels.TaskSetStatus, request),
```

- [ ] **Step 9: Run both test files to verify they pass**

Run: `npm run test:main -- "task-handlers|preload"`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/ipc/task-handlers.ts src/main/ipc/task-handlers.test.ts src/preload/index.ts src/preload/index.test.ts
git commit -m "feat: add task:set-status IPC to persist archive state"
```

---

### Task 2: `ArchivedTasksModal` component

**Files:**
- Create: `src/renderer/components/archived-tasks-modal/archived-tasks-modal.tsx`
- Create: `src/renderer/components/archived-tasks-modal/archived-tasks-modal.test.tsx`
- Create: `src/renderer/components/archived-tasks-modal/archived-tasks-modal.stories.tsx`

**Interfaces:**
- Consumes: `ModalOverlay` from `../modal-overlay/modal-overlay`; `RepoRecord`, `TaskRecord` from `../../../shared/types`.
- Produces: `ArchivedTasksModal(props: ArchivedTasksModalProps): JSX.Element | null` where
  ```ts
  interface ArchivedTasksModalProps {
    isOpen: boolean;
    repos: RepoRecord[];
    archivedTasksByRepoId: Record<string, TaskRecord[]>;
    onSelectTask: (taskId: string) => void;
    onUnarchive: (taskId: string) => void;
    onClose: () => void;
  }
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/components/archived-tasks-modal/archived-tasks-modal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArchivedTasksModal } from './archived-tasks-modal';
import type { RepoRecord, TaskRecord } from '../../../shared/types';

const repos: RepoRecord[] = [{ id: 'repo-1', name: 'demo', path: 'C:\\demo' }];

const task = (over: Partial<TaskRecord>): TaskRecord => ({
  id: 'task-1',
  repoId: 'repo-1',
  title: 'Fix login bug',
  branch: 'task/fix-login',
  worktreePath: 'C:\\w',
  status: 'done',
  kind: 'worktree',
  ...over,
});

function renderModal(over: Partial<Parameters<typeof ArchivedTasksModal>[0]> = {}) {
  const props = {
    isOpen: true,
    repos,
    archivedTasksByRepoId: { 'repo-1': [task({})] },
    onSelectTask: vi.fn(),
    onUnarchive: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<ArchivedTasksModal {...props} />);
  return props;
}

describe('ArchivedTasksModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ArchivedTasksModal
        isOpen={false}
        repos={repos}
        archivedTasksByRepoId={{ 'repo-1': [task({})] }}
        onSelectTask={vi.fn()}
        onUnarchive={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists archived tasks grouped under their repo name', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Archived tasks' })).toBeInTheDocument();
    expect(screen.getByText('demo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fix login bug' })).toBeInTheDocument();
  });

  it('opens a task and closes the modal when its row is clicked', async () => {
    const props = renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Fix login bug' }));
    expect(props.onSelectTask).toHaveBeenCalledWith('task-1');
  });

  it('calls onUnarchive when the unarchive button is clicked', async () => {
    const props = renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive task' }));
    expect(props.onUnarchive).toHaveBeenCalledWith('task-1');
  });

  it('filters the list by title, branch, or repo (case-insensitive)', async () => {
    renderModal({
      archivedTasksByRepoId: {
        'repo-1': [task({ id: 'a', title: 'Fix login bug', branch: 'task/fix-login' }), task({ id: 'b', title: 'Export CSV', branch: 'task/export' })],
      },
    });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter archived tasks' }), 'export');
    expect(screen.queryByRole('button', { name: 'Fix login bug' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });

  it('shows an empty message when there are no archived tasks', () => {
    renderModal({ archivedTasksByRepoId: {} });
    expect(screen.getByText('No archived tasks.')).toBeInTheDocument();
  });

  it('shows a no-match message when a filter matches nothing', async () => {
    renderModal();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter archived tasks' }), 'zzz');
    expect(screen.getByText('No archived tasks match.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:renderer -- archived-tasks-modal`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/renderer/components/archived-tasks-modal/archived-tasks-modal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ArchiveRestore } from 'lucide-react';
import { ModalOverlay } from '../modal-overlay/modal-overlay';
import type { RepoRecord, TaskRecord } from '../../../shared/types';

export interface ArchivedTasksModalProps {
  isOpen: boolean;
  repos: RepoRecord[];
  archivedTasksByRepoId: Record<string, TaskRecord[]>;
  onSelectTask: (taskId: string) => void;
  onUnarchive: (taskId: string) => void;
  onClose: () => void;
}

export function ArchivedTasksModal({
  isOpen,
  repos,
  archivedTasksByRepoId,
  onSelectTask,
  onUnarchive,
  onClose,
}: ArchivedTasksModalProps): JSX.Element | null {
  const [filter, setFilter] = useState('');

  // The modal can stay mounted across opens; clear the filter each time it opens.
  useEffect(() => {
    if (isOpen) {
      setFilter('');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const needle = filter.trim().toLowerCase();
  const repoName = (repoId: string): string => repos.find((repo) => repo.id === repoId)?.name ?? repoId;

  const groups = Object.entries(archivedTasksByRepoId)
    .map(([repoId, tasks]) => ({
      repoId,
      name: repoName(repoId),
      tasks: tasks.filter(
        (task) =>
          needle === '' ||
          task.title.toLowerCase().includes(needle) ||
          (task.branch ?? '').toLowerCase().includes(needle) ||
          repoName(repoId).toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.tasks.length > 0);

  const totalArchived = Object.values(archivedTasksByRepoId).reduce((sum, tasks) => sum + tasks.length, 0);

  return (
    <ModalOverlay>
      <div role="dialog" aria-label="Archived tasks" className="flex max-h-[80vh] w-[28rem] flex-col gap-4">
        <h2 className="text-lg font-semibold text-graphite-100">Archived tasks</h2>
        <input
          type="search"
          aria-label="Filter archived tasks"
          placeholder="Filter archived tasks…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-sm text-graphite-100 focus:outline-none focus:ring-2 focus:ring-clay-500"
        />
        <div className="flex-1 overflow-y-auto">
          {totalArchived === 0 ? (
            <p className="text-sm text-graphite-400">No archived tasks.</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-graphite-400">No archived tasks match.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {groups.map((group) => (
                <li key={group.repoId} className="flex flex-col gap-1">
                  <span className="truncate text-sm font-semibold text-graphite-100">{group.name}</span>
                  <ul className="flex flex-col gap-1 pl-2">
                    {group.tasks.map((task) => (
                      <li key={task.id} className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectTask(task.id)}
                          className="flex-1 truncate rounded-md px-2 py-1 text-left text-sm text-graphite-200 hover:bg-graphite-700"
                        >
                          {task.title}
                        </button>
                        <button
                          type="button"
                          aria-label="Unarchive task"
                          title="Unarchive task"
                          onClick={() => onUnarchive(task.id)}
                          className="shrink-0 rounded-md px-2 py-1 text-graphite-400 hover:text-clay-400"
                        >
                          <ArchiveRestore aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="self-end rounded-md border border-graphite-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400"
        >
          Close
        </button>
      </div>
    </ModalOverlay>
  );
}
```

> Note: the row click handler calls only `onSelectTask`; the parent (`app.tsx`) is responsible for closing the modal on select (Task 4). This keeps the modal purely presentational.

- [ ] **Step 4: Run to verify tests pass**

Run: `npm run test:renderer -- archived-tasks-modal`
Expected: PASS.

- [ ] **Step 5: Add a Storybook story**

Create `src/renderer/components/archived-tasks-modal/archived-tasks-modal.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { ArchivedTasksModal } from './archived-tasks-modal';

const meta: Meta<typeof ArchivedTasksModal> = {
  title: 'Components/ArchivedTasksModal',
  component: ArchivedTasksModal,
};
export default meta;

type Story = StoryObj<typeof ArchivedTasksModal>;

export const WithTasks: Story = {
  args: {
    isOpen: true,
    repos: [{ id: 'repo-1', name: 'demo', path: 'C:\\demo' }],
    archivedTasksByRepoId: {
      'repo-1': [
        { id: 't1', repoId: 'repo-1', title: 'Fix login bug', branch: 'task/fix-login', worktreePath: 'C:\\w', status: 'done', kind: 'worktree' },
        { id: 't2', repoId: 'repo-1', title: 'Export CSV', branch: 'task/export', worktreePath: 'C:\\w', status: 'done', kind: 'worktree' },
      ],
    },
    onSelectTask: () => {},
    onUnarchive: () => {},
    onClose: () => {},
  },
};

export const Empty: Story = {
  args: { ...WithTasks.args, archivedTasksByRepoId: {} },
};
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/archived-tasks-modal/
git commit -m "feat: add ArchivedTasksModal with grouped list and filter"
```

---

### Task 3: RepoSidebar — archive row action + toolbar button, remove inline archived section

**Files:**
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.tsx`
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx`

**Interfaces:**
- Consumes: `onArchiveTaskClick`, `onOpenArchivedClick` from `app.tsx` (Task 4).
- Produces: `RepoSidebarProps` gains `onArchiveTaskClick: (taskId: string) => void` and `onOpenArchivedClick: () => void`; loses `archivedTasksByRepoId`. `TaskRow` gains `onArchiveTaskClick: (taskId: string) => void`.

- [ ] **Step 1: Update the failing tests**

In `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx`:
- Every `render(<RepoSidebar ... />)` call must now pass `onArchiveTaskClick={vi.fn()}` and `onOpenArchivedClick={vi.fn()}`, and must NOT pass `archivedTasksByRepoId`. (Find each render helper/call and update its props.)
- Delete any test that asserts the inline "Archived (N)" section renders/expands (the `doneTask` archived-section tests). Replace with the two tests below.

Add:

```tsx
it('calls onArchiveTaskClick when a task row\'s archive button is clicked', async () => {
  const onArchiveTaskClick = vi.fn();
  render(
    <RepoSidebar
      repos={[{ id: 'repo-1', name: 'demo', path: 'C:\\demo' }]}
      activeTasksByRepoId={{ 'repo-1': [task] }}
      scratchTasks={[]}
      selectedTaskId={undefined}
      searchQuery=""
      onSearchQueryChange={vi.fn()}
      onSelectTask={vi.fn()}
      onOpenRepoClick={vi.fn()}
      onCloneRepoClick={vi.fn()}
      onNewTaskClick={vi.fn()}
      onRemoveTaskClick={vi.fn()}
      onReviewCodeClick={vi.fn()}
      onNewQuestionClick={vi.fn()}
      appVersion={undefined}
      onGenerateDsuClick={vi.fn()}
      onArchiveTaskClick={onArchiveTaskClick}
      onOpenArchivedClick={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Archive task' }));
  expect(onArchiveTaskClick).toHaveBeenCalledWith(task.id);
});

it('calls onOpenArchivedClick when the Archived toolbar button is clicked', async () => {
  const onOpenArchivedClick = vi.fn();
  render(
    <RepoSidebar
      repos={[]}
      activeTasksByRepoId={{}}
      scratchTasks={[]}
      selectedTaskId={undefined}
      searchQuery=""
      onSearchQueryChange={vi.fn()}
      onSelectTask={vi.fn()}
      onOpenRepoClick={vi.fn()}
      onCloneRepoClick={vi.fn()}
      onNewTaskClick={vi.fn()}
      onRemoveTaskClick={vi.fn()}
      onReviewCodeClick={vi.fn()}
      onNewQuestionClick={vi.fn()}
      appVersion={undefined}
      onGenerateDsuClick={vi.fn()}
      onArchiveTaskClick={vi.fn()}
      onOpenArchivedClick={onOpenArchivedClick}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Archived tasks' }));
  expect(onOpenArchivedClick).toHaveBeenCalledOnce();
});
```

> Use the existing top-of-file `task` fixture (the `todoTask`/`task` const the suite already defines). Remove the now-unused `doneTask` fixture if the deleted tests were its only consumer.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:renderer -- repo-sidebar`
Expected: FAIL — `Archive task` / `Archived tasks` buttons not found; and TS/prop errors from removed `archivedTasksByRepoId`.

- [ ] **Step 3: Update imports and props**

In `src/renderer/components/repo-sidebar/repo-sidebar.tsx`:
- Remove the `useState` import (line 1) — it becomes unused once `expandedRepoIds` is gone.
- In the lucide-react import, remove `ChevronDown` and `ChevronRight`, add `Archive` and `ArchiveRestore`:

```ts
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  Download,
  Eye,
  FolderOpen,
  GitPullRequest,
  MessageCirclePlus,
  Plus,
  Trash2,
} from 'lucide-react';
```

- In `RepoSidebarProps`: remove the `archivedTasksByRepoId` line; add:

```ts
  onArchiveTaskClick: (taskId: string) => void;
  onOpenArchivedClick: () => void;
```

- [ ] **Step 4: Add the archive button to `TaskRow`**

Change `TaskRowProps` and `TaskRow` to accept and render an archive button (before the existing remove button):

```tsx
interface TaskRowProps {
  task: TaskRecord;
  selectedTaskId: string | undefined;
  onSelectTask: (taskId: string) => void;
  onArchiveTaskClick: (taskId: string) => void;
  onRemoveTaskClick: (taskId: string) => void;
}

function TaskRow({ task, selectedTaskId, onSelectTask, onArchiveTaskClick, onRemoveTaskClick }: TaskRowProps): JSX.Element {
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
        <span className="shrink-0 rounded-full bg-clay-600/20 px-1.5 py-0.5 text-clay-400">
          <GitPullRequest role="img" aria-label="Review" className="h-3 w-3" />
        </span>
      )}
      <button
        type="button"
        aria-label="Archive task"
        title="Archive task"
        onClick={() => onArchiveTaskClick(task.id)}
        className="shrink-0 rounded-md px-2 py-1 text-graphite-400 hover:text-clay-400"
      >
        <Archive aria-hidden="true" className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Remove task"
        onClick={() => onRemoveTaskClick(task.id)}
        className="shrink-0 rounded-md px-2 py-1 text-graphite-400 hover:text-danger-400"
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
      </button>
    </li>
  );
}
```

- [ ] **Step 5: Update the component body — destructure, toolbar button, remove archived section**

In `export function RepoSidebar({ ... })`:
- Update the destructured params: remove `archivedTasksByRepoId`, add `onArchiveTaskClick` and `onOpenArchivedClick`.
- Delete the `expandedRepoIds` state and the `toggleArchived` function.
- Add an "Archived tasks" toolbar button after the "Generate work log" button (keep the existing surrounding markup):

```tsx
        <button
          type="button"
          aria-label="Archived tasks"
          title="Archived tasks"
          onClick={onOpenArchivedClick}
          className="flex flex-1 items-center justify-center rounded-md border border-graphite-600 px-3 py-2 text-graphite-100 hover:border-clay-500 hover:text-clay-400"
        >
          <ArchiveRestore aria-hidden="true" className="h-4 w-4" />
        </button>
```

- Inside the repo `.map(...)`: delete `const archivedTasks = archivedTasksByRepoId[repo.id] ?? [];`, `const isExpanded = ...`, and the entire `{archivedTasks.length > 0 && ( ... )}` block.
- Pass `onArchiveTaskClick` to each `TaskRow`:

```tsx
                  <TaskRow
                    key={task.id}
                    task={task}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={onSelectTask}
                    onArchiveTaskClick={onArchiveTaskClick}
                    onRemoveTaskClick={onRemoveTaskClick}
                  />
```

- [ ] **Step 6: Run to verify tests pass**

Run: `npm run test:renderer -- repo-sidebar`
Expected: PASS.

- [ ] **Step 7: Update the sidebar stories**

In `src/renderer/components/repo-sidebar/repo-sidebar.stories.tsx`: remove any `archivedTasksByRepoId` arg and add `onArchiveTaskClick: () => {}` and `onOpenArchivedClick: () => {}` to the story args (and drop the `status: 'done'` sample task if it only existed to demo the removed section).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/repo-sidebar/
git commit -m "feat: add archive action and Archived toolbar button; drop inline archived section"
```

---

### Task 4: Wire archive/unarchive and the modal into `app.tsx`

**Files:**
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/app.test.tsx`

**Interfaces:**
- Consumes: `window.claudeOrchestrator.setTaskStatus` (Task 1); `ArchivedTasksModal` (Task 2); `RepoSidebar` new props (Task 3).

- [ ] **Step 1: Write the failing app test**

In `src/renderer/app.test.tsx`:
- Add `setTaskStatus: vi.fn(async () => undefined)` to the mocked `claudeOrchestrator` object (wherever the suite defines `vi.stubGlobal('claudeOrchestrator', {...})` or equivalent), alongside `removeTask`, `setTaskNotes`, etc. Import/hoist a `setTaskStatus` mock const following the existing pattern used for `generateDsuSummary`.

Add this test (assumes the suite's task list mock includes at least one active task named to match; use the existing `listTasks` mock's first task title — substitute the real title):

```tsx
it('archives a task, hides it from the sidebar, and shows it in the Archived modal', async () => {
  render(<App />);
  // The seeded active task is visible in the sidebar.
  const taskButton = await screen.findByRole('button', { name: 'Fix login bug' });
  expect(taskButton).toBeInTheDocument();

  // Archive it.
  await userEvent.click(screen.getAllByRole('button', { name: 'Archive task' })[0]!);
  expect(setTaskStatus).toHaveBeenCalledWith({ taskId: expect.any(String), status: 'done' });

  // It leaves the active sidebar list.
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Fix login bug' })).not.toBeInTheDocument(),
  );

  // Open the Archived modal and find it there.
  await userEvent.click(screen.getByRole('button', { name: 'Archived tasks' }));
  const dialog = await screen.findByRole('dialog', { name: 'Archived tasks' });
  expect(within(dialog).getByRole('button', { name: 'Fix login bug' })).toBeInTheDocument();
});
```

> Ensure `within` and `waitFor` are imported from `@testing-library/react` at the top of the test file (add if missing). Use the real seeded task title from the suite's `listTasks` mock in place of `'Fix login bug'`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:renderer -- app`
Expected: FAIL — no `Archive task` button / `setTaskStatus` undefined.

- [ ] **Step 3: Import the modal and add state**

In `src/renderer/app.tsx`:
- Add the import: `import { ArchivedTasksModal } from './components/archived-tasks-modal/archived-tasks-modal';`
- Add state near the other modal flags: `const [isArchivedModalOpen, setIsArchivedModalOpen] = useState(false);`

- [ ] **Step 4: Add the handlers**

Add near `handleRemoveTask`:

```tsx
  async function handleArchiveTask(taskId: string): Promise<void> {
    try {
      await window.claudeOrchestrator.setTaskStatus({ taskId, status: 'done' });
      setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status: 'done' } : task)));
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }

  async function handleUnarchiveTask(taskId: string): Promise<void> {
    try {
      await window.claudeOrchestrator.setTaskStatus({ taskId, status: 'todo' });
      setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status: 'todo' } : task)));
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }
```

- [ ] **Step 5: Update the `RepoSidebar` props and render the modal**

In the `<RepoSidebar ... />` element: remove `archivedTasksByRepoId={archivedTasksByRepoId}`, and add:

```tsx
          onArchiveTaskClick={(taskId) => void handleArchiveTask(taskId)}
          onOpenArchivedClick={() => setIsArchivedModalOpen(true)}
```

Then add the modal alongside the other modals (e.g. after `<DsuSummaryModal ... />`):

```tsx
        <ArchivedTasksModal
          isOpen={isArchivedModalOpen}
          repos={repos}
          archivedTasksByRepoId={archivedTasksByRepoId}
          onSelectTask={(taskId) => {
            void handleSelectTask(taskId);
            setIsArchivedModalOpen(false);
          }}
          onUnarchive={(taskId) => void handleUnarchiveTask(taskId)}
          onClose={() => setIsArchivedModalOpen(false)}
        />
```

(`archivedTasksByRepoId` is already computed in `app.tsx`; it is now consumed by the modal instead of the sidebar.)

- [ ] **Step 6: Run the app test to verify it passes**

Run: `npm run test:renderer -- app`
Expected: PASS.

- [ ] **Step 7: Full typecheck + suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all suites PASS. (If the renderer suite flakes with a worker timeout, re-run `npm run test:renderer` alone — it is heavy.)

- [ ] **Step 8: Commit**

```bash
git add src/renderer/app.tsx src/renderer/app.test.tsx
git commit -m "feat: wire archive/unarchive actions and Archived modal into app"
```

---

## Self-Review

**Spec coverage:**
- Archive action on task row → Task 3 (TaskRow archive button) + Task 4 (handler). ✓
- Top-bar Archived icon → Task 3 (toolbar button) + Task 4 (opens modal). ✓
- Archived modal: grouped list, filter, open-on-click, unarchive, empty/no-match → Task 2. ✓
- Remove inline per-repo archived section → Task 3. ✓
- Persistence via frontmatter status → Task 1. ✓
- Reuse `status: 'done'` (Approach A) → Task 1 handler + Task 4 handlers set `'done'`/`'todo'`; sidebar split unchanged. ✓
- Error handling via top banner → Task 4 handlers use `setErrorMessage`. ✓
- Testing (main handler, preload, modal, sidebar, app) → Tasks 1–4. ✓

**Placeholder scan:** No TBD/placeholder steps; all code blocks concrete. The few "match the suite's existing fixture/mock name" notes are unavoidable adaptations to existing large test files, each with the exact pattern to follow.

**Type consistency:** `TaskSetStatusRequest { taskId, status }` used identically in shared type, handler, preload, and `setTaskStatus` calls. `onArchiveTaskClick`/`onOpenArchivedClick` names consistent across sidebar props, TaskRow, and app wiring. `ArchivedTasksModalProps` fields match the render call in Task 4.
