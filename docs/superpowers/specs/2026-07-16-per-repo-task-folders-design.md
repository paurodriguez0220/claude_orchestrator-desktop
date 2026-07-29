# Per-repo task folders

**Date:** 2026-07-16
**Status:** Approved (design)

## Problem

The sidebar lists each repo's active tasks (worktrees) in a single flat list. With many
tasks per repo there is no way to organise them by what they are (a feature area, an epic,
a bug batch). Paulo wants to create named folders per repo and drag tasks into them.

## Goal

Let the user create named, per-repo folders and assign a repo's worktree/review tasks into
them by drag-and-drop, as pure UI organisation. No effect on git or the worktree on disk.

## Non-goals

- No global/cross-repo folders — folders belong to a single repo.
- No nested folders (flat only).
- No automatic grouping by attribute (kind/status/ADO) — manual only.
- Quick Questions (scratch tasks) are unaffected.
- No manual reordering of tasks or folders — drag-and-drop is assign-only.
- Folders never move a worktree or run any git command.

## Data model

- `RepoRecord.folders?: { id: string; name: string }[]` — ordered per-repo folder list.
- `TaskRecord.folderId?: string` — the folder a task belongs to, or undefined (ungrouped).

A task carries its own `folderId`, so a folder's membership is derived, not stored twice.
Removing a task or deleting a folder needs no cross-syncing.

## Behaviour

- A repo with no folders looks exactly as it does today.
- **Ungrouped** tasks render directly under the repo (current behaviour).
- Folders render as collapsible sub-sections (▸/▾) above the ungrouped tasks, each showing
  its name and task count.
- Deleting a folder **keeps** its tasks — they move to ungrouped (their `folderId` is
  cleared). Worktrees are never touched.
- A task belongs to at most one folder.

## UI (RepoSidebar)

- A **"New folder"** icon button in the repo header row, alongside the existing update-base
  toggle / Review / New Task icons (icon-first).
- Each folder row: collapse toggle, name, task count, and small rename / delete icons.
- **Drag-and-drop** (native HTML5, no new dependency):
  - Task rows are `draggable`; on drag start the dragged task id is held in component state
    (a ref), not `dataTransfer`, so the behaviour is testable under jsdom.
  - Dropping a task on a folder calls `onAssignTaskToFolder(taskId, folderId)`.
  - Dropping a task on the repo's ungrouped area calls `onAssignTaskToFolder(taskId, null)`.
- All new callbacks are optional props (following the existing `onOpenTaskInEditorClick` /
  `onToggleUpdateBase` pattern), so existing tests/stories are unaffected until wired.

## IPC / persistence

New channels, each mutating `store.json` and returning the updated `RepoRecord` (folder ops)
or `void` (task assign), matching the existing handler style:

- `repo:folder:create` — `{ repoId, name }` → creates a folder with a generated id.
- `repo:folder:rename` — `{ repoId, folderId, name }`.
- `repo:folder:delete` — `{ repoId, folderId }` → clears `folderId` on that repo's tasks
  that referenced it.
- `task:set-folder` — `{ taskId, folderId?: string }` → assign (or clear when omitted).

Preload facade methods: `createRepoFolder`, `renameRepoFolder`, `deleteRepoFolder`,
`setTaskFolder`. Unknown repo/task/folder ids throw, as other handlers do.

## Affected code

- `src/shared/types.ts` — `folders` on `RepoRecord`, `folderId` on `TaskRecord`.
- `src/shared/ipc-channels.ts` — four channels + request interfaces.
- `src/main/ipc/repo-handlers.ts` — folder create/rename/delete handlers.
- `src/main/ipc/task-handlers.ts` — `task:set-folder` handler.
- `src/preload/index.ts` — four facade methods.
- `src/renderer/components/repo-sidebar/repo-sidebar.tsx` — folder rendering, new-folder
  button, rename/delete, drag-and-drop.
- `src/renderer/app.tsx` — folder/assign handlers + optimistic state updates.

## Testing

- `repo-handlers`: create adds a folder with an id; rename updates the name; delete removes
  the folder and clears `folderId` on its tasks; unknown ids throw.
- `task-handlers`: `task:set-folder` assigns and clears `folderId`; unknown task throws.
- `preload`: each facade method invokes its channel with the right payload.
- `RepoSidebar`: renders folders with counts; collapse toggles visibility; new-folder /
  rename / delete buttons fire their callbacks; dragging a task onto a folder fires
  `onAssignTaskToFolder(taskId, folderId)`, and onto ungrouped fires it with `null`.

## Security

No shell/git involvement. Folder names are stored data only (never interpolated into a
command), so no new command-injection surface; standard store read/write applies.
