# Task: Export the agent's conversation transcript to Markdown

**Status:** Defined

## Goal

Periodically save a clean, human-readable Markdown export of each task's actual `claude` conversation (what was said, not raw terminal output) to disk — independent of, and never overwriting, the user's own hand-typed task notes.

## Context

Claude Code CLI already persists its own structured session transcript on disk (that's how `claude --continue` already works, with no involvement from this app). Confirmed on this machine: transcripts live at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`, where `<encoded-cwd>` replaces `\`, `:`, `.`, and `/` in the working directory path with `-` (e.g. `C:\Users\paulo.rodriguez\claude-orchestrator\repos\Digital.Knowledge-worktrees\chore-health-check-endpoint-conventions` becomes `C--Users-paulo-rodriguez-claude-orchestrator-repos-Digital-Knowledge-worktrees-chore-health-check-endpoint-conventions`). Since this app always spawns `claude` with `cwd` set to a task's `worktreePath`, that same encoding can be applied to locate the right transcript for any task.

Each JSONL line is one event. The two kinds of interest:
- `{"type":"user","message":{"role":"user","content":"..."},...}` — a user turn. `content` is usually a plain string.
- `{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking",...},{"type":"text","text":"..."},{"type":"tool_use",...}]},...}` — an assistant turn, where `content` is an array of typed blocks.

Everything else in the file (`mode`, `permission-mode`, `attachment`, `hook_success`, `skill_listing`, `deferred_tools_delta`, `agent_listing_delta`, `auto_mode`, `plan_mode_exit`, `last-prompt`, etc.) is session bookkeeping, not conversation content, and is ignored.

**This reads an undocumented, internal Claude Code CLI file format that could change between CLI versions.** The design treats every read as best-effort: a missing directory, missing file, or a line that fails to parse as JSON is skipped, never thrown — this is a background convenience export, not a user-initiated action a failure should interrupt.

## Proposed Design

### Locating a task's transcript

A new `src/main/services/transcript-service.ts` exports:
- `encodeProjectDirName(cwd: string): string` — replaces every `\`, `:`, `.`, and `/` character in `cwd` with `-`.
- `findLatestTranscriptFile(cwd: string): Promise<string | undefined>` — computes `join(homedir(), '.claude', 'projects', encodeProjectDirName(cwd))`, lists files ending in `.jsonl` in that directory, and returns the path of whichever has the newest mtime. Returns `undefined` (not a thrown error) if the directory doesn't exist or contains no `.jsonl` files — this covers a task that was just created and hasn't had a `claude` turn yet. A task's session can restart under a new session id (e.g. the existing "no conversation found" auto-recovery in `pty-manager.ts` starts a fresh session); only the latest file is used, not a stitched history across restarts.

### Parsing to Markdown

- `parseTranscriptToMarkdown(jsonlContent: string): string` — splits on newlines, `JSON.parse`s each non-empty line inside a `try`/`catch` (skip on parse failure, continue to the next line), and for each parsed entry:
  - `type: "user"` with a string `message.content` → emit `### You\n\n{content}\n\n`.
  - `type: "assistant"` → filter `message.content` (an array) to blocks where `type === "text"`, join their `.text` fields with a blank line between them; if the joined text is non-empty, emit `### Claude\n\n{text}\n\n`. A turn with only `thinking`/`tool_use` blocks and no `text` block produces no output (dropped entirely, not an empty heading).
  - Any other `type`, or a `user`/`assistant` entry whose `message.content` isn't in the expected shape (e.g. an array, for tool-result-only user turns), is skipped.
- `exportTranscript(cwd: string, outputPath: string): Promise<void>` — calls `findLatestTranscriptFile`; if `undefined`, returns without writing anything; otherwise reads the file, calls `parseTranscriptToMarkdown`, and writes the result to `outputPath` (creating parent directories as needed, mirroring `notes-service.ts`'s `writeTaskNotes` pattern).

### Where it's written

A new path helper in `src/main/paths.ts`: `getTaskTranscriptPath(taskId: string): string` → `join(getRuntimeDataRoot(), 'tasks', \`${taskId}.transcript.md\`)`. This is a sibling of the existing `<taskId>.md` notes file, in the same `tasks/` directory, but never read or written by anything in `notes-service.ts` — completely separate file, so the auto-export can never collide with or overwrite the user's own notes.

### Scheduling

This is main-process-only background work with no renderer/IPC involvement at all.

`src/main/services/pty-manager.ts` currently keeps `sessions: Map<string, IPty>`. It changes to `sessions: Map<string, { process: IPty; cwd: string }>` so a session's working directory is available without re-reading the store, and gains `listAliveSessions(): Array<{ taskId: string; cwd: string }>` (returns entries for every taskId still in the map — a session is only removed from the map by `killSession` or the process's own `onExit`, so "in the map" already means "alive").

A new `startTranscriptExportScheduler(intervalMs: number): void` in `transcript-service.ts` runs `setInterval` at the given interval; each tick calls `listAliveSessions()` and, for every entry, calls `exportTranscript(cwd, getTaskTranscriptPath(taskId))`, catching and `console.error`-logging any rejection per-task so one task's failure doesn't stop the others from exporting on that tick. This is started once, at app startup, alongside where `registerTaskHandlers`/`registerRepoHandlers` are already wired up, with `intervalMs` set to 5 minutes (`5 * 60 * 1000`) — matching the cadence already shipped for the task-notes periodic autosave.

## Non-Goals

- No in-app UI to view the exported transcript in v1 — it's a plain file on disk, open it in any Markdown viewer/editor. A follow-up could add a read-only tab in the notes panel.
- No faster-than-5-minute updates; no manual "export now" trigger.
- No stitching of multiple session-restart transcripts into one file — latest session only (see Context).
- No changes to `notes-service.ts` or the existing task-notes autosave — this is fully additive and separate.

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every 5 minutes, export a clean Markdown conversation summary for every task with a currently-alive `claude` session, to a file separate from the task's own notes.

**Architecture:** A new `transcript-service.ts` locates and parses Claude Code's own JSONL transcript files (an internal format, handled best-effort). `pty-manager.ts` is extended to track each session's `cwd` and expose the list of currently-alive sessions. A `setInterval`-based scheduler, started once at app startup, drives the periodic export for every alive session.

**Tech Stack:** Same as the rest of the project — TypeScript strict, Node.js `fs/promises`, Vitest.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one function/responsibility per concern.
- Every read of the external JSONL format is best-effort: missing files/directories and unparseable lines are skipped, never thrown — this must not surface as a UI error banner or crash the scheduler.
- Never write to or read from the existing per-task notes file (`<taskId>.md`) from this feature's code — the transcript export is a fully separate file (`<taskId>.transcript.md`).
