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

---
*Maintained by paurodriguez0220 · Last updated: 2026-07-08*
*Standards: https://github.com/paurodriguez0220/standards-docs*
