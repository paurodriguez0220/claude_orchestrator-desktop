# Task: Multi-tab terminal follow-ups

**Status:** Planned

## Goal

Small items deferred from the final review of the multi-tab persistent terminals feature. Neither is a blocker.

## Context

Final whole-branch review (2026-07-08) approved the multi-tab feature for merge but deferred two items as fast-follows rather than merge blockers.

## Proposed Design

- `app.tsx`'s `handleCloseTab` removes a tab from `openTaskIds` and advances `activeTaskId` even when `window.claudeOrchestrator.closeTask(taskId)` rejects — only `errorMessage` is set. A failed backend close can look like a successful UI close, potentially orphaning the PTY process. Decide intentionally: either keep "UI always closes, banner warns" (document the choice with a comment) or block tab removal until `closeTask` succeeds.
- `handleCloseTab`'s fallback logic (closing the sole open tab → `activeTaskId` becomes `undefined`; closing a non-active tab → `activeTaskId` unchanged) is currently verified only by code inspection, not dedicated tests. Add two small tests in `app.test.tsx` covering these two branches directly.

## Acceptance Criteria

- [ ] `handleCloseTab`'s behavior on a `closeTask` rejection is an explicit, documented decision (not implicit)
- [ ] Dedicated test: closing the sole open tab sets `activeTaskId` to `undefined`
- [ ] Dedicated test: closing a non-active tab leaves `activeTaskId` unchanged
