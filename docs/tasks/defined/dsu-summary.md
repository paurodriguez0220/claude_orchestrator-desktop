# Task: Daily stand-up (DSU) summary service

**Status:** Defined

## Goal

On demand, generate a written summary of what actually got done across your tasks since the last working day, so you have something ready to say in stand-up without reconstructing it from memory.

## Context

Every task's worktree already accumulates real git history as work happens. Nothing today aggregates that across tasks into a single readable recap. This app already always shells out to the `claude` CLI (via `node-pty` in `pty-manager.ts`) rather than calling the Anthropic API directly — there is no API key config anywhere in this app, and DSU should not be the first feature to introduce one. It should reuse the same already-authenticated `claude` CLI, just in a new **non-interactive, one-shot** mode (`claude -p "<prompt>"`, captured via `execFile` like `git-service.ts` already does for git commands) rather than the existing interactive `pty.spawn` mode — this is a new pattern for this codebase and should be flagged as a standards-docs candidate at merge time.

## Proposed Design

### Source of truth

Git commit history, per task, on that task's own branch (`worktreePath`). Concretely: `git log --since=<cutoff> --pretty=%s` (via `execFile`, matching `git-service.ts`'s existing argument-array pattern — never string-interpolated) run in each task's worktree.

### "Last working day" cutoff

If today is Monday, cutoff = last Friday at local midnight. Otherwise, cutoff = yesterday at local midnight. No holiday calendar, no configurable work-week (YAGNI for v1) — this covers the common Mon–Fri case and is a one-line rule, not a scheduling system.

### Trigger

Manual only, via a new "Generate DSU" button (sidebar, near the repo list). No automatic daily generation, no background scheduler — the existing 5-minute/5-second pollers in this app are for live state (transcripts, finished-state); DSU is an explicit, occasional action, not something to poll for.

### Synthesis

For every task with at least one commit since the cutoff: collect its title and that list of commit subjects. Build one prompt covering all such tasks and run it through `claude -p` non-interactively (a new one-shot main-process helper, not the existing pty-based session code) asking for a concise, stand-up-style write-up (what was done, task by task). Capture stdout as the summary text. Tasks with zero commits in range are omitted entirely — no "nothing to report" filler.

### Delivery

Write the result to `<runtime-data-root>/dsu/<date>.md` (same root as `claude-orchestrator/`, mirroring the existing transcript-export file convention) and show it in a simple modal in the renderer immediately after generation, so you don't have to go find the file to read it.

## Non-Goals

- No automatic/scheduled generation — manual button only for v1.
- No Slack/email/clipboard posting — a local markdown file + on-screen modal only.
- No custom date-range picker — always "since last working day," not configurable per run.
- No holiday-aware or per-user-configurable work week.
- No Anthropic API key configuration — reuses the CLI's existing login exclusively.
- No editing of the generated summary before saving — it's written as generated; regenerate by clicking the button again if it's wrong.

---
*Added: 2026-07-09*
*Standards: https://github.com/paurodriguez0220/standards-docs*
