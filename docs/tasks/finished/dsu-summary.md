# Task: Daily stand-up (DSU) summary service

**Status:** Done

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

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A manual "Generate DSU" action that walks every non-scratch task's worktree, collects commit subjects since the last working day, synthesizes a stand-up write-up via a one-shot `claude -p` call, saves it to `<runtime-data-root>/dsu/<date>.md`, and shows it in a modal.

**Architecture:** `git-service.ts` gains a pure cutoff-computation function and a `git log --since --pretty=%s` wrapper, both following its existing `execFile`-with-argument-array pattern. A new `dsu-service.ts` owns prompt construction and the one-shot non-interactive `claude -p` invocation (via `execFile('cmd.exe', ['/c', 'claude', '-p', prompt])`) — a deliberately different code path from `pty-manager.ts`'s interactive `pty.spawn`, which this feature never touches. A new IPC channel (`dsu:generate`) and main-process handler (`dsu-handlers.ts`) orchestrate: read the store, compute the cutoff, gather per-task commit subjects, call the synthesis helper, write the markdown file via a new `getDsuSummaryPath` in `paths.ts`, and return `{ markdown, filePath }` to the renderer. The renderer gets a new presentational `DsuSummaryModal` and a "Generate DSU" button wired into `RepoSidebar`/`App`, following the existing `isSubmittingModal`-style pending-state pattern already used for other async actions in `App`.

**Tech Stack:** Same as the rest of the project — TypeScript strict, Node.js `child_process`/`fs/promises`, Electron IPC, React 18, Tailwind CSS tokens, Vitest + React Testing Library.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one component/module per file, `JSX.Element` return types on components.
- Never build a shell command by string-interpolating text into a command string. Every `execFile` call passes its arguments as a discrete array element — the prompt text passed to `claude -p` is always `args[N]`, never concatenated into a larger string.
- The one-shot `claude -p` helper (`dsu-service.ts`) is a new, separate code path from `pty-manager.ts`. Do not modify `pty-manager.ts` and do not route this feature through `spawnClaudeSession`.
- Tests never actually shell out to `git` or `claude` — every test that exercises an `execFile` call mocks `node:child_process`, matching the pattern already established in `git-service.test.ts`.
- Styling uses Tailwind CSS v4 tokens (`graphite-*`, `clay-*`) — no arbitrary hex values.
- Disabled buttons must remain reachable/labeled for accessibility (no `aria-hidden` on a disabled-but-visible control).

---

### Task 1: `git-service.ts` — last-working-day cutoff and commit subjects since a cutoff

**Files:**
- Modify: `src/main/services/git-service.ts`
- Modify: `src/main/services/git-service.test.ts`

**Interfaces:**
- Produces: `getLastWorkingDayCutoff(now: Date): Date` — pure function. If `now` is a Monday, returns the previous Friday at local midnight; otherwise returns the previous day at local midnight.
- Produces: `getCommitSubjectsSince(worktreePath: string, cutoff: Date): Promise<string[]>` — runs `git log --since=<cutoff.toISOString()> --pretty=%s` (via the existing `runGitCapture`, with `cwd: worktreePath`) and returns the non-empty, trimmed commit subject lines.

- [ ] **Step 1: Write the failing tests for `getLastWorkingDayCutoff`**

Add to the top of `src/main/services/git-service.test.ts`'s import line and add a new `describe` block. The import line changes from:

```ts
import { cloneRepo, addWorktree, addWorktreeForExistingBranch, removeWorktree, listBranches, fetchRepo, GitCommandError } from './git-service';
```

to:

```ts
import { cloneRepo, addWorktree, addWorktreeForExistingBranch, removeWorktree, listBranches, fetchRepo, getLastWorkingDayCutoff, getCommitSubjectsSince, GitCommandError } from './git-service';
```

Add this new `describe` block inside `describe('git-service', ...)`, after the existing `it('wraps a failing git command in GitCommandError with the real stderr', ...)` test:

```ts
  describe('getLastWorkingDayCutoff', () => {
    it('returns last Friday at local midnight when today is Monday', () => {
      // 2024-01-08 is a Monday.
      const monday = new Date(2024, 0, 8, 14, 30, 0);
      expect(getLastWorkingDayCutoff(monday)).toEqual(new Date(2024, 0, 5, 0, 0, 0, 0));
    });

    it('returns yesterday at local midnight for any non-Monday day', () => {
      // 2024-01-10 is a Wednesday.
      const wednesday = new Date(2024, 0, 10, 9, 15, 0);
      expect(getLastWorkingDayCutoff(wednesday)).toEqual(new Date(2024, 0, 9, 0, 0, 0, 0));
    });
  });

  describe('getCommitSubjectsSince', () => {
    it('runs git log --since=<cutoff ISO> --pretty=%s in the worktree and returns non-empty subjects', async () => {
      execFileMock.mockImplementation(() => ({
        stdout: 'fix: handle empty input\nfeat: add DSU button\n\n',
        stderr: '',
      }));
      const cutoff = new Date(2024, 0, 9, 0, 0, 0, 0);
      const result = await getCommitSubjectsSince('C:\\repo-worktrees\\slug', cutoff);
      expect(execFileMock).toHaveBeenCalledWith(
        'git',
        ['-c', 'core.longpaths=true', 'log', `--since=${cutoff.toISOString()}`, '--pretty=%s'],
        { cwd: 'C:\\repo-worktrees\\slug' },
      );
      expect(result).toEqual(['fix: handle empty input', 'feat: add DSU button']);
    });

    it('returns an empty array when there are no commits since the cutoff', async () => {
      execFileMock.mockImplementation(() => ({ stdout: '', stderr: '' }));
      const result = await getCommitSubjectsSince('C:\\repo-worktrees\\slug', new Date(2024, 0, 9));
      expect(result).toEqual([]);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- git-service`
Expected: FAIL — `getLastWorkingDayCutoff` and `getCommitSubjectsSince` are not exported from `./git-service`

- [ ] **Step 3: Implement both functions**

Add to `src/main/services/git-service.ts`, after `fetchRepo`:

```ts
export function getLastWorkingDayCutoff(now: Date): Date {
  const isMonday = now.getDay() === 1;
  const daysBack = isMonday ? 3 : 1;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack, 0, 0, 0, 0);
}

export async function getCommitSubjectsSince(worktreePath: string, cutoff: Date): Promise<string[]> {
  const output = await runGitCapture(['log', `--since=${cutoff.toISOString()}`, '--pretty=%s'], worktreePath);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- git-service`
Expected: PASS (all existing tests plus the 4 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/main/services/git-service.ts src/main/services/git-service.test.ts
git commit -m "feat: add last-working-day cutoff and per-worktree commit lookup to git-service"
```

---

### Task 2: `dsu-service.ts` — one-shot `claude -p` synthesis helper

**Files:**
- Create: `src/main/services/dsu-service.ts`
- Create: `src/main/services/dsu-service.test.ts`

**Interfaces:**
- Produces: `TaskCommitSummary { title: string; commitSubjects: string[] }`
- Produces: `DsuCommandError extends Error` with a `stderr: string` field (same shape as `git-service.ts`'s `GitCommandError`).
- Produces: `buildDsuPrompt(taskSummaries: TaskCommitSummary[]): string` — pure function, one `## <title>` heading per task followed by `- <subject>` bullet lines.
- Produces: `generateDsuSummary(taskSummaries: TaskCommitSummary[]): Promise<string>` — if `taskSummaries` is empty, returns the fixed string `'No commits since the last working day.'` without invoking `claude`. Otherwise runs `execFile('cmd.exe', ['/c', 'claude', '-p', buildDsuPrompt(taskSummaries)])` (the prompt is always a single, discrete argument-array element — never concatenated into a shell string) and returns the trimmed stdout. Throws `DsuCommandError` on failure.

- [ ] **Step 1: Write the failing tests**

Create `src/main/services/dsu-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockError: { stderr?: string } | null = null;

const execFileMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => {
    const callback = args[args.length - 1] as (
      err: { stderr?: string } | null,
      result?: { stdout: string; stderr: string },
    ) => void;
    const result = execFileMock(...args.slice(0, -1));
    if (mockError) {
      callback(mockError);
    } else {
      callback(null, result ?? { stdout: '', stderr: '' });
    }
  },
}));

import { buildDsuPrompt, generateDsuSummary, DsuCommandError } from './dsu-service';
import type { TaskCommitSummary } from './dsu-service';

describe('dsu-service', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    mockError = null;
  });

  describe('buildDsuPrompt', () => {
    it('lists each task title as a heading with its commit subjects as bullets', () => {
      const taskSummaries: TaskCommitSummary[] = [
        { title: 'Fix login bug', commitSubjects: ['fix: handle empty input', 'feat: add validation'] },
      ];
      const prompt = buildDsuPrompt(taskSummaries);
      expect(prompt).toContain('## Fix login bug');
      expect(prompt).toContain('- fix: handle empty input');
      expect(prompt).toContain('- feat: add validation');
    });
  });

  describe('generateDsuSummary', () => {
    it('returns a fixed message without shelling out when there are no task summaries', async () => {
      const result = await generateDsuSummary([]);
      expect(result).toBe('No commits since the last working day.');
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('invokes claude -p non-interactively with the prompt as a discrete argument, never a concatenated shell string', async () => {
      execFileMock.mockReturnValue({ stdout: '- Fixed the login bug\n', stderr: '' });
      const taskSummaries: TaskCommitSummary[] = [
        { title: 'Fix login bug', commitSubjects: ['fix: handle empty input'] },
      ];
      const result = await generateDsuSummary(taskSummaries);
      expect(execFileMock).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'claude', '-p', buildDsuPrompt(taskSummaries)],
        undefined,
      );
      expect(result).toBe('- Fixed the login bug');
    });

    it('wraps a failing claude invocation in DsuCommandError with the real stderr', async () => {
      mockError = Object.assign(new Error('exit 1'), { stderr: 'claude: not logged in' });
      const thrownError = await generateDsuSummary([
        { title: 'Fix login bug', commitSubjects: ['fix: handle empty input'] },
      ]).catch((err) => err);
      expect(thrownError).toBeInstanceOf(DsuCommandError);
      expect(thrownError.stderr).toBe('claude: not logged in');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- dsu-service`
Expected: FAIL — cannot find module `./dsu-service` (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Create `src/main/services/dsu-service.ts`:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const NO_COMMITS_MESSAGE = 'No commits since the last working day.';

export class DsuCommandError extends Error {
  public readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(message);
    this.name = 'DsuCommandError';
    this.stderr = stderr;
  }
}

export interface TaskCommitSummary {
  title: string;
  commitSubjects: string[];
}

export function buildDsuPrompt(taskSummaries: TaskCommitSummary[]): string {
  const sections = taskSummaries
    .map(
      (task) => `## ${task.title}\n${task.commitSubjects.map((subject) => `- ${subject}`).join('\n')}`,
    )
    .join('\n\n');
  return [
    'You are helping prepare a daily stand-up update.',
    'Below is a list of tasks and the git commit subjects completed on each since the last working day.',
    'Write a concise, stand-up-style summary describing what was done, organized task by task.',
    'Do not invent information beyond what the commit subjects imply.',
    '',
    sections,
  ].join('\n');
}

export async function generateDsuSummary(taskSummaries: TaskCommitSummary[]): Promise<string> {
  if (taskSummaries.length === 0) {
    return NO_COMMITS_MESSAGE;
  }
  const prompt = buildDsuPrompt(taskSummaries);
  try {
    const { stdout } = await execFileAsync('cmd.exe', ['/c', 'claude', '-p', prompt], undefined);
    return stdout.toString().trim();
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    throw new DsuCommandError('claude -p failed to generate the DSU summary', stderr);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:main -- dsu-service`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/services/dsu-service.ts src/main/services/dsu-service.test.ts
git commit -m "feat: add one-shot claude -p DSU synthesis helper"
```

---

### Task 3: `paths.ts` — `getDsuSummaryPath`

**Files:**
- Modify: `src/main/paths.ts`
- Modify: `src/main/paths.test.ts`

**Interfaces:**
- Produces: `getDsuSummaryPath(date: string): string` — returns `<runtime-data-root>/dsu/<date>.md`.

- [ ] **Step 1: Write the failing test**

In `src/main/paths.test.ts`, change the import line from:

```ts
import { getRuntimeDataRoot, getStorePath, getReposRoot, getTaskNotesPath, getTaskTranscriptPath, getWorktreePath, getPastedImagesDir, getScratchPath } from './paths';
```

to:

```ts
import { getRuntimeDataRoot, getStorePath, getReposRoot, getTaskNotesPath, getTaskTranscriptPath, getWorktreePath, getPastedImagesDir, getScratchPath, getDsuSummaryPath } from './paths';
```

Add this test at the end of the `describe('paths', ...)` block, after the `getScratchPath` test:

```ts
  it('getDsuSummaryPath returns dsu/<date>.md under the runtime root', () => {
    expect(getDsuSummaryPath('2026-07-09')).toBe(join(getRuntimeDataRoot(), 'dsu', '2026-07-09.md'));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- paths`
Expected: FAIL — `getDsuSummaryPath` is not exported from `./paths`

- [ ] **Step 3: Implement**

Add to `src/main/paths.ts`, after `getScratchPath`:

```ts
export function getDsuSummaryPath(date: string): string {
  return join(getRuntimeDataRoot(), 'dsu', `${date}.md`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:main -- paths`
Expected: PASS (all existing tests plus the 1 new one)

- [ ] **Step 5: Commit**

```bash
git add src/main/paths.ts src/main/paths.test.ts
git commit -m "feat: add getDsuSummaryPath for the DSU markdown output file"
```

---

### Task 4: IPC channel, main-process handler, and preload exposure

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Create: `src/main/ipc/dsu-handlers.ts`
- Create: `src/main/ipc/dsu-handlers.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.test.ts`

**Interfaces:**
- Consumes: `getLastWorkingDayCutoff`, `getCommitSubjectsSince` from Task 1; `generateDsuSummary`, `TaskCommitSummary` from Task 2; `getDsuSummaryPath` from Task 3.
- Produces: `IpcChannels.GenerateDsuSummary = 'dsu:generate'` in `src/shared/ipc-channels.ts`, plus a new exported interface `DsuGenerateResponse { markdown: string; filePath: string }`.
- Produces: `registerDsuHandlers(): void` in `src/main/ipc/dsu-handlers.ts` — registers an `ipcMain.handle(IpcChannels.GenerateDsuSummary, ...)` handler that reads the store, computes the cutoff, collects commit subjects for every non-`'scratch'` task (skipping a task entirely if `getCommitSubjectsSince` throws — e.g. a worktree that no longer exists — rather than failing the whole request), calls `generateDsuSummary`, writes the result to `getDsuSummaryPath(<today as YYYY-MM-DD>)`, and returns `{ markdown, filePath }`.
- Produces: `ClaudeOrchestratorApi.generateDsuSummary(): Promise<DsuGenerateResponse>` in the preload's exposed API, invoking `IpcChannels.GenerateDsuSummary`.

- [ ] **Step 1: Add the channel and response type**

In `src/shared/ipc-channels.ts`, add `GenerateDsuSummary: 'dsu:generate',` to the `IpcChannels` object (after `SaveClipboardImage: 'image:save-clipboard',`):

```ts
export const IpcChannels = {
  RepoAdd: 'repo:add',
  RepoClone: 'repo:clone',
  RepoList: 'repo:list',
  RepoBranches: 'repo:branches',
  RepoFetch: 'repo:fetch',
  TaskCreate: 'task:create',
  TaskList: 'task:list',
  TaskOpen: 'task:open',
  TaskClose: 'task:close',
  TaskRemove: 'task:remove',
  TaskNotesGet: 'task:notes:get',
  TaskNotesSet: 'task:notes:set',
  TaskSearch: 'task:search',
  PtyInput: 'pty:input',
  PtyOutput: 'pty:output',
  PtyResize: 'pty:resize',
  TaskFinishedStateChanged: 'task:finished-state-changed',
  DialogSelectFolder: 'dialog:select-folder',
  SaveClipboardImage: 'image:save-clipboard',
  GenerateDsuSummary: 'dsu:generate',
} as const;
```

And add this interface at the end of the file:

```ts
export interface DsuGenerateResponse {
  markdown: string;
  filePath: string;
}
```

`src/shared/ipc-channels.test.ts`'s existing "every channel name is unique" test covers the new entry automatically — no test changes needed there.

- [ ] **Step 2: Write the failing handler test**

Create `src/main/ipc/dsu-handlers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StoreData } from '../../shared/types';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const mkdirMock = vi.fn();
const writeFileMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
}));

vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

let store: StoreData = { repos: [], tasks: [] };

vi.mock('../services/store', () => ({
  readStore: vi.fn(async () => store),
}));

const cutoffFixture = new Date(2026, 6, 8, 0, 0, 0, 0);

vi.mock('../services/git-service', () => ({
  getLastWorkingDayCutoff: vi.fn(() => cutoffFixture),
  getCommitSubjectsSince: vi.fn(),
}));

vi.mock('../services/dsu-service', () => ({
  generateDsuSummary: vi.fn(async () => '## Summary\nDid stuff.'),
}));

vi.mock('../paths', () => ({
  getStorePath: () => 'C:\\fake\\store.json',
  getDsuSummaryPath: (date: string) => `C:\\fake\\dsu\\${date}.md`,
}));

import { registerDsuHandlers } from './dsu-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { getCommitSubjectsSince } from '../services/git-service';
import { generateDsuSummary } from '../services/dsu-service';

describe('dsu-handlers', () => {
  beforeEach(() => {
    handlers.clear();
    mkdirMock.mockReset();
    writeFileMock.mockReset();
    vi.mocked(getCommitSubjectsSince).mockReset();
    vi.mocked(generateDsuSummary).mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 9, 10, 0, 0));
    registerDsuHandlers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('collects commit subjects per non-scratch task, skips tasks with zero commits, and writes the result', async () => {
    store = {
      repos: [],
      tasks: [
        {
          id: 'task-1',
          repoId: 'repo-1',
          title: 'Fix login bug',
          worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
          status: 'in-progress',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
        {
          id: 'task-2',
          repoId: 'repo-1',
          title: 'Untouched task',
          worktreePath: 'C:\\demo-worktrees\\untouched',
          status: 'todo',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
        {
          id: 'task-3',
          title: 'Quick question',
          worktreePath: 'C:\\fake\\scratch\\task-3',
          status: 'todo',
          kind: 'scratch',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
    };
    vi.mocked(getCommitSubjectsSince).mockImplementation(async (worktreePath: string) =>
      worktreePath === 'C:\\demo-worktrees\\fix-login-bug' ? ['fix: handle empty input'] : [],
    );

    const handler = handlers.get(IpcChannels.GenerateDsuSummary);
    const result = await handler?.({});

    expect(getCommitSubjectsSince).toHaveBeenCalledWith('C:\\demo-worktrees\\fix-login-bug', cutoffFixture);
    expect(getCommitSubjectsSince).toHaveBeenCalledWith('C:\\demo-worktrees\\untouched', cutoffFixture);
    expect(getCommitSubjectsSince).not.toHaveBeenCalledWith('C:\\fake\\scratch\\task-3', expect.anything());
    expect(generateDsuSummary).toHaveBeenCalledWith([
      { title: 'Fix login bug', commitSubjects: ['fix: handle empty input'] },
    ]);
    expect(mkdirMock).toHaveBeenCalledWith('C:\\fake\\dsu', { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith('C:\\fake\\dsu\\2026-07-09.md', '## Summary\nDid stuff.', 'utf-8');
    expect(result).toEqual({ markdown: '## Summary\nDid stuff.', filePath: 'C:\\fake\\dsu\\2026-07-09.md' });
  });

  it('skips a task whose git log fails (e.g. a removed worktree) instead of failing the whole request', async () => {
    store = {
      repos: [],
      tasks: [
        {
          id: 'task-1',
          repoId: 'repo-1',
          title: 'Stale task',
          worktreePath: 'C:\\gone',
          status: 'todo',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
    };
    vi.mocked(getCommitSubjectsSince).mockRejectedValueOnce(new Error('not a git repository'));

    const handler = handlers.get(IpcChannels.GenerateDsuSummary);
    const result = await handler?.({});

    expect(generateDsuSummary).toHaveBeenCalledWith([]);
    expect(result).toEqual({ markdown: '## Summary\nDid stuff.', filePath: 'C:\\fake\\dsu\\2026-07-09.md' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:main -- dsu-handlers`
Expected: FAIL — cannot find module `./dsu-handlers` (file doesn't exist yet)

- [ ] **Step 4: Write the implementation**

Create `src/main/ipc/dsu-handlers.ts`:

```ts
import { ipcMain } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { IpcChannels } from '../../shared/ipc-channels';
import type { DsuGenerateResponse } from '../../shared/ipc-channels';
import { readStore } from '../services/store';
import { getLastWorkingDayCutoff, getCommitSubjectsSince } from '../services/git-service';
import { generateDsuSummary } from '../services/dsu-service';
import type { TaskCommitSummary } from '../services/dsu-service';
import { getStorePath, getDsuSummaryPath } from '../paths';

function todayDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function registerDsuHandlers(): void {
  ipcMain.handle(IpcChannels.GenerateDsuSummary, async (): Promise<DsuGenerateResponse> => {
    const store = await readStore(getStorePath());
    const cutoff = getLastWorkingDayCutoff(new Date());

    const taskSummaries: TaskCommitSummary[] = [];
    for (const task of store.tasks) {
      if (task.kind === 'scratch') {
        continue;
      }
      let commitSubjects: string[];
      try {
        commitSubjects = await getCommitSubjectsSince(task.worktreePath, cutoff);
      } catch {
        continue;
      }
      if (commitSubjects.length > 0) {
        taskSummaries.push({ title: task.title, commitSubjects });
      }
    }

    const markdown = await generateDsuSummary(taskSummaries);
    const filePath = getDsuSummaryPath(todayDateStamp());
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, markdown, 'utf-8');
    return { markdown, filePath };
  });
}
```

- [ ] **Step 5: Register the handler in `index.ts`**

In `src/main/index.ts`, add the import alongside the other handler imports:

```ts
import { registerDsuHandlers } from './ipc/dsu-handlers';
```

And call it in `app.whenReady()`, alongside the other `register*Handlers()` calls:

```ts
app.whenReady().then(() => {
  registerRepoHandlers();
  registerTaskHandlers(broadcastPtyData);
  registerImageHandlers();
  registerDsuHandlers();
  startTranscriptExportScheduler(5 * 60 * 1000);
  startFinishedStatePoller(5000, broadcastFinishedState);
```

- [ ] **Step 6: Run handler test to verify it passes**

Run: `npm run test:main -- dsu-handlers`
Expected: PASS (2 tests)

- [ ] **Step 7: Write the failing preload test**

Add to `src/preload/index.test.ts`, at the end of the `describe('preload', ...)` block:

```ts
  it('generateDsuSummary invokes the GenerateDsuSummary channel', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.generateDsuSummary as any)();
    expect(ipcRendererInvoke).toHaveBeenCalledWith('dsu:generate');
  });
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm run test:main -- preload`
Expected: FAIL — `api.generateDsuSummary` is not a function

- [ ] **Step 9: Implement the preload exposure**

In `src/preload/index.ts`, add `DsuGenerateResponse` to the existing type-only import from `../shared/ipc-channels`:

```ts
import type {
  TaskCreateRequest,
  TaskNotesSetRequest,
  TaskNotesGetResponse,
  PtyOutputEvent,
  TaskFinishedStateChangedEvent,
  BranchOption,
  DsuGenerateResponse,
} from '../shared/ipc-channels';
```

Add a method to the `ClaudeOrchestratorApi` interface, after `saveClipboardImage`:

```ts
  saveClipboardImage(dataUrl: string): Promise<string>;
  generateDsuSummary(): Promise<DsuGenerateResponse>;
}
```

Add the implementation to the `api` object, after `saveClipboardImage`:

```ts
  saveClipboardImage: (dataUrl) => ipcRenderer.invoke(IpcChannels.SaveClipboardImage, dataUrl),
  generateDsuSummary: () => ipcRenderer.invoke(IpcChannels.GenerateDsuSummary),
};
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npm run test:main -- preload`
Expected: PASS (all existing tests plus the 1 new one)

- [ ] **Step 11: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/ipc/dsu-handlers.ts src/main/ipc/dsu-handlers.test.ts src/main/index.ts src/preload/index.ts src/preload/index.test.ts
git commit -m "feat: wire up DSU generation IPC channel, handler, and preload exposure"
```

---

### Task 5: `DsuSummaryModal` component

**Files:**
- Create: `src/renderer/components/dsu-summary-modal/dsu-summary-modal.tsx`
- Create: `src/renderer/components/dsu-summary-modal/dsu-summary-modal.test.tsx`
- Create: `src/renderer/components/dsu-summary-modal/dsu-summary-modal.stories.tsx`

**Interfaces:**
- Consumes: `ModalOverlay` from `../modal-overlay/modal-overlay`.
- Produces: `DsuSummaryModal({ isOpen, summary, filePath, onClose }: DsuSummaryModalProps): JSX.Element | null`, where `DsuSummaryModalProps { isOpen: boolean; summary: string; filePath: string | undefined; onClose: () => void }`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/dsu-summary-modal/dsu-summary-modal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DsuSummaryModal } from './dsu-summary-modal';

describe('DsuSummaryModal', () => {
  it('does not render when isOpen is false', () => {
    render(<DsuSummaryModal isOpen={false} summary="" filePath={undefined} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the summary text and the saved file path', () => {
    render(
      <DsuSummaryModal
        isOpen
        summary={'## Fix login bug\n- Fixed the bug'}
        filePath="C:\\Users\\paulo.rodriguez\\claude-orchestrator\\dsu\\2026-07-09.md"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'DSU Summary' })).toBeInTheDocument();
    expect(screen.getByText(/Fixed the bug/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-09\.md/)).toBeInTheDocument();
  });

  it('calls onClose when Close is clicked', async () => {
    const onClose = vi.fn();
    render(<DsuSummaryModal isOpen summary="text" filePath={undefined} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer -- dsu-summary-modal`
Expected: FAIL — cannot find module `./dsu-summary-modal` (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Create `src/renderer/components/dsu-summary-modal/dsu-summary-modal.tsx`:

```tsx
import { ModalOverlay } from '../modal-overlay/modal-overlay';

export interface DsuSummaryModalProps {
  isOpen: boolean;
  summary: string;
  filePath: string | undefined;
  onClose: () => void;
}

export function DsuSummaryModal({ isOpen, summary, filePath, onClose }: DsuSummaryModalProps): JSX.Element | null {
  if (!isOpen) {
    return null;
  }

  return (
    <ModalOverlay>
      <div role="dialog" aria-label="DSU Summary" className="flex max-h-[80vh] flex-col gap-4">
        <h2 className="text-lg font-semibold text-graphite-100">DSU Summary</h2>
        <pre className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-md border border-graphite-700 bg-graphite-900 p-3 text-sm text-graphite-100">
          {summary}
        </pre>
        {filePath !== undefined && <p className="text-xs text-graphite-400">Saved to {filePath}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-clay-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:bg-clay-500"
          >
            Close
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:renderer -- dsu-summary-modal`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the Storybook story**

Create `src/renderer/components/dsu-summary-modal/dsu-summary-modal.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { DsuSummaryModal } from './dsu-summary-modal';

const meta: Meta<typeof DsuSummaryModal> = {
  component: DsuSummaryModal,
  title: 'Components/DsuSummaryModal',
  args: { onClose: fn() },
};

export default meta;
type Story = StoryObj<typeof DsuSummaryModal>;

export const Open: Story = {
  args: {
    isOpen: true,
    summary:
      '## Fix login bug\n\n- Fixed a null check on the login form.\n\n## Add search bar\n\n- Wired up the task search input.',
    filePath: 'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\dsu\\2026-07-09.md',
  },
};

export const Closed: Story = { args: { isOpen: false, summary: '', filePath: undefined } };
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/dsu-summary-modal
git commit -m "feat: add DsuSummaryModal component"
```

---

### Task 6: "Generate DSU" button in `RepoSidebar`, wired up in `App`

**Files:**
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.tsx`
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx`
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.stories.tsx`
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/app.test.tsx`

**Interfaces:**
- Consumes: `Spinner` from `../spinner/spinner` (already used elsewhere in `repo-sidebar.tsx`'s sibling components); `DsuSummaryModal` from Task 5; `window.claudeOrchestrator.generateDsuSummary()` from Task 4.
- Produces: `RepoSidebarProps` gains two new required fields: `onGenerateDsuClick: () => void` and `isGeneratingDsu: boolean`. No other prop changes.

- [ ] **Step 1: Update existing `RepoSidebar` tests to the new required props**

`onGenerateDsuClick` and `isGeneratingDsu` are new required props, so every existing `render(<RepoSidebar ... />)` call in `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx` needs both added. There are 17 such calls; each one currently ends with an `onNewQuestionClick={...}` line immediately before the closing `/>`. Add `onGenerateDsuClick={vi.fn()}` and `isGeneratingDsu={false}` right after that line in all 17 blocks. For example, the first test's `render` call becomes:

```tsx
    render(
      <RepoSidebar
        repos={[repo]}
        activeTasksByRepoId={{ 'repo-1': [task] }}
        archivedTasksByRepoId={{}}
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        onGenerateDsuClick={vi.fn()}
        isGeneratingDsu={false}
      />,
    );
```

Apply the same two added lines (`onGenerateDsuClick={vi.fn()}` / `isGeneratingDsu={false}`, using the test's existing spy variable in place of `vi.fn()` where one is already declared for another prop — each call keeps whichever spy it already passes for its own props under test and just adds these two as plain `vi.fn()`/`false`) to the other 16 `render(<RepoSidebar ... />)` calls in the file, changing nothing else about them.

- [ ] **Step 2: Write the new failing tests**

Append to the end of the `describe('RepoSidebar', ...)` block in `src/renderer/components/repo-sidebar/repo-sidebar.test.tsx` (after the last existing `it(...)`):

```tsx
  it('calls onGenerateDsuClick when "Generate DSU" is clicked', async () => {
    const onGenerateDsuClick = vi.fn();
    render(
      <RepoSidebar
        repos={[]}
        activeTasksByRepoId={{}}
        archivedTasksByRepoId={{}}
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        onGenerateDsuClick={onGenerateDsuClick}
        isGeneratingDsu={false}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Generate DSU' }));
    expect(onGenerateDsuClick).toHaveBeenCalledOnce();
  });

  it('disables the Generate DSU button and shows a spinner while isGeneratingDsu', () => {
    render(
      <RepoSidebar
        repos={[]}
        activeTasksByRepoId={{}}
        archivedTasksByRepoId={{}}
        scratchTasks={[]}
        selectedTaskId={undefined}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectTask={vi.fn()}
        onOpenRepoClick={vi.fn()}
        onCloneRepoClick={vi.fn()}
        onNewTaskClick={vi.fn()}
        onRemoveTaskClick={vi.fn()}
        onReviewCodeClick={vi.fn()}
        onNewQuestionClick={vi.fn()}
        onGenerateDsuClick={vi.fn()}
        isGeneratingDsu
      />,
    );
    expect(screen.getByRole('button', { name: /Generating/ })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run tests to verify the new ones fail and the rest still pass**

Run: `npm run test:renderer -- repo-sidebar`
Expected: existing tests pass (with the two new props added), the 2 new tests fail — no `onGenerateDsuClick`/`isGeneratingDsu` handling yet, no "Generate DSU" button rendered

- [ ] **Step 4: Implement**

In `src/renderer/components/repo-sidebar/repo-sidebar.tsx`, add the `Spinner` import:

```tsx
import { useState } from 'react';
import type { RepoRecord, TaskRecord } from '../../../shared/types';
import { TaskSearchInput } from '../task-search-input/task-search-input';
import { Spinner } from '../spinner/spinner';
```

Extend `RepoSidebarProps`:

```tsx
export interface RepoSidebarProps {
  repos: RepoRecord[];
  activeTasksByRepoId: Record<string, TaskRecord[]>;
  archivedTasksByRepoId: Record<string, TaskRecord[]>;
  scratchTasks: TaskRecord[];
  selectedTaskId: string | undefined;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSelectTask: (taskId: string) => void;
  onOpenRepoClick: () => void;
  onCloneRepoClick: () => void;
  onNewTaskClick: (repoId: string) => void;
  onRemoveTaskClick: (taskId: string) => void;
  onReviewCodeClick: (repoId: string) => void;
  onNewQuestionClick: () => void;
  onGenerateDsuClick: () => void;
  isGeneratingDsu: boolean;
}
```

Destructure the two new props in the component signature:

```tsx
export function RepoSidebar({
  repos,
  activeTasksByRepoId,
  archivedTasksByRepoId,
  scratchTasks,
  selectedTaskId,
  searchQuery,
  onSearchQueryChange,
  onSelectTask,
  onOpenRepoClick,
  onCloneRepoClick,
  onNewTaskClick,
  onRemoveTaskClick,
  onReviewCodeClick,
  onNewQuestionClick,
  onGenerateDsuClick,
  isGeneratingDsu,
}: RepoSidebarProps): JSX.Element {
```

Replace the top button row (currently just "Open Existing Repo" and "Clone Repo") with a version that adds the "Generate DSU" button:

```tsx
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
        <button
          type="button"
          onClick={onGenerateDsuClick}
          disabled={isGeneratingDsu}
          className="flex flex-1 items-center justify-center gap-2 rounded-md border border-graphite-600 px-3 py-2 text-sm font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400 disabled:opacity-50"
        >
          {isGeneratingDsu && <Spinner />}
          {isGeneratingDsu ? 'Generating…' : 'Generate DSU'}
        </button>
      </div>
```

Everything else in the file (task rows, archived section, Quick Questions section) stays exactly as-is.

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm run test:renderer -- repo-sidebar`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 6: Update the Storybook story args**

In `src/renderer/components/repo-sidebar/repo-sidebar.stories.tsx`, add `onGenerateDsuClick: fn()` and `isGeneratingDsu: false` to the shared `args` in `meta`:

```tsx
const meta: Meta<typeof RepoSidebar> = {
  component: RepoSidebar,
  title: 'Components/RepoSidebar',
  args: {
    onSearchQueryChange: fn(),
    onSelectTask: fn(),
    onOpenRepoClick: fn(),
    onCloneRepoClick: fn(),
    onNewTaskClick: fn(),
    onRemoveTaskClick: fn(),
    onReviewCodeClick: fn(),
    onNewQuestionClick: fn(),
    onGenerateDsuClick: fn(),
    isGeneratingDsu: false,
    scratchTasks: [],
  },
};
```

(This requires adding `import { fn } from 'storybook/test';` if not already present — it already is, per the existing file.)

- [ ] **Step 7: Wire it up in `App`**

In `src/renderer/app.tsx`, add the import:

```tsx
import { DsuSummaryModal } from './components/dsu-summary-modal/dsu-summary-modal';
```

Add new state, alongside the other `useState` declarations:

```tsx
  const [isDsuModalOpen, setIsDsuModalOpen] = useState(false);
  const [dsuSummary, setDsuSummary] = useState<{ markdown: string; filePath: string } | undefined>();
  const [isGeneratingDsu, setIsGeneratingDsu] = useState(false);
```

Add a new handler, alongside the other `handle*` async functions:

```tsx
  async function handleGenerateDsu(): Promise<void> {
    setErrorMessage(undefined);
    setIsGeneratingDsu(true);
    try {
      const result = await window.claudeOrchestrator.generateDsuSummary();
      setDsuSummary(result);
      setIsDsuModalOpen(true);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    } finally {
      setIsGeneratingDsu(false);
    }
  }
```

Pass the two new props to `<RepoSidebar>`:

```tsx
        <RepoSidebar
          repos={repos}
          activeTasksByRepoId={filteredActiveTasksByRepoId}
          archivedTasksByRepoId={archivedTasksByRepoId}
          scratchTasks={scratchTasks}
          selectedTaskId={activeTaskId}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSelectTask={(taskId) => void handleSelectTask(taskId)}
          onOpenRepoClick={() => void handleOpenRepoClick()}
          onCloneRepoClick={() => setIsCloneModalOpen(true)}
          onNewTaskClick={(repoId) => void handleNewTaskClick(repoId)}
          onRemoveTaskClick={(taskId) => void handleRemoveTask(taskId)}
          onReviewCodeClick={(repoId) => void handleReviewCodeClick(repoId)}
          onNewQuestionClick={() => setIsNewQuestionModalOpen(true)}
          onGenerateDsuClick={() => void handleGenerateDsu()}
          isGeneratingDsu={isGeneratingDsu}
        />
```

Render the modal alongside the other modals (after `<NewQuestionModal ... />`):

```tsx
        <NewQuestionModal
          isOpen={isNewQuestionModalOpen}
          isSubmitting={isSubmittingModal}
          onClose={() => setIsNewQuestionModalOpen(false)}
          onSubmit={(fields) => void handleCreateQuestion(fields)}
        />
        <DsuSummaryModal
          isOpen={isDsuModalOpen}
          summary={dsuSummary?.markdown ?? ''}
          filePath={dsuSummary?.filePath}
          onClose={() => setIsDsuModalOpen(false)}
        />
```

Everything else in the file (tab bar, terminal pane, notes panel) stays exactly as-is.

- [ ] **Step 8: Write the failing `App` integration tests**

Add to `src/renderer/app.test.tsx`'s `vi.stubGlobal('claudeOrchestrator', {...})` mock object (in the `beforeEach`), a `generateDsuSummary` mock alongside the others:

```tsx
const generateDsuSummary = vi.fn(async () => ({
  markdown: '## Fix login bug\n\n- Fixed a null check.',
  filePath: 'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\dsu\\2026-07-09.md',
}));
```

(declared alongside the other top-level `const ... = vi.fn(...)` declarations), and add it to the `vi.stubGlobal` object:

```tsx
  vi.stubGlobal('claudeOrchestrator', {
    listRepos,
    listTasks,
    createTask,
    openTask,
    closeTask,
    removeTask,
    selectFolder,
    addRepo,
    cloneRepo,
    listBranches,
    fetchRepo,
    taskSearch,
    getTaskNotes,
    setTaskNotes,
    generateDsuSummary,
    sendPtyInput: vi.fn(),
    resizePty: vi.fn(),
    onPtyOutput: vi.fn(() => vi.fn()),
    onTaskFinishedStateChanged: vi.fn(() => vi.fn()),
  });
```

Add two new tests inside `describe('App', ...)`:

```tsx
  it('"Generate DSU" fetches the summary and shows it in a modal', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Generate DSU' }));
    expect(generateDsuSummary).toHaveBeenCalledOnce();
    expect(await screen.findByRole('dialog', { name: 'DSU Summary' })).toBeInTheDocument();
    expect(screen.getByText(/Fixed a null check/)).toBeInTheDocument();
  });

  it('shows a visible error when generating the DSU summary fails, instead of failing silently', async () => {
    generateDsuSummary.mockRejectedValueOnce(new Error('claude -p failed to generate the DSU summary'));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Generate DSU' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('claude -p failed to generate the DSU summary');
  });
```

- [ ] **Step 9: Run tests to verify they fail**

Run: `npm run test:renderer -- app`
Expected: FAIL — no "Generate DSU" button rendered yet

- [ ] **Step 10: Run tests to verify all pass (after Step 7's implementation)**

Run: `npm run test:renderer -- app`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 11: Commit**

```bash
git add src/renderer/components/repo-sidebar src/renderer/app.tsx src/renderer/app.test.tsx
git commit -m "feat: add Generate DSU button and result modal to the sidebar"
```

---
*Added: 2026-07-09*
*Standards: https://github.com/paurodriguez0220/standards-docs*
