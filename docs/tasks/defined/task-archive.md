# Task: Archive tasks marked done

**Status:** Defined

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

---
*Added: 2026-07-09*
*Standards: https://github.com/paurodriguez0220/standards-docs*
