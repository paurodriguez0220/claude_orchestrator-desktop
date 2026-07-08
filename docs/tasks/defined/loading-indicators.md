# Task: Loading indicators for create/clone/open

**Status:** Defined

## Goal

Give visible feedback for the app's three slowest async actions — creating a task, cloning a repo, and opening an existing task's terminal — so the UI never looks frozen or silently clickable while git/PTY work happens in the background.

## Context

`NewTaskModal`'s "Create Task" button and `CloneRepoModal`'s "Clone" button both call `onSubmit` synchronously with no pending state: the modal stays open, fully interactive, and unchanged in appearance while `App`'s `handleCreateTask`/`handleCloneRepo` run their async work (`git worktree add`, `git clone`, spawning `claude` via node-pty) — inviting a double-click and giving no signal that anything is happening. Selecting an already-existing task from the sidebar has the same gap: `handleSelectTask`'s `openTask` call can take a moment (PTY/`claude` startup), during which the terminal pane shows nothing new.

## Proposed Design

### Modal submission state

`App` tracks `isSubmittingModal: boolean`, set `true` when `handleCreateTask`/`handleCloneRepo` starts and `false` in a `finally` once the whole async chain settles (success or error). `handleCreateTask`'s existing early modal-close (`setNewTaskRepoId(undefined)` right after `createTask` resolves, before `handleSelectTask` runs) moves to after `handleSelectTask` completes, so the modal stays open — with its pending state visible — for the full "create task, then open its terminal" chain, not just the worktree-creation part.

`NewTaskModal`/`CloneRepoModal` each gain an `isSubmitting: boolean` prop: while `true`, both the Cancel and the submit button (`Create Task`/`Clone`) are `disabled`, and the submit button's label switches to `Creating…`/`Cloning…` with a small spinner.

### Opening an existing task

`App` tracks `loadingTaskId: string | undefined` — set to a task's id when `handleSelectTask` begins the "not yet open" branch (the one that calls `openTask`), cleared once that branch's `await`s settle. While a task's id matches `loadingTaskId` and it's the `activeTaskId`, the terminal pane renders a loading overlay ("Starting session…" + spinner) on top of/instead of its `TerminalTab`.

### Shared component

A small presentational `Spinner` component (`src/renderer/components/spinner/spinner.tsx`) — an animated Tailwind spinner, no props beyond an optional size/className — used in all three places above for visual consistency.

## Non-Goals

- No progress percentage/ETA for git clone (no reliable signal to compute one from `execFile`'s current usage) — indeterminate spinner only.
- No changes to error handling/display — the existing `errorMessage` banner is unchanged; this is purely about the in-flight state, not failure states.
- No loading indicator for notes save/autosave (already near-instant, not reported as confusing).

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visible pending/loading state for task creation, repo cloning, and opening an existing task's terminal.

**Architecture:** `App` gains `isSubmittingModal`/`loadingTaskId` state, threaded into `NewTaskModal`/`CloneRepoModal` as an `isSubmitting` prop and into the terminal-pane rendering as a conditional overlay. A new shared `Spinner` component backs all three.

**Tech Stack:** Same as the rest of the project — TypeScript strict, React 18, Tailwind CSS tokens, Vitest + React Testing Library.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one component per file, `JSX.Element` return types.
- Styling uses Tailwind CSS v4 tokens (`graphite-*`, `clay-*`, `danger-*`) — no arbitrary hex values.
- Disabled buttons must remain reachable/labeled for accessibility (no `aria-hidden` on a disabled-but-visible control).
