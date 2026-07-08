# Task: Claude Orchestrator (MVP)

**Status:** Planned

## Goal

Build an Electron desktop app that spawns and manages Claude Code CLI sessions across git worktrees, so switching between ADO tasks never bleeds context between branches.

## Context

Today, git worktrees for parallel ADO tasks are created manually. It's easy to forget to `cd`/switch into the correct worktree before continuing work, so Claude's context and git operations end up scoped to the wrong branch — corrupting the working history for that task. This tool exists to remove that manual directory-management step and give each task its own always-correct, always-visible Claude CLI session.

Target machine is the fefundinfo.com corporate laptop. No blocking constraint identified — the user already runs unsigned dev tooling (Node, Git, Claude Code CLI) there without issue — but code-signing/AppLocker friction is a known possible risk if it ever comes up during distribution (not a concern for a single-user local tool).

## Proposed Design

### Architecture

Electron app: Node.js main process + React renderer.

- **Main process** — owns all system access: spawns git commands (clone, `worktree add`/`remove`), spawns `claude` per task via `node-pty`, reads/writes app data and per-task notes files.
- **Renderer** — sidebar tree (repos → tasks), tabbed embedded terminals (`xterm.js`) wired to PTYs over IPC, a task detail/notes panel.
- **IPC boundary** — renderer never touches the filesystem or spawns processes directly; only through defined channels (`repo:add`, `repo:clone`, `task:create`, `task:open`, `task:close`, `task:remove`, `pty:input`, `pty:data`, ...). Keeps the system-access layer testable independent of the UI.

### Data & storage

Runtime data is kept separate from the app's own source code, and out of any corporate-managed/synced folder (e.g. `Documents`, which is subject to FE OneDrive redirection policy).

- **App source code**: `C:\Users\paulo.rodriguez\Paulo\claude-orchestrator` (this repo, alongside the user's other projects).
- **Runtime data root**: `C:\Users\paulo.rodriguez\claude-orchestrator\` — directly under the user profile, separate from the source tree above.
  - `store.json` — registry of repos + tasks (id, path, remote url, branch, timestamps).
  - `tasks/<taskId>.md` — per-task file: YAML frontmatter (ADO id, title, branch, worktree path, status) + freeform markdown notes body, user-editable.
  - `repos/` — cloned/managed repos live here by default when using the "clone new" flow (opening an existing repo elsewhere on disk is also supported and doesn't move it).
- Worktrees are created as siblings of their repo: `<repoParent>/<repoName>-worktrees/<task-slug>`, via `git worktree add <path> -b <branch>`.

**Key design decision**: the app does not reimplement Claude's own memory/history. Claude Code already scopes session history per working directory and supports `--continue`/`--resume`. The app's entire job is to *guarantee* `claude` is always spawned with `cwd` correctly set to the task's worktree — that alone fixes the context-bleed problem. The app's own per-task markdown file is a lightweight, human-readable companion (metadata + freeform notes), not a transcript store.

### Core flows

1. **Add repo** — "Open existing" (folder picker, repo is used in place) or "Clone new" (git URL, cloned into `C:\Users\paulo.rodriguez\claude-orchestrator\repos\`).
2. **New task** — user picks a repo, enters a title + optional ADO task ID + branch name (auto-slugified from title if left blank) → app runs `git worktree add` → creates `tasks/<taskId>.md` → opens a new terminal tab, spawns `claude` with `cwd` set to the new worktree.
3. **Reopen task** — clicking an existing task re-spawns `claude --continue` cd'd into that worktree if no PTY is currently alive for it; otherwise just focuses the existing live tab.
4. **Task notes** — editable markdown panel per task; frontmatter (ADO id, branch, status, etc.) is app-managed, the body is freeform and autosaved.
5. **Remove task** — confirmation prompt, then `git worktree remove`, archives (does not silently delete) the notes file.

### Error handling

- Git command failures (clone/worktree add/remove) capture stderr and surface the real git error text in the UI — never swallowed.
- PTY spawn failure (e.g. `claude` not on `PATH`) shows a clear inline error in the terminal tab instead of a silent hang.
- Worktree removal failure (e.g. uncommitted changes) surfaces git's own error; requires an explicit second confirmation to force — never force-removes by default.

### Testing approach

- Main-process logic (git command construction, store read/write, slug generation) is pure-function-testable — unit tests, no Electron runtime required.
- IPC handlers tested with mocked `child_process`/`fs`.
- The Electron shell itself (real PTY spawning, terminal rendering) is inherently interactive — covered by a manual smoke-test checklist rather than automated E2E for v1.

### MVP scope

**In:** repo add (open existing / clone new), task + worktree creation, embedded real terminal per task (`xterm.js` + `node-pty` running the actual `claude` CLI), per-task notes file, resume via `--continue`, remove task.

**Out (future):**
- ADO API auto-pull of task title/description (MVP is manual metadata entry only)
- AI-generated session summaries
- macOS/Linux support (Windows-only for v1)
- Installer/code-signing/distribution
- Multi-window / multi-monitor layouts

## Acceptance Criteria

- [ ] Can add a repo (open existing local folder, or clone from a git URL into `C:\Users\paulo.rodriguez\claude-orchestrator\repos\`)
- [ ] Can create a new task on a repo: enters title/ADO id/branch, worktree is created on disk, notes file is created
- [ ] New task opens an embedded terminal tab running `claude`, `cwd` correctly set to the new worktree
- [ ] Closing and reopening a task reuses the same worktree and resumes Claude context via `--continue`
- [ ] Task notes are editable and persist across app restarts
- [ ] Removing a task removes the git worktree (with confirmation) and archives its notes file
- [ ] Git/PTY errors are surfaced visibly in the UI, never silently swallowed
- [ ] App restart restores the full repo/task list from `store.json`

---
*Maintained by paurodriguez0220 · Last updated: 2026-07-08*
*Standards: https://github.com/paurodriguez0220/standards-docs*
