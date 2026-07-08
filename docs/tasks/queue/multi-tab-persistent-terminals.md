# Task: Multi-tab persistent terminals

**Status:** Planned

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

Unchanged in behavior — still tied to whichever task is `activeTaskId`, fetched/saved the same way as today.

### Non-goals

- No limit on the number of concurrently open tabs (YAGNI for a single-user tool).
- No tab reordering/drag-and-drop.
- No change to `TerminalTab`'s internal xterm/PTY logic — this is purely about *how many* instances exist and *which one is visible*, not how any single one works.

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
