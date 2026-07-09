# Task: Icon-based declutter across the sidebar

**Status:** Defined

## Goal

Replace wordy repeated text — per-task "Remove" buttons, the "Review" badge, the archived-section disclosure triangle — **and** the top-level action buttons ("Open Existing Repo", "Clone Repo", "New Task", "Review Code", "+ New Question") with small icons, so the sidebar reads cleanly as it accumulates search/archive/Quick-Questions sections on top of the per-repo tree.

## Context

Every task row today repeats the word "Remove" as a text button, every `'review'`-kind task repeats the word "Review" in a badge, and the archived-section toggle uses a plain `▾`/`▸` text character. Every repo section also carries full-word buttons ("Open Existing Repo", "Clone Repo", "New Task", "Review Code") plus a "+ New Question" button below the tree. As more sections stack up in the sidebar (search, per-repo Archived toggles, Quick Questions), this text is the dominant source of visual noise. No icon library is currently installed in this repo.

**Scope correction (2026-07-09):** an earlier pass at this task deliberately scoped out the top-level buttons, defaulting to "row actions only" when a scope-clarifying question went unanswered. Explicit user feedback: that default was wrong — this user wants icons over wordy text by default, including these top-level buttons. Treat "prefer icons over text labels" as this app's standing default going forward, not a one-off.

## Proposed Design

### Library

`lucide-react` — tree-shakeable, plays cleanly with React + Tailwind, widely used, avoids hand-maintaining SVG paths. (Already added as a dependency by the row-actions pass below.)

### Scope

**Row actions** (already implemented in a prior pass on branch `worktree-agent-afa024b0e81a9af72`, not yet merged to master):
- **Remove button** (`TaskRow` in `repo-sidebar.tsx`, and the scratch-task row) — `Trash2` icon, `aria-label="Remove task"`/`"Remove question"`.
- **"Review" badge** (`TaskRow`) — `GitPullRequest` icon inside the badge pill, `aria-label="Review"`.
- **Archived toggle disclosure** (`RepoSidebar`) — `ChevronDown`/`ChevronRight` icons replacing `▾`/`▸` (decorative, `aria-hidden`).
- **Tab close button** (`TabBar`) — `X` icon replacing `×`.

**Top-level buttons** (new scope, this revision):
- **"Open Existing Repo"** (`RepoSidebar`) — `FolderOpen` icon, `aria-label="Open Existing Repo"`.
- **"Clone Repo"** (`RepoSidebar`) — `Download` icon, `aria-label="Clone Repo"`.
- **"New Task"** (`RepoSidebar`, per-repo) — `Plus` icon, `aria-label="New Task"`.
- **"Review Code"** (`RepoSidebar`, per-repo) — `Eye` icon, `aria-label="Review Code"` (deliberately distinct from the Review badge's `GitPullRequest` icon, since they mean different things — one starts a review, the other marks a task as a review).
- **"+ New Question"** (`RepoSidebar`) — `MessageCirclePlus` icon, `aria-label="New Question"`.

Every icon-only button keeps its original text as an `aria-label` (screen readers, and existing `getByRole('button', { name: '...' })` test queries keep working unchanged against the same accessible name) plus a native `title` attribute so a mouse-hover tooltip still shows the action name — icon-only isn't icon-only-with-no-way-to-tell-what-it-does.

## Non-Goals

- No user-configurable icon set or theming — one fixed icon per element.
- No new custom SVG components — `lucide-react`'s existing icons only, no hand-drawn icons for v1.
- No changes to any click/remove/select/create behavior — this is a purely visual swap of text for icons on already-existing interactive elements.
- No icon-only conversion of task *titles* themselves, or of section headings ("Quick Questions") — only actionable buttons/badges/toggles are in scope.

---
*Added: 2026-07-09*
*Standards: https://github.com/paurodriguez0220/standards-docs*
