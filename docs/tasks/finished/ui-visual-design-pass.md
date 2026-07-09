# Task: UI visual design pass

**Status:** Done

## Goal

Give the app real visual design — right now every renderer component has zero CSS, so the app renders as raw unstyled HTML (overlapping buttons, no layout, modals rendering inline instead of as overlays).

## Context

None of the MVP's 15 tasks or the existing-branch feature's 6 tasks ever added CSS. `src/renderer/index.html` has no stylesheet link, and no component has a `className`/style of any kind. This was fine for building/testing behavior (tests query by role/label/text, not appearance) but the app is now unusable-looking for daily use — confirmed by a screenshot showing the sidebar's "Digital.Knowledge" repo name running into its "New Task" button, and a "Remove" button overlapping a tiny bullet point.

## Proposed Design

### Setup

Add Tailwind CSS v4 via `@tailwindcss/vite` (no separate PostCSS/Tailwind config file needed — the plugin integrates directly into `electron.vite.config.ts`'s renderer Vite config). Add a single global stylesheet (`src/renderer/styles.css`) with the Tailwind import, linked from `index.html`/`main.tsx`.

### Visual direction

Dark theme throughout — a warm neutral graphite background (not default gray-900/blue-gray) with a terracotta/clay accent color for primary buttons, focus rings, and the active-task highlight in the sidebar. Applied via Tailwind's theme customization (CSS custom properties in Tailwind v4's `@theme` block), not scattered hex codes across components.

### Layout

- **App shell**: fixed-width dark sidebar (repos/tasks tree + "Open Existing Repo"/"Clone Repo" buttons) on the left; flexible main content area on the right. Implemented as a CSS grid/flex root in `App`.
- **Task selected**: terminal fills most of the main area's width; `TaskNotesPanel` becomes a narrower fixed-width panel to its right (not full-width below).
- **Error banner**: a visually distinct, dismissable bar anchored at the top of the app (replacing the current bare `<p role="alert">`), styled to read clearly as an error (not just default text color).

### Modals

`NewTaskModal` and `CloneRepoModal` become fixed-position centered overlays with a semi-transparent backdrop, instead of rendering inline in the normal document flow. Clicking the backdrop does not close the modal (avoid accidental data loss while filling a form) — only the existing Cancel button does.

### Terminal

`TerminalTab` passes an explicit `theme` option to the `Terminal` constructor (background/foreground/cursor/selection colors) matching the app's palette, so the embedded terminal reads as part of the app rather than a mismatched black rectangle.

### Non-goals

- No component logic, prop, or IPC behavior changes — this is visual/layout only.
- No new UI component library (no shadcn, no Radix) — Tailwind utility classes directly on existing JSX, per YAGNI for a single-user tool.
- No changes to test files — every existing test queries by role/label/text, not CSS classes, so all should keep passing unmodified. (If a specific test turns out to depend on DOM structure that must change for layout reasons, that's a plan-time decision to flag, not a silent change.)

### Testing

- All existing tests (main + renderer) must continue to pass unmodified — this is the primary regression guard, since there's no visual regression testing in this project.
- Manual verification via the smoke-test runbook: launch the app (`start.bat`), visually confirm the sidebar/main layout, open a modal (confirm it overlays centered with backdrop, not inline), select a task (confirm terminal + side notes panel layout), trigger an error (confirm the banner is visually distinct).

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every renderer component gets real Tailwind-based visual design — dark graphite/clay theme, proper sidebar+main layout, overlay modals, side-panel notes, themed terminal — with zero regressions to existing behavior/tests.

**Architecture:** Tailwind CSS v4 wired into the Vite build (app + Storybook) with a shared `@theme` token palette established once; every component task applies those tokens via utility classes, plus one new shared `ModalOverlay` presentational component both modals reuse.

**Tech Stack:** Tailwind CSS v4, `@tailwindcss/vite`. No other new dependencies.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one component per file, `JSX.Element`/`JSX.Element | null` return types (React 18 pinned).
- Every color/spacing value in component JSX must come from the Tailwind theme tokens established in Task 1 (`graphite-*`, `clay-*`, `danger-*`) — no ad-hoc hex codes or arbitrary Tailwind values (`bg-[#123456]`) scattered across files.
- **Test policy for this plan specifically:** every *existing* test case in every test file must keep passing, unmodified, against the restyled components — styling changes (`className` additions) must never require touching an existing `it(...)` block. Two small, design-doc-mandated interactive additions beyond pure CSS (the error banner's Dismiss button, and the terminal's `theme` option) each get exactly one *new* test case; nothing else changes test files.
- Commit messages follow Conventional Commits (`<type>: <description>`).

---

### Task 1: Tailwind CSS setup (app build + Storybook)

**Files:**
- Modify: `package.json`
- Create: `src/renderer/styles.css`
- Modify: `src/renderer/main.tsx`
- Modify: `electron.vite.config.ts`
- Modify: `.storybook/main.ts`
- Modify: `.storybook/preview.ts`

**Interfaces:**
- Produces: the Tailwind theme tokens every later task consumes by class name: `graphite-950`, `graphite-900`, `graphite-800`, `graphite-700`, `graphite-600`, `graphite-400`, `graphite-200`, `graphite-100` (background/text/border scale), `clay-700`, `clay-600`, `clay-500`, `clay-400` (accent scale), `danger-500`, `danger-400` (error scale). Used as `bg-graphite-900`, `text-clay-500`, `border-graphite-700`, etc.

- [ ] **Step 1: Install Tailwind**

Run:
```bash
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Create the global stylesheet with the design token palette**

Create `src/renderer/styles.css`:

```css
@import "tailwindcss";

html,
body,
#root {
  height: 100%;
}

@theme {
  --color-graphite-950: #17140f;
  --color-graphite-900: #201c17;
  --color-graphite-800: #2b2620;
  --color-graphite-700: #3d362d;
  --color-graphite-600: #524a3d;
  --color-graphite-400: #8c8171;
  --color-graphite-200: #e8e1d4;
  --color-graphite-100: #f4f0e8;

  --color-clay-700: #9a4a2c;
  --color-clay-600: #b95936;
  --color-clay-500: #d97a52;
  --color-clay-400: #e69873;

  --color-danger-500: #d9534f;
  --color-danger-400: #e8817d;
}
```

- [ ] **Step 3: Import the stylesheet in the renderer entry point**

Modify `src/renderer/main.tsx` — add the import as the first line:

```tsx
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Wire the Tailwind Vite plugin into the app build**

Replace the contents of `electron.vite.config.ts`:

```ts
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()],
  },
});
```

- [ ] **Step 5: Wire the Tailwind Vite plugin into Storybook, and import the stylesheet in the preview**

Replace the contents of `.storybook/main.ts`:

```ts
import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-vitest',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-mcp',
  ],
  framework: '@storybook/react-vite',
  async viteFinal(viteConfig) {
    viteConfig.plugins = viteConfig.plugins ?? [];
    viteConfig.plugins.push(tailwindcss());
    return viteConfig;
  },
};
export default config;
```

Modify `.storybook/preview.ts` — add the stylesheet import as the first line:

```ts
import '../src/renderer/styles.css';
import type { Preview } from '@storybook/react-vite';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      test: 'todo',
    },
  },
};

export default preview;
```

- [ ] **Step 6: Verify the full test suite still passes (no component changed yet, this is a pure regression check)**

Run: `npm test`
Expected: PASS — same totals as before this task (no test files touched)

- [ ] **Step 7: Verify Tailwind is actually active in the production build**

Run: `npm run build`
Expected: exits 0

Run: `grep -l "tw-" out/renderer/assets/*.css`
Expected: prints a matching CSS filename — confirms Tailwind's generated output (which uses `--tw-*` custom properties internally) is present in the bundle, even though no component uses a utility class yet.

- [ ] **Step 8: Verify Storybook boots with Tailwind wired in**

Run: `npm run storybook` (then stop it with Ctrl+C once confirmed)
Expected: Storybook dev server starts on port 6006 without error (same boot behavior as the original MVP scaffold check — no visual difference expected yet since no story uses Tailwind classes until Task 2+).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/renderer/styles.css src/renderer/main.tsx electron.vite.config.ts .storybook/main.ts .storybook/preview.ts
git commit -m "chore: add tailwind css v4 with graphite/clay design tokens"
```

---

### Task 2: Shared ModalOverlay component, applied to both modals

**Files:**
- Create: `src/renderer/components/modal-overlay/modal-overlay.tsx`
- Create: `src/renderer/components/modal-overlay/modal-overlay.test.tsx`
- Create: `src/renderer/components/modal-overlay/modal-overlay.stories.tsx`
- Modify: `src/renderer/components/new-task-modal/new-task-modal.tsx`
- Modify: `src/renderer/components/clone-repo-modal/clone-repo-modal.tsx`

**Interfaces:**
- Consumes: Tailwind theme tokens (Task 1).
- Produces: `ModalOverlayProps { children: React.ReactNode }` / `ModalOverlay` — a fixed, centered, backdropped wrapper. Both modals render their existing `role="dialog"` element as `ModalOverlay`'s child (same role/aria-label, same nesting-independent test queries — no existing test needs to change).

- [ ] **Step 1: Write the failing test for ModalOverlay**

Create `src/renderer/components/modal-overlay/modal-overlay.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModalOverlay } from './modal-overlay';

describe('ModalOverlay', () => {
  it('renders its children', () => {
    render(
      <ModalOverlay>
        <p>Overlay content</p>
      </ModalOverlay>,
    );
    expect(screen.getByText('Overlay content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer -- modal-overlay`
Expected: FAIL — `Cannot find module './modal-overlay'`

- [ ] **Step 3: Implement ModalOverlay**

Create `src/renderer/components/modal-overlay/modal-overlay.tsx`:

```tsx
export interface ModalOverlayProps {
  children: React.ReactNode;
}

export function ModalOverlay({ children }: ModalOverlayProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-950/80 p-4">
      <div className="w-full max-w-md rounded-lg border border-graphite-700 bg-graphite-800 p-6 text-graphite-100 shadow-2xl">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:renderer -- modal-overlay`
Expected: PASS (1 test)

- [ ] **Step 5: Add the Storybook story**

Create `src/renderer/components/modal-overlay/modal-overlay.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { ModalOverlay } from './modal-overlay';

const meta: Meta<typeof ModalOverlay> = {
  component: ModalOverlay,
  title: 'Components/ModalOverlay',
};

export default meta;
type Story = StoryObj<typeof ModalOverlay>;

export const Default: Story = {
  args: {
    children: <p className="text-graphite-100">Example modal content</p>,
  },
};
```

- [ ] **Step 6: Wrap NewTaskModal in ModalOverlay and style its fields**

Replace the contents of `src/renderer/components/new-task-modal/new-task-modal.tsx`:

```tsx
import { useState } from 'react';
import type { BranchOption } from '../../../shared/ipc-channels';
import { ModalOverlay } from '../modal-overlay/modal-overlay';

export interface NewTaskFields {
  title: string;
  adoId: string | undefined;
  branch: string | undefined;
  existingBranch: string | undefined;
}

export interface NewTaskModalProps {
  isOpen: boolean;
  branches: BranchOption[];
  onClose: () => void;
  onSubmit: (fields: NewTaskFields) => void;
}

const fieldInputClasses =
  'rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-graphite-100 focus:border-clay-500 focus:outline-none';
const fieldLabelClasses = 'text-sm font-medium text-graphite-400';

export function NewTaskModal({ isOpen, branches, onClose, onSubmit }: NewTaskModalProps): JSX.Element | null {
  const [title, setTitle] = useState('');
  const [adoId, setAdoId] = useState('');
  const [branch, setBranch] = useState('');
  const [useExistingBranch, setUseExistingBranch] = useState(false);
  const [selectedExistingBranch, setSelectedExistingBranch] = useState('');

  if (!isOpen) {
    return null;
  }

  function handleSubmit(): void {
    onSubmit({
      title,
      adoId: adoId || undefined,
      branch: useExistingBranch ? undefined : branch || undefined,
      existingBranch: useExistingBranch ? selectedExistingBranch || undefined : undefined,
    });
  }

  return (
    <ModalOverlay>
      <div role="dialog" aria-label="New Task" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-graphite-100">New Task</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="new-task-title" className={fieldLabelClasses}>
            Title
          </label>
          <input
            id="new-task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={fieldInputClasses}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="new-task-ado-id" className={fieldLabelClasses}>
            ADO Task ID (optional)
          </label>
          <input
            id="new-task-ado-id"
            value={adoId}
            onChange={(event) => setAdoId(event.target.value)}
            className={fieldInputClasses}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className={fieldLabelClasses}>Branch</legend>
          <label className="flex items-center gap-2 text-sm text-graphite-100">
            <input
              type="radio"
              name="branch-mode"
              checked={!useExistingBranch}
              onChange={() => setUseExistingBranch(false)}
              className="accent-clay-500"
            />
            New branch
          </label>
          <label className="flex items-center gap-2 text-sm text-graphite-100">
            <input
              type="radio"
              name="branch-mode"
              checked={useExistingBranch}
              onChange={() => setUseExistingBranch(true)}
              className="accent-clay-500"
            />
            Use existing branch
          </label>
        </fieldset>

        {useExistingBranch ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="new-task-existing-branch" className={fieldLabelClasses}>
              Existing Branch
            </label>
            <select
              id="new-task-existing-branch"
              value={selectedExistingBranch}
              onChange={(event) => setSelectedExistingBranch(event.target.value)}
              className={fieldInputClasses}
            >
              <option value="">Select a branch</option>
              {branches.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
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
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-graphite-400 hover:text-graphite-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-md bg-clay-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:bg-clay-500"
          >
            Create Task
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
```

- [ ] **Step 7: Run the existing NewTaskModal tests to confirm no regression**

Run: `npm run test:renderer -- new-task-modal`
Expected: PASS (all pre-existing tests, unmodified)

- [ ] **Step 8: Wrap CloneRepoModal in ModalOverlay and style its fields**

Replace the contents of `src/renderer/components/clone-repo-modal/clone-repo-modal.tsx`:

```tsx
import { useState } from 'react';
import { ModalOverlay } from '../modal-overlay/modal-overlay';

export interface CloneRepoFields {
  url: string;
  name: string;
}

export interface CloneRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (fields: CloneRepoFields) => void;
}

const fieldInputClasses =
  'rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-graphite-100 focus:border-clay-500 focus:outline-none';
const fieldLabelClasses = 'text-sm font-medium text-graphite-400';

export function CloneRepoModal({ isOpen, onClose, onSubmit }: CloneRepoModalProps): JSX.Element | null {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');

  if (!isOpen) {
    return null;
  }

  return (
    <ModalOverlay>
      <div role="dialog" aria-label="Clone Repo" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-graphite-100">Clone Repo</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="clone-repo-url" className={fieldLabelClasses}>
            Git URL
          </label>
          <input
            id="clone-repo-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className={fieldInputClasses}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="clone-repo-name" className={fieldLabelClasses}>
            Local Name
          </label>
          <input
            id="clone-repo-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={fieldInputClasses}
          />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-graphite-400 hover:text-graphite-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ url, name })}
            className="rounded-md bg-clay-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:bg-clay-500"
          >
            Clone
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
```

- [ ] **Step 9: Run the existing CloneRepoModal tests to confirm no regression**

Run: `npm run test:renderer -- clone-repo-modal`
Expected: PASS (all pre-existing tests, unmodified)

- [ ] **Step 10: Run the full renderer suite and typecheck**

Run: `npm run test:renderer`
Expected: PASS (all files, no regressions)

Run: `npm run typecheck`
Expected: clean

- [ ] **Step 11: Commit**

```bash
git add src/renderer/components/modal-overlay src/renderer/components/new-task-modal src/renderer/components/clone-repo-modal
git commit -m "feat: add modal overlay component and style both modals"
```

---

### Task 3: App shell layout — sidebar/main split, terminal+notes side-by-side, dismissable error banner

**Files:**
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/app.test.tsx`

**Interfaces:**
- Consumes: Tailwind theme tokens (Task 1); `ModalOverlay`-wrapped `NewTaskModal`/`CloneRepoModal` (Task 2).
- Produces: no new exports. Adds one small interactive addition beyond pure CSS — an error banner "Dismiss" button that clears `errorMessage` — covered by one new test per the Global Constraints' test policy.

- [ ] **Step 1: Write the failing test for the new Dismiss button**

Add to `src/renderer/app.test.tsx` (inside the existing `describe('App', ...)` block):

```ts
  it('dismissing the error banner clears the error message', async () => {
    createTask.mockRejectedValueOnce(new Error('git worktree add failed: fatal: branch already exists'));
    render(<App />);
    const newTaskButtons = await screen.findAllByRole('button', { name: 'New Task' });
    const firstNewTaskButton = newTaskButtons[0];
    if (!firstNewTaskButton) {
      throw new Error('Expected at least one "New Task" button to be rendered');
    }
    await userEvent.click(firstNewTaskButton);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix login bug');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer -- app`
Expected: FAIL — no "Dismiss" button exists yet

- [ ] **Step 3: Implement the layout and the Dismiss button**

Modify `src/renderer/app.tsx` — replace only the final `return (...)` block (everything above it — imports, state, handlers — is unchanged):

```tsx
  return (
    <div className="flex h-screen bg-graphite-900 text-graphite-100">
      {errorMessage !== undefined && (
        <div
          role="alert"
          className="fixed inset-x-0 top-0 z-40 flex items-center justify-between bg-danger-500 px-4 py-2 text-sm font-medium text-graphite-100 shadow-lg"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(undefined)}
            className="ml-4 rounded px-2 py-1 text-xs font-semibold hover:bg-graphite-950/20"
          >
            Dismiss
          </button>
        </div>
      )}
      <RepoSidebar
        repos={repos}
        tasksByRepoId={tasksByRepoId}
        selectedTaskId={selectedTaskId}
        onSelectTask={(taskId) => void handleSelectTask(taskId)}
        onOpenRepoClick={() => void handleOpenRepoClick()}
        onCloneRepoClick={() => setIsCloneModalOpen(true)}
        onNewTaskClick={(repoId) => void handleNewTaskClick(repoId)}
        onRemoveTaskClick={(taskId) => void handleRemoveTask(taskId)}
      />
      <NewTaskModal
        isOpen={newTaskRepoId !== undefined}
        branches={branches}
        onClose={() => setNewTaskRepoId(undefined)}
        onSubmit={(fields) => void handleCreateTask(fields)}
      />
      <CloneRepoModal
        isOpen={isCloneModalOpen}
        onClose={() => setIsCloneModalOpen(false)}
        onSubmit={(fields) => void handleCloneRepo(fields)}
      />
      <main className="flex flex-1 overflow-hidden">
        {selectedTaskId !== undefined ? (
          <>
            <div className="flex-1 overflow-hidden">
              <TerminalTab taskId={selectedTaskId} />
            </div>
            <div className="w-80 shrink-0 overflow-y-auto border-l border-graphite-700 bg-graphite-800">
              <TaskNotesPanel
                body={notesBody}
                status={notesStatus}
                onSave={(newBody) => window.claudeOrchestrator.setTaskNotes({ taskId: selectedTaskId, body: newBody })}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-graphite-400">
            Select or create a task to get started.
          </div>
        )}
      </main>
    </div>
  );
```

Check the imports at the top of `src/renderer/app.tsx` and confirm `onNewTaskClick`/`handleNewTaskClick`/`branches` state referenced above already exist from the existing-branch feature — do not re-add them, this step only replaces the JSX return block.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:renderer -- app`
Expected: PASS (all pre-existing App tests plus the 1 new one)

- [ ] **Step 5: Run the full test suite and build**

Run: `npm test`
Expected: PASS — every test across the whole app, no regressions

Run: `npm run build`
Expected: succeeds

- [ ] **Step 6: Commit**

```bash
git add src/renderer/app.tsx src/renderer/app.test.tsx
git commit -m "feat: add app shell layout, side-panel notes, and dismissable error banner"
```

---

### Task 4: RepoSidebar visual design

**Files:**
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.tsx`

**Interfaces:**
- Consumes: Tailwind theme tokens (Task 1).
- Produces: no prop/behavior changes — `RepoSidebarProps` is unchanged.

- [ ] **Step 1: Confirm the existing tests as the regression baseline**

Run: `npm run test:renderer -- repo-sidebar`
Expected: PASS (5 tests) — record this as the baseline to match after restyling

- [ ] **Step 2: Apply the visual design**

Replace the contents of `src/renderer/components/repo-sidebar/repo-sidebar.tsx`:

```tsx
import type { RepoRecord, TaskRecord } from '../../../shared/types';

export interface RepoSidebarProps {
  repos: RepoRecord[];
  tasksByRepoId: Record<string, TaskRecord[]>;
  selectedTaskId: string | undefined;
  onSelectTask: (taskId: string) => void;
  onOpenRepoClick: () => void;
  onCloneRepoClick: () => void;
  onNewTaskClick: (repoId: string) => void;
  onRemoveTaskClick: (taskId: string) => void;
}

export function RepoSidebar({
  repos,
  tasksByRepoId,
  selectedTaskId,
  onSelectTask,
  onOpenRepoClick,
  onCloneRepoClick,
  onNewTaskClick,
  onRemoveTaskClick,
}: RepoSidebarProps): JSX.Element {
  return (
    <nav
      aria-label="Repositories"
      className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-graphite-700 bg-graphite-800 p-4"
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onOpenRepoClick}
          className="flex-1 rounded-md border border-graphite-600 px-3 py-2 text-sm font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400"
        >
          Open Existing Repo
        </button>
        <button
          type="button"
          onClick={onCloneRepoClick}
          className="flex-1 rounded-md border border-graphite-600 px-3 py-2 text-sm font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400"
        >
          Clone Repo
        </button>
      </div>
      <ul className="flex flex-col gap-3">
        {repos.map((repo) => (
          <li key={repo.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-graphite-100">{repo.name}</span>
              <button
                type="button"
                onClick={() => onNewTaskClick(repo.id)}
                className="shrink-0 rounded-md bg-clay-600 px-2 py-1 text-xs font-medium text-graphite-100 hover:bg-clay-500"
              >
                New Task
              </button>
            </div>
            <ul className="flex flex-col gap-1 pl-2">
              {(tasksByRepoId[repo.id] ?? []).map((task) => (
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
                  <button
                    type="button"
                    onClick={() => onRemoveTaskClick(task.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-xs text-graphite-400 hover:text-danger-400"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 3: Run the tests to confirm no regression**

Run: `npm run test:renderer -- repo-sidebar`
Expected: PASS (same 5 tests, unmodified)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/repo-sidebar/repo-sidebar.tsx
git commit -m "feat: style repo sidebar"
```

---

### Task 5: TerminalTab container styling + xterm color theme

**Files:**
- Modify: `src/renderer/components/terminal-tab/terminal-tab.tsx`
- Modify: `src/renderer/components/terminal-tab/terminal-tab.test.tsx`

**Interfaces:**
- Consumes: Tailwind theme tokens (Task 1) — the xterm `theme` colors below are the same hex values as `graphite-900`/`graphite-200`/`clay-500`/`graphite-700` (xterm's `Terminal` constructor takes raw hex strings, not Tailwind classes, so the values are duplicated here intentionally — xterm has no Tailwind integration).
- Produces: no prop changes — `TerminalTabProps` unchanged. Adds one new test verifying the xterm `theme` option, per the Global Constraints' test policy.

- [ ] **Step 1: Write the failing test for the xterm theme**

Modify `src/renderer/components/terminal-tab/terminal-tab.test.tsx` — add `Terminal` to the imports (it's already mocked by the existing `vi.mock('@xterm/xterm', ...)` above):

```ts
import { Terminal } from '@xterm/xterm';
```

Add this test (inside the existing `describe('TerminalTab', ...)` block):

```ts
  it('applies the app color theme to the xterm instance', () => {
    render(<TerminalTab taskId="task-1" />);
    expect(Terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({ background: '#201c17' }),
      }),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer -- terminal-tab`
Expected: FAIL — `Terminal` is currently called with no arguments

- [ ] **Step 3: Implement the theme and container styling**

Replace the contents of `src/renderer/components/terminal-tab/terminal-tab.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { PtyOutputEvent } from '../../../shared/ipc-channels';

export interface TerminalTabProps {
  taskId: string;
}

export function TerminalTab({ taskId }: TerminalTabProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const terminal = new Terminal({
      theme: {
        background: '#201c17',
        foreground: '#e8e1d4',
        cursor: '#d97a52',
        selectionBackground: '#3d362d',
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();

    terminal.onData((data: string) => {
      window.claudeOrchestrator.sendPtyInput(taskId, data);
    });

    const unsubscribe = window.claudeOrchestrator.onPtyOutput((event: PtyOutputEvent) => {
      if (event.taskId === taskId) {
        terminal.write(event.data);
      }
    });

    return () => {
      unsubscribe();
      terminal.dispose();
    };
  }, [taskId]);

  return <div ref={containerRef} data-task-id={taskId} className="h-full w-full p-2" />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:renderer -- terminal-tab`
Expected: PASS (all pre-existing tests plus the 1 new one)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/terminal-tab
git commit -m "feat: theme the embedded terminal and style its container"
```

---

### Task 6: TaskNotesPanel visual design

**Files:**
- Modify: `src/renderer/components/task-notes-panel/task-notes-panel.tsx`

**Interfaces:**
- Consumes: Tailwind theme tokens (Task 1).
- Produces: no prop/behavior changes — `TaskNotesPanelProps` is unchanged.

- [ ] **Step 1: Confirm the existing tests as the regression baseline**

Run: `npm run test:renderer -- task-notes-panel`
Expected: PASS (3 tests) — record this as the baseline to match after restyling

- [ ] **Step 2: Apply the visual design**

Replace the contents of `src/renderer/components/task-notes-panel/task-notes-panel.tsx`:

```tsx
import { useState } from 'react';
import type { TaskStatus } from '../../../shared/types';

export interface TaskNotesPanelProps {
  body: string;
  status: TaskStatus;
  onSave: (body: string) => Promise<void>;
}

export function TaskNotesPanel({ body, status, onSave }: TaskNotesPanelProps): JSX.Element {
  const [draft, setDraft] = useState(body);
  const [saveError, setSaveError] = useState<string | undefined>();

  async function handleSave(): Promise<void> {
    setSaveError(undefined);
    try {
      await onSave(draft);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">Status: {status}</p>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="flex-1 resize-none rounded-md border border-graphite-600 bg-graphite-900 p-3 text-sm text-graphite-100 focus:border-clay-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={handleSave}
        className="self-start rounded-md bg-clay-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:bg-clay-500"
      >
        Save
      </button>
      {saveError !== undefined && (
        <p role="alert" className="text-sm text-danger-400">
          {saveError}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run the tests to confirm no regression**

Run: `npm run test:renderer -- task-notes-panel`
Expected: PASS (same 3 tests, unmodified)

- [ ] **Step 4: Run the full test suite, typecheck, and build**

Run: `npm test`
Expected: PASS — full suite, no regressions across any task in this plan

Run: `npm run typecheck`
Expected: clean

Run: `npm run build`
Expected: succeeds

- [ ] **Step 5: Update the manual smoke-test checklist**

Add to `docs/runbooks/manual-smoke-test.md`, as the next sequential step after the existing ones:

```markdown
13. Visually confirm the new design: dark graphite sidebar with a clay-colored "New Task" button, opening "New Task" or "Clone Repo" shows a centered modal with a dimmed backdrop (clicking the backdrop does NOT close it), selecting a task shows the terminal filling most of the width with a narrower notes panel to its right, and triggering an error (e.g. submit an empty Clone Repo form) shows a red banner at the top with a working "Dismiss" button.
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/task-notes-panel/task-notes-panel.tsx docs/runbooks/manual-smoke-test.md
git commit -m "feat: style task notes panel and update smoke-test checklist"
```

## Acceptance Criteria

- [ ] Tailwind CSS is set up via `@tailwindcss/vite`, no separate config file sprawl
- [ ] Sidebar, buttons, and task list render with real spacing/layout — no visual overlap
- [ ] `NewTaskModal`/`CloneRepoModal` render as centered overlays with a backdrop, not inline
- [ ] Selecting a task shows the terminal filling most of the main area with the notes panel as a narrower side panel, not stacked full-width
- [ ] Error messages render in a visually distinct banner
- [ ] Terminal colors are explicitly themed to match the app palette
- [ ] Every existing test (main + renderer) still passes unmodified
- [ ] `npm run build` succeeds

---
*Maintained by paurodriguez0220 · Last updated: 2026-07-08*
*Standards: https://github.com/paurodriguez0220/standards-docs*
