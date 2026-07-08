# Task: Tab indicator when Claude finishes responding

**Status:** Defined

## Goal

Show a small indicator on a background tab when Claude finishes its current turn and is idle, waiting for input — so you can work in one tab while a long-running task finishes in another, without needing to keep switching over to check.

## Context

Today, switching away from a tab gives no signal about what's happening in it — you have to manually switch back to check whether Claude is still working or has finished and is waiting. This reuses the JSONL transcript-reading infrastructure already built for the transcript-export feature (`docs/tasks/defined/task-transcript-export.md`): `transcript-service.ts`'s `findLatestTranscriptFile(cwd)` locates a task's Claude Code CLI transcript, and each transcript line already carries a `stop_reason` field on assistant turns — `"tool_use"` while Claude is still actively working (about to call a tool and continue), and `"end_turn"` (or similar) once it's actually finished and waiting for the next human message.

**This depends on the same undocumented internal file format flagged as a risk in the transcript-export feature.** Treated the same way: best-effort, silently skip on anything unexpected rather than surfacing an error.

## Proposed Design

### Detection

A new, faster-polling check in the main process — separate from the existing 5-minute transcript-export scheduler — runs every 5 seconds. "Open as a tab" and "has a currently-alive PTY session" are already the same thing in this app's architecture (a session is spawned when a tab opens and killed when it closes), so this reuses `pty-manager.ts`'s existing `listAliveSessions()` — the exact same source the transcript-export scheduler already uses — with no new plumbing needed to know which tasks to watch. Each tick, for every alive session, it reads that task's latest transcript file and inspects the last relevant line:
- If the last `user`/`assistant` entry is an `assistant` message whose `stop_reason` is `"end_turn"` (not `"tool_use"`), and no later `user` entry follows it in the file → the task is "finished, waiting for input."
- Otherwise (still mid-turn, no transcript yet, or any read/parse failure) → not finished. Failures are silent, matching the transcript-export feature's best-effort convention.

### Delivery to the renderer

Whenever a task's finished-state changes (false → true or true → false), the main process pushes an event to the renderer — the same push pattern already used for `PtyOutput` — rather than the renderer polling for it.

### Visual indicator

A small clay-colored dot appears next to a tab's title in `TabBar`, only when that tab is **not** the currently active one (the active tab doesn't need a badge — you're already looking at it). It does not change the tab's background or text color, keeping the existing active/inactive tab styles as the only two color states.

### Clearing

Switching to that tab (making it `activeTaskId`) clears its indicator immediately — the same moment you'd actually see Claude's response.

## Non-Goals

- No sound/desktop notification — visual tab indicator only, for v1.
- No indicator on the currently active tab.
- No optimized tail-only reads of large transcript files for v1 — each check reads the whole file, same as the transcript-export feature already does, just far more often (every 5s vs. every 5min). Acceptable for a single-user tool with a handful of open tabs; flagged as a future optimization if transcript files grow large enough to make this noticeably slow.
- No changes to the transcript-export feature itself — this reuses its file-locating logic but is otherwise a separate, independent poller.

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clay-colored dot appears on a background tab within ~5 seconds of Claude finishing its turn in that task, and clears the moment you switch to it.

**Architecture:** A new function in `transcript-service.ts` reads a transcript file's entries and determines whether the last turn is a finished (not mid-tool-use) assistant turn. A new poller, driven by a `setInterval` separate from the existing export scheduler, runs this check every 5 seconds for whichever tasks the renderer currently has open, and broadcasts a `TaskFinishedStateChanged` event whenever a task's state flips. `App` tracks open tasks needing attention and clears an entry when that tab becomes active; `TabBar` renders the dot.

**Tech Stack:** Same as the rest of the project — TypeScript strict, React 18, Tailwind CSS tokens, Node.js `fs/promises`, Vitest + React Testing Library, Electron IPC.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one component per file, `JSX.Element` return types.
- Every read of the external JSONL transcript format is best-effort: missing files, missing directories, and unparseable lines are skipped/treated as "not finished," never thrown — must not surface as a UI error banner or crash the poller.
- Styling uses Tailwind CSS v4 tokens (`graphite-*`, `clay-*`, `danger-*`) — no arbitrary hex values.
- The poller only watches tasks with a currently-alive PTY session (`pty-manager.ts`'s `listAliveSessions()`), never every task in the store.
