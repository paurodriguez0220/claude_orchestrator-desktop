# Branch category picker — design

*Date: 2026-07-13 · Status: approved, pending implementation*

## Problem

When creating a task on a **new branch**, the New Task modal offers a single free-text
"Branch (optional)" field. Blank defaults to `` task/<slug-of-title> `` (`task-handlers.ts:62`).
To use any other namespace — `fix/…` for a bug, `feature/…` for a feature — the user must
type the full branch name by hand every time. In practice everything lands under one prefix,
and there is no quick way to categorise a task as a bug fix versus a feature.

## Goal

Let the user pick a branch "folder" (prefix) from a short preset list when creating a task,
so the common path is: type a title → pick `fix/` → done. Preserve the ability to type an
arbitrary full branch name.

## Approach

A **preset prefix dropdown** in the modal, combined with the title slug to form the branch.
The final branch string is still composed and validated the same way downstream — the change
is mostly in the modal plus a small contract addition — so the blast radius stays small.

### UI — `new-task-modal.tsx` (New branch mode only)

Replace the single "Branch (optional)" text input with:

- A **prefix dropdown** with options: `feature/`, `fix/`, `chore/`, `refactor/`, `Custom…`.
  Default selection: `feature/`.
- A live **branch preview** showing `<prefix><slug-of-title>`, e.g. `fix/paste-multiline`.
  When the title is empty the preview shows just the prefix.
- Selecting **Custom…** hides the preview and reveals the existing free-text box, which submits
  as a full explicit branch name — exactly today's behaviour, no capability lost.

Review mode (`mode === 'review'`) and "Use existing branch" are unchanged.

### Data flow / contract

- `TaskCreateRequest` in `src/shared/ipc-channels.ts`: add `branchPrefix?: string`.
  Keep the existing optional `branch?: string`, which now means an explicit full-branch override
  (used only by the Custom… path).
- `NewTaskFields` (in `new-task-modal.tsx`) gains `branchPrefix: string | undefined`.
- `app.tsx`: forward `branchPrefix` from `onSubmit` into `createTask`.
- `task-handlers.ts`: branch resolution becomes:
  1. existing branch selected → use it (unchanged);
  2. else explicit `request.branch` present → use it (Custom… path, unchanged behaviour);
  3. else → `` `${request.branchPrefix ?? 'feature/'}${slug}` ``.
  `assertSafeBranchName(branch)` still runs on the result. Worktree folder path still uses the
  slug only — no prefix folders on disk.

### Slug reuse

The modal needs `slugify` to render the live preview. Move `slugify` to `src/shared/slug.ts`
as the single source of truth; `main/services/slug.ts` re-exports it (so existing main-side
imports keep working) and retains the security guards (`assertSafeBranchName`,
`assertSafeFolderName`, `assertValidGitUrl`), which stay main-only. The renderer imports
`slugify` from `shared`.

## Testing

- **new-task-modal test:** dropdown renders the four presets + Custom…; default is `feature/`;
  preview reflects prefix + slugified title; submitting a preset forwards `branchPrefix` and no
  explicit `branch`; Custom… reveals the text box and forwards the typed value as `branch`.
- **app test:** `branchPrefix` is forwarded to `createTask`.
- **task-handlers test:** prefix composes the branch (`fix/` + slug); missing prefix defaults to
  `feature/`; explicit `branch` override still wins; existing-branch path unchanged.
- **shared/slug test:** move/duplicate existing `slugify` coverage to the new location.

## Out of scope (YAGNI)

- Editable / settings-stored prefix list.
- Per-repo default prefixes.
- Prefix-based worktree folders on disk.

These are straightforward follow-ups if wanted later.
