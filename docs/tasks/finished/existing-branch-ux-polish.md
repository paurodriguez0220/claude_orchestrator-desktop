# Task: Polish for existing-branch selection

**Status:** Done

## Goal

Small follow-ups from the final review of "select an existing branch when creating a new task" — none are correctness/security bugs, all are low-probability UX/test-hygiene nits.

## Context

Final whole-branch review (2026-07-08) approved the feature for merge but flagged four minor items worth a cheap follow-up pass.

## Proposed Design

- `git-service.test.ts`: `beforeEach` should `mockReset()` the `execFile` mock (not just `mockClear()`), so a `mockImplementation` set by one test (e.g. `listBranches`) can't leak into a test appended later in the file.
- `new-task-modal.tsx`: submitting in "Use existing branch" mode with no branch selected currently silently falls back to creating a new branch. Disable "Create Task" (or show a validation message) when existing-branch mode has no selection.
- `app.tsx`'s `handleNewTaskClick`: no guard against out-of-order `listBranches` responses (rapid open-repo-A → close → open-repo-B could show A's stale list on B). Add a check that the resolved repoId still matches `newTaskRepoId` before calling `setBranches`; also clear `branches` on modal close.
- `repo-handlers.ts`'s `RepoBranches` handler: if two different remotes expose a branch with the same bare name, both currently become options with the same `value`, producing duplicate React keys and an ambiguous branch to attach to. Single-remote is the common case (no fix needed short-term) but worth a note if multi-remote support is ever added.

## Acceptance Criteria

- [ ] `git-service.test.ts` fully isolates mocks between tests
- [ ] Submitting "Use existing branch" with nothing selected is blocked or clearly flagged, not silently treated as new-branch mode
- [ ] Rapid repo switching while "New Task" branch list is loading never shows the wrong repo's branches
