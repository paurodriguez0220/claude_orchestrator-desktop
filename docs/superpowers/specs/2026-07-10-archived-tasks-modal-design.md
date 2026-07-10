# Archived tasks — design

**Date:** 2026-07-10
**Status:** Approved (design), pending implementation plan

## Goal

Let a task be **hidden from the sidebar without deleting anything**, and let it be **found again** through a dedicated modal that lists all archived tasks across every repo. Archiving is non-destructive and completely separate from deleting a worktree.

## Context / discovery

- Today a task's `status` (`'todo' | 'in-progress' | 'blocked' | 'done'`) is **never set from the UI**. Every task is created `'todo'` (`task-handlers.ts`), the notes panel renders `Status:` as read-only text (no control), and `setTaskNotes` only persists the body. The only way a task currently becomes `'done'` is hand-editing the notes `.md` frontmatter on disk.
- Consequently the existing per-repo "Archived (N)" collapsed section in `RepoSidebar` (which splits on `status === 'done'`) can never populate through normal use.
- **Delete** (`handleRemoveTask`) permanently removes the git worktree after a confirm. It is unchanged by this feature.

So this feature must add the **archive action itself**, a **browse/find modal**, and **unarchive** — not merely a modal.

## Data model (Approach A)

Reuse `status: 'done'` as the "archived" signal. No new field, no migration.
- **Archive** = set the task's status to `'done'`.
- **Unarchive** = set it back to `'todo'`.
- The existing `activeTasksByRepoId` / `archivedTasksByRepoId` split in `app.tsx` (keys on `status === 'done'`) continues to define active vs archived.

Rationale: status is currently vestigial (no setter, always `'todo'`), single-user tool, and the split logic already exists. Semantic overload of "done" vs "hidden" is accepted for the MVP.

## Persistence

A new IPC channel persists the status change into the task's notes frontmatter (the same `.md` file the body lives in), via `notes-service`, so archive state survives restarts.

- Channel: `task:set-status` — input `{ taskId: string; status: TaskStatus }`, reads the task's notes, rewrites frontmatter `status`, returns nothing (or the updated status).
- Renderer updates its in-memory `tasks` list optimistically after the IPC resolves (mirrors `handleRemoveTask`'s pattern).

## UI

### 1. Archive action (per active task row)
An **archive icon** button on each active task row in `RepoSidebar`, beside the existing "Remove task" trash icon. Click → calls `onArchiveTaskClick(taskId)` → `task:set-status` with `'done'`. Row disappears from the active list. If the task's tab is open, it stays open (archiving is sidebar-only). `aria-label`/`title` "Archive task".

### 2. Top-bar "Archived" icon button
A new icon button in the sidebar's top toolbar (next to Open Repo / Clone / Generate work log), lucide-react `Archive` icon, `aria-label`/`title` "Archived tasks". Opens the modal.

### 3. Archived modal (`ArchivedTasksModal`)
- Lists **all archived tasks across all repos**, grouped by repo (repo name heading, then rows). Each row shows task title + branch, in the same row style as `TaskRow` where practical.
- **Filter box** at the top: case-insensitive substring match over task title, branch name, and repo name; filters the list live. Empty query shows everything. This is the "find it again" mechanism.
- **Row click** → `onSelectTask(taskId)` (opens/selects its tab) and closes the modal.
- **Unarchive** icon per row → `task:set-status` with `'todo'`; the row leaves the archived list (restored to the sidebar's active list).
- **Empty state**: "No archived tasks." (also shown when a filter matches nothing, e.g. "No archived tasks match.").
- No delete action inside the modal — deletion stays on the normal active task row.

### 4. Sidebar cleanup
Remove the per-repo "Archived (N)" collapsed section, its toggle button, `expandedRepoIds`/`toggleArchived` state, and the `archivedTasksByRepoId` prop passed to `RepoSidebar`. Archived tasks are reachable **only** via the modal. `app.tsx` still computes the archived grouping, but passes it to the modal instead.

## Components & boundaries

- `ArchivedTasksModal` (new, `src/renderer/components/archived-tasks-modal/`) — presentational: receives `isOpen`, `archivedTasksByRepoId`, `onSelectTask`, `onUnarchive`, `onClose`; owns only its local filter string. No IPC directly.
- `RepoSidebar` — gains an `onArchiveTaskClick` per-row action and an `onOpenArchivedClick` toolbar button; loses the inline archived section and its props/state.
- `app.tsx` — adds `isArchivedModalOpen` state, `handleArchiveTask`/`handleUnarchiveTask` (call `task:set-status`, update `tasks`), renders `ArchivedTasksModal`.
- Main: `task:set-status` handler in `task-handlers.ts`; `notes-service` gains/uses a frontmatter status writer; new channel typed in `ipc-channels` and exposed on the preload facade.

## Error handling

- `task:set-status` failures surface via the existing top error banner (`setErrorMessage`), mirroring `handleRemoveTask`. The optimistic list update only applies after the IPC resolves.

## Testing

- **Main:** `task:set-status` handler persists the new status to frontmatter and leaves the body intact; rejects unknown taskId.
- **Renderer:**
  - `ArchivedTasksModal`: renders grouped rows; filter narrows by title/branch/repo; empty + no-match states; row click calls `onSelectTask` and closes; unarchive icon calls `onUnarchive`.
  - `RepoSidebar`: archive icon calls `onArchiveTaskClick`; toolbar archived button calls `onOpenArchivedClick`; inline "Archived (N)" section no longer rendered.
  - `app.tsx`: archiving a task removes it from the active list and it appears in the modal; unarchiving restores it; errors show the banner.

## Non-goals

- No change to delete/remove behavior.
- No dedicated `archived` boolean field (Approach B) — deferred.
- No per-row delete inside the modal.
- No persisted filter text or modal state across restarts.
- No keyboard shortcut to open the modal.
