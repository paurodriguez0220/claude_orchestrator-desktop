# Task: Icon-based declutter for repeated row actions

**Status:** Defined

## Goal

Replace the noisiest repeated text (per-task "Remove" buttons, the "Review" badge, the archived-section disclosure triangle) with small icons, so the sidebar reads cleanly as it accumulates search/archive/Quick-Questions sections on top of the per-repo tree.

## Context

Every task row today repeats the word "Remove" as a text button, every `'review'`-kind task repeats the word "Review" in a badge, and the archived-section toggle uses a plain `▾`/`▸` text character. As more sections stack up in the sidebar (search, per-repo Archived toggles, Quick Questions), this repeated text is the most avoidable source of visual noise. No icon library is currently installed in this repo.

## Proposed Design

### Library

Add `lucide-react` as a dependency — tree-shakeable, plays cleanly with React + Tailwind, widely used, avoids hand-maintaining SVG paths.

### Scope (row actions only, not top-level buttons)

- **Remove button** (`TaskRow` in `repo-sidebar.tsx`, and the scratch-task row) — replace the "Remove" text with a `Trash2` icon button. Keep an accessible name via `aria-label="Remove task"` (or `"Remove question"` for scratch tasks) so screen readers and existing `getByRole('button', { name: 'Remove' })`-style test queries have an equivalent accessible-name update path.
- **"Review" badge** (`TaskRow`) — replace the text badge with a small `GitPullRequest` icon inside the same badge pill, keeping `aria-label="Review"` (or visually-hidden text) so the existing "shows a Review badge" test still has something to assert against.
- **Archived toggle disclosure** (`RepoSidebar`) — replace the `▾`/`▸` characters with `ChevronDown`/`ChevronRight` icons (already `aria-hidden`, no accessible-name impact — the button's own `Archived (N)` text stays as-is, only the decorative glyph changes).
- **Tab close button** (`TabBar`) — replace the `×` character with an `X` icon, for visual consistency with the new icon set (same accessible name, no behavior change).

Top-level text buttons ("Open Existing Repo", "Clone Repo", "New Task", "Review Code", "+ New Question") are explicitly out of scope for this pass — they're one-per-section, not repeated per row, so they're not contributing to the noise this task is solving.

## Non-Goals

- No icon+label conversion of the top-level per-repo/section action buttons (see Scope).
- No user-configurable icon set or theming — one fixed icon per element.
- No new custom SVG components — `lucide-react`'s existing icons only, no hand-drawn icons for v1.
- No changes to any click/remove/select behavior — this is a purely visual swap of text/characters for icons on already-existing interactive elements.

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repeated per-row text/characters (Remove buttons, the "Review" badge, the Archived disclosure glyph, the tab close `×`) with `lucide-react` icons, without changing any click/remove/select behavior and without losing accessible-name coverage.

**Architecture:** `lucide-react` is added as a runtime dependency (no icon library currently installed). `TaskRow` (in `repo-sidebar.tsx`) and the scratch-task row swap their "Remove" text buttons for icon-only buttons carrying a new `aria-label`; the `'review'`-kind badge swaps its text for a `role="img"`-labelled icon. Both of those are accessible-name changes, so the corresponding tests in `repo-sidebar.test.tsx` are updated to query the new names. The Archived toggle's `▾`/`▸` characters and `TabBar`'s `×` character are purely decorative (already `aria-hidden`, or already carrying their accessible name on the parent button) — those two swaps have no accessible-name impact and no test changes.

**Tech Stack:** Same as the rest of the project — TypeScript strict, React 18, Tailwind CSS v4 tokens, Vitest + React Testing Library, `lucide-react` (`^1.23.0`) for icons.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one component per file, `JSX.Element` return types.
- Styling uses Tailwind CSS v4 tokens (`graphite-*`, `clay-*`, `danger-*`) — no arbitrary hex values.
- Every element that changes from text/a character to an icon keeps an equivalent accessible name: either the existing behavior is preserved untouched (decorative glyph, already `aria-hidden`, or accessible name already lives on a parent element) or a new `aria-label`/`role="img"` pairing is added and the plan's test-update steps show the exact updated query.
- Icons are sized consistently with the existing `Spinner` component's convention: `h-4 w-4` for a standalone icon button, `h-3 w-3` for a small inline/badge icon. No custom SVGs — `lucide-react`'s icon set only.
- `lucide-react` icons default to `aria-hidden="true"` automatically when no accessibility prop (`aria-label`, `role`, etc.) is passed (see `node_modules/lucide-react/dist/esm/Icon.mjs`) — pass `aria-hidden="true"` explicitly anyway for decorative icons so intent is clear in the source, and don't rely on the library default.

---

### Task 1: Add lucide-react; swap TaskRow's Remove button, the scratch-task Remove button, and the Review badge to icons

**Files:**
- Modify: `package.json` (and `package-lock.json`, via `npm install`)
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.tsx`
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx`

**Interfaces:**
- No prop or exported-interface changes. `TaskRow` stays an internal (non-exported) helper with the same `TaskRowProps`.
- Consumes: `Trash2`, `GitPullRequest` from `lucide-react`.
- Accessible-name changes: the `TaskRow` Remove button's accessible name changes from `'Remove'` to `'Remove task'`; the scratch-task row's Remove button's accessible name changes from `'Remove'` to `'Remove question'`; the Review badge gains an accessible name of `'Review'` via `role="img"` (previously it was plain visible text with no separate accessible-name query needed).

- [ ] **Step 1: Add the dependency**

Run: `npm install lucide-react`

This adds `"lucide-react": "^1.23.0"` (or whatever version npm resolves at install time) to `package.json`'s `dependencies` and updates `package-lock.json`.

- [ ] **Step 2: Update the existing tests that query the old "Remove"/"Review" text**

In `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx`:

Rename this test and update its query (currently the test titled `'calls onRemoveTaskClick with the task id when "Remove" is clicked'`):

```tsx
  it('calls onRemoveTaskClick with the task id when "Remove task" is clicked', async () => {
    // ...unchanged render(...) call...
    await userEvent.click(screen.getByRole('button', { name: 'Remove task' }));
    expect(onRemoveTaskClick).toHaveBeenCalledWith('task-1');
  });
```

Update the Review badge assertion (currently `expect(screen.getByText('Review', { selector: 'span' })).toBeInTheDocument();` inside the `'shows a "Review" badge next to a task whose kind is "review"'` test) to:

```tsx
    expect(screen.getByRole('img', { name: 'Review' })).toBeInTheDocument();
```

Update the archived-remove test's query (currently `const removeButtons = screen.getAllByRole('button', { name: 'Remove' });` inside the `'calls onRemoveTaskClick with the archived task id when Remove is clicked after expanding'` test) to:

```tsx
    const removeButtons = screen.getAllByRole('button', { name: 'Remove task' });
```

- [ ] **Step 3: Write the new failing test for the scratch-task Remove button**

Insert this test into the existing `describe('RepoSidebar', ...)` block, directly after the `'renders scratch tasks in a Quick Questions section, showing only title and status'` test:

```tsx
  it('calls onRemoveTaskClick with the scratch task id when "Remove question" is clicked', async () => {
    const onRemoveTaskClick = vi.fn();
    const scratchTask: TaskRecord = {
      id: 'task-4',
      title: 'What does this error mean?',
      worktreePath: 'C:\\scratch\\task-4',
      status: 'in-progress',
      kind: 'scratch',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    };
    render(
      <RepoSidebar
        repos={[]}
        activeTasksByRepoId={{}}
        archivedTasksByRepoId={{}}
        scratchTasks={[scratchTask]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={onRemoveTaskClick}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove question' }));
    expect(onRemoveTaskClick).toHaveBeenCalledWith('task-4');
  });
```

- [ ] **Step 4: Run tests to verify the updated/new ones fail, and the rest still pass**

Run: `npm run test:renderer -- repo-sidebar`
Expected: the renamed "Remove task" test, the "Review" `role="img"` assertion, the archived-remove test, and the new scratch "Remove question" test all FAIL (no `aria-label`/`role="img"` exists yet — buttons/badge are still plain text named `'Remove'`/`'Review'`). All other tests still PASS.

- [ ] **Step 5: Implement**

In `src/renderer/components/repo-sidebar/repo-sidebar.tsx`, add the import:

```tsx
import { useState } from 'react';
import { GitPullRequest, Trash2 } from 'lucide-react';
import type { RepoRecord, TaskRecord } from '../../../shared/types';
import { TaskSearchInput } from '../task-search-input/task-search-input';
```

Replace the `TaskRow` function body with:

```tsx
function TaskRow({ task, selectedTaskId, onSelectTask, onRemoveTaskClick }: TaskRowProps): JSX.Element {
  return (
    <li className="flex items-center justify-between gap-2">
      <button
        type="button"
        aria-pressed={task.id === selectedTaskId}
        onClick={() => onSelectTask(task.id)}
        className={
          task.id === selectedTaskId
            ? 'flex-1 truncate rounded-md bg-clay-600/20 px-2 py-1 text-left text-sm font-medium text-clay-400'
            : 'flex-1 truncate rounded-md px-2 py-1 text-left text-sm text-graphite-200 hover:bg-graphite-700'
        }
      >
        {task.title}
      </button>
      {task.kind === 'review' && (
        <span className="shrink-0 rounded-full bg-clay-600/20 px-1.5 py-0.5 text-clay-400">
          <GitPullRequest role="img" aria-label="Review" className="h-3 w-3" />
        </span>
      )}
      <button
        type="button"
        aria-label="Remove task"
        onClick={() => onRemoveTaskClick(task.id)}
        className="shrink-0 rounded-md px-2 py-1 text-graphite-400 hover:text-danger-400"
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
      </button>
    </li>
  );
}
```

Replace the scratch-task `<li>` block (inside the `Quick Questions` section's `<ul>`) with:

```tsx
          {scratchTasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-pressed={task.id === selectedTaskId}
                onClick={() => onSelectTask(task.id)}
                className={
                  task.id === selectedTaskId
                    ? 'flex-1 truncate rounded-md bg-clay-600/20 px-2 py-1 text-left text-sm font-medium text-clay-400'
                    : 'flex-1 truncate rounded-md px-2 py-1 text-left text-sm text-graphite-200 hover:bg-graphite-700'
                }
              >
                {task.title}
              </button>
              <span className="shrink-0 text-xs text-graphite-400">{task.status}</span>
              <button
                type="button"
                aria-label="Remove question"
                onClick={() => onRemoveTaskClick(task.id)}
                className="shrink-0 rounded-md px-2 py-1 text-graphite-400 hover:text-danger-400"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          ))}
```

Everything else in the file (props, `RepoSidebar`'s body, the archived-toggle logic) stays exactly as-is for this task.

- [ ] **Step 6: Run tests to verify all pass**

Run: `npm run test:renderer -- repo-sidebar`
Expected: PASS (all tests, including the 3 updated and 1 new one)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/renderer/components/repo-sidebar
git commit -m "feat: replace TaskRow Remove/Review text with lucide-react icons"
```

---

### Task 2: Swap the Archived toggle's disclosure characters for chevron icons

**Files:**
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.tsx`

**Interfaces:**
- No prop or exported-interface changes.
- Consumes: `ChevronDown`, `ChevronRight` from `lucide-react`.
- No accessible-name change: the disclosure glyph is already `aria-hidden="true"` and carries no accessible name of its own — the toggle button's accessible name remains its visible text, `` `Archived (${archivedTasks.length})` ``, which is asserted by the existing tests (`'Archived (1)'`) and is untouched by this task.

- [ ] **Step 1: Confirm the regression baseline before editing**

Run: `npm run test:renderer -- repo-sidebar`
Expected: PASS (all tests, including Task 1's changes) — this is the baseline these tests must still pass after swapping the glyph, since the glyph itself has no test coverage (it's decorative/`aria-hidden`) and no new test is needed for a purely visual, non-labelled swap.

- [ ] **Step 2: Implement**

In `src/renderer/components/repo-sidebar/repo-sidebar.tsx`, update the import:

```tsx
import { ChevronDown, ChevronRight, GitPullRequest, Trash2 } from 'lucide-react';
```

Replace:

```tsx
                    <span aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
```

with:

```tsx
                    {isExpanded ? (
                      <ChevronDown aria-hidden="true" className="h-3 w-3" />
                    ) : (
                      <ChevronRight aria-hidden="true" className="h-3 w-3" />
                    )}
```

- [ ] **Step 3: Run tests to verify still green**

Run: `npm run test:renderer -- repo-sidebar`
Expected: PASS (no test changes, no regressions — `aria-expanded` and the `Archived (N)` accessible name are unaffected)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/repo-sidebar/repo-sidebar.tsx
git commit -m "feat: replace Archived toggle glyph with lucide-react chevron icons"
```

---

### Task 3: Swap TabBar's close `×` character for an X icon

**Files:**
- Modify: `src/renderer/components/tab-bar/tab-bar.tsx`

**Interfaces:**
- No prop or exported-interface changes.
- Consumes: `X` from `lucide-react`.
- No accessible-name change: the close button's accessible name already comes from its own `aria-label={\`Close ${tab.title}\`}` (not from the `×` character), so the existing test `getByRole('button', { name: 'Close Fix login bug' })` in `tab-bar.test.tsx` is untouched by this task.

- [ ] **Step 1: Confirm the regression baseline before editing**

Run: `npm run test:renderer -- tab-bar`
Expected: PASS (all 5 existing tests) — baseline these must still pass after the swap, since the `×` character carries no accessible name and no new test is needed.

- [ ] **Step 2: Implement**

In `src/renderer/components/tab-bar/tab-bar.tsx`, add the import:

```tsx
import { X } from 'lucide-react';
```

Replace the close button's contents:

```tsx
            <button
              type="button"
              onClick={() => onCloseTab(tab.taskId)}
              aria-label={`Close ${tab.title}`}
              className="rounded px-1 text-xs text-graphite-400 hover:bg-graphite-700 hover:text-graphite-100"
            >
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
```

- [ ] **Step 3: Run tests to verify still green**

Run: `npm run test:renderer -- tab-bar`
Expected: PASS (all 5 existing tests, no changes needed)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/tab-bar/tab-bar.tsx
git commit -m "feat: replace tab close character with lucide-react X icon"
```

---

*Added: 2026-07-09*
*Standards: https://github.com/paurodriguez0220/standards-docs*
