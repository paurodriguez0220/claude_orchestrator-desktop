# Task: Select an existing branch when creating a new task

**Status:** Planned

## Goal

Let "New Task" attach a worktree to an already-existing branch, instead of always creating a brand-new one.

## Context

Today, `TaskCreate` always runs `git worktree add <path> -b <branch>`, which fails if `<branch>` already exists. There's no way to open a task against a branch you (or a teammate, via a remote) already have — e.g. resuming work on a branch created outside this app, or picking up a previous task's branch again.

## Proposed Design

### Backend

- New IPC channel `repo:branches` — lists a repo's branches:
  - Local: `git branch --format=%(refname:short)`
  - Remote-tracking: `git branch -r --format=%(refname:short)`, excluding the `<remote>/HEAD` pointer entry
  - Remote-only branches are exposed with a display label like `origin/feature-x` but an underlying bare-name value (`feature-x`) — letting git's own checkout DWIM behavior create the local tracking branch automatically the first time it's used in `git worktree add`.
- `src/main/services/git-service.ts`: new `addWorktreeForExistingBranch(repoPath, worktreePath, branch): Promise<void>` — identical to `addWorktree` but omits `-b` (attaches to an existing branch/ref instead of creating one).
- `TaskCreateRequest` (`src/shared/ipc-channels.ts`) gains an optional `existingBranch?: string`. In `TaskCreate` (`src/main/ipc/task-handlers.ts`):
  - If `existingBranch` is present: skip the title-based branch-name generation, still run `assertSafeBranchName` on it (defense in depth, even though it came from a real git ref), derive the worktree folder slug from the **branch name** (not the task title), and call `addWorktreeForExistingBranch`.
  - If absent: unchanged — today's create-new-branch flow.

### Renderer

- `NewTaskModal`: add a "New branch" / "Use existing branch" toggle.
  - "New branch" mode: unchanged (title + optional ADO id + optional branch name text field).
  - "Use existing branch" mode: the branch text field is replaced by a `<select>` populated from a new `branches: BranchOption[]` prop (remote-only entries labeled `origin/name`, value `name`).
- `App`: when "New Task" is clicked for a repo, calls `window.claudeOrchestrator.listBranches(repoId)` and passes the result to `NewTaskModal`. On submit, forwards `existingBranch` (if that mode was used) instead of a new branch name.

### Error handling

No new error-handling code — a branch already checked out in another worktree, or any other git failure, surfaces through the existing generic `GitCommandError` → visible-error-message path built in the MVP.

### Testing

- `git-service.test.ts`: `addWorktreeForExistingBranch` asserts the argument array (no `-b`); `listBranches` asserts correct parsing of local/remote output and correct exclusion of `<remote>/HEAD`.
- `repo-handlers.test.ts`: `RepoBranches` handler test.
- `task-handlers.test.ts`: `TaskCreate` with `existingBranch` set — asserts `addWorktreeForExistingBranch` is called (not `addWorktree`), and the worktree slug comes from the branch name.
- `new-task-modal.test.tsx`: toggling to "Use existing branch" swaps in the select; submitting in that mode calls `onSubmit` with `existingBranch` set.
- `app.test.tsx`: opening "New Task" fetches branches; submitting with an existing branch selected calls `createTask` with `existingBranch`.

## Acceptance Criteria

- [ ] New Task modal has a working "New branch" / "Use existing branch" toggle
- [ ] Existing-branch mode lists real local and remote-tracking branches for the selected repo
- [ ] Selecting a local existing branch and submitting attaches a worktree to it (`git worktree add <path> <branch>`, no `-b`)
- [ ] Selecting a remote-only branch attaches a worktree and creates the local tracking branch (verified via `git branch` after)
- [ ] Worktree folder name is derived from the branch name in existing-branch mode
- [ ] Git errors (e.g. branch already checked out elsewhere) surface visibly in the UI, same as other flows
- [ ] "New branch" mode behavior is unchanged from today

---
*Maintained by paurodriguez0220 · Last updated: 2026-07-08*
*Standards: https://github.com/paurodriguez0220/standards-docs*
