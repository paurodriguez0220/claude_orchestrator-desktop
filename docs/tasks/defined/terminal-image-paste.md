# Task: Paste images into the terminal

**Status:** Defined

## Goal

Let a pasted image (e.g. a screenshot) reach Claude — today it silently does nothing.

## Context

Root-cause investigation (via `superpowers:systematic-debugging`) confirmed there is no clipboard/paste handling anywhere in the codebase (`grep -ri "paste|clipboard"` across `src/` returns zero matches). This is not a regression — it was never implemented. `TerminalTab` wraps xterm.js, which only handles plain-text paste out of the box (it reads `clipboardData.getData('text/plain')` via its own hidden textarea); it has no support for image clipboard data. A real native terminal (iTerm2, Windows Terminal) can special-case a pasted/dropped image because it owns the whole window; this app's terminal is a custom xterm.js instance inside Electron, which gives it the same opportunity — it just doesn't use it yet.

## Proposed Design

### Detection

`TerminalTab` adds a native `paste` event listener on the terminal's container element (separate from xterm.js's own internal paste handling). On paste, it inspects `event.clipboardData.items` for an entry whose MIME type starts with `image/`. If none is found — the normal case, a text paste — nothing changes; the event proceeds and xterm.js handles it exactly as it does today. If an image entry is found, `event.preventDefault()` stops xterm's own (would-be-broken) text paste, and the image is handled as described below instead.

### Saving the image

The image `Blob` is read into a base64 data URL (`FileReader.readAsDataURL`) in the renderer, then sent to a new `SaveClipboardImage` IPC call: `saveClipboardImage(taskId: string, dataUrl: string): Promise<string>`. The main-process handler decodes the base64 payload, derives a file extension from the data URL's MIME prefix (`image/png` → `.png`, `image/jpeg` → `.jpg`, `image/gif` → `.gif`, `image/webp` → `.webp`; anything else is rejected with an error), and writes it to `claude-orchestrator/pasted-images/<uuid>.<ext>` (a new top-level folder under the existing runtime data root, alongside `repos/`/`tasks/`), returning the absolute path.

### Getting it to Claude

The renderer takes the returned path and sends it into that task's terminal via the existing `sendPtyInput(taskId, data)` — exactly as if it had been typed — wrapping it in double quotes if it contains a space. This mirrors how a real terminal behaves when you drag-and-drop a file into it: the path appears on the input line, and you press Enter yourself (along with typing anything else) when ready. Claude Code CLI reads the file at that path as an attached image once you send it.

## Non-Goals

- No automatic cleanup of old files under `pasted-images/` — flagged as a future improvement, not urgent for a personal single-user tool.
- No thumbnail/preview rendering inside the terminal itself.
- No support for multiple images in one paste event — only the first image item found is handled.
- No changes to xterm.js's existing text-paste behavior.

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasting an image into a task's terminal saves it to disk and types its file path into that terminal's input line.

**Architecture:** A new `saveClipboardImage` main-process function + `SaveClipboardImage` IPC channel decodes a base64 data URL to a file under `claude-orchestrator/pasted-images/`. `TerminalTab` gains a `paste` event listener that detects image clipboard data, calls the new IPC channel, and forwards the resulting path into the PTY via the existing `sendPtyInput`.

**Tech Stack:** Same as the rest of the project — TypeScript strict, React 18, Node.js `fs/promises`, Vitest + React Testing Library, Electron IPC.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames.
- A normal text paste must be completely unaffected — the new paste listener only intervenes when an image MIME type is actually present in the clipboard data.
- The saved file's extension must be derived from the actual image MIME type, not assumed — an unrecognized image MIME type is rejected with a clear error, not silently mis-written.
