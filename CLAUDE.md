# CLAUDE.md

## Project

An Electron desktop app that spawns and manages Claude Code CLI sessions across git worktrees. Each ADO task gets its own worktree and its own terminal tab, so switching tasks never bleeds context between branches — the app guarantees `claude` always runs with `cwd` correctly set to the right worktree. Single user (Paulo), Windows-only for v1.

## Architecture

- **Main process** (Node.js/TypeScript) — owns all system access: git commands (clone, `worktree add`/`remove`), spawns `claude` per task via `node-pty`, reads/writes app data and per-task notes files.
- **Renderer** (React/TypeScript) — sidebar (repos → tasks), one embedded terminal pane per selected task (`xterm.js`), task notes panel. (Design originally called this "tabbed"; MVP ships a single swappable pane — multi-tab terminals are a follow-up.)
- **IPC boundary** — renderer never touches the filesystem or spawns processes directly; only through defined channels (`repo:add`, `repo:clone`, `dialog:select-folder`, `task:create`, `task:remove`, `pty:input`/`pty:output`, ...).

Full design and implementation plan: [`docs/tasks/defined/claude-orchestrator-mvp.md`](docs/tasks/defined/claude-orchestrator-mvp.md).

## Structure

```
src/
├── main/        Electron main process — git, PTY, filesystem, IPC handlers
├── renderer/    React UI — sidebar, terminal tabs, task panel
docs/
└── tasks/       queue/defined/finished task tracking (see standards-docs/documentation.md)
```

Runtime data (managed repos, worktrees, task notes) lives outside this repo, at `C:\Users\paulo.rodriguez\claude-orchestrator\`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Electron app in dev mode |
| `npm run build` | Typecheck (main + renderer) and produce a production bundle |
| `npm run typecheck` | Typecheck only, no bundling |
| `npm test` | Run both test suites (`test:main` + `test:renderer`) |
| `npm run test:main -- <pattern>` | Run main-process tests matching `<pattern>` |
| `npm run test:renderer -- <pattern>` | Run renderer tests matching `<pattern>` |
| `npm run storybook` | Start Storybook for renderer components |

## Conventions

Follow `C:\Users\paulo.rodriguez\Paulo\standards-docs\`: `code-style.md` (TypeScript strict mode, no `any`, named exports), `web-components.md` (React/Storybook/Vitest), `testing.md`, `security.md`, `git-workflow.md`.

## Never Do

- Never build a shell command by string-interpolating user input (repo URLs, branch names, task titles). Always `execFile`/`spawn` with argument arrays.
- Never commit or push under the corporate git identity (`@fefundinfo.com`). This repo's local `user.email`/`user.name` must stay set to the personal account (`paurodriguez0220`).
- Never force-remove a git worktree without an explicit second user confirmation.
- Never let `claude` be spawned outside a task's own worktree directory — that's the entire point of this app.

---
*Maintained by paurodriguez0220 · Last updated: 2026-07-08*
*Standards: https://github.com/paurodriguez0220/standards-docs*
