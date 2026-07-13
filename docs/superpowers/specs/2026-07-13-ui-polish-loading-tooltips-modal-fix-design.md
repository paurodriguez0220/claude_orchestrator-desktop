# UI polish: loading feedback, hover titles, archived-modal fix — design

*Date: 2026-07-13 · Status: approved, pending implementation*

## Problem

Three small UI issues degrade the feel of the app:

1. **No loading feedback** on several async actions, so the app looks hung: closing a tab,
   fetching branches (New Task / Review — the latter also runs a slow `git fetch`), removing a
   task, and adding a repo. Opening a tab already shows a "Starting session…" overlay, and the
   create/clone/question modals and DSU already show spinners — these four are the gaps.
2. **Truncated titles are unreadable in full.** Tab titles (`max-w-40 truncate`) and sidebar
   titles (`truncate`) clip long names with no way to see the whole thing.
3. **Archived-tasks modal overflows.** The filter input, Close button, and restore icons spill
   past the modal card's right edge.

## Goal

Add targeted, icon-forward loading indicators to the four actions; show the full title on hover
for tab and sidebar titles; fix the archived-modal overflow.

## Approach

**Loading:** per-action inline indicators — small busy-state in `App`, the existing `Spinner`
shown exactly where the user clicked, and the specific control disabled while in flight. This
matches existing patterns (`loadingTaskId` overlay, `isSubmittingModal` button spinners) and
prevents double-invocation (e.g. closing a tab or removing a task twice). Each busy-state is set
before its `await` and cleared in a `finally`, so failures re-enable the control and surface via
the existing error banner.

**Tooltips:** native `title` attribute on the truncated elements — consistent with the app's
existing use of `title="…"` on every icon button; no new component.

**Modal fix:** remove the width the archived modal sets on itself; let it fill the shared overlay
panel like every other modal.

## Changes

### 1. Loading feedback

**`src/renderer/app.tsx`** — add four busy-states and wire them through handlers:

- `closingTaskIds: string[]` — set/cleared around `closeTask` in `handleCloseTab`; ignore a
  repeat close for an id already closing.
- `removingTaskIds: string[]` — set/cleared around `removeTask` in `handleRemoveTask` (after the
  existing confirm dialog).
- `isLoadingBranches: boolean` — set true at the start of `handleNewTaskClick` and
  `handleReviewCodeClick`, cleared in a `finally`. The existing out-of-order guard for
  `handleNewTaskClick` (`newTaskRepoIdRef`) still gates `setBranches`.
- `isAddingRepo: boolean` — set true after a folder is chosen, around `addRepo` in
  `handleOpenRepoClick`, cleared in a `finally`.

Pass each down to the relevant component.

**`src/renderer/components/tab-bar/tab-bar.tsx`** — add `closingTaskIds: string[]`. For a tab
whose id is closing, render a `Spinner` in place of the `X` and disable the close button.

**`src/renderer/components/repo-sidebar/repo-sidebar.tsx`** — add `removingTaskIds: string[]`
and `isAddingRepo: boolean`.
- `TaskRow` (and the Quick-Question rows, which also have a remove button): when the row's id is
  in `removingTaskIds`, render a `Spinner` in place of `Trash2` and disable that row's remove and
  archive buttons.
- The "Open Existing Repo" button: when `isAddingRepo`, render a `Spinner` in place of
  `FolderOpen` and disable the button.

**`src/renderer/components/new-task-modal/new-task-modal.tsx`** — add `isLoadingBranches: boolean`.
While loading, show a small inline `Spinner` in the branch area. Disable **Create Task** during
load **only** in Review mode and "Use existing branch" mode (new-branch mode does not need
branches and stays usable).

### 2. Full-title-on-hover tooltips (native `title`)

Add `title` with the full text to:
- Tab title button (`tab-bar.tsx`) → `title={tab.title}`
- Sidebar task-row title button (`repo-sidebar.tsx`) → `title={task.title}`
- Sidebar repo-name span (`repo-sidebar.tsx`) → `title={repo.name}`
- Quick-Question row title button (`repo-sidebar.tsx`) → `title={task.title}`
- Archived-modal task button (`archived-tasks-modal.tsx`) → `title={task.title}`

### 3. Archived-modal overflow fix

**`src/renderer/components/archived-tasks-modal/archived-tasks-modal.tsx`** — the root div uses
`flex max-h-[80vh] w-[28rem] flex-col gap-4`. The shared `ModalOverlay` already applies
`w-full max-w-md` plus `p-6`, so the self-set `w-[28rem]` (equal to `max-w-md` but ignoring the
48px padding) makes the content wider than the panel. Remove `w-[28rem]`:
`flex max-h-[80vh] flex-col gap-4`. Scrolling via `max-h-[80vh]` is unaffected.

## Testing

- **`app.test.tsx`:** use deferred promises (the pattern already used for branch tests) to hold
  each IPC mid-flight; assert the busy prop is passed to the child while pending and cleared after
  resolve **and** after reject.
- **`tab-bar.test.tsx`:** a tab in `closingTaskIds` renders a spinner and a disabled close button;
  tab title button carries `title`.
- **`repo-sidebar.test.tsx`:** a task in `removingTaskIds` shows a spinner with disabled
  remove/archive; `isAddingRepo` shows a spinner on a disabled Open-Repo button; title buttons and
  repo name carry `title`.
- **`new-task-modal.test.tsx`:** `isLoadingBranches` shows the spinner and disables Create Task in
  Review / use-existing mode, not in new-branch mode.
- **`archived-tasks-modal.test.tsx`:** root no longer carries `w-[28rem]`; task buttons carry
  `title`.

## Out of scope (YAGNI)

- A custom styled tooltip component (native `title` chosen).
- A global "busy bar" indicator.
- "Only show tooltip when actually overflowing" logic — always-present `title` is harmless.

## Sequencing note

`new-task-modal.tsx` is also touched by the pending **branch-category-picker** plan (spec+plan
committed, no code yet). Land these two features in sequence, not parallel, to avoid a conflict in
that file; whichever is second gets a small reconcile.
