# Claude Orchestrator

An Electron desktop app that spawns and manages Claude Code CLI sessions across git worktrees — one worktree and one terminal tab per task, so switching tasks never bleeds context between branches. Single user (Paulo), Windows-only.

## Getting Started

Prerequisites:

- Node.js 22+ and npm
- Git (on PATH)
- Claude Code CLI (`claude` on PATH) — the app spawns it inside each task's worktree

```
git clone https://github.com/paurodriguez0220/claude_orchestrator-desktop.git
cd claude_orchestrator-desktop
npm install
npm run dev
```

For daily use, install the app via the NSIS installer produced by `npm run dist` (in `dist/`) and launch it from the Start Menu / Desktop shortcut. The installer is intentionally unsigned — on first run, dismiss the SmartScreen warning with "More info" → "Run anyway".

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Electron app in dev mode (hot reload) |
| `npm run build` | Typecheck (main + renderer) and produce a production bundle |
| `npm run typecheck` | Typecheck only, no bundling |
| `npm test` | Run both test suites (`test:main` + `test:renderer`) |
| `npm run test:main -- <pattern>` | Run main-process tests matching `<pattern>` |
| `npm run test:renderer -- <pattern>` | Run renderer tests matching `<pattern>` |
| `npm run storybook` | Start Storybook for renderer components |
| `npm run dist` | Build, then package a Windows NSIS installer into `dist/` |

## Architecture

Three Electron processes with a hard IPC boundary, following the **Orchestrator pattern** — the main process orchestrates git worktrees, PTY sessions, and per-task state; the renderer only renders.

- **Main process** (`src/main/`) — owns all system access, organized as a **service layer** (`services/`: git, PTY, notes, store, transcripts, DSU) with thin **IPC handler** modules (`ipc/`) registered per domain. Spawns `claude` per task via `node-pty`, always with `cwd` set to that task's worktree.
- **Preload** (`src/preload/`) — a **typed facade** over `ipcRenderer`, exposed via `contextBridge` as `window.claudeOrchestrator`. The renderer never touches Node APIs directly.
- **Renderer** (`src/renderer/`) — React UI: repo/task sidebar, tabbed `xterm.js` terminal panes, task notes panel. One folder per component with co-located test and Storybook story.
- **Shared** (`src/shared/`) — IPC channel constants and request/response types, the single source of truth for the boundary.

Full design history lives in [`docs/tasks/finished/claude-orchestrator-mvp.md`](docs/tasks/finished/claude-orchestrator-mvp.md).

## Dependencies

| Dependency | Purpose |
| --- | --- |
| `node-pty` | Spawns `claude` in a real PTY per task (native module, unpacked from asar) |
| `@xterm/xterm` + `@xterm/addon-fit` | Terminal emulator UI in the renderer |
| `react` / `react-dom` | Renderer UI framework |
| `lucide-react` | Icon set for buttons and status indicators |
| Git CLI (external) | Clone, worktree add/remove, branch listing |
| Claude Code CLI (external) | The sessions being orchestrated; also used headless (`claude -p`) for DSU summaries |

## Configuration

No environment variables or secrets. Runtime data (managed repos, worktrees, task notes, transcripts) lives outside this repo at `C:\Users\paulo.rodriguez\claude-orchestrator\`. In dev mode, `ELECTRON_RENDERER_URL` is set automatically by `electron-vite`.

## Links

- Repo: https://github.com/paurodriguez0220/claude_orchestrator-desktop
- Standards: https://github.com/paurodriguez0220/standards-docs
- Agent context: [`CLAUDE.md`](CLAUDE.md)

---
*Maintained by paurodriguez0220 · Last updated: 2026-07-09*
*Standards: https://github.com/paurodriguez0220/standards-docs*
