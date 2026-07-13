# Branch Category Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick a branch "folder" (prefix) from a preset dropdown (`feature/`, `fix/`, `chore/`, `refactor/`) when creating a task on a new branch, composed with the title slug, while preserving free-text full-branch entry via a Custom… option.

**Architecture:** The New Task modal composes the chosen prefix with the title; the prefix travels to the main process as a new `branchPrefix` field on `TaskCreateRequest`, where the branch is composed as `` `${branchPrefix}${slug}` ``. `slugify` moves to a shared module so both the renderer (live preview) and main (branch/worktree naming) use one source of truth. Blast radius is the modal, one shared type, the create-task handler, and the slug module.

**Tech Stack:** Electron, React 18 + TypeScript (strict), Vitest + Testing Library, Tailwind.

## Global Constraints

- TypeScript strict mode; no `any`; named exports only.
- Follow existing file/test patterns in each directory.
- Git identity stays personal (`paurodriguez0220`); never the corporate identity.
- Before each commit: `npm run typecheck` clean and the touched test suite green.
- Default branch prefix is `feature/` (this intentionally changes the old blank default of `task/`).
- Preset prefixes, in order: `feature/`, `fix/`, `chore/`, `refactor/`.

---

### Task 1: Extract `slugify` into a shared module

Moves `slugify` from `src/main/services/slug.ts` to `src/shared/slug.ts` (single source of truth) so the renderer can reuse it for the live preview. Security guards (`assertSafeBranchName`, `assertSafeFolderName`, `assertValidGitUrl`) stay in main. Pure refactor — behaviour unchanged.

**Files:**
- Create: `src/shared/slug.ts`
- Create: `src/shared/slug.test.ts`
- Modify: `src/main/services/slug.ts:1-8` (remove local `slugify`, re-export from shared)
- Modify: `src/main/services/slug.test.ts:1-21` (remove the `slugify` describe block; keep guard tests)

**Interfaces:**
- Consumes: nothing.
- Produces: `slugify(title: string): string` exported from `src/shared/slug.ts`; still re-exported from `src/main/services/slug.ts` so existing main-side imports (`task-handlers.ts`) keep working unchanged.

- [ ] **Step 1: Write the failing test**

Create `src/shared/slug.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates a plain title', () => {
    expect(slugify('Fix Login Bug')).toBe('fix-login-bug');
  });

  it('strips characters outside a-z0-9 and collapses separators', () => {
    expect(slugify('Fix login bug!! (urgent)')).toBe('fix-login-bug-urgent');
  });

  it('strips shell metacharacters entirely', () => {
    expect(slugify('title; rm -rf / && echo pwned')).toBe('title-rm-rf-echo-pwned');
  });

  it('truncates to 60 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long).length).toBe(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer -- shared/slug`
Expected: FAIL — cannot resolve `./slug` (module does not exist yet).

- [ ] **Step 3: Create the shared module**

Create `src/shared/slug.ts`:

```ts
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
```

- [ ] **Step 4: Re-export from the main slug module**

In `src/main/services/slug.ts`, replace the local `slugify` definition (lines 1-8) with a re-export, leaving everything from `SAFE_BRANCH_PATTERN` onward untouched:

```ts
export { slugify } from '../../shared/slug';

const SAFE_BRANCH_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;
```

- [ ] **Step 5: Remove the now-duplicated slugify tests from the main slug test**

In `src/main/services/slug.test.ts`, delete the entire `describe('slugify', ...)` block (lines 4-21). Update the import on line 2 to drop `slugify`:

```ts
import { assertSafeBranchName, assertValidGitUrl, assertSafeFolderName } from './slug';
```

- [ ] **Step 6: Run both suites + typecheck to verify green**

Run: `npm run typecheck && npm run test:renderer -- shared/slug && npm run test:main -- slug`
Expected: PASS — shared slugify tests pass; main guard tests pass; no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared/slug.ts src/shared/slug.test.ts src/main/services/slug.ts src/main/services/slug.test.ts
git commit -m "refactor: move slugify to a shared module for renderer reuse"
```

---

### Task 2: Compose the branch from `branchPrefix` in the main process

Adds the `branchPrefix` field to the create-task contract and composes the default branch as `` `${branchPrefix ?? 'feature/'}${slug}` ``. Explicit `branch` (Custom…) and existing-branch paths are unchanged.

**Files:**
- Modify: `src/shared/ipc-channels.ts:43-50` (add `branchPrefix?: string`)
- Modify: `src/main/ipc/task-handlers.ts:62` (compose branch from prefix)
- Modify: `src/main/ipc/task-handlers.test.ts:98` (flip default expectation) and add new cases

**Interfaces:**
- Consumes: `slugify` (Task 1); `TaskCreateRequest` from `src/shared/ipc-channels.ts`.
- Produces: `TaskCreateRequest.branchPrefix?: string`. Branch resolution order in the create handler: `existingBranch` → explicit `branch` → `` `${branchPrefix ?? 'feature/'}${slug}` ``.

- [ ] **Step 1: Add the field to the shared contract**

In `src/shared/ipc-channels.ts`, add `branchPrefix` to `TaskCreateRequest` (after `branch`):

```ts
export interface TaskCreateRequest {
  repoId?: string;
  title: string;
  adoId?: string;
  branch?: string;
  branchPrefix?: string;
  existingBranch?: string;
  kind?: TaskKind;
}
```

- [ ] **Step 2: Update the existing default-branch test to expect `feature/`, and add new cases**

In `src/main/ipc/task-handlers.test.ts`, change the assertion on line 98 from `task/fix-login-bug` to `feature/fix-login-bug`:

```ts
expect(addWorktree).toHaveBeenCalledWith('C:\\demo', 'C:\\demo\\..\\demo-worktrees\\fix-login-bug', 'feature/fix-login-bug');
```

Then add these two tests inside the `describe('task-handlers', ...)` block (after the existing TaskCreate default test):

```ts
it('TaskCreate composes the branch from branchPrefix + slug', async () => {
  const handler = handlers.get(IpcChannels.TaskCreate);
  const task = await handler?.({}, { repoId: 'repo-1', title: 'Fix login bug', branchPrefix: 'fix/' });
  expect(addWorktree).toHaveBeenCalledWith('C:\\demo', 'C:\\demo\\..\\demo-worktrees\\fix-login-bug', 'fix/fix-login-bug');
  expect(task).toMatchObject({ branch: 'fix/fix-login-bug' });
});

it('TaskCreate lets an explicit branch override the prefix', async () => {
  const handler = handlers.get(IpcChannels.TaskCreate);
  const task = await handler?.({}, { repoId: 'repo-1', title: 'Fix login bug', branchPrefix: 'fix/', branch: 'hotfix/custom' });
  expect(addWorktree).toHaveBeenCalledWith('C:\\demo', 'C:\\demo\\..\\demo-worktrees\\fix-login-bug', 'hotfix/custom');
  expect(task).toMatchObject({ branch: 'hotfix/custom' });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:main -- task-handlers`
Expected: FAIL — default test now expects `feature/fix-login-bug` but code still produces `task/fix-login-bug`; the prefix-compose test fails likewise.

- [ ] **Step 4: Implement the branch composition**

In `src/main/ipc/task-handlers.ts`, change line 62 from:

```ts
    const branch = existingBranch !== undefined ? existingBranch : (request.branch ?? `task/${slug}`);
```

to:

```ts
    const branch = existingBranch !== undefined ? existingBranch : (request.branch ?? `${request.branchPrefix ?? 'feature/'}${slug}`);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:main -- task-handlers`
Expected: PASS — default composes `feature/fix-login-bug`; `fix/` prefix composes `fix/fix-login-bug`; explicit branch overrides.

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/ipc/task-handlers.ts src/main/ipc/task-handlers.test.ts
git commit -m "feat: compose task branch from a chosen prefix (default feature/)"
```

---

### Task 3: Add the prefix dropdown to the New Task modal

Replaces the free-text "Branch (optional)" input (new-branch mode only) with a preset prefix `<select>` plus a live branch preview; a `Custom…` option restores the free-text full-branch box. Forwards `branchPrefix` via the existing `...fields` spread in `app.tsx` (no `app.tsx` logic change).

**Files:**
- Modify: `src/renderer/components/new-task-modal/new-task-modal.tsx` (add `branchPrefix` to `NewTaskFields`; prefix select + preview + Custom…)
- Modify: `src/renderer/components/new-task-modal/new-task-modal.test.tsx` (update 4 onSubmit expectations + line 47 assertion; add 4 new tests)

**Interfaces:**
- Consumes: `slugify` from `src/shared/slug.ts` (Task 1); `NewTaskModalProps` (unchanged); `branchPrefix` on the create contract (Task 2).
- Produces: `NewTaskFields` gains `branchPrefix: string | undefined`. In new-branch preset mode it submits `{ branch: undefined, branchPrefix: <selected> }`; in Custom… mode `{ branch: <typed> || undefined, branchPrefix: undefined }`; in existing/review mode `{ branch: undefined, branchPrefix: undefined, existingBranch: <selected> }`.

- [ ] **Step 1: Write the failing tests**

In `src/renderer/components/new-task-modal/new-task-modal.test.tsx`:

(a) Update the existing "submits title, optional adoId, and optional branch" test (lines 18-23) to include the default prefix:

```ts
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Fix login bug',
      adoId: 'ADO-1234',
      branch: undefined,
      branchPrefix: 'feature/',
      existingBranch: undefined,
    });
```

(b) In the three existing/review-branch submit tests, add `branchPrefix: undefined` to each expected object (the test at lines 71-76, the review test at 120-125, and the review test at 160-165). Each becomes, e.g.:

```ts
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Resume feature work',
      adoId: undefined,
      branch: undefined,
      branchPrefix: undefined,
      existingBranch: 'feature-x',
    });
```

(c) Replace the pre-toggle assertion on line 47 (`expect(screen.queryByRole('combobox')).not.toBeInTheDocument();`) with:

```ts
    expect(screen.getByRole('combobox', { name: 'Branch folder' })).toBeInTheDocument();
```

(d) Add these new tests inside the `describe('NewTaskModal', ...)` block:

```ts
  it('defaults the branch folder to feature/ and previews prefix + title slug', async () => {
    render(<NewTaskModal isOpen mode="task" branches={[]} isSubmitting={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix Login Bug');
    expect(screen.getByTestId('branch-preview')).toHaveTextContent('feature/fix-login-bug');
  });

  it('submits the selected folder as branchPrefix with no explicit branch', async () => {
    const onSubmit = vi.fn();
    render(<NewTaskModal isOpen mode="task" branches={[]} isSubmitting={false} onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix Login Bug');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Branch folder' }), 'fix/');
    expect(screen.getByTestId('branch-preview')).toHaveTextContent('fix/fix-login-bug');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Fix Login Bug',
      adoId: undefined,
      branch: undefined,
      branchPrefix: 'fix/',
      existingBranch: undefined,
    });
  });

  it('Custom… reveals a free-text branch field and submits it as branch (no prefix)', async () => {
    const onSubmit = vi.fn();
    render(<NewTaskModal isOpen mode="task" branches={[]} isSubmitting={false} onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix Login Bug');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Branch folder' }), 'custom');
    await userEvent.type(screen.getByLabelText('Branch (optional)'), 'hotfix/urgent');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Fix Login Bug',
      adoId: undefined,
      branch: 'hotfix/urgent',
      branchPrefix: undefined,
      existingBranch: undefined,
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:renderer -- new-task-modal`
Expected: FAIL — `NewTaskFields` has no `branchPrefix`; no `Branch folder` combobox; no `branch-preview` element.

- [ ] **Step 3: Implement the modal changes**

In `src/renderer/components/new-task-modal/new-task-modal.tsx`:

Add the slugify import after the `BranchOption` import (line 2):

```ts
import { slugify } from '../../../shared/slug';
```

Add `branchPrefix` to `NewTaskFields`:

```ts
export interface NewTaskFields {
  title: string;
  adoId: string | undefined;
  branch: string | undefined;
  branchPrefix: string | undefined;
  existingBranch: string | undefined;
}
```

Add the prefix constants above the component (after `fieldLabelClasses`, line 25):

```ts
const BRANCH_PREFIXES = ['feature/', 'fix/', 'chore/', 'refactor/'] as const;
const CUSTOM_PREFIX = 'custom';
```

Add prefix state next to the other `useState` calls (near line 37):

```ts
  const [prefixChoice, setPrefixChoice] = useState<string>('feature/');
```

Replace `handleSubmit` (lines 47-54) with:

```ts
  const isCustomBranch = prefixChoice === CUSTOM_PREFIX;

  function handleSubmit(): void {
    onSubmit({
      title,
      adoId: adoId || undefined,
      branch: usingExistingBranch ? undefined : isCustomBranch ? branch || undefined : undefined,
      branchPrefix: usingExistingBranch || isCustomBranch ? undefined : prefixChoice,
      existingBranch: usingExistingBranch ? selectedExistingBranch || undefined : undefined,
    });
  }
```

Replace the new-branch else block (current lines 119-131, the `) : ( ... )` branch holding the free-text branch input) with:

```tsx
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="new-task-branch-prefix" className={fieldLabelClasses}>
                Branch folder
              </label>
              <select
                id="new-task-branch-prefix"
                value={prefixChoice}
                onChange={(event) => setPrefixChoice(event.target.value)}
                className={fieldInputClasses}
              >
                {BRANCH_PREFIXES.map((prefix) => (
                  <option key={prefix} value={prefix}>
                    {prefix}
                  </option>
                ))}
                <option value={CUSTOM_PREFIX}>Custom…</option>
              </select>
            </div>
            {isCustomBranch ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="new-task-branch" className={fieldLabelClasses}>
                  Branch (optional)
                </label>
                <input
                  id="new-task-branch"
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  className={fieldInputClasses}
                />
              </div>
            ) : (
              <p className="text-sm text-graphite-400" data-testid="branch-preview">
                Branch: <span className="text-graphite-100">{`${prefixChoice}${slugify(title)}`}</span>
              </p>
            )}
          </div>
        )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:renderer -- new-task-modal`
Expected: PASS — default previews `feature/<slug>`; selecting `fix/` submits `branchPrefix: 'fix/'`; Custom… submits the typed `branch`; existing/review submits unchanged with `branchPrefix: undefined`.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: PASS — all suites green (app.test.tsx uses `objectContaining`, so the new field does not break it).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/new-task-modal/new-task-modal.tsx src/renderer/components/new-task-modal/new-task-modal.test.tsx
git commit -m "feat: add branch folder picker to the New Task modal"
```

---

## Notes

- `app.tsx` needs no change: `handleCreateTask` spreads `...fields` into `createTask`, so `branchPrefix` forwards automatically once it is on `NewTaskFields`.
- `new-task-modal.stories.tsx` needs no change: it does not construct `NewTaskFields` literals, so adding a field does not break it.
- This changes the blank default branch namespace from `task/` to `feature/` — intentional and covered by the updated `task-handlers` test.
