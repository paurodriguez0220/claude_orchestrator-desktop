# Task: Tab indicator when Claude finishes responding

**Status:** Defined

## Goal

Show a small indicator on a background tab when Claude finishes its current turn and is idle, waiting for input — so you can work in one tab while a long-running task finishes in another, without needing to keep switching over to check.

## Context

Today, switching away from a tab gives no signal about what's happening in it — you have to manually switch back to check whether Claude is still working or has finished and is waiting. This reuses the JSONL transcript-reading infrastructure already built for the transcript-export feature (`docs/tasks/defined/task-transcript-export.md`): `transcript-service.ts`'s `findLatestTranscriptFile(cwd)` locates a task's Claude Code CLI transcript, and each transcript line already carries a `stop_reason` field on assistant turns — `"tool_use"` while Claude is still actively working (about to call a tool and continue), and `"end_turn"` (or similar) once it's actually finished and waiting for the next human message.

**This depends on the same undocumented internal file format flagged as a risk in the transcript-export feature.** Treated the same way: best-effort, silently skip on anything unexpected rather than surfacing an error.

## Proposed Design

### Detection

A new, faster-polling check in the main process — separate from the existing 5-minute transcript-export scheduler — runs every 5 seconds. "Open as a tab" and "has a currently-alive PTY session" are already the same thing in this app's architecture (a session is spawned when a tab opens and killed when it closes), so this reuses `pty-manager.ts`'s existing `listAliveSessions()` — the exact same source the transcript-export scheduler already uses — with no new plumbing needed to know which tasks to watch. Each tick, for every alive session, it reads that task's latest transcript file and inspects the last relevant line:
- If the last `user`/`assistant` entry is an `assistant` message whose `stop_reason` is `"end_turn"` (not `"tool_use"`), and no later `user` entry follows it in the file → the task is "finished, waiting for input."
- Otherwise (still mid-turn, no transcript yet, or any read/parse failure) → not finished. Failures are silent, matching the transcript-export feature's best-effort convention.

### Delivery to the renderer

Whenever a task's finished-state changes (false → true or true → false), the main process pushes an event to the renderer — the same push pattern already used for `PtyOutput` — rather than the renderer polling for it.

### Visual indicator

A small clay-colored dot appears next to a tab's title in `TabBar`, only when that tab is **not** the currently active one (the active tab doesn't need a badge — you're already looking at it). It does not change the tab's background or text color, keeping the existing active/inactive tab styles as the only two color states.

### Clearing

Switching to that tab (making it `activeTaskId`) clears its indicator immediately — the same moment you'd actually see Claude's response.

## Non-Goals

- No sound/desktop notification — visual tab indicator only, for v1.
- No indicator on the currently active tab.
- No optimized tail-only reads of large transcript files for v1 — each check reads the whole file, same as the transcript-export feature already does, just far more often (every 5s vs. every 5min). Acceptable for a single-user tool with a handful of open tabs; flagged as a future optimization if transcript files grow large enough to make this noticeably slow.
- No changes to the transcript-export feature itself — this reuses its file-locating logic but is otherwise a separate, independent poller.

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clay-colored dot appears on a background tab within ~5 seconds of Claude finishing its turn in that task, and clears the moment you switch to it.

**Architecture:** A new function in `transcript-service.ts` reads a transcript file's entries and determines whether the last turn is a finished (not mid-tool-use) assistant turn. A new poller, driven by a `setInterval` separate from the existing export scheduler, runs this check every 5 seconds for whichever tasks the renderer currently has open, and broadcasts a `TaskFinishedStateChanged` event whenever a task's state flips. `App` tracks open tasks needing attention and clears an entry when that tab becomes active; `TabBar` renders the dot.

**Tech Stack:** Same as the rest of the project — TypeScript strict, React 18, Tailwind CSS tokens, Node.js `fs/promises`, Vitest + React Testing Library, Electron IPC.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one component per file, `JSX.Element` return types.
- Every read of the external JSONL transcript format is best-effort: missing files, missing directories, and unparseable lines are skipped/treated as "not finished," never thrown — must not surface as a UI error banner or crash the poller.
- Styling uses Tailwind CSS v4 tokens (`graphite-*`, `clay-*`, `danger-*`) — no arbitrary hex values.
- The poller only watches tasks with a currently-alive PTY session (`pty-manager.ts`'s `listAliveSessions()`), never every task in the store.

---

### Task 1: Detect a task's finished state and poll for changes

**Files:**
- Modify: `src/main/services/transcript-service.ts`
- Modify: `src/main/services/transcript-service.test.ts`
- Create: `src/main/services/finished-state-poller.ts`
- Test: `src/main/services/finished-state-poller.test.ts`

**Interfaces:**
- Produces: `isTaskFinished(cwd: string): Promise<boolean>` — a new named export of `transcript-service.ts`, alongside the existing `encodeProjectDirName`, `findLatestTranscriptFile`, `parseTranscriptToMarkdown`, `exportTranscript`, `startTranscriptExportScheduler`.
- Produces: `startFinishedStatePoller(intervalMs: number, onFinishedStateChanged: (taskId: string, finished: boolean) => void): void` — a named export of the new `finished-state-poller.ts`.
- Consumes: `findLatestTranscriptFile` (same file, internal) inside `isTaskFinished`; `listAliveSessions` from `./pty-manager` and `isTaskFinished` from `./transcript-service` inside `startFinishedStatePoller`.

- [ ] **Step 1: Add the failing tests for `isTaskFinished`**

In `src/main/services/transcript-service.test.ts`, add `isTaskFinished` to the existing import line from `./transcript-service`:

```ts
import {
  encodeProjectDirName,
  findLatestTranscriptFile,
  parseTranscriptToMarkdown,
  exportTranscript,
  startTranscriptExportScheduler,
  isTaskFinished,
} from './transcript-service';
```

Then add this new `describe` block right after the existing `describe('exportTranscript', ...)` block and before `describe('startTranscriptExportScheduler', ...)`:

```ts
  describe('isTaskFinished', () => {
    it('returns false when no transcript file is found', async () => {
      readdirMock.mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'ENOENT' }));
      expect(await isTaskFinished('C:\\repo-worktrees\\slug')).toBe(false);
    });

    it('returns true when the last relevant entry is an assistant turn with stop_reason "end_turn"', async () => {
      readdirMock.mockResolvedValueOnce(['session.jsonl']);
      statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
      readFileMock.mockResolvedValueOnce(
        [
          JSON.stringify({ type: 'user', message: { role: 'user', content: 'can you check this branch' } }),
          JSON.stringify({
            type: 'assistant',
            message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] },
          }),
        ].join('\n'),
      );
      expect(await isTaskFinished('C:\\repo-worktrees\\slug')).toBe(true);
    });

    it('returns false when the last relevant entry is an assistant turn still using a tool (stop_reason "tool_use")', async () => {
      readdirMock.mockResolvedValueOnce(['session.jsonl']);
      statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
      readFileMock.mockResolvedValueOnce(
        JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            stop_reason: 'tool_use',
            content: [{ type: 'tool_use', name: 'Read', input: {} }],
          },
        }),
      );
      expect(await isTaskFinished('C:\\repo-worktrees\\slug')).toBe(false);
    });

    it('returns false when the last relevant entry is a user turn (Claude has not responded yet)', async () => {
      readdirMock.mockResolvedValueOnce(['session.jsonl']);
      statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
      readFileMock.mockResolvedValueOnce(
        [
          JSON.stringify({
            type: 'assistant',
            message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] },
          }),
          JSON.stringify({ type: 'user', message: { role: 'user', content: 'one more thing' } }),
        ].join('\n'),
      );
      expect(await isTaskFinished('C:\\repo-worktrees\\slug')).toBe(false);
    });

    it('ignores non-turn entries (e.g. "summary") when finding the last relevant turn', async () => {
      readdirMock.mockResolvedValueOnce(['session.jsonl']);
      statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
      readFileMock.mockResolvedValueOnce(
        [
          JSON.stringify({
            type: 'assistant',
            message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] },
          }),
          JSON.stringify({ type: 'summary', summary: 'Fixed the login bug' }),
        ].join('\n'),
      );
      expect(await isTaskFinished('C:\\repo-worktrees\\slug')).toBe(true);
    });

    it('returns false without throwing when a line is not valid JSON', async () => {
      readdirMock.mockResolvedValueOnce(['session.jsonl']);
      statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
      readFileMock.mockResolvedValueOnce('not json at all');
      expect(await isTaskFinished('C:\\repo-worktrees\\slug')).toBe(false);
    });

    it('returns false without throwing when reading the transcript file fails', async () => {
      readdirMock.mockResolvedValueOnce(['session.jsonl']);
      statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
      readFileMock.mockRejectedValueOnce(new Error('EBUSY: file locked'));
      expect(await isTaskFinished('C:\\repo-worktrees\\slug')).toBe(false);
    });
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm run test:main -- transcript-service`
Expected: existing tests pass; the 7 new tests fail — `isTaskFinished` is not exported yet

- [ ] **Step 3: Implement `isTaskFinished`**

Add this to `src/main/services/transcript-service.ts`, right after the existing `exportTranscript` function (before `startTranscriptExportScheduler`):

```ts
interface TranscriptTurnEntry {
  type: 'user' | 'assistant';
  message: { stop_reason?: string };
}

function isTurnEntry(entry: unknown): entry is TranscriptTurnEntry {
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }
  const candidate = entry as { type?: unknown; message?: unknown };
  return (
    (candidate.type === 'user' || candidate.type === 'assistant') &&
    typeof candidate.message === 'object' &&
    candidate.message !== null
  );
}

export async function isTaskFinished(cwd: string): Promise<boolean> {
  try {
    const transcriptFile = await findLatestTranscriptFile(cwd);
    if (transcriptFile === undefined) {
      return false;
    }
    const raw = await readFile(transcriptFile, 'utf-8');
    let lastTurn: TranscriptTurnEntry | undefined;
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') {
        continue;
      }
      let entry: unknown;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (isTurnEntry(entry)) {
        lastTurn = entry;
      }
    }
    return lastTurn?.type === 'assistant' && lastTurn.message.stop_reason === 'end_turn';
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- transcript-service`
Expected: PASS (all tests)

- [ ] **Step 5: Write the failing tests for the poller**

Create `src/main/services/finished-state-poller.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listAliveSessionsMock = vi.fn();
const isTaskFinishedMock = vi.fn();

vi.mock('./pty-manager', () => ({
  listAliveSessions: (...args: unknown[]) => listAliveSessionsMock(...args),
}));

vi.mock('./transcript-service', () => ({
  isTaskFinished: (...args: unknown[]) => isTaskFinishedMock(...args),
}));

import { startFinishedStatePoller } from './finished-state-poller';

describe('finished-state-poller', () => {
  beforeEach(() => {
    listAliveSessionsMock.mockReset();
    isTaskFinishedMock.mockReset();
  });

  it('calls the listener when a task flips from not-finished to finished', async () => {
    vi.useFakeTimers();
    try {
      listAliveSessionsMock.mockReturnValue([{ taskId: 'task-1', cwd: 'C:\\repo-worktrees\\slug1' }]);
      isTaskFinishedMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const onChange = vi.fn();

      startFinishedStatePoller(5000, onChange);
      await vi.advanceTimersByTimeAsync(5000);
      expect(onChange).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5000);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('task-1', true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not call the listener again while the state stays the same across ticks', async () => {
    vi.useFakeTimers();
    try {
      listAliveSessionsMock.mockReturnValue([{ taskId: 'task-1', cwd: 'C:\\repo-worktrees\\slug1' }]);
      isTaskFinishedMock.mockResolvedValue(true);
      const onChange = vi.fn();

      startFinishedStatePoller(5000, onChange);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('task-1', true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls the listener again when a finished task goes back to not-finished', async () => {
    vi.useFakeTimers();
    try {
      listAliveSessionsMock.mockReturnValue([{ taskId: 'task-1', cwd: 'C:\\repo-worktrees\\slug1' }]);
      isTaskFinishedMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const onChange = vi.fn();

      startFinishedStatePoller(5000, onChange);
      await vi.advanceTimersByTimeAsync(5000);
      expect(onChange).toHaveBeenNthCalledWith(1, 'task-1', true);

      await vi.advanceTimersByTimeAsync(5000);
      expect(onChange).toHaveBeenNthCalledWith(2, 'task-1', false);
      expect(onChange).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a rejected finished-state check as "not finished" instead of throwing or crashing the poller', async () => {
    vi.useFakeTimers();
    try {
      listAliveSessionsMock.mockReturnValue([{ taskId: 'task-1', cwd: 'C:\\repo-worktrees\\slug1' }]);
      isTaskFinishedMock.mockRejectedValue(new Error('unexpected transcript shape'));
      const onChange = vi.fn();

      startFinishedStatePoller(5000, onChange);
      await vi.advanceTimersByTimeAsync(5000);

      expect(onChange).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('only checks tasks that currently have an alive PTY session', async () => {
    vi.useFakeTimers();
    try {
      listAliveSessionsMock.mockReturnValue([]);
      const onChange = vi.fn();

      startFinishedStatePoller(5000, onChange);
      await vi.advanceTimersByTimeAsync(5000);

      expect(isTaskFinishedMock).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test:main -- finished-state-poller`
Expected: FAIL — cannot find module `./finished-state-poller` (file doesn't exist yet)

- [ ] **Step 7: Implement the poller**

Create `src/main/services/finished-state-poller.ts`:

```ts
import { listAliveSessions } from './pty-manager';
import { isTaskFinished } from './transcript-service';

type FinishedStateChangeListener = (taskId: string, finished: boolean) => void;

export function startFinishedStatePoller(intervalMs: number, onFinishedStateChanged: FinishedStateChangeListener): void {
  const knownFinishedState = new Map<string, boolean>();

  setInterval(() => {
    const aliveTaskIds = new Set<string>();

    for (const { taskId, cwd } of listAliveSessions()) {
      aliveTaskIds.add(taskId);
      void isTaskFinished(cwd)
        .catch(() => false)
        .then((finished) => {
          const previous = knownFinishedState.get(taskId) ?? false;
          if (previous !== finished) {
            knownFinishedState.set(taskId, finished);
            onFinishedStateChanged(taskId, finished);
          }
        });
    }

    for (const taskId of knownFinishedState.keys()) {
      if (!aliveTaskIds.has(taskId)) {
        knownFinishedState.delete(taskId);
      }
    }
  }, intervalMs);
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run test:main -- finished-state-poller`
Expected: PASS (all tests)

- [ ] **Step 9: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests pass

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add src/main/services/transcript-service.ts src/main/services/transcript-service.test.ts src/main/services/finished-state-poller.ts src/main/services/finished-state-poller.test.ts
git commit -m "feat: detect a task's finished state and poll for changes every 5 seconds"
```

---

### Task 2: `TaskFinishedStateChanged` IPC channel, preload exposure, and main wiring

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.test.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Produces: `IpcChannels.TaskFinishedStateChanged = 'task:finished-state-changed'` and `TaskFinishedStateChangedEvent { taskId: string; finished: boolean }` — new named exports of `ipc-channels.ts`, alongside the existing `PtyOutput`/`PtyOutputEvent`.
- Produces: `onTaskFinishedStateChanged(listener: (event: TaskFinishedStateChangedEvent) => void): () => void` — a new method on `ClaudeOrchestratorApi` and the exposed `claudeOrchestrator` global, mirroring `onPtyOutput` exactly (subscribe via `ipcRenderer.on`, return an unsubscribe function that calls `ipcRenderer.removeListener` with the same handler reference).
- Consumes: `startFinishedStatePoller` from `./services/finished-state-poller` (Task 1), wired into `main/index.ts`'s `app.whenReady()` alongside the existing `startTranscriptExportScheduler` call.

- [ ] **Step 1: Add the failing preload tests**

In `src/preload/index.test.ts`, add these two tests inside the existing `describe('preload', ...)` block, right after the two existing `onPtyOutput` tests:

```ts
  it('onTaskFinishedStateChanged registers a listener on the task:finished-state-changed channel', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    const listener = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api.onTaskFinishedStateChanged as any)(listener);
    expect(ipcRendererOn).toHaveBeenCalledWith('task:finished-state-changed', expect.any(Function));
  });

  it('onTaskFinishedStateChanged returns an unsubscribe function that removes the same listener', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    const listener = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribe = (api.onTaskFinishedStateChanged as any)(listener) as () => void;
    expect(typeof unsubscribe).toBe('function');

    const registeredHandler = ipcRendererOn.mock.calls[ipcRendererOn.mock.calls.length - 1]?.[1];

    unsubscribe();

    expect(ipcRendererRemoveListener).toHaveBeenCalledWith('task:finished-state-changed', registeredHandler);
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm run test:main -- preload`
Expected: existing tests pass; the 2 new tests fail — `onTaskFinishedStateChanged` is not exposed on the API yet

- [ ] **Step 3: Add the channel and event type**

In `src/shared/ipc-channels.ts`, add the channel constant right after `PtyResize`:

```ts
  PtyResize: 'pty:resize',
  TaskFinishedStateChanged: 'task:finished-state-changed',
  DialogSelectFolder: 'dialog:select-folder',
```

Add the event interface right after the existing `PtyOutputEvent` interface:

```ts
export interface PtyOutputEvent {
  taskId: string;
  data: string;
}

export interface TaskFinishedStateChangedEvent {
  taskId: string;
  finished: boolean;
}
```

- [ ] **Step 4: Expose it on the preload API**

In `src/preload/index.ts`, add `TaskFinishedStateChangedEvent` to the existing type import from `../shared/ipc-channels`:

```ts
import type {
  TaskCreateRequest,
  TaskNotesSetRequest,
  TaskNotesGetResponse,
  PtyOutputEvent,
  TaskFinishedStateChangedEvent,
  BranchOption,
} from '../shared/ipc-channels';
```

Add the method to the `ClaudeOrchestratorApi` interface, right after `onPtyOutput`:

```ts
  onPtyOutput(listener: (event: PtyOutputEvent) => void): () => void;
  onTaskFinishedStateChanged(listener: (event: TaskFinishedStateChangedEvent) => void): () => void;
```

Add the implementation to the `api` object, right after `onPtyOutput`'s implementation:

```ts
  onPtyOutput: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: PtyOutputEvent): void => listener(payload);
    ipcRenderer.on(IpcChannels.PtyOutput, handler);
    return () => ipcRenderer.removeListener(IpcChannels.PtyOutput, handler);
  },
  onTaskFinishedStateChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: TaskFinishedStateChangedEvent): void =>
      listener(payload);
    ipcRenderer.on(IpcChannels.TaskFinishedStateChanged, handler);
    return () => ipcRenderer.removeListener(IpcChannels.TaskFinishedStateChanged, handler);
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:main -- preload`
Expected: PASS (all tests)

- [ ] **Step 6: Wire the poller into main-process startup**

In `src/main/index.ts`, add the import alongside the existing ones:

```ts
import { startTranscriptExportScheduler } from './services/transcript-service';
import { startFinishedStatePoller } from './services/finished-state-poller';
```

Add a broadcast function right after `broadcastPtyData`:

```ts
function broadcastPtyData(taskId: string, data: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.PtyOutput, { taskId, data });
  }
}

function broadcastFinishedState(taskId: string, finished: boolean): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.TaskFinishedStateChanged, { taskId, finished });
  }
}
```

Call it inside `app.whenReady().then(() => { ... })`, right after `startTranscriptExportScheduler(5 * 60 * 1000);`:

```ts
  startTranscriptExportScheduler(5 * 60 * 1000);
  startFinishedStatePoller(5000, broadcastFinishedState);
```

`src/main/index.ts` has no test file today (consistent with the existing convention noted in the transcript-export feature's scheduler-wiring task); this wiring is verified via the manual smoke test in Step 8 instead.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests pass

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 8: Add a manual smoke-test step**

Add a new step to `docs/runbooks/manual-smoke-test.md` (append after the last existing numbered step, incrementing the number to 19):

```
19. Open a task and let Claude finish responding to a message, then switch to a different open tab without touching the first one again. Within ~5 seconds, confirm a small clay-colored dot appears next to the first task's title in the tab bar. Click back on that tab — confirm the dot disappears immediately.
```

- [ ] **Step 9: Commit**

```bash
git add src/shared/ipc-channels.ts src/preload/index.ts src/preload/index.test.ts src/main/index.ts docs/runbooks/manual-smoke-test.md
git commit -m "feat: push TaskFinishedStateChanged events from main to renderer and start the poller"
```

---

### Task 3: `TabBar` finished-state dot

**Files:**
- Modify: `src/renderer/components/tab-bar/tab-bar.tsx`
- Modify: `src/renderer/components/tab-bar/tab-bar.test.tsx`
- Modify: `src/renderer/components/tab-bar/tab-bar.stories.tsx`

**Interfaces:**
- Produces: `TabBarProps` gains a new required field `finishedTaskIds: string[]`. `TabBarTab` is unchanged.

- [ ] **Step 1: Update existing tests to pass the new required prop**

`finishedTaskIds` is a new required prop, so every existing `render(<TabBar ... />)` call in `src/renderer/components/tab-bar/tab-bar.test.tsx` needs `finishedTaskIds={[]}` added. The first one becomes:

```tsx
  it('renders a button per open task, marking the active one pressed', () => {
    render(
      <TabBar
        tabs={[
          { taskId: 'task-1', title: 'Fix login bug' },
          { taskId: 'task-2', title: 'Add tests' },
        ]}
        activeTaskId="task-2"
        finishedTaskIds={[]}
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Fix login bug' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Add tests' })).toHaveAttribute('aria-pressed', 'true');
  });
```

Do the same (`finishedTaskIds={[]}`) for the other 2 existing `render(<TabBar ... />)` calls in that file, keeping every other prop/assertion unchanged.

- [ ] **Step 2: Write the new failing tests**

Append these two tests inside the existing `describe('TabBar', ...)` block:

```tsx
  it('shows a finished dot on a non-active tab whose taskId is in finishedTaskIds', () => {
    render(
      <TabBar
        tabs={[
          { taskId: 'task-1', title: 'Fix login bug' },
          { taskId: 'task-2', title: 'Add tests' },
        ]}
        activeTaskId="task-2"
        finishedTaskIds={['task-1']}
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );
    expect(screen.getByRole('status', { name: 'Fix login bug finished' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Add tests finished' })).not.toBeInTheDocument();
  });

  it('does not show a finished dot on the active tab even if its taskId is in finishedTaskIds', () => {
    render(
      <TabBar
        tabs={[{ taskId: 'task-1', title: 'Fix login bug' }]}
        activeTaskId="task-1"
        finishedTaskIds={['task-1']}
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );
    expect(screen.queryByRole('status', { name: 'Fix login bug finished' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run tests to verify the existing ones pass (with the prop added) and the 2 new ones fail**

Run: `npm run test:renderer -- tab-bar`
Expected: 3 pass; the 2 new tests fail — no dot is rendered yet

- [ ] **Step 4: Implement**

Replace the full contents of `src/renderer/components/tab-bar/tab-bar.tsx` with:

```tsx
export interface TabBarTab {
  taskId: string;
  title: string;
}

export interface TabBarProps {
  tabs: TabBarTab[];
  activeTaskId: string | undefined;
  finishedTaskIds: string[];
  onSelectTab: (taskId: string) => void;
  onCloseTab: (taskId: string) => void;
}

export function TabBar({ tabs, activeTaskId, finishedTaskIds, onSelectTab, onCloseTab }: TabBarProps): JSX.Element {
  return (
    <div className="flex shrink-0 gap-1 border-b border-graphite-700 bg-graphite-800 px-2 pt-2">
      {tabs.map((tab) => {
        const isActive = tab.taskId === activeTaskId;
        const isFinished = !isActive && finishedTaskIds.includes(tab.taskId);
        return (
          <div key={tab.taskId} className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectTab(tab.taskId)}
              className={
                isActive
                  ? 'max-w-40 truncate rounded-t-md bg-graphite-900 px-3 py-2 text-sm font-medium text-clay-400'
                  : 'max-w-40 truncate rounded-t-md px-3 py-2 text-sm text-graphite-400 hover:text-graphite-100'
              }
            >
              {tab.title}
            </button>
            {isFinished && (
              <span
                role="status"
                aria-label={`${tab.title} finished`}
                className="h-2 w-2 shrink-0 rounded-full bg-clay-500"
              />
            )}
            <button
              type="button"
              onClick={() => onCloseTab(tab.taskId)}
              aria-label={`Close ${tab.title}`}
              className="rounded px-1 text-xs text-graphite-400 hover:bg-graphite-700 hover:text-graphite-100"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm run test:renderer -- tab-bar`
Expected: PASS (5 tests)

- [ ] **Step 6: Update the Storybook story**

Replace the full contents of `src/renderer/components/tab-bar/tab-bar.stories.tsx` with:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { TabBar } from './tab-bar';

const meta: Meta<typeof TabBar> = {
  component: TabBar,
  title: 'Components/TabBar',
  args: { finishedTaskIds: [], onSelectTab: fn(), onCloseTab: fn() },
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

export const BackgroundTabFinished: Story = {
  args: {
    tabs: [
      { taskId: 'task-1', title: 'Fix login bug' },
      { taskId: 'task-2', title: 'Add tests' },
    ],
    activeTaskId: 'task-2',
    finishedTaskIds: ['task-1'],
  },
};
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/tab-bar
git commit -m "feat: show a finished-state dot on background TabBar tabs"
```

---

### Task 4: Wire finished-state tracking into `App`

**Files:**
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/app.test.tsx`

**Interfaces:**
- Consumes: `onTaskFinishedStateChanged` from `window.claudeOrchestrator` (Task 2); `TabBar`'s `finishedTaskIds` prop (Task 3).
- Produces: no new exports — this task only changes `App`'s internal state and rendering.

This task depends on Task 2 (preload exposure) and Task 3 (`TabBar` prop) being in place first — it calls the former and passes into the latter.

- [ ] **Step 1: Add the stub to the existing test setup**

In `src/renderer/app.test.tsx`, add `onTaskFinishedStateChanged: vi.fn(() => vi.fn())` to the `vi.stubGlobal('claudeOrchestrator', { ... })` call inside the existing `beforeEach`, right after `onPtyOutput`:

```tsx
beforeEach(() => {
  vi.clearAllMocks();
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
    fetchRepo,
    getTaskNotes,
    setTaskNotes,
    sendPtyInput: vi.fn(),
    resizePty: vi.fn(),
    onPtyOutput: vi.fn(() => vi.fn()),
    onTaskFinishedStateChanged: vi.fn(() => vi.fn()),
  });
});
```

This keeps every existing test passing once `App` calls `window.claudeOrchestrator.onTaskFinishedStateChanged` on mount.

- [ ] **Step 2: Write the new failing test**

Append this test inside the existing `describe('App', ...)` block:

```tsx
  it('shows a finished dot on a background tab when the main process reports it finished, and clears it when that tab becomes active', async () => {
    let finishedListener: ((event: { taskId: string; finished: boolean }) => void) | undefined;
    const onTaskFinishedStateChanged = vi.fn(
      (listener: (event: { taskId: string; finished: boolean }) => void) => {
        finishedListener = listener;
        return vi.fn();
      },
    );
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
      fetchRepo,
      getTaskNotes,
      setTaskNotes,
      sendPtyInput: vi.fn(),
      resizePty: vi.fn(),
      onPtyOutput: vi.fn(() => vi.fn()),
      onTaskFinishedStateChanged,
    });

    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add tests' }));

    expect(finishedListener).toBeDefined();
    finishedListener?.({ taskId: 'task-1', finished: true });

    expect(await screen.findByRole('status', { name: 'Fix login bug finished' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Fix login bug' }));
    expect(screen.queryByRole('status', { name: 'Fix login bug finished' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:renderer -- app`
Expected: existing tests pass; the new test fails — `finishedListener` stays `undefined` (`App` never calls `onTaskFinishedStateChanged`), or the dot never appears

- [ ] **Step 4: Implement**

In `src/renderer/app.tsx`, add the new state hook right after the existing `loadingTaskId` state:

```tsx
  const [loadingTaskId, setLoadingTaskId] = useState<string | undefined>();
  const [finishedTaskIds, setFinishedTaskIds] = useState<string[]>([]);
```

Add a new `useEffect` right after the existing one that loads repos/tasks on mount:

```tsx
  useEffect(() => {
    void window.claudeOrchestrator.listRepos().then(setRepos);
    void window.claudeOrchestrator.listTasks().then(setTasks);
  }, []);

  useEffect(() => {
    return window.claudeOrchestrator.onTaskFinishedStateChanged(({ taskId, finished }) => {
      setFinishedTaskIds((current) => {
        if (finished) {
          return current.includes(taskId) ? current : [...current, taskId];
        }
        return current.filter((id) => id !== taskId);
      });
    });
  }, []);
```

In `handleSelectTask`, clear the task's finished flag the moment it becomes active:

```tsx
      setActiveTaskId(taskId);
      setFinishedTaskIds((current) => current.filter((id) => id !== taskId));
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }
```

Pass the new state down to `TabBar`:

```tsx
          <TabBar
            tabs={openTaskIds.map((id) => ({
              taskId: id,
              title: tasks.find((task) => task.id === id)?.title ?? '',
            }))}
            activeTaskId={activeTaskId}
            finishedTaskIds={finishedTaskIds}
            onSelectTab={(taskId) => void handleSelectTask(taskId)}
            onCloseTab={(taskId) => void handleCloseTab(taskId)}
          />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:renderer -- app`
Expected: PASS (all tests)

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests pass

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/renderer/app.tsx src/renderer/app.test.tsx
git commit -m "feat: track and clear per-task finished state in App"
```
