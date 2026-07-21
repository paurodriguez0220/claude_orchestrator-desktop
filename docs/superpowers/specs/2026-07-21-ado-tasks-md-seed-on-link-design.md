# Seed `tasks.md` on ADO link — design

**Date:** 2026-07-21
**Status:** Parked (design approved, implementation not started)
**Related:** [`2026-07-16-ado-tasks-md-template-parser-design.md`](2026-07-16-ado-tasks-md-template-parser-design.md), memory `project_ado_sync_vision`

## Problem

The "Sync tasks.md to ADO" button fails with:

> `Error invoking remote method 'ado:sync-tasks': No tasks.md found in this worktree — create one before syncing to ADO.`

Root cause: the orchestrator never creates the tasks file. Task/worktree creation
(`task-handlers.ts` → `getWorktreePath`) leaves the file entirely to the Claude
agent running in the worktree. The agent has no anchor telling it the expected
name, case, or location, so it guesses — in the observed case it produced
`src/Zenith.Core.Etl/TASK.md` (co-located, nested, uppercase). The sync handler
(`ado-sync-service.ts:18`) reads only `join(worktreePath, 'tasks.md')` — lowercase,
worktree root — so it never finds the agent's file.

The design question is **"how will the agent know to put the task file in the
correct path and case?"** The answer adopted here: it shouldn't have to guess.
Seed the correctly-named file before the agent works, and tell the agent to use it.

## Approach

Chosen: **seed the file when a worktree becomes ADO-linked, plus a one-line nudge
to the worktree's `CLAUDE.md`.** Rejected alternatives:

- **Recursive / case-insensitive sync lookup** — solves the symptom but adds
  ambiguity ("which `TASK.md` wins if there are several?") and still gives the
  agent no canonical home. Sync stays root-only + exact-case by design.
- **Seed into every worktree on creation** — drops an ADO template into worktrees
  that may never sync. Seeding only when ADO-linked keeps non-ADO worktrees clean.
- **Seed on first sync attempt** — reactive; the agent may already have written the
  wrong file by then.

## Behavior

### Trigger

In the `task:link-ado` IPC handler (`task-handlers.ts:257`), after an ADO id is
added to the task, attempt to seed `tasks.md` into the task's worktree.

### Seeding rules

1. **Resolve the worktree path** from the task record.
2. **No worktree folder yet → skip silently.** Linking still succeeds; seeding is
   retried on a later link (or can be attempted again the next time the handler
   runs with a real path). Linking must never fail because there is nothing to
   seed into.
3. **`tasks.md` already exists at the worktree root → do nothing.** Never overwrite
   the agent's or user's existing file. Seeding is idempotent.
4. **Otherwise, copy `docs/templates/tasks.md` → `<worktreePath>/tasks.md`**,
   exact lowercase name, at the root — the same path the sync handler reads.
5. **Pre-fill frontmatter:** set `adoParent:` to the id just linked so the
   agent/user does not have to fill it in by hand. (If multiple ids are linked,
   use the first / parent id per existing sync semantics.)

### Agent nudge

When seeding occurs, **append a one-line convention note to the worktree's
`CLAUDE.md`** if that file exists (append only; do not create one if absent):

> `## ADO tasks: track work items in \`tasks.md\` at the worktree root — append to it; do not rename or relocate it.`

Idempotent: do not append if the note is already present. This complements the
template's own header comment, so the agent both *sees* the file and is *told* to
use it.

## Interfaces / units

- **`seedTasksMd(worktreePath, adoParentId)`** — new, focused helper (own module,
  e.g. `src/main/services/tasks-md-seeder.ts`). Pure I/O orchestration: existence
  checks, template read, frontmatter prefill, write, CLAUDE.md append. Returns
  whether it seeded (for logging/telemetry). No ADO or store knowledge.
- **`task:link-ado` handler** — calls `seedTasksMd` after `updateAdoIds`, guarded
  so a seeding failure does not fail the link (log and continue).
- **Template source** — reuse `docs/templates/tasks.md`. The seeder must locate it
  relative to app resources (packaged path differs from dev — resolve via the same
  mechanism other bundled assets use; confirm during implementation).

## Error handling

- No worktree path / folder missing → skip, no error surfaced.
- Existing `tasks.md` → skip, no error.
- Template unreadable or write fails → log a warning; the link operation still
  succeeds (seeding is best-effort, not a link precondition).

## Testing

- Link with no worktree folder → link succeeds, nothing written.
- Link with worktree, no `tasks.md` → `tasks.md` created at root, lowercase, with
  `adoParent` pre-filled; CLAUDE.md note appended when CLAUDE.md exists.
- Link with worktree that already has `tasks.md` → file untouched, no duplicate
  CLAUDE.md note.
- Link a second id → does not overwrite or re-seed.
- Template resolves correctly in both dev and packaged builds.

## Out of scope

- Changing the sync lookup (stays root-only, exact-case).
- Multi-tab / multiple tasks files per worktree.
- Auto-syncing on link (sync stays explicit / user-triggered).
