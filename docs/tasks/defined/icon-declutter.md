# Task: Icon-based declutter for repeated row actions

**Status:** Defined

## Goal

Replace the noisiest repeated text (per-task "Remove" buttons, the "Review" badge, the archived-section disclosure triangle) with small icons, so the sidebar reads cleanly as it accumulates search/archive/Quick-Questions sections on top of the per-repo tree.

## Context

Every task row today repeats the word "Remove" as a text button, every `'review'`-kind task repeats the word "Review" in a badge, and the archived-section toggle uses a plain `▾`/`▸` text character. As more sections stack up in the sidebar (search, per-repo Archived toggles, Quick Questions), this repeated text is the most avoidable source of visual noise. No icon library is currently installed in this repo.

## Proposed Design

### Library

Add `lucide-react` as a dependency — tree-shakeable, plays cleanly with React + Tailwind, widely used, avoids hand-maintaining SVG paths.

### Scope (row actions only, not top-level buttons)

- **Remove button** (`TaskRow` in `repo-sidebar.tsx`, and the scratch-task row) — replace the "Remove" text with a `Trash2` icon button. Keep an accessible name via `aria-label="Remove task"` (or `"Remove question"` for scratch tasks) so screen readers and existing `getByRole('button', { name: 'Remove' })`-style test queries have an equivalent accessible-name update path.
- **"Review" badge** (`TaskRow`) — replace the text badge with a small `GitPullRequest` icon inside the same badge pill, keeping `aria-label="Review"` (or visually-hidden text) so the existing "shows a Review badge" test still has something to assert against.
- **Archived toggle disclosure** (`RepoSidebar`) — replace the `▾`/`▸` characters with `ChevronDown`/`ChevronRight` icons (already `aria-hidden`, no accessible-name impact — the button's own `Archived (N)` text stays as-is, only the decorative glyph changes).
- **Tab close button** (`TabBar`) — replace the `×` character with an `X` icon, for visual consistency with the new icon set (same accessible name, no behavior change).

Top-level text buttons ("Open Existing Repo", "Clone Repo", "New Task", "Review Code", "+ New Question") are explicitly out of scope for this pass — they're one-per-section, not repeated per row, so they're not contributing to the noise this task is solving.

## Non-Goals

- No icon+label conversion of the top-level per-repo/section action buttons (see Scope).
- No user-configurable icon set or theming — one fixed icon per element.
- No new custom SVG components — `lucide-react`'s existing icons only, no hand-drawn icons for v1.
- No changes to any click/remove/select behavior — this is a purely visual swap of text/characters for icons on already-existing interactive elements.

---
*Added: 2026-07-09*
*Standards: https://github.com/paurodriguez0220/standards-docs*
