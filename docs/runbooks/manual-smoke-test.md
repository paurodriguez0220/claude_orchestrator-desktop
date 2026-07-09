# Manual Smoke Test — Claude Orchestrator

Run through this checklist after any change to the Electron shell, PTY spawning, or IPC wiring — these paths aren't covered by automated tests.

1. Run `npm run dev`. The app window opens with an empty sidebar and "Open Existing Repo" / "Clone Repo" buttons.
2. Click "Open Existing Repo", pick an existing local git repo folder via the native picker. It appears in the sidebar. (Separately, try "Clone Repo" with a git URL + name to confirm the clone flow too.)
3. Click "New Task" on that repo. Fill in a title, submit. A terminal pane opens for that task.
4. In the terminal pane, confirm `claude` actually starts (not a blank/frozen pane).
5. Run `git worktree list` in a separate terminal — confirm the new worktree exists at `<repo>-worktrees/<slug>`.
6. Type a message to Claude in the tab; confirm it responds.
7. Close the app entirely, then reopen it (`npm run dev` again). The repo and task should still be listed.
8. Click the task again — confirm `claude --continue` resumes with prior context (ask Claude "what were we just discussing?").
9. Edit the notes panel for the task, click Save, restart the app, reopen the task — the notes persist.
10. Click "Remove" on the task — confirm the browser `confirm()` prompt appears; cancelling it leaves the task untouched. Confirming it removes the task from the sidebar and `git worktree list` no longer shows it.
11. Try creating a task with a title containing `; rm -rf /` — confirm it's slugified/rejected safely and no shell command actually runs with that payload.
12. Select an existing branch when creating a task: pick a repo with at least one branch you haven't opened a worktree for, click "New Task", toggle "Use existing branch", pick that branch, submit. Confirm `git worktree list` shows the new worktree checked out on that exact branch (no `-b` was used to create a *new* branch of the same name). Then, in that same repo, run `git fetch` and pick a branch that only exists as `origin/<name>` (not yet local) from the dropdown — after creating the task, run `git branch` in the repo and confirm a new local branch `<name>` now exists, tracking `origin/<name>`.
13. Visually confirm the new design: dark graphite sidebar with a clay-colored "New Task" button, opening "New Task" or "Clone Repo" shows a centered modal with a dimmed backdrop (clicking the backdrop does NOT close it), selecting a task shows the terminal filling most of the width with a narrower notes panel to its right, and triggering an error (e.g. submit an empty Clone Repo form) shows a red banner at the top with a working "Dismiss" button.
14. Open two different tasks. Confirm both appear as tabs above the terminal, and switching between them preserves each terminal's visible scrollback (type something distinctive in one, switch to the other, switch back — the first tab's text should still be there). Close one tab's × — confirm it disappears from the tab bar but the task still appears in the sidebar, and reopening it resumes via `claude --continue`.
15. Click "New Task", fill in a title, click "Create Task" — confirm the button shows "Creating…" and is disabled, and the modal doesn't close until the new task's terminal appears. Click on an already-existing task in the sidebar — confirm a brief "Starting session…" overlay appears over the terminal pane before it becomes interactive.
16. Open a task and have a short back-and-forth with Claude. Wait 5 minutes (or temporarily lower the interval in `src/main/index.ts` to confirm the mechanism, then revert). Check `%USERPROFILE%\claude-orchestrator\tasks\<taskId>.transcript.md` — confirm it exists and contains a readable "### You" / "### Claude" back-and-forth matching what was actually said, with no raw JSON, ANSI escape codes, or internal "thinking" text in it.
17. Click "Review Code" on a repo with at least one branch you haven't opened a worktree for — confirm it runs a `git fetch` (check timestamps/output in a separate terminal) before the branch dropdown appears, that there's no "New branch"/"Use existing branch" toggle (only the dropdown), and that after picking a branch and submitting, the new task shows a "Review" badge next to its title in the sidebar.
18. Copy a screenshot to the clipboard (e.g. Win+Shift+S), click into an open task's terminal, and paste (Ctrl+V) — confirm a file path appears on the terminal's input line (not garbled text or nothing), pointing at a new file under `%USERPROFILE%\claude-orchestrator\pasted-images\`. Open that file to confirm it's a valid, viewable image. Then paste some normal copied text — confirm it still pastes as plain text exactly as before.
19. Open a task and let Claude finish responding to a message, then switch to a different open tab without touching the first one again. Within ~5 seconds, confirm a small clay-colored dot appears next to the first task's title in the tab bar. Click back on that tab — confirm the dot disappears immediately.

---
*Maintained by paurodriguez0220 · Last updated: 2026-07-08*
*Standards: https://github.com/paurodriguez0220/standards-docs*
