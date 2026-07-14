# Open task worktree in VS Code — design

**Date:** 2026-07-14
**Status:** Approved to implement (user said "yes implement"; away for the two clarifying questions, so defaults chosen and noted below)

## Goal

Let the user open a task's worktree folder directly in **VS Code** from the sidebar, without leaving the app or hunting for the path on disk.

## Decisions (defaults taken while user was AFK)

- **Target editor: VS Code.** "VS Studio" in this TS/Electron project almost certainly means VS Code, and `code <folder>` is the canonical way to open a folder. Visual Studio (`devenv`) opens solutions, not bare folders — a poor fit. File Explorer was considered but the request said "studio" (an editor).
- **Placement: per-task icon button** in the sidebar task row, matching the established icon-first UI preference. Sits alongside the existing Archive / Remove icons on each `TaskRow`. Scratch "Quick Question" rows are excluded — their folders are throwaway Q&A scratch dirs, not meaningful to open in an editor.

## Architecture

Follows the existing IPC boundary exactly (mirrors `git-service.ts` + `task-handlers.ts`).

1. **`src/main/services/editor-service.ts`** (new) — `openInVsCode(folderPath: string): Promise<void>`.
   - Launches VS Code via `execFileAsync('cmd.exe', ['/c', 'code', folderPath], { windowsHide: true })`.
     - `cmd.exe /c` is required because the VS Code CLI on Windows is `code.cmd` (a batch file), which Node cannot spawn directly. Wrapping in `cmd.exe` with `shell: false` lets Node do its own argv-quoting of `folderPath` (handles spaces), rather than us hand-quoting into a shell string.
   - **Safety guard:** before launching, reject any path containing shell/cmd metacharacters (`" % & | < > ^ \` $` or CR/LF). Worktree/scratch paths are app-generated and never contain these, so this is a belt-and-suspenders guard that keeps a crafted path from ever breaking out of the `cmd.exe` invocation — consistent with the repo rule "never build a shell command by string-interpolating input."
   - Throws a typed `EditorLaunchError` on failure. The most common failure — `code` not on PATH — surfaces a friendly message telling the user to run VS Code's "Shell Command: Install 'code' command in PATH".

2. **IPC channel `task:open-in-editor`** — new entry `TaskOpenInEditor` in `IpcChannels`.

3. **`task-handlers.ts`** — `ipcMain.handle(TaskOpenInEditor, (…, taskId) => …)`: look up the task in the store, resolve its `worktreePath`, call `openInVsCode`. Throws `Unknown task` if the id is unknown (mirrors `TaskOpen`).

4. **Preload facade** — `openTaskInEditor(taskId: string): Promise<void>` on `ClaudeOrchestratorApi`, invoking the channel.

5. **Renderer**
   - `RepoSidebar` gains an optional `onOpenTaskInEditorClick?: (taskId: string) => void` prop, threaded into `TaskRow`, rendered as a `Code2` (lucide) icon button, `aria-label="Open in VS Code"`, placed before the Archive button. (Optional prop chosen to keep this additive per-row action from churning ~30 existing test render calls; the app always supplies it.)
   - `app.tsx` gains `handleOpenTaskInEditor(taskId)` → `window.claudeOrchestrator.openTaskInEditor(taskId)`, wrapped in the existing `try/catch → setErrorMessage` pattern so a missing `code` CLI shows in the standard error banner.

## Data flow

Click icon → `onOpenTaskInEditorClick(taskId)` → `openTaskInEditor(taskId)` (preload) → `task:open-in-editor` IPC → handler resolves `worktreePath` from store → `openInVsCode(path)` → `cmd /c code <path>`. Errors propagate back over IPC and render in the error banner.

## Error handling

- Unknown task id → handler throws `Unknown task: <id>`.
- Unsafe path → `EditorLaunchError` (never expected in practice).
- `code` not found / non-zero exit → `EditorLaunchError` with install hint; shown in the app error banner.

## Testing

- `editor-service.test.ts` — reuses the `git-service.test.ts` execFile callback-mock pattern. Asserts: happy path calls `cmd.exe /c code <path>`; unsafe path is rejected without launching; a failing launch surfaces `EditorLaunchError`.
- `task-handlers.test.ts` — mock `editor-service`; assert the handler resolves the task's `worktreePath` and calls `openInVsCode`, and rejects an unknown id.
- `preload/index.test.ts` — assert `openTaskInEditor` invokes `task:open-in-editor` with the id.
- `repo-sidebar.test.tsx` — assert clicking the new "Open in VS Code" button calls `onOpenTaskInEditorClick` with the task id.

## Out of scope (possible follow-ups)

- Opening scratch/Quick-Question folders.
- Choosing a different editor (Visual Studio, Cursor, Explorer) — would become a setting.
- An "open in editor" control in the active-task panel header.
