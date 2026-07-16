# Fresh base for new worktrees

**Date:** 2026-07-16
**Status:** Approved (design)

## Problem

When a task is created, the app runs `git worktree add <path> -b <branch>` from the
main clone (`git-service.ts:53`, called at `task-handlers.ts:80`). That branches off
whatever commit the main clone's HEAD currently points to — i.e. the last time the repo
was pulled. There is no `git fetch` or `git pull` in the create path (`fetchRepo` exists
but is only wired to the manual `RepoFetch` handler). So every new worktree starts from a
potentially stale base commit.

## Goal

New worktrees start from the latest remote commit of the repo's default branch, without
risking the main clone's working tree, controllable per repo, and degrading gracefully
when offline.

## Non-goals

- No changes to the existing-branch checkout path (`addWorktreeForExistingBranch`).
- No changes to scratch tasks.
- Not turning the app into a git client — no merge/rebase UI, no conflict handling beyond
  a best-effort fast-forward of the local default ref.

## Mechanism

Instead of "update the main folder, then branch from it," branch the new worktree
directly off the freshly fetched remote default branch:

```
git fetch origin
git worktree add <path> -b <branch> origin/<default>
```

Branching from `origin/<default>` guarantees the worktree starts at the latest remote
commit **without touching the main clone's working tree**, so it cannot fail on a dirty or
diverged local default branch.

> **Implementation note (2026-07-16):** the best-effort fast-forward of the main clone's
> local default branch was dropped. In the common case the default branch is the branch
> checked out in the main clone, and git refuses to move a checked-out branch's ref via a
> fetch refspec, so it would almost always no-op. Branching new worktrees from
> `origin/<default>` already guarantees freshness — the actual goal — so advancing the main
> clone's working copy adds edge cases (dirty tree, branch checked out elsewhere) for no
> functional benefit to the worktree workflow. It can return as a follow-up if wanted.

### Default branch detection

Live, at create time:

1. `git symbolic-ref --short refs/remotes/origin/HEAD` → yields `origin/<default>`; strip
   the `origin/` prefix.
2. If that fails (e.g. `origin/HEAD` unset), fall back to the clone's current HEAD branch
   name (`git rev-parse --abbrev-ref HEAD`).

No new stored field on `RepoRecord`, no store migration. Default branch changes rarely
enough that per-create detection is fine.

## Per-repo setting

Add to `RepoRecord`:

```ts
updateBaseOnCreate?: boolean; // undefined => treated as true
```

- Treated as `true` when undefined, so existing repos opt in by default.
- Exposed as a toggle in the repo's context menu: **"Update base before new tasks"**.
- When `false`, task create behaves exactly as today: `git worktree add <path> -b <branch>`
  from local HEAD, no fetch.

## Failure handling

- `git fetch` fails (offline / no remote): do **not** block create. Fall back to branching
  from local HEAD and surface a non-blocking notice: *"Couldn't reach remote — branched
  from local copy."*
- Local default-branch fast-forward fails: skip silently (worktree already fresh).
- Never report "updated" when it was not.

## Affected code

- `src/shared/types.ts` — added `updateBaseOnCreate?: boolean` to `RepoRecord`.
- `src/main/services/git-service.ts` — new helpers:
  - `getDefaultBranch(repoPath): Promise<string>` (symbolic-ref + rev-parse fallback).
  - `addWorktreeFromRef(repoPath, worktreePath, branch, startPoint)` — `worktree add -b`
    from an explicit start point (e.g. `origin/<default>`).
  - reuse existing `fetchRepo`.
- `src/main/ipc/task-handlers.ts` — in the new-branch path, when `updateBaseOnCreate` is not
  `false`: fetch → resolve default → branch from `origin/<default>`; on fetch failure, fall
  back to `addWorktree` (local HEAD) and attach a transient `baseUpdateWarning`. Returns the
  new `TaskCreateResult` (TaskRecord + optional non-persisted `baseUpdateWarning`).
- `src/shared/ipc-channels.ts` — `RepoSetUpdateBase` channel, `RepoSetUpdateBaseRequest`,
  `TaskCreateResult`.
- `src/main/ipc/repo-handlers.ts` — `RepoSetUpdateBase` handler persisting the toggle.
- `src/preload/index.ts` — `setRepoUpdateBase(repoId, value)`; `createTask` now returns
  `TaskCreateResult`.
- Renderer — per-repo `RefreshCw` / `RefreshCwOff` toggle in the sidebar repo header
  (`repo-sidebar.tsx`); `app.tsx` persists the toggle and surfaces `baseUpdateWarning` in the
  existing banner.

## Testing

- `git-service`: `getDefaultBranch` parses `origin/<default>` and falls back on failure;
  `addWorktreeFromRef` passes the start point as an arg array (never a shell string);
  `fastForwardBranch` swallows non-fast-forward errors.
- `task-handlers`:
  - setting on/undefined → `fetchRepo` called and worktree branched from `origin/<default>`.
  - setting off → old behavior, no fetch.
  - fetch failure → falls back to local HEAD branch and emits the notice.
  - existing-branch and scratch paths unchanged.
- `repo-handlers`: toggle persists `updateBaseOnCreate` to the store.

## Security

All git invocations continue to use `execFile`/argument arrays — branch names and start
points are never string-interpolated into a shell (per project "Never Do" rules).
`assertSafeBranchName` still guards the new branch name.
