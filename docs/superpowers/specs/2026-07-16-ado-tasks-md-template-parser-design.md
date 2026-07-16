# ADO `tasks.md` template + parser

**Date:** 2026-07-16
**Status:** Approved (design)

## Problem

The planned "brainstorm → `tasks.md` → child work items in ADO" flow has no defined
contract. A brainstorm can emit task breakdowns in any shape, and there is no reader that
turns such a file into structured work-item data. Without a fixed template and a parser that
reads it, the later sync feature has nothing reliable to build on, and re-running a sync
would have no way to tell an already-created item from a new one.

## Goal

Define **piece A** of the ADO sync vision: a fixed `tasks.md` template that a brainstorm
always emits, and a pure parser that reads it into structured work-item data that maps
cleanly onto ADO fields (type, title, description, parent). Include the idempotency key the
later sync (piece C) needs to distinguish create from update.

This piece performs **no ADO calls and no writes** — it is a template definition plus a pure
parsing function with tests. It is the contract both the multi-link display (piece B) and
the sync button (piece C) read from.

## Non-goals

- No ADO round-trips — no create, no update, no auth. That is piece C.
- No "Sync to ADO" button or any UI. Parser only.
- No rewriting of `tasks.md` (appending `#id` markers) — that is a piece-C concern; this
  spec only defines that the marker exists and how the parser reads it.
- No multiple parents per file — one parent per `tasks.md` for v1 (see Open decisions).
- No worktree ↔ many-ADO linking — that is piece B.

## The template

Lives at the worktree root as `tasks.md`. YAML frontmatter for file-level fields, then a
single `## Work items` section of checkbox lines, one per work item.

```markdown
---
adoParent: 12345          # parent work item id; may be blank until the worktree is linked
---

# <Feature title>          <!-- context only, never synced -->

One-paragraph summary of the feature (context for humans; not pushed to ADO).

## Work items

- [ ] (Task) Set up the adoIds data model
  > Migrate TaskRecord.adoId to adoIds[]; keep a back-compat read.
- [ ] (Task) Task-panel "Linked ADO items" section
  > Chips with remove; Add opens the ADO picker.
- [ ] (Bug) Blank description on large payloads
- [x] (Task) Already-synced example #67890
```

## The contract the parser reads

- **Frontmatter `adoParent`** → the parent all children are created under. May be blank
  (piece C falls back to the worktree's linked parent from piece B).
- **`# Heading` and prose** → context only; ignored by the parser.
- **Each `- [ ] (Type) Title` line under `## Work items`** → one work item:
  - `(Type)` (case-insensitive, e.g. `Task`, `Bug`, `User Story`) → `System.WorkItemType`.
  - Text after `(Type)`, up to an optional trailing `#<id>`, trimmed → title.
- **An indented `>` blockquote immediately under an item** → `System.Description`.
  Consecutive `>` lines join with newlines.
- **Idempotency marker:** a trailing `#<digits>` on the title line is the ADO work-item id
  of an already-created item. A line **with** an id → piece C *updates*; a line **without**
  → piece C *creates* (then appends the id). This keeps "synced" separate from the checkbox
  state, so `[x]` can mean "done" without implying "synced" and vice-versa.

## Parsed shape

A pure function `parseTasksMarkdown(content: string): ParsedTasks`:

```ts
export interface ParsedWorkItem {
  type: string;            // System.WorkItemType, e.g. "Task"
  title: string;           // trailing #id stripped
  description?: string;    // joined blockquote lines
  adoId?: number;          // present iff the line carried a trailing #id
  checked: boolean;        // checkbox state, carried through but not an ADO field
}

export interface ParsedTasks {
  parentId?: number;       // from frontmatter adoParent, if a valid positive integer
  featureTitle?: string;   // the first # heading, for context/logging
  items: ParsedWorkItem[];
}
```

## Behaviour / edge cases

- **Missing `## Work items` section** → `items: []`, no throw (an empty breakdown is valid).
- **Line without a recognised `(Type)`** → skipped (not a work item); the parser does not
  throw on prose accidentally living under the section.
- **Malformed frontmatter or non-integer `adoParent`** → `parentId` undefined; parsing of
  items still proceeds.
- **`adoId` parsing** — only a `#` followed by digits at the end of the title line counts; a
  `#` mid-title (e.g. `Fix bug in #region handling`) is left in the title.
- Pure and deterministic: same input → same output, no I/O, no clock, no randomness.

## Affected code

- `src/shared/types.ts` — `ParsedWorkItem`, `ParsedTasks` interfaces (shared so piece C and
  the renderer can both use them).
- `src/main/services/tasks-md-parser.ts` — **new**: `parseTasksMarkdown`. Pure, no imports
  beyond a lightweight frontmatter split (reuse the notes-service frontmatter approach
  rather than adding a dependency).
- `docs/templates/tasks.md` — **new**: the canonical template, committed so the brainstorm
  step (and the user) reference one source of truth.

No IPC, no preload, no renderer, no `package.json` changes in this piece.

## Testing

`tasks-md-parser` unit tests (`src/main/services/tasks-md-parser.test.ts`):

- Parses parent id from frontmatter; missing/blank/non-integer → undefined.
- One `- [ ] (Task) Title` line → one item with the right type and title.
- `(Type)` matching is case-insensitive and handles multi-word types (`User Story`).
- Indented `>` blockquote → `description`; multiple `>` lines join with newlines.
- Trailing `#67890` → `adoId: 67890` and stripped from title; mid-title `#` is preserved.
- `[x]` vs `[ ]` → `checked` true/false, independent of `adoId`.
- No `## Work items` section → `items: []`, no throw.
- Prose / unrecognised lines under the section are skipped.

## Security

Pure string parsing of a local file's contents. No shell, git, or ADO involvement in this
piece. The parsed values (types, titles) are **not** trusted for command construction here;
piece C, when it feeds them to `az`, must continue to use `execFile` with argument arrays
(never string interpolation) and apply the same field validation the existing
`createWorkItem` uses.

## Open decisions (carried to piece C)

- **One parent per file** for v1. If children ever need to span multiple parents, extend the
  template with a per-item `parent:` override rather than multiple frontmatter parents.
- Whether `[x]` (done) should influence sync at all, or remain purely a human marker.
