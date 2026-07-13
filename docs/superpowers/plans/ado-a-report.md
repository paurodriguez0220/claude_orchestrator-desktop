# ADO Integration — Plan A (read side) — Implementation Report

Branch: `feature/ado-integration` (not pushed/merged, as instructed).

## Commits (in order)

1. `9151c5f` — feat(ado): add ado-service (auth check, config, list my tasks)
   - `src/main/services/ado-service.ts` (+ test), `AdoWorkItem` added to `src/shared/ipc-channels.ts`.
2. `c676c62` — feat(ado): IPC + preload for listing ADO tasks and config
   - `src/main/ipc/ado-handlers.ts` (+ test), registered in `src/main/index.ts`, preload facade (`listAdoTasks`, `getAdoConfig`) + test cases.
3. `ea86300` — feat(new-task-modal): accept initial title + ADO id for prefill
   - `NewTaskModalProps` gains `initialTitle?`/`initialAdoId?`, seeded into `useState`.
4. `9f7d19d` — feat(ado): ADO tasks modal + sidebar entry + create-worktree-from-item
   - New `src/renderer/components/ado-tasks-modal/ado-tasks-modal.tsx` (+ test), `ListChecks` sidebar button (`onOpenAdoClick`) in `repo-sidebar.tsx` (+ existing tests updated with the new required prop), `app.tsx` wiring (state, `handleOpenAdo`, `handleCreateWorktreeFromAdoItem`, modal render, `NewTaskModal` prefill/key/clear-on-close), 3 new `app.test.tsx` cases.

## TDD process

Each task: wrote/extended the test file first, ran it and confirmed failure (module-not-found / missing prop / missing button), then implemented per the plan's code, reran to green, then typecheck, then commit. All 4 tasks followed this loop.

## Test summary

Full suite green after Task A4: `npm run typecheck` clean; `npm test` → main 182/182 passed (22 files), renderer 169/169 passed (15 files). No skipped/pending tests.

## Deviations from the plan (minor, functionally equivalent)

- Task A4: implemented `onCreateWorktree` as a named `handleCreateWorktreeFromAdoItem` function (with the plan's documented V1 limitation — `repos[0]` used, no repo picker — carried as a code comment) rather than an inline arrow in JSX. Same behavior, easier to test/read.
- Did not call `listBranches` when opening the New Task modal from an ADO item (plan didn't specify this); branches stay `[]` until the user toggles "Use existing branch". New-branch mode (the default) doesn't need them, consistent with existing `isLoadingBranches` semantics elsewhere in the app.

## Concerns

- None blocking. `az` CLI behavior is entirely mocked in tests, as instructed — no real `az` calls were made or verified against a live ADO org.
- One untracked `.superpowers/` directory appeared in git status at task start (pre-existing, not created by this work); left untouched.

## Code review fixes (round 2)

5. `fix(ado): load branches when creating a worktree from an ADO item` — `src/renderer/app.tsx`, `src/renderer/app.test.tsx`
   - Finding 1 (Important). Extracted `handleNewTaskClick`'s branch-loading logic into a shared `loadBranchesForRepo(repoId)` (sets/clears `isLoadingBranches`, applies the existing `newTaskRepoIdRef` stale-response guard). `handleCreateWorktreeFromAdoItem` is now `async` and calls it after setting prefill/repo/mode, closing the loop noted as a deviation in Task A4 above. `onCreateWorktree` prop wiring updated to `(item) => void handleCreateWorktreeFromAdoItem(item)` to match the codebase's async-handler convention. New test asserts `listBranches` is called with the repo id and the loading spinner appears/clears; existing prefill test also asserts `listBranches` was called.
6. `fix(ado): reject WIQL-unsafe characters in assignee email` — `src/main/services/ado-service.ts`, `src/main/services/ado-service.test.ts`
   - Finding 2 (Important). Tightened `EMAIL_RE` to `/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/`, rejecting a single quote (or other WIQL metacharacters) before any `az` call. Added test: `listMyAssignedTasks("x'y@z.com")` rejects with `AdoCommandError` and `execFile` is never called. Default email still passes.
7. `test(ado): replace tautological WIQL assertion with a real one` — `src/main/services/ado-service.test.ts`
   - Finding 3 (Confirmed). The `maps az boards query JSON output` test previously asserted `args[3]` equals itself. Replaced with assertions that the WIQL string contains `[System.AssignedTo] = 'paulo.rodriguez@fefundinfo.com'` and `[System.State] NOT IN ('Closed', 'Resolved', 'Done', 'Removed')`, and that the full argv is `['boards','query','--wiql', wiql, '-o','json']`.

### Verification (round 2)

`npm run test:main -- ado-service` → 8/8 passed. `npm run test:renderer -- app` → 48/48 passed. `npm test` → main 183/183 (22 files), renderer 170/170 (15 files). `npm run typecheck` → clean.
