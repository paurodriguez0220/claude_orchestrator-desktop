# Task: Code Review tasks, Quick Questions, and a searchable branch picker

**Status:** Defined

## Goal

Support two task "kinds" beyond today's single git-worktree-per-task model — **Code Review** tasks (for reviewing an existing branch without the ceremony of a full "new task" flow) and **Quick Questions** (ad-hoc `claude` sessions with no repo/branch association at all) — and make branch selection searchable, since both the existing "select existing branch" flow and the new Review flow need to pick a branch from a potentially long list.

## Context

Every task today is backed by a git worktree on a branch inside a managed repo (`TaskRecord.repoId`/`branch`/`worktreePath` are all required, and `TaskCreate` always calls `addWorktree`/`addWorktreeForExistingBranch`). Two real workflows don't fit that model well:

- **Code review**: reviewing a teammate's PR branch is read-heavy, not a new unit of work — creating a full "task" with a title/ADO id for it feels heavier than needed, and reviewing a brand-new PR branch fails today because `listBranches` only reads branches git already knows about locally (`git branch`/`git branch -r`), never `git fetch`.
- **Quick questions**: a one-off `claude` question ("what does this error mean") has no natural repo/branch to attach to, but still benefits from the existing terminal/notes/multi-tab machinery.

## Proposed Design

### Task kinds

`TaskRecord` (and `TaskNotesFrontmatter`) gain a `kind: 'worktree' | 'review' | 'scratch'` field. `repoId` and `branch` become optional — only `'scratch'` tasks omit them. Existing tasks/notes on disk predate this field; both are treated as `kind: 'worktree'` when absent (read-time default, not a migration script — nothing is rewritten on disk until the task is next saved).

- **`'worktree'`** — today's behavior, unchanged.
- **`'review'`** — structurally identical to a `'worktree'` task created via "use existing branch" (same `addWorktreeForExistingBranch` call, same fields populated). The only differences are (a) the tag itself, shown as a small "Review" badge in the sidebar, and (b) the creation flow runs `git fetch` first so a just-pushed PR branch is selectable immediately. No new backend removal/close logic — a review task is removed exactly like a worktree task.
- **`'scratch'`** — no `repoId`, no `branch`. `TaskCreate` creates a fresh empty directory at `<runtime-data-root>/scratch/<taskId>/` (no git operations at all) and uses that as `worktreePath` (the field stays the generic "directory claude runs in", regardless of kind). `TaskRemove` for a scratch task deletes that directory recursively (safe — it's an app-owned disposable folder, never a real repo) instead of calling `removeWorktree`.

### Code Review UI

Each repo section in the sidebar gets a second button, "Review Code", next to "New Task". It opens the existing `NewTaskModal` pre-set to "use existing branch" with the "create new branch" option hidden entirely (a review always targets something that already exists). Opening it triggers a new `RepoFetch` IPC call (`git fetch` in that repo) before populating the branch dropdown, so newly-pushed branches are selectable without the user having to fetch manually outside the app. The created task is tagged `kind: 'review'`. Review tasks render in the same per-repo task list as regular tasks (not a separate section), with a small "Review" badge next to the title.

### Quick Questions UI

A new, always-visible section in the sidebar, below the repo list: a "Quick Questions" heading, a "+ New Question" button, and a flat list of scratch tasks (title + status only — no repo/branch shown, since they have none). A scratch task uses the exact same `TerminalTab`/`TabBar`/`TaskNotesPanel`/multi-tab/autosave machinery as any other task, since it's still a normal `TaskRecord` entry in the same `tasks` array — `App`'s `tasksByRepoId` grouping just needs to also produce a separate flat list of `kind: 'scratch'` tasks (which have no `repoId` to group by) and pass it to `RepoSidebar` alongside the per-repo tree. Creating one opens a minimal modal with just a Title field (no branch, no ADO id, no repo picker).

### Searchable branch picker

The existing-branch `<select>` (used today by `NewTaskModal`'s "use existing branch" mode, and now also by the Review flow) becomes a filterable combobox: an input box that filters the branch list as you type, with the matching branches shown below for selection. One component, reused by both call sites — no behavior change to what gets submitted (still a branch name string).

## Non-Goals

- No fetch-on-every-branch-list-open for the regular "use existing branch" flow — auto-fetch is scoped to the new Review flow only (the regular flow's existing fetch gap is unchanged, filed separately if it becomes a problem).
- No editing/changing a task's `kind` after creation.
- No cross-repo search or global task filter (that's the separate, already-discussed task-notes search bar — not part of this design).
- No branch reordering, favoriting, or recency sorting in the searchable picker — plain substring filter only.
- No limit on the number of Quick Question tasks (YAGNI, matches the existing no-limit-on-open-tabs precedent).

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `kind`-tagged tasks (`worktree` | `review` | `scratch`), the Review Code and Quick Questions UI flows, and a shared searchable branch picker.

**Architecture:** `TaskRecord`/`TaskNotesFrontmatter` gain an optional-on-read `kind` field, with `repoId`/`branch` becoming optional (`'scratch'` tasks omit both). `TaskCreateRequest` gains an optional `kind` and its `repoId` becomes optional too (required for `'worktree'`/`'review'`, absent for `'scratch'`). `TaskCreate`/`TaskRemove` branch on `kind` for scratch-folder vs. worktree handling; `'review'` reuses the existing worktree-for-existing-branch path unchanged. A new `RepoFetch` IPC channel wraps `git fetch`. A new `BranchPicker` presentational component (filterable combobox) replaces the plain `<select>` in `NewTaskModal`. `App`/`RepoSidebar` gain a parallel "Quick Questions" list alongside the per-repo tree.

**Tech Stack:** Same as the rest of the project — TypeScript strict, React 18, Tailwind CSS tokens, Vitest + React Testing Library, `execFile`-based git service.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one component per file, `JSX.Element` return types.
- Never build a shell command by string-interpolating user input — `execFile`/`spawn` with argument arrays only (per this repo's `CLAUDE.md`).
- Never force-remove a git worktree without explicit confirmation (unchanged from today — review/worktree removal reuses the existing confirmed-removal flow; only the new scratch-folder deletion path is new, and it's app-owned disposable storage, not a worktree).
- Styling uses Tailwind CSS v4 tokens (`graphite-*`, `clay-*`, `danger-*`) — no arbitrary hex values.
