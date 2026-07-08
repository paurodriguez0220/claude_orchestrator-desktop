# Task: Task search bar

**Status:** Defined

## Goal

Let you find a task by typing a keyword related to it — its title, notes content, branch name, or ADO ticket id — instead of scanning the sidebar by eye.

## Context

The sidebar lists every task nested under its repo, with no way to filter or search. As the number of managed repos/tasks grows, finding "that task about the health check endpoint" means visually scanning every repo's task list. Task notes bodies (the free-text content in the right-pane panel) only exist as `.md` files on disk — the renderer never holds all of them in memory (only the currently-open tabs' notes are cached, per the multi-tab feature) — so a body search has to happen in the main process.

## Proposed Design

### Search scope

A match against any of: task title, notes body (the `.md` file's content after frontmatter), branch name, or ADO ticket id. Case-insensitive substring match — no fuzzy matching, no ranking, matching the simple conventions used everywhere else in this app.

### Search execution

A new `TaskSearch` IPC channel takes a query string and returns the list of matching task ids. The handler reads the store for title/branch/adoId matching (already in memory) and reads each task's notes file via the existing `readTaskNotes`/`notes-service.ts` for body matching, combining both into one result set — no new file format or duplicate storage of notes content.

### UI

A search input at the top of the sidebar, above the repo list. As you type, the input is debounced (~250ms after the last keystroke) before calling `TaskSearch`, to avoid firing on every keystroke. While a query is active, each repo's task list is filtered down to just the matching ids (via the returned array of task ids intersected with `tasksByRepoId`); a repo with zero matches under an active query doesn't render at all. Clearing the search box (empty string) restores the full, unfiltered view instantly, without a `TaskSearch` round-trip.

## Non-Goals

- No search-result snippets/highlighting of the matched text.
- No fuzzy matching or relevance ranking — plain substring match only.
- No keyboard shortcut to focus the search box (e.g. `Ctrl+K`) for v1.
- No caching of search results across queries — every non-empty query triggers a fresh `TaskSearch` call.

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing in a sidebar search box filters the visible tasks to ones matching the query in title, notes body, branch, or ADO id.

**Architecture:** A new `TaskSearch` IPC channel and its main-process handler combine an in-memory store scan (title/branch/adoId) with per-task notes-file reads (body) to return matching task ids. `App` debounces the search input and intersects the result with its existing `tasksByRepoId` grouping before passing it to `RepoSidebar`.

**Tech Stack:** Same as the rest of the project — TypeScript strict, React 18, Tailwind CSS tokens, Vitest + React Testing Library.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one component per file, `JSX.Element` return types.
- Styling uses Tailwind CSS v4 tokens (`graphite-*`, `clay-*`, `danger-*`) — no arbitrary hex values.
- Matching is case-insensitive substring only — no new dependency (e.g. a fuzzy-search library) for this.
