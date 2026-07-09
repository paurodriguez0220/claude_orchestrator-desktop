# Task: Claude Orchestrator (MVP)

**Status:** Done

## Goal

Build an Electron desktop app that spawns and manages Claude Code CLI sessions across git worktrees, so switching between ADO tasks never bleeds context between branches.

## Context

Today, git worktrees for parallel ADO tasks are created manually. It's easy to forget to `cd`/switch into the correct worktree before continuing work, so Claude's context and git operations end up scoped to the wrong branch — corrupting the working history for that task. This tool exists to remove that manual directory-management step and give each task its own always-correct, always-visible Claude CLI session.

Target machine is the fefundinfo.com corporate laptop. No blocking constraint identified — the user already runs unsigned dev tooling (Node, Git, Claude Code CLI) there without issue — but code-signing/AppLocker friction is a known possible risk if it ever comes up during distribution (not a concern for a single-user local tool).

## Proposed Design

### Architecture

Electron app: Node.js main process + React renderer, written entirely in TypeScript with `strict` mode enabled (per `code-style.md` — no exceptions, no `any`). Named exports only, no barrel (`index.ts`) files, kebab-case filenames, one component per file with an explicit exported props `interface` (per `web-components.md`).

- **Main process** — owns all system access: spawns git commands (clone, `worktree add`/`remove`), spawns `claude` per task via `node-pty`, reads/writes app data and per-task notes files.
- **Renderer** — sidebar tree (repos → tasks), tabbed embedded terminals (`xterm.js`) wired to PTYs over IPC, a task detail/notes panel.
- **IPC boundary** — renderer never touches the filesystem or spawns processes directly; only through defined channels (`repo:add`, `repo:clone`, `task:create`, `task:open`, `task:close`, `task:remove`, `pty:input`, `pty:data`, ...). Keeps the system-access layer testable independent of the UI.

### Data & storage

Runtime data is kept separate from the app's own source code, and out of any corporate-managed/synced folder (e.g. `Documents`, which is subject to FE OneDrive redirection policy).

- **App source code**: `C:\Users\paulo.rodriguez\Paulo\claude_orchestrator-desktop` (this repo, alongside the user's other projects — named per `code-style.md`'s `{purpose}-{apptype}` repo naming convention, using the new `-desktop` suffix for Electron/Tauri apps).
- **Runtime data root**: `C:\Users\paulo.rodriguez\claude-orchestrator\` — directly under the user profile, separate from the source tree above.
  - `store.json` — registry of repos + tasks (id, path, remote url, branch, timestamps).
  - `tasks/<taskId>.md` — per-task file: frontmatter (ADO id, title, branch, worktree path, status) + freeform markdown notes body, user-editable.
  - `repos/` — cloned/managed repos live here by default when using the "clone new" flow (opening an existing repo elsewhere on disk is also supported and doesn't move it).
- Worktrees are created as siblings of their repo: `<repoParent>/<repoName>-worktrees/<task-slug>`, via `git worktree add <path> -b <branch>`.

**Key design decision**: the app does not reimplement Claude's own memory/history. Claude Code already scopes session history per working directory and supports `--continue`/`--resume`. The app's entire job is to *guarantee* `claude` is always spawned with `cwd` correctly set to the task's worktree — that alone fixes the context-bleed problem. The app's own per-task markdown file is a lightweight, human-readable companion (metadata + freeform notes), not a transcript store.

### Core flows

1. **Add repo** — "Open existing" (folder picker, repo is used in place) or "Clone new" (git URL, cloned into `C:\Users\paulo.rodriguez\claude-orchestrator\repos\`).
2. **New task** — user picks a repo, enters a title + optional ADO task ID + branch name (auto-slugified from title if left blank) → app runs `git worktree add` → creates `tasks/<taskId>.md` → opens a new terminal tab, spawns `claude` with `cwd` set to the new worktree.
3. **Reopen task** — clicking an existing task re-spawns `claude --continue` cd'd into that worktree if no PTY is currently alive for it; otherwise just focuses the existing live tab.
4. **Task notes** — editable markdown panel per task; frontmatter (ADO id, branch, status, etc.) is app-managed, the body is freeform and autosaved.
5. **Remove task** — confirmation prompt, then `git worktree remove`, archives (does not silently delete) the notes file.

### Error handling

- Git command failures (clone/worktree add/remove) capture stderr and surface the real git error text in the UI — never swallowed.
- PTY spawn failure (e.g. `claude` not on `PATH`) shows a clear inline error in the terminal tab instead of a silent hang.
- Worktree removal failure (e.g. uncommitted changes) surfaces git's own error; requires an explicit second confirmation to force — never force-removes by default.

### Security

The app spawns real shell processes and builds git commands from user-supplied input (repo URLs, branch names, task titles), so this is a genuine command-injection surface — `security.md`'s "never trust user input, validate at every boundary" rule applies directly, not just to web APIs.

- All process spawning uses `child_process.execFile`/`node-pty` with argument arrays — never string-interpolated into a shell (`exec`, or `spawn(..., { shell: true })`).
- Branch names and task-slug generation are derived from user input via an explicit allow-list transform (lowercase, alphanumeric + hyphen only) — never passed through raw.
- Repo URLs for "clone new" are validated to look like a git URL (`https://`, `git@`) before being handed to `git clone` as a single argument — never concatenated into a shell string.
- No feature ever shells out with elevated/admin rights — everything runs at the user's own permission level (see Context above).

### Testing approach

Per `testing.md`, this project has a test project from the start — not added later.

- Main-process logic (git command construction, store read/write, slug generation) is pure-function-testable — Vitest unit tests, no Electron runtime required. These are the highest-priority tests given the command-injection surface above.
- IPC handlers tested with mocked `child_process`/`fs`/`node-pty`.
- Renderer components follow `web-components.md`: Vitest + React Testing Library for behavior, Storybook stories for visual states.
- The Electron shell itself (real PTY spawning, terminal rendering) is inherently interactive — covered by a manual smoke-test checklist rather than automated E2E for v1.

### MVP scope

**In:** repo add (open existing / clone new), task + worktree creation, embedded real terminal per task (`xterm.js` + `node-pty` running the actual `claude` CLI), per-task notes file, resume via `--continue`, remove task.

**Out (future):**
- ADO API auto-pull of task title/description (MVP is manual metadata entry only)
- AI-generated session summaries
- macOS/Linux support (Windows-only for v1)
- Installer/code-signing/distribution
- Multi-window / multi-monitor layouts

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working Electron app: add a repo, create a task (spawns a worktree + a real `claude` terminal), reopen it later with context intact, edit notes, remove it cleanly.

**Architecture:** Electron main process (Node/TS) owns git, filesystem, and PTY access behind a typed IPC contract; a React/TS renderer renders the repo/task tree, terminal tabs (`xterm.js`), and a notes panel; a preload script exposes the IPC contract to the renderer via `contextBridge`.

**Tech Stack:** Electron, `electron-vite`, TypeScript (strict), React 18, `node-pty`, `@xterm/xterm` + `@xterm/addon-fit`, Vitest, React Testing Library, Storybook 10.

### Global Constraints

- TypeScript `strict: true` everywhere. No `any`. No non-null assertions (`!`) unless provably safe at the call site.
- Named exports only. No barrel (`index.ts`) re-export files.
- Filenames kebab-case. One component/module per file.
- Every process invocation (`git`, `claude`) uses an argument array (`execFile`, or `node-pty`'s `spawn(file, args[])`) — never a shell string, never `{ shell: true }`.
- Local git identity for this repo is `paurodriguez0220` / `paurodriguez0220@gmail.com` — never the `@fefundinfo.com` corporate identity (already configured; do not change it).
- Runtime data root is `C:\Users\paulo.rodriguez\claude-orchestrator\` — never write app runtime data inside the source repo or under `Documents`.
- Commit messages follow Conventional Commits (`git-workflow.md`): `<type>: <description>`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`, `vitest.main.config.ts`, `vitest.renderer.config.ts`, `.gitignore`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/app.tsx`, `.storybook/main.ts`, `.storybook/preview.ts` (generated by `storybook init` — see Step 4)

**Interfaces:**
- Produces: a running `npm run dev` (Electron window boots), `npm run build` (type-checks and bundles), `npm run test:main` / `npm run test:renderer` (both run green with 0 tests), `npm run storybook` (Storybook dev server boots with 0 stories).

- [ ] **Step 1: Scaffold via electron-vite's React-TS template**

Run:
```bash
npm create @quick-start/electron@latest . -- --template react-ts
```

When prompted, decline adding Electron updater/notarization extras (not needed for a local single-user tool).

- [ ] **Step 2: Enable TypeScript strict mode**

Edit `tsconfig.json` so `compilerOptions` includes:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "module": "ESNext",
    "jsx": "react-jsx",
    "skipLibCheck": true
  }
}
```

- [ ] **Step 3: Install runtime dependencies**

Run:
```bash
npm install node-pty @xterm/xterm @xterm/addon-fit
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom @types/node
```

- [ ] **Step 4: Initialize Storybook**

Per `web-components.md`, every React project gets Storybook 10 with the Vite builder.

Run:
```bash
npx storybook@10 init
```

Accept the defaults for a Vite + React + TypeScript project. Do not separately install `@storybook/test` — Storybook 10 ships `@vitest/spy` built in; story files import spy helpers from `storybook/test` (already used in later tasks' `.stories.tsx` files).

- [ ] **Step 5: Add Vitest configs**

Create `vitest.main.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
  },
});
```

Create `vitest.renderer.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/renderer/**/*.test.tsx'],
    setupFiles: ['./src/renderer/test-setup.ts'],
  },
});
```

Create `src/renderer/test-setup.ts`:

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 6: Add npm scripts**

Edit `package.json` `scripts`:

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test:main": "vitest run --config vitest.main.config.ts",
    "test:renderer": "vitest run --config vitest.renderer.config.ts",
    "test": "npm run test:main && npm run test:renderer",
    "storybook": "storybook dev -p 6006"
  }
}
```

- [ ] **Step 7: Verify the scaffold builds and tests run**

Run: `npm run build`
Expected: exits 0, no TypeScript errors.

Run: `npm test`
Expected: both Vitest configs report "No test files found" but exit 0 (not an error at this stage — Task 2 adds the first real test).

Run: `npm run storybook` (then stop it with Ctrl+C once it's up)
Expected: Storybook dev server starts on port 6006 without error.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite + react + strict typescript project"
```

---

### Task 2: Shared IPC contract and domain types

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/ipc-channels.ts`
- Test: `src/shared/ipc-channels.test.ts`

**Interfaces:**
- Produces: `RepoRecord`, `TaskRecord`, `TaskStatus`, `StoreData`, `TaskNotesFrontmatter`, `TaskNotes` (types), `IpcChannels` (channel name constants, including `DialogSelectFolder`), `RepoAddRequest`, `RepoCloneRequest`, `TaskCreateRequest`, `TaskNotesSetRequest`, `PtyOutputEvent`, `TaskNotesGetResponse` (payload types). Every later task imports from here — do not redefine these shapes elsewhere.

- [ ] **Step 1: Write domain types**

Create `src/shared/types.ts`:

```ts
export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done';

export interface RepoRecord {
  id: string;
  name: string;
  path: string;
  remoteUrl?: string;
  createdAt: string;
}

export interface TaskRecord {
  id: string;
  repoId: string;
  title: string;
  adoId?: string;
  branch: string;
  worktreePath: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoreData {
  repos: RepoRecord[];
  tasks: TaskRecord[];
}

export interface TaskNotesFrontmatter {
  title: string;
  adoId?: string;
  branch: string;
  worktreePath: string;
  status: TaskStatus;
}

export interface TaskNotes {
  frontmatter: TaskNotesFrontmatter;
  body: string;
}
```

- [ ] **Step 2: Write the failing test for channel uniqueness**

Create `src/shared/ipc-channels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { IpcChannels } from './ipc-channels';

describe('IpcChannels', () => {
  it('every channel name is unique', () => {
    const values = Object.values(IpcChannels);
    expect(new Set(values).size).toBe(values.length);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:main -- ipc-channels`
Expected: FAIL — `Cannot find module './ipc-channels'`

- [ ] **Step 4: Write the IPC contract**

Create `src/shared/ipc-channels.ts`:

```ts
import type { TaskStatus } from './types';

export const IpcChannels = {
  RepoAdd: 'repo:add',
  RepoClone: 'repo:clone',
  RepoList: 'repo:list',
  TaskCreate: 'task:create',
  TaskList: 'task:list',
  TaskOpen: 'task:open',
  TaskClose: 'task:close',
  TaskRemove: 'task:remove',
  TaskNotesGet: 'task:notes:get',
  TaskNotesSet: 'task:notes:set',
  PtyInput: 'pty:input',
  PtyOutput: 'pty:output',
  DialogSelectFolder: 'dialog:select-folder',
} as const;

export interface RepoAddRequest {
  path: string;
}

export interface RepoCloneRequest {
  url: string;
  name: string;
}

export interface TaskCreateRequest {
  repoId: string;
  title: string;
  adoId?: string;
  branch?: string;
}

export interface TaskNotesSetRequest {
  taskId: string;
  body: string;
}

export interface PtyInputRequest {
  taskId: string;
  data: string;
}

export interface PtyOutputEvent {
  taskId: string;
  data: string;
}

export interface TaskNotesGetResponse {
  body: string;
  status: TaskStatus;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:main -- ipc-channels`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared
git commit -m "feat: add shared domain types and ipc channel contract"
```

---

### Task 3: Runtime paths and JSON store service

**Files:**
- Create: `src/main/paths.ts`
- Create: `src/main/services/store.ts`
- Test: `src/main/paths.test.ts`
- Test: `src/main/services/store.test.ts`

**Interfaces:**
- Consumes: `StoreData` from `src/shared/types.ts` (Task 2).
- Produces: `getRuntimeDataRoot(): string`, `getStorePath(): string`, `getReposRoot(): string`, `getTaskNotesPath(taskId: string): string`, `getWorktreePath(repoPath: string, repoName: string, taskSlug: string): string`, `readStore(storePath: string): Promise<StoreData>`, `writeStore(storePath: string, data: StoreData): Promise<void>`.

- [ ] **Step 1: Write the failing test for paths**

Create `src/main/paths.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';

vi.mock('node:os', () => ({ homedir: () => 'C:\\Users\\paulo.rodriguez' }));

import { getRuntimeDataRoot, getStorePath, getReposRoot, getTaskNotesPath, getWorktreePath } from './paths';

describe('paths', () => {
  it('getRuntimeDataRoot is under the user profile, not the source repo', () => {
    expect(getRuntimeDataRoot()).toBe(join('C:\\Users\\paulo.rodriguez', 'claude-orchestrator'));
  });

  it('getStorePath points at store.json under the runtime root', () => {
    expect(getStorePath()).toBe(join(getRuntimeDataRoot(), 'store.json'));
  });

  it('getReposRoot points at repos/ under the runtime root', () => {
    expect(getReposRoot()).toBe(join(getRuntimeDataRoot(), 'repos'));
  });

  it('getTaskNotesPath returns tasks/<id>.md under the runtime root', () => {
    expect(getTaskNotesPath('abc123')).toBe(join(getRuntimeDataRoot(), 'tasks', 'abc123.md'));
  });

  it('getWorktreePath places the worktree as a sibling of the repo, in <repoName>-worktrees/<slug>', () => {
    const repoPath = 'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\repos\\my-repo';
    expect(getWorktreePath(repoPath, 'my-repo', 'fix-login-bug')).toBe(
      join(repoPath, '..', 'my-repo-worktrees', 'fix-login-bug'),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- paths`
Expected: FAIL — `Cannot find module './paths'`

- [ ] **Step 3: Implement paths.ts**

Create `src/main/paths.ts`:

```ts
import { join } from 'node:path';
import { homedir } from 'node:os';

export function getRuntimeDataRoot(): string {
  return join(homedir(), 'claude-orchestrator');
}

export function getStorePath(): string {
  return join(getRuntimeDataRoot(), 'store.json');
}

export function getReposRoot(): string {
  return join(getRuntimeDataRoot(), 'repos');
}

export function getTaskNotesPath(taskId: string): string {
  return join(getRuntimeDataRoot(), 'tasks', `${taskId}.md`);
}

export function getWorktreePath(repoPath: string, repoName: string, taskSlug: string): string {
  return join(repoPath, '..', `${repoName}-worktrees`, taskSlug);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:main -- paths`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the failing test for the store service**

Create `src/main/services/store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoreData } from '../../shared/types';

const files = new Map<string, string>();

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async (path: string) => {
    const content = files.get(path);
    if (content === undefined) {
      const error = new Error('not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    return content;
  }),
  writeFile: vi.fn(async (path: string, content: string) => {
    files.set(path, content);
  }),
  mkdir: vi.fn(async () => undefined),
}));

import { readStore, writeStore } from './store';

describe('store', () => {
  beforeEach(() => files.clear());

  it('readStore returns an empty store when the file does not exist', async () => {
    const result = await readStore('C:\\fake\\store.json');
    expect(result).toEqual<StoreData>({ repos: [], tasks: [] });
  });

  it('writeStore then readStore round-trips the data', async () => {
    const data: StoreData = {
      repos: [{ id: '1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' }],
      tasks: [],
    };
    await writeStore('C:\\fake\\store.json', data);
    const result = await readStore('C:\\fake\\store.json');
    expect(result).toEqual(data);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test:main -- store`
Expected: FAIL — `Cannot find module './store'`

- [ ] **Step 7: Implement store.ts**

Create `src/main/services/store.ts`:

```ts
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StoreData } from '../../shared/types';

export async function readStore(storePath: string): Promise<StoreData> {
  try {
    const raw = await readFile(storePath, 'utf-8');
    return JSON.parse(raw) as StoreData;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { repos: [], tasks: [] };
    }
    throw err;
  }
}

export async function writeStore(storePath: string, data: StoreData): Promise<void> {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(data, null, 2), 'utf-8');
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test:main -- store`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add src/main/paths.ts src/main/paths.test.ts src/main/services/store.ts src/main/services/store.test.ts
git commit -m "feat: add runtime paths and json store service"
```

---

### Task 4: Slug and input-validation utilities

**Files:**
- Create: `src/main/services/slug.ts`
- Test: `src/main/services/slug.test.ts`

**Interfaces:**
- Produces: `slugify(title: string): string`, `assertSafeBranchName(branch: string): void` (throws `Error` on unsafe input), `assertValidGitUrl(url: string): void` (throws `Error` on unsafe/invalid input).

This task directly implements the Security section and the "malicious input" acceptance criterion — treat it as the highest-priority test file in the plan.

- [ ] **Step 1: Write the failing tests**

Create `src/main/services/slug.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { slugify, assertSafeBranchName, assertValidGitUrl } from './slug';

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

describe('assertSafeBranchName', () => {
  it('accepts a normal branch name', () => {
    expect(() => assertSafeBranchName('task/fix-login-bug')).not.toThrow();
  });

  it('rejects a branch name containing a semicolon', () => {
    expect(() => assertSafeBranchName('feat/x; rm -rf /')).toThrow('Unsafe branch name');
  });

  it('rejects a branch name containing backticks', () => {
    expect(() => assertSafeBranchName('feat/`whoami`')).toThrow('Unsafe branch name');
  });

  it('rejects a branch name containing a space', () => {
    expect(() => assertSafeBranchName('feat/with space')).toThrow('Unsafe branch name');
  });
});

describe('assertValidGitUrl', () => {
  it('accepts a normal https URL', () => {
    expect(() => assertValidGitUrl('https://github.com/paurodriguez0220/demo.git')).not.toThrow();
  });

  it('accepts a normal ssh (git@) URL', () => {
    expect(() => assertValidGitUrl('git@github.com:paurodriguez0220/demo.git')).not.toThrow();
  });

  it('rejects a URL with a shell injection payload', () => {
    expect(() => assertValidGitUrl('https://github.com/x; rm -rf /')).toThrow('Invalid git URL');
  });

  it('rejects a URL without a known scheme', () => {
    expect(() => assertValidGitUrl('javascript:alert(1)')).toThrow('Invalid git URL');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- slug`
Expected: FAIL — `Cannot find module './slug'`

- [ ] **Step 3: Implement slug.ts**

Create `src/main/services/slug.ts`:

```ts
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const SAFE_BRANCH_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;

export function assertSafeBranchName(branch: string): void {
  if (!SAFE_BRANCH_PATTERN.test(branch)) {
    throw new Error(`Unsafe branch name: ${branch}`);
  }
}

const SAFE_URL_CHARS = /^[A-Za-z0-9:/_.@-]+$/;

export function assertValidGitUrl(url: string): void {
  const hasKnownScheme = url.startsWith('https://') || url.startsWith('git@');
  if (!hasKnownScheme || !SAFE_URL_CHARS.test(url)) {
    throw new Error(`Invalid git URL: ${url}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- slug`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/services/slug.ts src/main/services/slug.test.ts
git commit -m "feat: add slug generation and input-validation utilities"
```

---

### Task 5: Git service

**Files:**
- Create: `src/main/services/git-service.ts`
- Test: `src/main/services/git-service.test.ts`

**Interfaces:**
- Produces: `GitCommandError` (class, has `.stderr: string`), `cloneRepo(url: string, destinationPath: string): Promise<void>`, `addWorktree(repoPath: string, worktreePath: string, branch: string): Promise<void>`, `removeWorktree(repoPath: string, worktreePath: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Create `src/main/services/git-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const execFileMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => {
    const callback = args[args.length - 1] as (err: unknown, result: { stdout: string; stderr: string }) => void;
    execFileMock(...args.slice(0, -1));
    callback(null, { stdout: '', stderr: '' });
  },
}));

import { cloneRepo, addWorktree, removeWorktree, GitCommandError } from './git-service';

describe('git-service', () => {
  beforeEach(() => execFileMock.mockClear());

  it('cloneRepo calls git clone with an argument array, never a shell string', async () => {
    await cloneRepo('https://github.com/paurodriguez0220/demo.git', 'C:\\dest\\demo');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['clone', 'https://github.com/paurodriguez0220/demo.git', 'C:\\dest\\demo'],
      undefined,
    );
  });

  it('addWorktree calls git worktree add with cwd set to the repo path', async () => {
    await addWorktree('C:\\repo', 'C:\\repo-worktrees\\slug', 'task/slug');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['worktree', 'add', 'C:\\repo-worktrees\\slug', '-b', 'task/slug'],
      { cwd: 'C:\\repo' },
    );
  });

  it('removeWorktree calls git worktree remove with cwd set to the repo path', async () => {
    await removeWorktree('C:\\repo', 'C:\\repo-worktrees\\slug');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', 'C:\\repo-worktrees\\slug'],
      { cwd: 'C:\\repo' },
    );
  });

  it('wraps a failing git command in GitCommandError with the real stderr', async () => {
    execFileMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('exit 128'), { stderr: 'fatal: destination path already exists' });
    });
    // Re-mock execFile for this one call to reject via the callback instead of the mock helper:
    vi.doMock('node:child_process', () => ({
      execFile: (...args: unknown[]) => {
        const callback = args[args.length - 1] as (err: unknown) => void;
        callback(Object.assign(new Error('exit 128'), { stderr: 'fatal: destination path already exists' }));
      },
    }));
    const { cloneRepo: cloneRepoWithFailure } = await import('./git-service');
    await expect(cloneRepoWithFailure('https://github.com/x/y.git', 'C:\\dest')).rejects.toThrow(GitCommandError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- git-service`
Expected: FAIL — `Cannot find module './git-service'`

- [ ] **Step 3: Implement git-service.ts**

Create `src/main/services/git-service.ts`:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class GitCommandError extends Error {
  public readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(message);
    this.name = 'GitCommandError';
    this.stderr = stderr;
  }
}

async function runGit(args: string[], cwd?: string): Promise<void> {
  try {
    await execFileAsync('git', args, cwd ? { cwd } : undefined);
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    throw new GitCommandError(`git ${args.join(' ')} failed`, stderr);
  }
}

export async function cloneRepo(url: string, destinationPath: string): Promise<void> {
  await runGit(['clone', url, destinationPath]);
}

export async function addWorktree(repoPath: string, worktreePath: string, branch: string): Promise<void> {
  await runGit(['worktree', 'add', worktreePath, '-b', branch], repoPath);
}

export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  await runGit(['worktree', 'remove', worktreePath], repoPath);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- git-service`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/services/git-service.ts src/main/services/git-service.test.ts
git commit -m "feat: add git service with argument-array command execution"
```

---

### Task 6: Task notes service

**Files:**
- Create: `src/main/services/notes-service.ts`
- Test: `src/main/services/notes-service.test.ts`

**Interfaces:**
- Consumes: `TaskNotes`, `TaskNotesFrontmatter` from `src/shared/types.ts` (Task 2).
- Produces: `serializeTaskNotes(notes: TaskNotes): string`, `parseTaskNotes(raw: string): TaskNotes`, `readTaskNotes(path: string): Promise<TaskNotes>`, `writeTaskNotes(path: string, notes: TaskNotes): Promise<void>`, `archiveTaskNotes(path: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests for serialize/parse**

Create `src/main/services/notes-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TaskNotes } from '../../shared/types';

const files = new Map<string, string>();

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async (path: string) => {
    const content = files.get(path);
    if (content === undefined) {
      const error = new Error('not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    return content;
  }),
  writeFile: vi.fn(async (path: string, content: string) => {
    files.set(path, content);
  }),
  rename: vi.fn(async (from: string, to: string) => {
    const content = files.get(from);
    if (content !== undefined) {
      files.set(to, content);
      files.delete(from);
    }
  }),
  mkdir: vi.fn(async () => undefined),
}));

import {
  serializeTaskNotes,
  parseTaskNotes,
  readTaskNotes,
  writeTaskNotes,
  archiveTaskNotes,
} from './notes-service';

const sample: TaskNotes = {
  frontmatter: {
    title: 'Fix login bug',
    adoId: 'ADO-1234',
    branch: 'task/fix-login-bug',
    worktreePath: 'C:\\repo-worktrees\\fix-login-bug',
    status: 'todo',
  },
  body: 'Started investigating the redirect loop.',
};

describe('serializeTaskNotes / parseTaskNotes', () => {
  it('round-trips frontmatter and body', () => {
    const raw = serializeTaskNotes(sample);
    expect(parseTaskNotes(raw)).toEqual(sample);
  });

  it('parseTaskNotes throws on missing frontmatter delimiters', () => {
    expect(() => parseTaskNotes('just some text, no frontmatter')).toThrow('Invalid task notes format');
  });
});

describe('readTaskNotes / writeTaskNotes / archiveTaskNotes', () => {
  beforeEach(() => files.clear());

  it('writeTaskNotes then readTaskNotes round-trips through disk', async () => {
    await writeTaskNotes('C:\\fake\\tasks\\abc.md', sample);
    const result = await readTaskNotes('C:\\fake\\tasks\\abc.md');
    expect(result).toEqual(sample);
  });

  it('archiveTaskNotes renames the file instead of deleting it', async () => {
    await writeTaskNotes('C:\\fake\\tasks\\abc.md', sample);
    await archiveTaskNotes('C:\\fake\\tasks\\abc.md');
    expect(files.has('C:\\fake\\tasks\\abc.md')).toBe(false);
    const archivedKey = [...files.keys()].find((key) => key.includes('abc.archived-'));
    expect(archivedKey).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- notes-service`
Expected: FAIL — `Cannot find module './notes-service'`

- [ ] **Step 3: Implement notes-service.ts**

Create `src/main/services/notes-service.ts`:

```ts
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { TaskNotes, TaskStatus } from '../../shared/types';

export function serializeTaskNotes(notes: TaskNotes): string {
  const lines = ['---', `title: ${notes.frontmatter.title}`];
  if (notes.frontmatter.adoId) {
    lines.push(`adoId: ${notes.frontmatter.adoId}`);
  }
  lines.push(`branch: ${notes.frontmatter.branch}`);
  lines.push(`worktreePath: ${notes.frontmatter.worktreePath}`);
  lines.push(`status: ${notes.frontmatter.status}`);
  lines.push('---', '', notes.body);
  return lines.join('\n');
}

export function parseTaskNotes(raw: string): TaskNotes {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!match) {
    throw new Error('Invalid task notes format: missing frontmatter');
  }
  const [, frontmatterBlock, body] = match;
  const fields: Record<string, string> = {};
  for (const line of frontmatterBlock.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    fields[key] = value;
  }
  return {
    frontmatter: {
      title: fields.title ?? '',
      adoId: fields.adoId,
      branch: fields.branch ?? '',
      worktreePath: fields.worktreePath ?? '',
      status: (fields.status as TaskStatus) ?? 'todo',
    },
    body: body.trim(),
  };
}

export async function readTaskNotes(path: string): Promise<TaskNotes> {
  const raw = await readFile(path, 'utf-8');
  return parseTaskNotes(raw);
}

export async function writeTaskNotes(path: string, notes: TaskNotes): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeTaskNotes(notes), 'utf-8');
}

export async function archiveTaskNotes(path: string): Promise<void> {
  const archivedPath = path.replace(/\.md$/, `.archived-${Date.now()}.md`);
  await rename(path, archivedPath);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- notes-service`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/services/notes-service.ts src/main/services/notes-service.test.ts
git commit -m "feat: add task notes read/write/archive service"
```

---

### Task 7: PTY manager

**Files:**
- Create: `src/main/services/pty-manager.ts`
- Test: `src/main/services/pty-manager.test.ts`

**Interfaces:**
- Produces: `spawnClaudeSession(taskId: string, cwd: string, resume: boolean, onData: (taskId: string, data: string) => void): void`, `writeToSession(taskId: string, data: string): void`, `isSessionAlive(taskId: string): boolean`, `killSession(taskId: string): void`.

On Windows, npm-installed CLI tools (including `claude`) install as `.cmd` shims. `node-pty` spawning `claude` directly does not reliably resolve `.cmd` shims, so sessions are spawned via `cmd.exe /c claude ...` — this is the standard workaround for launching npm-global CLIs from `node-pty` on Windows.

- [ ] **Step 1: Write the failing tests**

Create `src/main/services/pty-manager.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const spawnMock = vi.fn();

vi.mock('node-pty', () => ({
  spawn: (...args: unknown[]) => {
    spawnMock(...args);
    return {
      onData: vi.fn(),
      write: vi.fn(),
      kill: vi.fn(),
    };
  },
}));

import { spawnClaudeSession, writeToSession, isSessionAlive, killSession } from './pty-manager';

describe('pty-manager', () => {
  beforeEach(() => spawnMock.mockClear());

  it('spawns a fresh session via cmd.exe /c claude when not resuming', () => {
    spawnClaudeSession('task-1', 'C:\\repo-worktrees\\slug', false, vi.fn());
    expect(spawnMock).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'claude'],
      expect.objectContaining({ cwd: 'C:\\repo-worktrees\\slug' }),
    );
    killSession('task-1');
  });

  it('spawns with --continue when resuming', () => {
    spawnClaudeSession('task-2', 'C:\\repo-worktrees\\slug2', true, vi.fn());
    expect(spawnMock).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'claude', '--continue'],
      expect.objectContaining({ cwd: 'C:\\repo-worktrees\\slug2' }),
    );
    killSession('task-2');
  });

  it('does not spawn a second session for a taskId that is already alive', () => {
    spawnClaudeSession('task-3', 'C:\\repo-worktrees\\slug3', false, vi.fn());
    expect(isSessionAlive('task-3')).toBe(true);
    spawnClaudeSession('task-3', 'C:\\repo-worktrees\\slug3', false, vi.fn());
    expect(spawnMock).toHaveBeenCalledTimes(1);
    killSession('task-3');
  });

  it('isSessionAlive is false after killSession', () => {
    spawnClaudeSession('task-4', 'C:\\repo-worktrees\\slug4', false, vi.fn());
    killSession('task-4');
    expect(isSessionAlive('task-4')).toBe(false);
  });

  it('writeToSession is a no-op for an unknown taskId (does not throw)', () => {
    expect(() => writeToSession('unknown-task', 'echo hi\n')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- pty-manager`
Expected: FAIL — `Cannot find module './pty-manager'`

- [ ] **Step 3: Implement pty-manager.ts**

Create `src/main/services/pty-manager.ts`:

```ts
import * as pty from 'node-pty';

type PtyDataListener = (taskId: string, data: string) => void;

const sessions = new Map<string, pty.IPty>();

export function spawnClaudeSession(
  taskId: string,
  cwd: string,
  resume: boolean,
  onData: PtyDataListener,
): void {
  if (sessions.has(taskId)) {
    return;
  }
  const args = resume ? ['/c', 'claude', '--continue'] : ['/c', 'claude'];
  const session = pty.spawn('cmd.exe', args, {
    cwd,
    name: 'xterm-color',
    cols: 80,
    rows: 30,
  });
  session.onData((data) => onData(taskId, data));
  sessions.set(taskId, session);
}

export function writeToSession(taskId: string, data: string): void {
  sessions.get(taskId)?.write(data);
}

export function isSessionAlive(taskId: string): boolean {
  return sessions.has(taskId);
}

export function killSession(taskId: string): void {
  sessions.get(taskId)?.kill();
  sessions.delete(taskId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- pty-manager`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/services/pty-manager.ts src/main/services/pty-manager.test.ts
git commit -m "feat: add pty manager for spawning claude sessions per task"
```

---

### Task 8: Repo IPC handlers

**Files:**
- Create: `src/main/ipc/repo-handlers.ts`
- Test: `src/main/ipc/repo-handlers.test.ts`

**Interfaces:**
- Consumes: `IpcChannels`, `RepoAddRequest`, `RepoCloneRequest` (Task 2); `readStore`, `writeStore` (Task 3); `cloneRepo` (Task 5); `assertValidGitUrl` (Task 4); `getStorePath`, `getReposRoot` (Task 3).
- Produces: `registerRepoHandlers(): void` — registers `IpcChannels.RepoAdd`, `RepoClone`, `RepoList`, `DialogSelectFolder` on `ipcMain`. `DialogSelectFolder` returns `string | undefined` (undefined when the user cancels the native folder picker) — this is how the renderer implements "open existing repo" without ever constructing filesystem paths itself.

- [ ] **Step 1: Write the failing tests**

Create `src/main/ipc/repo-handlers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoreData } from '../../shared/types';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

const showOpenDialogMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
  dialog: {
    showOpenDialog: (...args: unknown[]) => showOpenDialogMock(...args),
  },
}));

let store: StoreData = { repos: [], tasks: [] };

vi.mock('../services/store', () => ({
  readStore: vi.fn(async () => store),
  writeStore: vi.fn(async (_path: string, data: StoreData) => {
    store = data;
  }),
}));

vi.mock('../services/git-service', () => ({
  cloneRepo: vi.fn(async () => undefined),
}));

vi.mock('../paths', () => ({
  getStorePath: () => 'C:\\fake\\store.json',
  getReposRoot: () => 'C:\\fake\\repos',
}));

import { registerRepoHandlers } from './repo-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { cloneRepo } from '../services/git-service';

describe('repo-handlers', () => {
  beforeEach(() => {
    store = { repos: [], tasks: [] };
    handlers.clear();
    registerRepoHandlers();
  });

  it('RepoAdd stores a repo record pointing at the given path', async () => {
    const handler = handlers.get(IpcChannels.RepoAdd);
    const repo = await handler?.({}, { path: 'C:\\Users\\paulo.rodriguez\\Paulo\\demo-repo' });
    expect(repo).toMatchObject({ name: 'demo-repo', path: 'C:\\Users\\paulo.rodriguez\\Paulo\\demo-repo' });
    expect(store.repos).toHaveLength(1);
  });

  it('RepoClone rejects an unsafe URL before calling git', async () => {
    const handler = handlers.get(IpcChannels.RepoClone);
    await expect(handler?.({}, { url: 'https://x; rm -rf /', name: 'evil' })).rejects.toThrow('Invalid git URL');
    expect(cloneRepo).not.toHaveBeenCalled();
  });

  it('RepoClone clones into the repos root and stores a repo record', async () => {
    const handler = handlers.get(IpcChannels.RepoClone);
    const repo = await handler?.({}, { url: 'https://github.com/paurodriguez0220/demo.git', name: 'demo' });
    expect(cloneRepo).toHaveBeenCalledWith('https://github.com/paurodriguez0220/demo.git', 'C:\\fake\\repos\\demo');
    expect(repo).toMatchObject({ name: 'demo', remoteUrl: 'https://github.com/paurodriguez0220/demo.git' });
  });

  it('RepoList returns the current repos', async () => {
    store.repos.push({ id: '1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' });
    const handler = handlers.get(IpcChannels.RepoList);
    const result = await handler?.({});
    expect(result).toEqual(store.repos);
  });

  it('DialogSelectFolder returns the chosen path', async () => {
    showOpenDialogMock.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\Users\\paulo.rodriguez\\Paulo\\demo-repo'] });
    const handler = handlers.get(IpcChannels.DialogSelectFolder);
    const result = await handler?.({});
    expect(result).toBe('C:\\Users\\paulo.rodriguez\\Paulo\\demo-repo');
  });

  it('DialogSelectFolder returns undefined when the user cancels', async () => {
    showOpenDialogMock.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    const handler = handlers.get(IpcChannels.DialogSelectFolder);
    const result = await handler?.({});
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- repo-handlers`
Expected: FAIL — `Cannot find module './repo-handlers'`

- [ ] **Step 3: Implement repo-handlers.ts**

Create `src/main/ipc/repo-handlers.ts`:

```ts
import { ipcMain, dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import { join, basename } from 'node:path';
import { IpcChannels } from '../../shared/ipc-channels';
import type { RepoAddRequest, RepoCloneRequest } from '../../shared/ipc-channels';
import type { RepoRecord } from '../../shared/types';
import { readStore, writeStore } from '../services/store';
import { cloneRepo } from '../services/git-service';
import { assertValidGitUrl } from '../services/slug';
import { getStorePath, getReposRoot } from '../paths';

export function registerRepoHandlers(): void {
  ipcMain.handle(IpcChannels.DialogSelectFolder, async (): Promise<string | undefined> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? undefined : result.filePaths[0];
  });

  ipcMain.handle(IpcChannels.RepoAdd, async (_event, request: RepoAddRequest): Promise<RepoRecord> => {
    const store = await readStore(getStorePath());
    const repo: RepoRecord = {
      id: randomUUID(),
      name: basename(request.path),
      path: request.path,
      createdAt: new Date().toISOString(),
    };
    store.repos.push(repo);
    await writeStore(getStorePath(), store);
    return repo;
  });

  ipcMain.handle(IpcChannels.RepoClone, async (_event, request: RepoCloneRequest): Promise<RepoRecord> => {
    assertValidGitUrl(request.url);
    const destinationPath = join(getReposRoot(), request.name);
    await cloneRepo(request.url, destinationPath);
    const store = await readStore(getStorePath());
    const repo: RepoRecord = {
      id: randomUUID(),
      name: request.name,
      path: destinationPath,
      remoteUrl: request.url,
      createdAt: new Date().toISOString(),
    };
    store.repos.push(repo);
    await writeStore(getStorePath(), store);
    return repo;
  });

  ipcMain.handle(IpcChannels.RepoList, async (): Promise<RepoRecord[]> => {
    const store = await readStore(getStorePath());
    return store.repos;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- repo-handlers`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/repo-handlers.ts src/main/ipc/repo-handlers.test.ts
git commit -m "feat: add repo ipc handlers"
```

---

### Task 9: Task IPC handlers and main process entry

**Files:**
- Create: `src/main/ipc/task-handlers.ts`
- Modify: `src/main/index.ts`
- Test: `src/main/ipc/task-handlers.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–8 (`IpcChannels`, store, git-service, slug, notes-service, pty-manager, paths, `registerRepoHandlers`).
- Produces: `registerTaskHandlers(onPtyData: (taskId: string, data: string) => void): void` — registers `TaskCreate`, `TaskList`, `TaskOpen`, `TaskClose`, `TaskRemove`, `TaskNotesGet`, `TaskNotesSet`.

- [ ] **Step 1: Write the failing tests**

Create `src/main/ipc/task-handlers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoreData } from '../../shared/types';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
}));

let store: StoreData = { repos: [], tasks: [] };

vi.mock('../services/store', () => ({
  readStore: vi.fn(async () => store),
  writeStore: vi.fn(async (_path: string, data: StoreData) => {
    store = data;
  }),
}));

vi.mock('../services/git-service', () => ({
  addWorktree: vi.fn(async () => undefined),
  removeWorktree: vi.fn(async () => undefined),
}));

vi.mock('../services/notes-service', () => ({
  readTaskNotes: vi.fn(async () => ({
    frontmatter: { title: 't', branch: 'b', worktreePath: 'C:\\w', status: 'todo' },
    body: 'existing notes',
  })),
  writeTaskNotes: vi.fn(async () => undefined),
  archiveTaskNotes: vi.fn(async () => undefined),
}));

const spawnClaudeSession = vi.fn();
const isSessionAlive = vi.fn(() => false);
const killSession = vi.fn();

vi.mock('../services/pty-manager', () => ({
  spawnClaudeSession: (...args: unknown[]) => spawnClaudeSession(...args),
  isSessionAlive: (...args: unknown[]) => isSessionAlive(...args),
  killSession: (...args: unknown[]) => killSession(...args),
}));

vi.mock('../paths', () => ({
  getStorePath: () => 'C:\\fake\\store.json',
  getTaskNotesPath: (taskId: string) => `C:\\fake\\tasks\\${taskId}.md`,
  getWorktreePath: (repoPath: string, repoName: string, slug: string) =>
    `${repoPath}\\..\\${repoName}-worktrees\\${slug}`,
}));

import { registerTaskHandlers } from './task-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { addWorktree, removeWorktree } from '../services/git-service';

describe('task-handlers', () => {
  const onPtyData = vi.fn();

  beforeEach(() => {
    store = {
      repos: [{ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' }],
      tasks: [],
    };
    handlers.clear();
    spawnClaudeSession.mockClear();
    isSessionAlive.mockClear();
    killSession.mockClear();
    registerTaskHandlers(onPtyData);
  });

  it('TaskCreate adds a worktree, stores a task record, and spawns a fresh session', async () => {
    const handler = handlers.get(IpcChannels.TaskCreate);
    const task = await handler?.({}, { repoId: 'repo-1', title: 'Fix login bug', adoId: 'ADO-1' });
    expect(addWorktree).toHaveBeenCalledWith('C:\\demo', 'C:\\demo\\..\\demo-worktrees\\fix-login-bug', 'task/fix-login-bug');
    expect(task).toMatchObject({ title: 'Fix login bug', adoId: 'ADO-1', status: 'todo' });
    expect(store.tasks).toHaveLength(1);
    expect(spawnClaudeSession).toHaveBeenCalledWith(
      expect.any(String),
      'C:\\demo\\..\\demo-worktrees\\fix-login-bug',
      false,
      onPtyData,
    );
  });

  it('TaskCreate rejects an unknown repoId', async () => {
    const handler = handlers.get(IpcChannels.TaskCreate);
    await expect(handler?.({}, { repoId: 'nope', title: 'x' })).rejects.toThrow('Unknown repo');
  });

  it('TaskOpen resumes an existing task session when none is alive', async () => {
    store.tasks.push({
      id: 'task-1',
      repoId: 'repo-1',
      title: 'Fix login bug',
      branch: 'task/fix-login-bug',
      worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
      status: 'todo',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    const handler = handlers.get(IpcChannels.TaskOpen);
    await handler?.({}, 'task-1');
    expect(spawnClaudeSession).toHaveBeenCalledWith('task-1', 'C:\\demo-worktrees\\fix-login-bug', true, onPtyData);
  });

  it('TaskOpen does nothing when a session is already alive', async () => {
    isSessionAlive.mockReturnValue(true);
    store.tasks.push({
      id: 'task-1',
      repoId: 'repo-1',
      title: 'Fix login bug',
      branch: 'task/fix-login-bug',
      worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
      status: 'todo',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    const handler = handlers.get(IpcChannels.TaskOpen);
    await handler?.({}, 'task-1');
    expect(spawnClaudeSession).not.toHaveBeenCalled();
  });

  it('TaskRemove kills the session, removes the worktree, drops the task, and archives notes', async () => {
    store.tasks.push({
      id: 'task-1',
      repoId: 'repo-1',
      title: 'Fix login bug',
      branch: 'task/fix-login-bug',
      worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
      status: 'todo',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });
    const handler = handlers.get(IpcChannels.TaskRemove);
    await handler?.({}, 'task-1');
    expect(killSession).toHaveBeenCalledWith('task-1');
    expect(removeWorktree).toHaveBeenCalledWith('C:\\demo', 'C:\\demo-worktrees\\fix-login-bug');
    expect(store.tasks).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- task-handlers`
Expected: FAIL — `Cannot find module './task-handlers'`

- [ ] **Step 3: Implement task-handlers.ts**

Create `src/main/ipc/task-handlers.ts`:

```ts
import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { IpcChannels } from '../../shared/ipc-channels';
import type { TaskCreateRequest, TaskNotesSetRequest, TaskNotesGetResponse } from '../../shared/ipc-channels';
import type { TaskRecord } from '../../shared/types';
import { readStore, writeStore } from '../services/store';
import { addWorktree, removeWorktree } from '../services/git-service';
import { slugify, assertSafeBranchName } from '../services/slug';
import { readTaskNotes, writeTaskNotes, archiveTaskNotes } from '../services/notes-service';
import { spawnClaudeSession, isSessionAlive, killSession } from '../services/pty-manager';
import { getStorePath, getTaskNotesPath, getWorktreePath } from '../paths';

export function registerTaskHandlers(onPtyData: (taskId: string, data: string) => void): void {
  ipcMain.handle(IpcChannels.TaskCreate, async (_event, request: TaskCreateRequest): Promise<TaskRecord> => {
    const store = await readStore(getStorePath());
    const repo = store.repos.find((candidate) => candidate.id === request.repoId);
    if (!repo) {
      throw new Error(`Unknown repo: ${request.repoId}`);
    }
    const slug = slugify(request.title);
    const branch = request.branch ?? `task/${slug}`;
    assertSafeBranchName(branch);
    const worktreePath = getWorktreePath(repo.path, repo.name, slug);
    await addWorktree(repo.path, worktreePath, branch);

    const now = new Date().toISOString();
    const task: TaskRecord = {
      id: randomUUID(),
      repoId: repo.id,
      title: request.title,
      adoId: request.adoId,
      branch,
      worktreePath,
      status: 'todo',
      createdAt: now,
      updatedAt: now,
    };
    store.tasks.push(task);
    await writeStore(getStorePath(), store);
    await writeTaskNotes(getTaskNotesPath(task.id), {
      frontmatter: {
        title: task.title,
        adoId: task.adoId,
        branch: task.branch,
        worktreePath: task.worktreePath,
        status: task.status,
      },
      body: '',
    });
    spawnClaudeSession(task.id, task.worktreePath, false, onPtyData);
    return task;
  });

  ipcMain.handle(IpcChannels.TaskList, async (): Promise<TaskRecord[]> => {
    const store = await readStore(getStorePath());
    return store.tasks;
  });

  ipcMain.handle(IpcChannels.TaskOpen, async (_event, taskId: string): Promise<void> => {
    if (isSessionAlive(taskId)) {
      return;
    }
    const store = await readStore(getStorePath());
    const task = store.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    spawnClaudeSession(taskId, task.worktreePath, true, onPtyData);
  });

  ipcMain.handle(IpcChannels.TaskClose, async (_event, taskId: string): Promise<void> => {
    killSession(taskId);
  });

  ipcMain.handle(IpcChannels.TaskRemove, async (_event, taskId: string): Promise<void> => {
    const store = await readStore(getStorePath());
    const task = store.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    const repo = store.repos.find((candidate) => candidate.id === task.repoId);
    if (!repo) {
      throw new Error(`Unknown repo: ${task.repoId}`);
    }
    killSession(taskId);
    await removeWorktree(repo.path, task.worktreePath);
    store.tasks = store.tasks.filter((candidate) => candidate.id !== taskId);
    await writeStore(getStorePath(), store);
    await archiveTaskNotes(getTaskNotesPath(taskId));
  });

  ipcMain.handle(IpcChannels.TaskNotesGet, async (_event, taskId: string): Promise<TaskNotesGetResponse> => {
    const notes = await readTaskNotes(getTaskNotesPath(taskId));
    return { body: notes.body, status: notes.frontmatter.status };
  });

  ipcMain.handle(IpcChannels.TaskNotesSet, async (_event, request: TaskNotesSetRequest): Promise<void> => {
    const notes = await readTaskNotes(getTaskNotesPath(request.taskId));
    await writeTaskNotes(getTaskNotesPath(request.taskId), { ...notes, body: request.body });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- task-handlers`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire handlers into the main process entry**

Modify `src/main/index.ts` — inside the existing `app.whenReady().then(() => { ... })` block (or equivalent electron-vite scaffold entry point), add:

```ts
import { BrowserWindow, ipcMain } from 'electron';
import { registerRepoHandlers } from './ipc/repo-handlers';
import { registerTaskHandlers } from './ipc/task-handlers';
import { IpcChannels } from '../shared/ipc-channels';

function broadcastPtyData(taskId: string, data: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.PtyOutput, { taskId, data });
  }
}

registerRepoHandlers();
registerTaskHandlers(broadcastPtyData);

ipcMain.on(IpcChannels.PtyInput, (_event, { taskId, data }: { taskId: string; data: string }) => {
  void import('./services/pty-manager').then(({ writeToSession }) => writeToSession(taskId, data));
});
```

- [ ] **Step 6: Verify the full main-process suite passes**

Run: `npm run test:main`
Expected: PASS (all main-process tests across Tasks 2–9)

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/task-handlers.ts src/main/ipc/task-handlers.test.ts src/main/index.ts
git commit -m "feat: add task ipc handlers and wire handlers into main process"
```

---

### Task 10: Preload script

**Files:**
- Modify: `src/preload/index.ts`
- Test: `src/preload/index.test.ts`

**Interfaces:**
- Consumes: `IpcChannels` and all request/response types from `src/shared/ipc-channels.ts` (Task 2).
- Produces: `window.api` typed surface — `ClaudeOrchestratorApi` interface exposed via `contextBridge`, consumed by every renderer component from Task 11 onward.

- [ ] **Step 1: Write the failing test**

Create `src/preload/index.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

const exposeInMainWorld = vi.fn();
const ipcRendererInvoke = vi.fn();
const ipcRendererSend = vi.fn();
const ipcRendererOn = vi.fn();

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke: ipcRendererInvoke, send: ipcRendererSend, on: ipcRendererOn },
}));

describe('preload', () => {
  it('exposes a "claudeOrchestrator" API on window', async () => {
    await import('./index');
    expect(exposeInMainWorld).toHaveBeenCalledWith('claudeOrchestrator', expect.any(Object));
  });

  it('addRepo invokes the RepoAdd channel', async () => {
    await import('./index');
    const [, api] = exposeInMainWorld.mock.calls[0] as [string, Record<string, (...a: unknown[]) => unknown>];
    await api.addRepo('C:\\some\\path');
    expect(ipcRendererInvoke).toHaveBeenCalledWith('repo:add', { path: 'C:\\some\\path' });
  });

  it('onPtyOutput registers a listener on the pty:output channel', async () => {
    await import('./index');
    const [, api] = exposeInMainWorld.mock.calls[0] as [string, Record<string, (...a: unknown[]) => unknown>];
    const listener = vi.fn();
    api.onPtyOutput(listener);
    expect(ipcRendererOn).toHaveBeenCalledWith('pty:output', expect.any(Function));
  });

  it('selectFolder invokes the DialogSelectFolder channel', async () => {
    await import('./index');
    const [, api] = exposeInMainWorld.mock.calls[0] as [string, Record<string, (...a: unknown[]) => unknown>];
    await api.selectFolder();
    expect(ipcRendererInvoke).toHaveBeenCalledWith('dialog:select-folder');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- preload`
Expected: FAIL (the scaffolded preload does not expose `claudeOrchestrator`)

- [ ] **Step 3: Implement the preload API**

Replace the contents of `src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';
import type {
  RepoRecord,
  TaskRecord,
} from '../shared/types';
import type {
  TaskCreateRequest,
  TaskNotesSetRequest,
  TaskNotesGetResponse,
  PtyOutputEvent,
} from '../shared/ipc-channels';

export interface ClaudeOrchestratorApi {
  selectFolder(): Promise<string | undefined>;
  addRepo(path: string): Promise<RepoRecord>;
  cloneRepo(url: string, name: string): Promise<RepoRecord>;
  listRepos(): Promise<RepoRecord[]>;
  createTask(request: TaskCreateRequest): Promise<TaskRecord>;
  listTasks(): Promise<TaskRecord[]>;
  openTask(taskId: string): Promise<void>;
  closeTask(taskId: string): Promise<void>;
  removeTask(taskId: string): Promise<void>;
  getTaskNotes(taskId: string): Promise<TaskNotesGetResponse>;
  setTaskNotes(request: TaskNotesSetRequest): Promise<void>;
  sendPtyInput(taskId: string, data: string): void;
  onPtyOutput(listener: (event: PtyOutputEvent) => void): void;
}

const api: ClaudeOrchestratorApi = {
  selectFolder: () => ipcRenderer.invoke(IpcChannels.DialogSelectFolder),
  addRepo: (path) => ipcRenderer.invoke(IpcChannels.RepoAdd, { path }),
  cloneRepo: (url, name) => ipcRenderer.invoke(IpcChannels.RepoClone, { url, name }),
  listRepos: () => ipcRenderer.invoke(IpcChannels.RepoList),
  createTask: (request) => ipcRenderer.invoke(IpcChannels.TaskCreate, request),
  listTasks: () => ipcRenderer.invoke(IpcChannels.TaskList),
  openTask: (taskId) => ipcRenderer.invoke(IpcChannels.TaskOpen, taskId),
  closeTask: (taskId) => ipcRenderer.invoke(IpcChannels.TaskClose, taskId),
  removeTask: (taskId) => ipcRenderer.invoke(IpcChannels.TaskRemove, taskId),
  getTaskNotes: (taskId) => ipcRenderer.invoke(IpcChannels.TaskNotesGet, taskId),
  setTaskNotes: (request) => ipcRenderer.invoke(IpcChannels.TaskNotesSet, request),
  sendPtyInput: (taskId, data) => ipcRenderer.send(IpcChannels.PtyInput, { taskId, data }),
  onPtyOutput: (listener) => {
    ipcRenderer.on(IpcChannels.PtyOutput, (_event, payload: PtyOutputEvent) => listener(payload));
  },
};

contextBridge.exposeInMainWorld('claudeOrchestrator', api);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:main -- preload`
Expected: PASS (4 tests)

- [ ] **Step 5: Declare the global type for the renderer**

Create `src/renderer/window.d.ts`:

```ts
import type { ClaudeOrchestratorApi } from '../preload/index';

declare global {
  interface Window {
    claudeOrchestrator: ClaudeOrchestratorApi;
  }
}

export {};
```

- [ ] **Step 6: Commit**

```bash
git add src/preload/index.ts src/preload/index.test.ts src/renderer/window.d.ts
git commit -m "feat: expose typed preload api to the renderer"
```

---

### Task 11: Renderer — repo sidebar, new-task modal, and clone-repo modal

**Files:**
- Create: `src/renderer/components/repo-sidebar/repo-sidebar.tsx`
- Create: `src/renderer/components/repo-sidebar/repo-sidebar.stories.tsx`
- Create: `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx`
- Create: `src/renderer/components/new-task-modal/new-task-modal.tsx`
- Create: `src/renderer/components/new-task-modal/new-task-modal.stories.tsx`
- Create: `src/renderer/components/new-task-modal/new-task-modal.test.tsx`
- Create: `src/renderer/components/clone-repo-modal/clone-repo-modal.tsx`
- Create: `src/renderer/components/clone-repo-modal/clone-repo-modal.stories.tsx`
- Create: `src/renderer/components/clone-repo-modal/clone-repo-modal.test.tsx`

**Interfaces:**
- Consumes: `RepoRecord`, `TaskRecord` from `src/shared/types.ts` (Task 2).
- Produces: `RepoSidebarProps` / `RepoSidebar` (props: `repos`, `tasksByRepoId`, `selectedTaskId`, `onSelectTask`, `onOpenRepoClick`, `onCloneRepoClick`, `onNewTaskClick`), `NewTaskModalProps` / `NewTaskModal` (props: `isOpen`, `onClose`, `onSubmit`), `CloneRepoModalProps` / `CloneRepoModal` (props: `isOpen`, `onClose`, `onSubmit`).

- [ ] **Step 1: Write the failing test for RepoSidebar**

Create `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepoSidebar } from './repo-sidebar';
import type { RepoRecord, TaskRecord } from '../../../shared/types';

const repo: RepoRecord = { id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' };
const task: TaskRecord = {
  id: 'task-1',
  repoId: 'repo-1',
  title: 'Fix login bug',
  branch: 'task/fix-login-bug',
  worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
  status: 'todo',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
};

describe('RepoSidebar', () => {
  it('renders each repo and its tasks', () => {
    render(
      <RepoSidebar
        repos={[repo]}
        tasksByRepoId={{ 'repo-1': [task] }}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
      />,
    );
    expect(screen.getByText('demo')).toBeInTheDocument();
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
  });

  it('calls onSelectTask when a task is clicked', async () => {
    const onSelectTask = vi.fn();
    render(
      <RepoSidebar
        repos={[repo]}
        tasksByRepoId={{ 'repo-1': [task] }}
        selectedTaskId={undefined}
        onSelectTask={onSelectTask}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fix login bug' }));
    expect(onSelectTask).toHaveBeenCalledWith('task-1');
  });

  it('calls onOpenRepoClick when "Open Existing Repo" is clicked', async () => {
    const onOpenRepoClick = vi.fn();
    render(
      <RepoSidebar
        repos={[]}
        tasksByRepoId={{}}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={onOpenRepoClick}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open Existing Repo' }));
    expect(onOpenRepoClick).toHaveBeenCalledOnce();
  });

  it('calls onCloneRepoClick when "Clone Repo" is clicked', async () => {
    const onCloneRepoClick = vi.fn();
    render(
      <RepoSidebar
        repos={[]}
        tasksByRepoId={{}}
        selectedTaskId={undefined}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={onCloneRepoClick}
        onNewTaskClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clone Repo' }));
    expect(onCloneRepoClick).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer -- repo-sidebar`
Expected: FAIL — `Cannot find module './repo-sidebar'`

- [ ] **Step 3: Implement RepoSidebar**

Create `src/renderer/components/repo-sidebar/repo-sidebar.tsx`:

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
}

export function RepoSidebar({
  repos,
  tasksByRepoId,
  selectedTaskId,
  onSelectTask,
  onOpenRepoClick,
  onCloneRepoClick,
  onNewTaskClick,
}: RepoSidebarProps): JSX.Element {
  return (
    <nav aria-label="Repositories">
      <button type="button" onClick={onOpenRepoClick}>
        Open Existing Repo
      </button>
      <button type="button" onClick={onCloneRepoClick}>
        Clone Repo
      </button>
      <ul>
        {repos.map((repo) => (
          <li key={repo.id}>
            <span>{repo.name}</span>
            <button type="button" onClick={() => onNewTaskClick(repo.id)}>
              New Task
            </button>
            <ul>
              {(tasksByRepoId[repo.id] ?? []).map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    aria-pressed={task.id === selectedTaskId}
                    onClick={() => onSelectTask(task.id)}
                  >
                    {task.title}
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:renderer -- repo-sidebar`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the Storybook story**

Create `src/renderer/components/repo-sidebar/repo-sidebar.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { RepoSidebar } from './repo-sidebar';

const meta: Meta<typeof RepoSidebar> = {
  component: RepoSidebar,
  title: 'Components/RepoSidebar',
  args: {
    onSelectTask: fn(),
    onOpenRepoClick: fn(),
    onCloneRepoClick: fn(),
    onNewTaskClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof RepoSidebar>;

export const Empty: Story = {
  args: { repos: [], tasksByRepoId: {}, selectedTaskId: undefined },
};

export const WithRepoAndTasks: Story = {
  args: {
    repos: [{ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' }],
    tasksByRepoId: {
      'repo-1': [
        {
          id: 'task-1',
          repoId: 'repo-1',
          title: 'Fix login bug',
          branch: 'task/fix-login-bug',
          worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
          status: 'todo',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
    },
    selectedTaskId: 'task-1',
  },
};
```

- [ ] **Step 6: Write the failing test for NewTaskModal**

Create `src/renderer/components/new-task-modal/new-task-modal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewTaskModal } from './new-task-modal';

describe('NewTaskModal', () => {
  it('does not render when isOpen is false', () => {
    render(<NewTaskModal isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits title, optional adoId, and optional branch', async () => {
    const onSubmit = vi.fn();
    render(<NewTaskModal isOpen onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix login bug');
    await userEvent.type(screen.getByLabelText('ADO Task ID (optional)'), 'ADO-1234');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Fix login bug', adoId: 'ADO-1234', branch: undefined });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<NewTaskModal isOpen onClose={onClose} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm run test:renderer -- new-task-modal`
Expected: FAIL — `Cannot find module './new-task-modal'`

- [ ] **Step 8: Implement NewTaskModal**

Create `src/renderer/components/new-task-modal/new-task-modal.tsx`:

```tsx
import { useState } from 'react';

export interface NewTaskFields {
  title: string;
  adoId: string | undefined;
  branch: string | undefined;
}

export interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (fields: NewTaskFields) => void;
}

export function NewTaskModal({ isOpen, onClose, onSubmit }: NewTaskModalProps): JSX.Element | null {
  const [title, setTitle] = useState('');
  const [adoId, setAdoId] = useState('');
  const [branch, setBranch] = useState('');

  if (!isOpen) {
    return null;
  }

  function handleSubmit(): void {
    onSubmit({
      title,
      adoId: adoId || undefined,
      branch: branch || undefined,
    });
  }

  return (
    <div role="dialog" aria-label="New Task">
      <label htmlFor="new-task-title">Title</label>
      <input id="new-task-title" value={title} onChange={(event) => setTitle(event.target.value)} />

      <label htmlFor="new-task-ado-id">ADO Task ID (optional)</label>
      <input id="new-task-ado-id" value={adoId} onChange={(event) => setAdoId(event.target.value)} />

      <label htmlFor="new-task-branch">Branch (optional)</label>
      <input id="new-task-branch" value={branch} onChange={(event) => setBranch(event.target.value)} />

      <button type="button" onClick={handleSubmit}>
        Create Task
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm run test:renderer -- new-task-modal`
Expected: PASS (3 tests)

- [ ] **Step 10: Add the Storybook story**

Create `src/renderer/components/new-task-modal/new-task-modal.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { NewTaskModal } from './new-task-modal';

const meta: Meta<typeof NewTaskModal> = {
  component: NewTaskModal,
  title: 'Components/NewTaskModal',
  args: { onClose: fn(), onSubmit: fn() },
};

export default meta;
type Story = StoryObj<typeof NewTaskModal>;

export const Open: Story = { args: { isOpen: true } };
export const Closed: Story = { args: { isOpen: false } };
```

- [ ] **Step 11: Write the failing test for CloneRepoModal**

Create `src/renderer/components/clone-repo-modal/clone-repo-modal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloneRepoModal } from './clone-repo-modal';

describe('CloneRepoModal', () => {
  it('does not render when isOpen is false', () => {
    render(<CloneRepoModal isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits the url and name', async () => {
    const onSubmit = vi.fn();
    render(<CloneRepoModal isOpen onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Git URL'), 'https://github.com/paurodriguez0220/demo.git');
    await userEvent.type(screen.getByLabelText('Local Name'), 'demo');
    await userEvent.click(screen.getByRole('button', { name: 'Clone' }));
    expect(onSubmit).toHaveBeenCalledWith({ url: 'https://github.com/paurodriguez0220/demo.git', name: 'demo' });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<CloneRepoModal isOpen onClose={onClose} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 12: Run test to verify it fails**

Run: `npm run test:renderer -- clone-repo-modal`
Expected: FAIL — `Cannot find module './clone-repo-modal'`

- [ ] **Step 13: Implement CloneRepoModal**

Create `src/renderer/components/clone-repo-modal/clone-repo-modal.tsx`:

```tsx
import { useState } from 'react';

export interface CloneRepoFields {
  url: string;
  name: string;
}

export interface CloneRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (fields: CloneRepoFields) => void;
}

export function CloneRepoModal({ isOpen, onClose, onSubmit }: CloneRepoModalProps): JSX.Element | null {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');

  if (!isOpen) {
    return null;
  }

  return (
    <div role="dialog" aria-label="Clone Repo">
      <label htmlFor="clone-repo-url">Git URL</label>
      <input id="clone-repo-url" value={url} onChange={(event) => setUrl(event.target.value)} />

      <label htmlFor="clone-repo-name">Local Name</label>
      <input id="clone-repo-name" value={name} onChange={(event) => setName(event.target.value)} />

      <button type="button" onClick={() => onSubmit({ url, name })}>
        Clone
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 14: Run test to verify it passes**

Run: `npm run test:renderer -- clone-repo-modal`
Expected: PASS (3 tests)

- [ ] **Step 15: Add the Storybook story**

Create `src/renderer/components/clone-repo-modal/clone-repo-modal.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { CloneRepoModal } from './clone-repo-modal';

const meta: Meta<typeof CloneRepoModal> = {
  component: CloneRepoModal,
  title: 'Components/CloneRepoModal',
  args: { onClose: fn(), onSubmit: fn() },
};

export default meta;
type Story = StoryObj<typeof CloneRepoModal>;

export const Open: Story = { args: { isOpen: true } };
export const Closed: Story = { args: { isOpen: false } };
```

- [ ] **Step 16: Commit**

```bash
git add src/renderer/components/repo-sidebar src/renderer/components/new-task-modal src/renderer/components/clone-repo-modal
git commit -m "feat: add repo sidebar, new-task modal, and clone-repo modal components"
```

---

### Task 12: Renderer — terminal tab

**Files:**
- Create: `src/renderer/components/terminal-tab/terminal-tab.tsx`
- Create: `src/renderer/components/terminal-tab/terminal-tab.stories.tsx`
- Create: `src/renderer/components/terminal-tab/terminal-tab.test.tsx`

**Interfaces:**
- Consumes: `window.claudeOrchestrator.sendPtyInput`, `window.claudeOrchestrator.onPtyOutput` (Task 10).
- Produces: `TerminalTabProps` / `TerminalTab` (props: `taskId`).

- [ ] **Step 1: Install xterm dependencies (already added in Task 1 Step 3 — verify)**

Run: `npm ls @xterm/xterm @xterm/addon-fit`
Expected: both packages listed, no error.

- [ ] **Step 2: Write the failing test**

Create `src/renderer/components/terminal-tab/terminal-tab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const writeMock = vi.fn();
const openMock = vi.fn();
const onDataMock = vi.fn();
const loadAddonMock = vi.fn();

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: openMock,
    write: writeMock,
    onData: onDataMock,
    loadAddon: loadAddonMock,
    dispose: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn() })),
}));

const sendPtyInput = vi.fn();
const onPtyOutput = vi.fn();

beforeEach(() => {
  vi.stubGlobal('window', {
    ...window,
    claudeOrchestrator: { sendPtyInput, onPtyOutput },
  });
});

import { TerminalTab } from './terminal-tab';

describe('TerminalTab', () => {
  it('opens a terminal and registers a pty output listener on mount', () => {
    render(<TerminalTab taskId="task-1" />);
    expect(openMock).toHaveBeenCalled();
    expect(onPtyOutput).toHaveBeenCalledWith(expect.any(Function));
  });

  it('forwards local keystrokes to sendPtyInput for the right taskId', () => {
    render(<TerminalTab taskId="task-1" />);
    const onDataHandler = onDataMock.mock.calls[0]?.[0] as (data: string) => void;
    onDataHandler('ls\r');
    expect(sendPtyInput).toHaveBeenCalledWith('task-1', 'ls\r');
  });

  it('only writes pty output events matching this tab\'s taskId', () => {
    render(<TerminalTab taskId="task-1" />);
    const outputHandler = onPtyOutput.mock.calls[0]?.[0] as (event: { taskId: string; data: string }) => void;
    outputHandler({ taskId: 'task-2', data: 'ignored' });
    expect(writeMock).not.toHaveBeenCalledWith('ignored');
    outputHandler({ taskId: 'task-1', data: 'hello' });
    expect(writeMock).toHaveBeenCalledWith('hello');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:renderer -- terminal-tab`
Expected: FAIL — `Cannot find module './terminal-tab'`

- [ ] **Step 4: Implement TerminalTab**

Create `src/renderer/components/terminal-tab/terminal-tab.tsx`:

```tsx
import { useEffect, useRef } from 'react';
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

    const terminal = new Terminal();
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();

    terminal.onData((data: string) => {
      window.claudeOrchestrator.sendPtyInput(taskId, data);
    });

    window.claudeOrchestrator.onPtyOutput((event: PtyOutputEvent) => {
      if (event.taskId === taskId) {
        terminal.write(event.data);
      }
    });

    return () => {
      terminal.dispose();
    };
  }, [taskId]);

  return <div ref={containerRef} data-task-id={taskId} />;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:renderer -- terminal-tab`
Expected: PASS (3 tests)

- [ ] **Step 6: Add the Storybook story**

Create `src/renderer/components/terminal-tab/terminal-tab.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { TerminalTab } from './terminal-tab';

const meta: Meta<typeof TerminalTab> = {
  component: TerminalTab,
  title: 'Components/TerminalTab',
};

export default meta;
type Story = StoryObj<typeof TerminalTab>;

export const Default: Story = {
  args: { taskId: 'story-task-1' },
};
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/terminal-tab
git commit -m "feat: add terminal tab component wired to preload pty api"
```

---

### Task 13: Renderer — task notes panel

**Files:**
- Create: `src/renderer/components/task-notes-panel/task-notes-panel.tsx`
- Create: `src/renderer/components/task-notes-panel/task-notes-panel.stories.tsx`
- Create: `src/renderer/components/task-notes-panel/task-notes-panel.test.tsx`

**Interfaces:**
- Produces: `TaskNotesPanelProps` / `TaskNotesPanel` (props: `body`, `status`, `onSave`).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/task-notes-panel/task-notes-panel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskNotesPanel } from './task-notes-panel';

describe('TaskNotesPanel', () => {
  it('renders the existing body', () => {
    render(<TaskNotesPanel body="existing notes" status="todo" onSave={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('existing notes');
  });

  it('calls onSave with the edited body when Save is clicked', async () => {
    const onSave = vi.fn();
    render(<TaskNotesPanel body="" status="todo" onSave={onSave} />);
    await userEvent.type(screen.getByRole('textbox'), 'new note');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('new note');
  });

  it('surfaces a save error instead of swallowing it', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('disk full'));
    render(<TaskNotesPanel body="" status="todo" onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('disk full')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer -- task-notes-panel`
Expected: FAIL — `Cannot find module './task-notes-panel'`

- [ ] **Step 3: Implement TaskNotesPanel**

Create `src/renderer/components/task-notes-panel/task-notes-panel.tsx`:

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
    <div>
      <p>Status: {status}</p>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button type="button" onClick={handleSave}>
        Save
      </button>
      {saveError !== undefined && <p role="alert">{saveError}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:renderer -- task-notes-panel`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the Storybook story**

Create `src/renderer/components/task-notes-panel/task-notes-panel.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { TaskNotesPanel } from './task-notes-panel';

const meta: Meta<typeof TaskNotesPanel> = {
  component: TaskNotesPanel,
  title: 'Components/TaskNotesPanel',
  args: { onSave: fn() },
};

export default meta;
type Story = StoryObj<typeof TaskNotesPanel>;

export const Empty: Story = { args: { body: '', status: 'todo' } };
export const WithNotes: Story = { args: { body: 'Started investigating the redirect loop.', status: 'in-progress' } };
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/task-notes-panel
git commit -m "feat: add task notes panel component"
```

---

### Task 14: Renderer — App shell wiring

**Files:**
- Modify: `src/renderer/app.tsx`
- Test: `src/renderer/app.test.tsx`

**Interfaces:**
- Consumes: `RepoSidebar`, `NewTaskModal`, `CloneRepoModal` (Task 11), `TerminalTab` (Task 12), `TaskNotesPanel` (Task 13), `window.claudeOrchestrator` (Task 10).
- Produces: the composed `App` component — the plan's final integration point.

Per `web-components.md`'s async-handler rule, every async action here (`openTask`, `createTask`, `addRepo`, `cloneRepo`) is wrapped so a rejection shows a visible error instead of failing silently — this is also the design's "Git/PTY errors are surfaced visibly in the UI" acceptance criterion.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/app.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './app';
import type { RepoRecord, TaskRecord } from '../shared/types';

const repo: RepoRecord = { id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-08T00:00:00.000Z' };
const task: TaskRecord = {
  id: 'task-1',
  repoId: 'repo-1',
  title: 'Fix login bug',
  branch: 'task/fix-login-bug',
  worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
  status: 'todo',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
};

const listRepos = vi.fn(async () => [repo]);
const listTasks = vi.fn(async () => [task]);
const createTask = vi.fn(async () => task);
const openTask = vi.fn(async () => undefined);
const getTaskNotes = vi.fn(async () => ({ body: 'notes', status: 'todo' as const }));
const setTaskNotes = vi.fn(async () => undefined);
const selectFolder = vi.fn(async () => 'C:\\Users\\paulo.rodriguez\\Paulo\\demo-repo');
const addRepo = vi.fn(async () => repo);
const cloneRepo = vi.fn(async () => repo);

beforeEach(() => {
  vi.stubGlobal('window', {
    ...window,
    claudeOrchestrator: {
      listRepos,
      listTasks,
      createTask,
      openTask,
      closeTask: vi.fn(),
      removeTask: vi.fn(),
      selectFolder,
      addRepo,
      cloneRepo,
      getTaskNotes,
      setTaskNotes,
      sendPtyInput: vi.fn(),
      onPtyOutput: vi.fn(),
    },
  });
});

describe('App', () => {
  it('loads repos and tasks on mount and renders the sidebar', async () => {
    render(<App />);
    expect(await screen.findByText('demo')).toBeInTheDocument();
    expect(await screen.findByText('Fix login bug')).toBeInTheDocument();
  });

  it('selecting a task opens it and shows its notes panel', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fix login bug' }));
    expect(openTask).toHaveBeenCalledWith('task-1');
    expect(await screen.findByDisplayValue('notes')).toBeInTheDocument();
  });

  it('"Open Existing Repo" picks a folder via the native dialog and adds it', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open Existing Repo' }));
    expect(selectFolder).toHaveBeenCalledOnce();
    expect(addRepo).toHaveBeenCalledWith('C:\\Users\\paulo.rodriguez\\Paulo\\demo-repo');
  });

  it('does not call addRepo when the folder picker is cancelled', async () => {
    selectFolder.mockResolvedValueOnce(undefined);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open Existing Repo' }));
    expect(addRepo).not.toHaveBeenCalled();
  });

  it('shows a visible error when creating a task fails, instead of failing silently', async () => {
    createTask.mockRejectedValueOnce(new Error('git worktree add failed: fatal: branch already exists'));
    render(<App />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'New Task' }))[0]);
    await userEvent.type(screen.getByLabelText('Title'), 'Fix login bug');
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('git worktree add failed: fatal: branch already exists');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer -- app`
Expected: FAIL (current scaffolded `App` doesn't render a sidebar)

- [ ] **Step 3: Implement the App shell**

Replace the contents of `src/renderer/app.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { RepoSidebar } from './components/repo-sidebar/repo-sidebar';
import { NewTaskModal } from './components/new-task-modal/new-task-modal';
import { CloneRepoModal } from './components/clone-repo-modal/clone-repo-modal';
import { TerminalTab } from './components/terminal-tab/terminal-tab';
import { TaskNotesPanel } from './components/task-notes-panel/task-notes-panel';
import type { RepoRecord, TaskRecord, TaskStatus } from '../shared/types';

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

export function App(): JSX.Element {
  const [repos, setRepos] = useState<RepoRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [notesBody, setNotesBody] = useState('');
  const [notesStatus, setNotesStatus] = useState<TaskStatus>('todo');
  const [newTaskRepoId, setNewTaskRepoId] = useState<string | undefined>();
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    void window.claudeOrchestrator.listRepos().then(setRepos);
    void window.claudeOrchestrator.listTasks().then(setTasks);
  }, []);

  async function handleSelectTask(taskId: string): Promise<void> {
    setErrorMessage(undefined);
    setSelectedTaskId(taskId);
    try {
      await window.claudeOrchestrator.openTask(taskId);
      const notes = await window.claudeOrchestrator.getTaskNotes(taskId);
      setNotesBody(notes.body);
      setNotesStatus(notes.status);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }

  async function handleCreateTask(fields: { title: string; adoId: string | undefined; branch: string | undefined }): Promise<void> {
    if (!newTaskRepoId) {
      return;
    }
    setErrorMessage(undefined);
    try {
      const task = await window.claudeOrchestrator.createTask({ repoId: newTaskRepoId, ...fields });
      setTasks((current) => [...current, task]);
      setNewTaskRepoId(undefined);
      await handleSelectTask(task.id);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }

  async function handleOpenRepoClick(): Promise<void> {
    setErrorMessage(undefined);
    try {
      const path = await window.claudeOrchestrator.selectFolder();
      if (path === undefined) {
        return;
      }
      const repo = await window.claudeOrchestrator.addRepo(path);
      setRepos((current) => [...current, repo]);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }

  async function handleCloneRepo(fields: { url: string; name: string }): Promise<void> {
    setErrorMessage(undefined);
    try {
      const repo = await window.claudeOrchestrator.cloneRepo(fields.url, fields.name);
      setRepos((current) => [...current, repo]);
      setIsCloneModalOpen(false);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }

  const tasksByRepoId = tasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
    (acc[task.repoId] ??= []).push(task);
    return acc;
  }, {});

  return (
    <div>
      {errorMessage !== undefined && <p role="alert">{errorMessage}</p>}
      <RepoSidebar
        repos={repos}
        tasksByRepoId={tasksByRepoId}
        selectedTaskId={selectedTaskId}
        onSelectTask={(taskId) => void handleSelectTask(taskId)}
        onOpenRepoClick={() => void handleOpenRepoClick()}
        onCloneRepoClick={() => setIsCloneModalOpen(true)}
        onNewTaskClick={setNewTaskRepoId}
      />
      <NewTaskModal
        isOpen={newTaskRepoId !== undefined}
        onClose={() => setNewTaskRepoId(undefined)}
        onSubmit={(fields) => void handleCreateTask(fields)}
      />
      <CloneRepoModal
        isOpen={isCloneModalOpen}
        onClose={() => setIsCloneModalOpen(false)}
        onSubmit={(fields) => void handleCloneRepo(fields)}
      />
      {selectedTaskId !== undefined && (
        <>
          <TerminalTab taskId={selectedTaskId} />
          <TaskNotesPanel
            body={notesBody}
            status={notesStatus}
            onSave={(newBody) => window.claudeOrchestrator.setTaskNotes({ taskId: selectedTaskId, body: newBody })}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:renderer -- app`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — every main-process and renderer test from Tasks 2–14 is green.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/app.tsx src/renderer/app.test.tsx
git commit -m "feat: wire app shell to preload api, completing the mvp flow"
```

---

### Task 15: Manual smoke-test checklist

**Files:**
- Create: `docs/runbooks/manual-smoke-test.md`

**Interfaces:**
- None — this is a documentation deliverable, not code. Its "test" is manually walking through it once against the running app.

- [ ] **Step 1: Write the checklist**

Create `docs/runbooks/manual-smoke-test.md`:

```markdown
# Manual Smoke Test — Claude Orchestrator

Run through this checklist after any change to the Electron shell, PTY spawning, or IPC wiring — these paths aren't covered by automated tests.

1. Run `npm run dev`. The app window opens with an empty sidebar and an "Add Repo" button.
2. Click "Add Repo", pick an existing local git repo folder. It appears in the sidebar.
3. Click "New Task" on that repo. Fill in a title, submit. A new terminal tab opens.
4. In the terminal tab, confirm `claude` actually starts (not a blank/frozen pane).
5. Run `git worktree list` in a separate terminal — confirm the new worktree exists at `<repo>-worktrees/<slug>`.
6. Type a message to Claude in the tab; confirm it responds.
7. Close the app entirely, then reopen it (`npm run dev` again). The repo and task should still be listed.
8. Click the task again — confirm `claude --continue` resumes with prior context (ask Claude "what were we just discussing?").
9. Edit the notes panel for the task, click Save, restart the app, reopen the task — the notes persist.
10. Remove the task — confirm the confirmation prompt appears, then confirm `git worktree list` no longer shows it.
11. Try creating a task with a title containing `; rm -rf /` — confirm it's slugified/rejected safely and no shell command actually runs with that payload.

---
*Maintained by paurodriguez0220 · Last updated: 2026-07-08*
*Standards: https://github.com/paurodriguez0220/standards-docs*
```

- [ ] **Step 2: Walk through the checklist once against the real app**

Run: `npm run dev` and manually perform steps 1–11 above.
Expected: every step behaves as described. Note any failures as new entries under `docs/issues/queue/` (per `documentation.md`) rather than fixing ad hoc.

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/manual-smoke-test.md
git commit -m "docs: add manual smoke-test checklist for the electron shell"
```

## Acceptance Criteria

- [ ] Can add a repo (open existing local folder, or clone from a git URL into `C:\Users\paulo.rodriguez\claude-orchestrator\repos\`)
- [ ] Can create a new task on a repo: enters title/ADO id/branch, worktree is created on disk, notes file is created
- [ ] New task opens an embedded terminal tab running `claude`, `cwd` correctly set to the new worktree
- [ ] Closing and reopening a task reuses the same worktree and resumes Claude context via `--continue`
- [ ] Task notes are editable and persist across app restarts
- [ ] Removing a task removes the git worktree (with confirmation) and archives its notes file
- [ ] Git/PTY errors are surfaced visibly in the UI, never silently swallowed
- [ ] App restart restores the full repo/task list from `store.json`
- [ ] All git/process invocations use argument arrays (no shell string interpolation); unit tests cover malicious input (e.g. branch names containing `;`, `&&`, backticks) and assert they're rejected or safely escaped

---
*Maintained by paurodriguez0220 · Last updated: 2026-07-08*
*Standards: https://github.com/paurodriguez0220/standards-docs*
