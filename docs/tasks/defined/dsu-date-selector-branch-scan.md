# Task: DSU date selector, branch-scan source, and on-close auto-regenerate

**Status:** Defined

## Goal

One sentence: let the DSU be generated for any chosen day (max = today), sourced from **branches committed to across all managed repos** instead of the app's task list, and keep today's DSU file fresh automatically whenever a tab or worktree is closed.

## Context

The current DSU always summarizes "since the last working day" and iterates the app's task records, labeling sections with ADO task titles. Paulo's actual goal is *"which branches did I work on on day X"* — branch names, not ADO titles, and any day, not just yesterday. Scanning branches from each repo's main clone also fixes a blind spot: a task removed after merging disappears from the store, but its branch and commits remain visible from the main repo.

Approved design decisions:
- **Single-day semantics** — the selected date covers that calendar day, local midnight to midnight. Max selectable = today. Default = last working day (yesterday; Friday if today is Monday).
- **Branch scan** — for each repo in the store: enumerate local branches, collect each branch's commits in the day's range, and **dedup by commit hash with the default branch (master/main) processed last**, so a feature merged that day keeps its commits and master shows only its own direct/merge commits.
- **Single modal** — the sidebar button opens `DsuSummaryModal` immediately; the modal owns a native date input + Generate button and renders the result below; regenerating for another day happens in place.
- **On-close auto-regenerate** — closing a tab (`task:close`) or removing a task/worktree (`task:remove`) for a non-scratch task fires a background regenerate of **today's** DSU. Fire-and-forget (never blocks or fails the close), coalesced (one run at a time, at most one queued follow-up).
- Output file: `dsu/<selected-date>.md` (regenerate overwrites).

Out of scope: date ranges, remote branches, browsing past DSU files from the UI, holiday awareness.

---

# DSU Date Selector + Branch Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate the DSU for a user-picked day from branch commit history scanned across all managed repos, and auto-refresh today's DSU markdown on tab/worktree close.

**Architecture:** A new pure `src/shared/dates.ts` module owns date-stamp logic used by both processes. `git-service.ts` gains `getBranchCommitsInRange` (hash + subject per branch, `--since`/`--until`). A new `src/main/services/dsu-orchestrator.ts` owns the scan → dedup → synthesize → save pipeline (`generateAndSaveDsu`) plus the coalescing background trigger (`queueDsuAutoRegenerate`); `dsu-handlers.ts` becomes a thin validate-and-delegate IPC layer taking a `date` argument. The renderer's `DsuSummaryModal` becomes the whole generate flow (date input, Generate button, result); the sidebar button just opens it (and becomes an icon button, matching its neighbors).

**Tech Stack:** TypeScript strict, Node `child_process`/`fs/promises`, Electron IPC, React 18, Tailwind v4 tokens, lucide-react, Vitest + React Testing Library.

## Global Constraints

- TypeScript `strict: true`. No `any` (including explicit-`any` casts). Named exports only, kebab-case filenames, `JSX.Element` return types on components.
- Never string-interpolate anything into a shell command. Every `execFile` argument is a discrete array element.
- Tests never shell out to `git` or `claude` — mock `node:child_process` following `git-service.test.ts`'s existing pattern.
- Do not touch `pty-manager.ts` or route anything through `spawnClaudeSession`.
- Styling uses Tailwind tokens (`graphite-*`, `clay-*`) — no arbitrary hex colors.
- Icon buttons carry `aria-label` + `title`; icons themselves are `aria-hidden`.
- Run the affected suite after every task; commit only green.

---

### Task 1: `src/shared/dates.ts` — pure date-stamp helpers

**Files:**
- Create: `src/shared/dates.ts`
- Create: `src/shared/dates.test.ts`

**Interfaces:**
- Produces: `toDateStamp(date: Date): string` — local `YYYY-MM-DD`.
- Produces: `getLastWorkingDayStamp(now: Date): string` — previous day's stamp; previous Friday's if `now` is a Monday.
- Produces: `isValidDateStamp(stamp: string): boolean` — shape `\d{4}-\d{2}-\d{2}` AND a real calendar date (rejects `2026-02-30`).
- Produces: `dateStampToRange(stamp: string): { from: Date; to: Date }` — `[local midnight of the day, local midnight of the next day)`.

- [ ] **Step 1: Write the failing tests**

Create `src/shared/dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toDateStamp, getLastWorkingDayStamp, isValidDateStamp, dateStampToRange } from './dates';

describe('dates', () => {
  describe('toDateStamp', () => {
    it('formats a local date as YYYY-MM-DD with zero padding', () => {
      expect(toDateStamp(new Date(2026, 0, 5, 23, 59, 0))).toBe('2026-01-05');
    });
  });

  describe('getLastWorkingDayStamp', () => {
    it('returns last Friday when now is a Monday', () => {
      // 2026-07-13 is a Monday.
      expect(getLastWorkingDayStamp(new Date(2026, 6, 13, 9, 0, 0))).toBe('2026-07-10');
    });

    it('returns yesterday for any non-Monday day', () => {
      // 2026-07-09 is a Thursday.
      expect(getLastWorkingDayStamp(new Date(2026, 6, 9, 9, 0, 0))).toBe('2026-07-08');
    });
  });

  describe('isValidDateStamp', () => {
    it('accepts a real YYYY-MM-DD date', () => {
      expect(isValidDateStamp('2026-07-09')).toBe(true);
    });

    it('rejects a malformed string', () => {
      expect(isValidDateStamp('not-a-date')).toBe(false);
    });

    it('rejects an impossible calendar date', () => {
      expect(isValidDateStamp('2026-02-30')).toBe(false);
    });
  });

  describe('dateStampToRange', () => {
    it('returns local midnight of the day and local midnight of the next day', () => {
      const { from, to } = dateStampToRange('2026-07-09');
      expect(from).toEqual(new Date(2026, 6, 9, 0, 0, 0, 0));
      expect(to).toEqual(new Date(2026, 6, 10, 0, 0, 0, 0));
    });

    it('rolls over month boundaries correctly', () => {
      const { to } = dateStampToRange('2026-07-31');
      expect(to).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- dates`
Expected: FAIL — cannot find module `./dates`

- [ ] **Step 3: Implement**

Create `src/shared/dates.ts`:

```ts
export function toDateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLastWorkingDayStamp(now: Date): string {
  const isMonday = now.getDay() === 1;
  const daysBack = isMonday ? 3 : 1;
  return toDateStamp(new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack));
}

const DATE_STAMP_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateStamp(stamp: string): boolean {
  if (!DATE_STAMP_PATTERN.test(stamp)) {
    return false;
  }
  // new Date() silently rolls impossible dates over (Feb 30 -> Mar 2), so a
  // round-trip back to a stamp only matches when the date really exists.
  return toDateStamp(dateStampToRange(stamp).from) === stamp;
}

export function dateStampToRange(stamp: string): { from: Date; to: Date } {
  const [year = 0, month = 0, day = 0] = stamp.split('-').map(Number);
  const from = new Date(year, month - 1, day, 0, 0, 0, 0);
  const to = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { from, to };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- dates`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/dates.ts src/shared/dates.test.ts
git commit -m "feat: add shared date-stamp helpers for DSU day selection"
```

---

### Task 2: `git-service.ts` — per-branch commits in a date range

**Files:**
- Modify: `src/main/services/git-service.ts`
- Modify: `src/main/services/git-service.test.ts`

**Interfaces:**
- Produces: `BranchCommit { hash: string; subject: string }`
- Produces: `getBranchCommitsInRange(repoPath: string, branch: string, from: Date, to: Date): Promise<BranchCommit[]>` — `git log <branch> --since=<from ISO> --until=<to ISO> --pretty=%H%x09%s` run in `repoPath` via the existing `runGitCapture`.
- Note: `getCommitSubjectsSince` and `getLastWorkingDayCutoff` stay for now — they're deleted in Task 3 when their last caller is rewritten.

- [ ] **Step 1: Write the failing tests**

In `src/main/services/git-service.test.ts`, extend the import from `./git-service` with `getBranchCommitsInRange`, then add inside `describe('git-service', ...)`:

```ts
  describe('getBranchCommitsInRange', () => {
    it('runs git log <branch> --since --until in the repo and parses hash/subject pairs', async () => {
      execFileMock.mockImplementation(() => ({
        stdout: 'abc123\tfix: handle empty input\ndef456\tfeat: add DSU button\n\n',
        stderr: '',
      }));
      const from = new Date(2026, 6, 9, 0, 0, 0, 0);
      const to = new Date(2026, 6, 10, 0, 0, 0, 0);
      const result = await getBranchCommitsInRange('C:\\repo', 'feature-x', from, to);
      expect(execFileMock).toHaveBeenCalledWith(
        'git',
        [
          '-c',
          'core.longpaths=true',
          'log',
          'feature-x',
          `--since=${from.toISOString()}`,
          `--until=${to.toISOString()}`,
          '--pretty=%H%x09%s',
        ],
        { cwd: 'C:\\repo' },
      );
      expect(result).toEqual([
        { hash: 'abc123', subject: 'fix: handle empty input' },
        { hash: 'def456', subject: 'feat: add DSU button' },
      ]);
    });

    it('returns an empty array when there are no commits in range', async () => {
      execFileMock.mockImplementation(() => ({ stdout: '', stderr: '' }));
      const result = await getBranchCommitsInRange('C:\\repo', 'master', new Date(2026, 6, 9), new Date(2026, 6, 10));
      expect(result).toEqual([]);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- git-service`
Expected: FAIL — `getBranchCommitsInRange` is not exported

- [ ] **Step 3: Implement**

Add to `src/main/services/git-service.ts`, after `getCommitSubjectsSince`:

```ts
export interface BranchCommit {
  hash: string;
  subject: string;
}

export async function getBranchCommitsInRange(
  repoPath: string,
  branch: string,
  from: Date,
  to: Date,
): Promise<BranchCommit[]> {
  const output = await runGitCapture(
    ['log', branch, `--since=${from.toISOString()}`, `--until=${to.toISOString()}`, '--pretty=%H%x09%s'],
    repoPath,
  );
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const tabIndex = line.indexOf('\t');
      return { hash: line.slice(0, tabIndex), subject: line.slice(tabIndex + 1) };
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- git-service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/git-service.ts src/main/services/git-service.test.ts
git commit -m "feat: add per-branch commit lookup in a date range to git-service"
```

---

### Task 3: DSU pipeline rewrite — branch summaries, orchestrator, date-taking handler

The service signature, the orchestration, and the handler are type-coupled, so this is one task with one commit; the suite is red in between steps but green at the commit.

**Files:**
- Rewrite: `src/main/services/dsu-service.ts` + `src/main/services/dsu-service.test.ts`
- Create: `src/main/services/dsu-orchestrator.ts` + `src/main/services/dsu-orchestrator.test.ts`
- Rewrite: `src/main/ipc/dsu-handlers.ts` + `src/main/ipc/dsu-handlers.test.ts`
- Modify: `src/main/services/git-service.ts` + test — delete `getCommitSubjectsSince`, `getLastWorkingDayCutoff`, and their tests (last callers gone after this task).

**Interfaces:**
- Consumes: `getBranchCommitsInRange`/`BranchCommit`/`listBranches` (git-service), `dateStampToRange`/`isValidDateStamp`/`toDateStamp` (shared/dates), `readStore`, `getStorePath`/`getDsuSummaryPath` (paths).
- Produces: `BranchCommitSummary { repoName: string; branch: string; commitSubjects: string[] }` (dsu-service).
- Produces: `buildDsuPrompt(branchSummaries: BranchCommitSummary[], dateStamp: string): string`; `generateDsuSummary(branchSummaries: BranchCommitSummary[], dateStamp: string): Promise<string>` — empty input returns `` `No commits on ${dateStamp}.` `` without shelling out.
- Produces: `orderBranchesDefaultLast(branches: string[]): string[]` and `generateAndSaveDsu(dateStamp: string): Promise<DsuGenerateResponse>` (dsu-orchestrator).
- Produces: the `dsu:generate` IPC handler now has signature `(event, date: string)` and throws on invalid/future dates.

- [ ] **Step 1: Rewrite `src/main/services/dsu-service.ts`**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class DsuCommandError extends Error {
  public readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(message);
    this.name = 'DsuCommandError';
    this.stderr = stderr;
  }
}

export interface BranchCommitSummary {
  repoName: string;
  branch: string;
  commitSubjects: string[];
}

export function buildDsuPrompt(branchSummaries: BranchCommitSummary[], dateStamp: string): string {
  const sections = branchSummaries
    .map(
      (summary) =>
        `## ${summary.repoName} / ${summary.branch}\n${summary.commitSubjects.map((subject) => `- ${subject}`).join('\n')}`,
    )
    .join('\n\n');
  return [
    'You are helping prepare a daily stand-up update.',
    `Below is a list of git branches worked on during ${dateStamp} and the commit subjects made on each.`,
    'Write a concise, stand-up-style summary describing what was done, organized branch by branch.',
    'Do not invent information beyond what the commit subjects imply.',
    '',
    sections,
  ].join('\n');
}

export async function generateDsuSummary(
  branchSummaries: BranchCommitSummary[],
  dateStamp: string,
): Promise<string> {
  if (branchSummaries.length === 0) {
    return `No commits on ${dateStamp}.`;
  }
  const prompt = buildDsuPrompt(branchSummaries, dateStamp);
  try {
    const { stdout } = await execFileAsync('cmd.exe', ['/c', 'claude', '-p', prompt], undefined);
    return stdout.toString().trim();
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    throw new DsuCommandError('claude -p failed to generate the DSU summary', stderr);
  }
}
```

- [ ] **Step 2: Rewrite `src/main/services/dsu-service.test.ts`**

Keep the existing `vi.mock('node:child_process', ...)` block (callback-adapting `execFileMock` + `mockError`) exactly as it is today; replace imports and the `describe` bodies:

```ts
import { buildDsuPrompt, generateDsuSummary, DsuCommandError } from './dsu-service';
import type { BranchCommitSummary } from './dsu-service';

describe('dsu-service', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    mockError = null;
  });

  describe('buildDsuPrompt', () => {
    it('lists each repo/branch pair as a heading with its commit subjects as bullets, and names the date', () => {
      const branchSummaries: BranchCommitSummary[] = [
        { repoName: 'demo', branch: 'task/fix-login-bug', commitSubjects: ['fix: handle empty input'] },
      ];
      const prompt = buildDsuPrompt(branchSummaries, '2026-07-08');
      expect(prompt).toContain('## demo / task/fix-login-bug');
      expect(prompt).toContain('- fix: handle empty input');
      expect(prompt).toContain('2026-07-08');
    });
  });

  describe('generateDsuSummary', () => {
    it('returns a dated no-commits message without shelling out when there are no branch summaries', async () => {
      const result = await generateDsuSummary([], '2026-07-08');
      expect(result).toBe('No commits on 2026-07-08.');
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('invokes claude -p non-interactively with the prompt as a discrete argument', async () => {
      execFileMock.mockReturnValue({ stdout: '- Fixed the login bug\n', stderr: '' });
      const branchSummaries: BranchCommitSummary[] = [
        { repoName: 'demo', branch: 'task/fix-login-bug', commitSubjects: ['fix: handle empty input'] },
      ];
      const result = await generateDsuSummary(branchSummaries, '2026-07-08');
      expect(execFileMock).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'claude', '-p', buildDsuPrompt(branchSummaries, '2026-07-08')],
        undefined,
      );
      expect(result).toBe('- Fixed the login bug');
    });

    it('wraps a failing claude invocation in DsuCommandError with the real stderr', async () => {
      mockError = Object.assign(new Error('exit 1'), { stderr: 'claude: not logged in' });
      const thrownError = await generateDsuSummary(
        [{ repoName: 'demo', branch: 'task/x', commitSubjects: ['fix: y'] }],
        '2026-07-08',
      ).catch((err) => err);
      expect(thrownError).toBeInstanceOf(DsuCommandError);
      expect(thrownError.stderr).toBe('claude: not logged in');
    });
  });
});
```

Run: `npm run test:main -- dsu-service` → Expected: PASS (4 tests)

- [ ] **Step 3: Create `src/main/services/dsu-orchestrator.ts`**

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DsuGenerateResponse } from '../../shared/ipc-channels';
import { dateStampToRange } from '../../shared/dates';
import { readStore } from './store';
import { listBranches, getBranchCommitsInRange } from './git-service';
import type { BranchCommit } from './git-service';
import { generateDsuSummary } from './dsu-service';
import type { BranchCommitSummary } from './dsu-service';
import { getStorePath, getDsuSummaryPath } from '../paths';

const DEFAULT_BRANCH_NAMES = new Set(['master', 'main']);

// The default branch goes last so commits merged into it the same day stay
// attributed to the feature branch they were made on — each commit hash
// belongs to the first branch that lists it.
export function orderBranchesDefaultLast(branches: string[]): string[] {
  const regular = branches.filter((branch) => !DEFAULT_BRANCH_NAMES.has(branch));
  const defaults = branches.filter((branch) => DEFAULT_BRANCH_NAMES.has(branch));
  return [...regular, ...defaults];
}

export async function generateAndSaveDsu(dateStamp: string): Promise<DsuGenerateResponse> {
  const store = await readStore(getStorePath());
  const { from, to } = dateStampToRange(dateStamp);

  const branchSummaries: BranchCommitSummary[] = [];
  for (const repo of store.repos) {
    let local: string[];
    try {
      ({ local } = await listBranches(repo.path));
    } catch {
      continue;
    }
    const seenHashes = new Set<string>();
    for (const branch of orderBranchesDefaultLast(local)) {
      let commits: BranchCommit[];
      try {
        commits = await getBranchCommitsInRange(repo.path, branch, from, to);
      } catch {
        continue;
      }
      const fresh = commits.filter((commit) => !seenHashes.has(commit.hash));
      for (const commit of fresh) {
        seenHashes.add(commit.hash);
      }
      if (fresh.length > 0) {
        branchSummaries.push({
          repoName: repo.name,
          branch,
          commitSubjects: fresh.map((commit) => commit.subject),
        });
      }
    }
  }

  const markdown = await generateDsuSummary(branchSummaries, dateStamp);
  const filePath = getDsuSummaryPath(dateStamp);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, markdown, 'utf-8');
  return { markdown, filePath };
}
```

- [ ] **Step 4: Create `src/main/services/dsu-orchestrator.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoreData } from '../../shared/types';
import type { BranchCommit } from './git-service';

const mkdirMock = vi.fn();
const writeFileMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

let store: StoreData = { repos: [], tasks: [] };

vi.mock('./store', () => ({
  readStore: vi.fn(async () => store),
}));

vi.mock('./git-service', () => ({
  listBranches: vi.fn(),
  getBranchCommitsInRange: vi.fn(),
}));

vi.mock('./dsu-service', () => ({
  generateDsuSummary: vi.fn(async () => '## Summary\nDid stuff.'),
}));

vi.mock('../paths', () => ({
  getStorePath: () => 'C:\\fake\\store.json',
  getDsuSummaryPath: (date: string) => `C:\\fake\\dsu\\${date}.md`,
}));

import { orderBranchesDefaultLast, generateAndSaveDsu } from './dsu-orchestrator';
import { listBranches, getBranchCommitsInRange } from './git-service';
import { generateDsuSummary } from './dsu-service';

const from = new Date(2026, 6, 8, 0, 0, 0, 0);
const to = new Date(2026, 6, 9, 0, 0, 0, 0);

describe('dsu-orchestrator', () => {
  beforeEach(() => {
    mkdirMock.mockReset();
    writeFileMock.mockReset();
    vi.mocked(listBranches).mockReset();
    vi.mocked(getBranchCommitsInRange).mockReset();
    vi.mocked(generateDsuSummary).mockClear();
    store = {
      repos: [{ id: 'repo-1', name: 'demo', path: 'C:\\demo', createdAt: '2026-07-01T00:00:00.000Z' }],
      tasks: [],
    };
  });

  describe('orderBranchesDefaultLast', () => {
    it('moves master and main to the end, preserving the order of the rest', () => {
      expect(orderBranchesDefaultLast(['master', 'task/a', 'main', 'task/b'])).toEqual([
        'task/a',
        'task/b',
        'master',
        'main',
      ]);
    });
  });

  describe('generateAndSaveDsu', () => {
    it('collects per-branch commits for the day range, skipping branches with no commits', async () => {
      vi.mocked(listBranches).mockResolvedValue({ local: ['task/fix-login-bug', 'master'], remote: [] });
      vi.mocked(getBranchCommitsInRange).mockImplementation(
        async (_repoPath: string, branch: string): Promise<BranchCommit[]> =>
          branch === 'task/fix-login-bug' ? [{ hash: 'abc', subject: 'fix: handle empty input' }] : [],
      );

      const result = await generateAndSaveDsu('2026-07-08');

      expect(getBranchCommitsInRange).toHaveBeenCalledWith('C:\\demo', 'task/fix-login-bug', from, to);
      expect(getBranchCommitsInRange).toHaveBeenCalledWith('C:\\demo', 'master', from, to);
      expect(generateDsuSummary).toHaveBeenCalledWith(
        [{ repoName: 'demo', branch: 'task/fix-login-bug', commitSubjects: ['fix: handle empty input'] }],
        '2026-07-08',
      );
      expect(mkdirMock).toHaveBeenCalledWith('C:\\fake\\dsu', { recursive: true });
      expect(writeFileMock).toHaveBeenCalledWith('C:\\fake\\dsu\\2026-07-08.md', '## Summary\nDid stuff.', 'utf-8');
      expect(result).toEqual({ markdown: '## Summary\nDid stuff.', filePath: 'C:\\fake\\dsu\\2026-07-08.md' });
    });

    it('attributes a commit reachable from both a feature branch and master to the feature branch only', async () => {
      vi.mocked(listBranches).mockResolvedValue({ local: ['master', 'task/feature'], remote: [] });
      vi.mocked(getBranchCommitsInRange).mockImplementation(
        async (_repoPath: string, branch: string): Promise<BranchCommit[]> =>
          branch === 'task/feature'
            ? [{ hash: 'abc', subject: 'feat: the work' }]
            : [
                { hash: 'abc', subject: 'feat: the work' },
                { hash: 'merge1', subject: 'Merge task/feature' },
              ],
      );

      await generateAndSaveDsu('2026-07-08');

      expect(generateDsuSummary).toHaveBeenCalledWith(
        [
          { repoName: 'demo', branch: 'task/feature', commitSubjects: ['feat: the work'] },
          { repoName: 'demo', branch: 'master', commitSubjects: ['Merge task/feature'] },
        ],
        '2026-07-08',
      );
    });

    it('skips a repo whose branch listing fails instead of failing the whole run', async () => {
      vi.mocked(listBranches).mockRejectedValueOnce(new Error('not a git repository'));

      const result = await generateAndSaveDsu('2026-07-08');

      expect(generateDsuSummary).toHaveBeenCalledWith([], '2026-07-08');
      expect(result.markdown).toBe('## Summary\nDid stuff.');
    });

    it('skips a branch whose git log fails instead of failing the whole run', async () => {
      vi.mocked(listBranches).mockResolvedValue({ local: ['task/broken', 'task/ok'], remote: [] });
      vi.mocked(getBranchCommitsInRange).mockImplementation(
        async (_repoPath: string, branch: string): Promise<BranchCommit[]> => {
          if (branch === 'task/broken') {
            throw new Error('bad object');
          }
          return [{ hash: 'ok1', subject: 'feat: ok work' }];
        },
      );

      await generateAndSaveDsu('2026-07-08');

      expect(generateDsuSummary).toHaveBeenCalledWith(
        [{ repoName: 'demo', branch: 'task/ok', commitSubjects: ['feat: ok work'] }],
        '2026-07-08',
      );
    });
  });
});
```

Run: `npm run test:main -- dsu-orchestrator` → Expected: PASS (5 tests)

- [ ] **Step 5: Rewrite `src/main/ipc/dsu-handlers.ts`**

```ts
import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import type { DsuGenerateResponse } from '../../shared/ipc-channels';
import { isValidDateStamp, toDateStamp } from '../../shared/dates';
import { generateAndSaveDsu } from '../services/dsu-orchestrator';

export function registerDsuHandlers(): void {
  ipcMain.handle(
    IpcChannels.GenerateDsuSummary,
    async (_event, date: string): Promise<DsuGenerateResponse> => {
      if (!isValidDateStamp(date)) {
        throw new Error(`Invalid DSU date: ${date}`);
      }
      if (date > toDateStamp(new Date())) {
        throw new Error('DSU date cannot be in the future');
      }
      return generateAndSaveDsu(date);
    },
  );
}
```

- [ ] **Step 6: Rewrite `src/main/ipc/dsu-handlers.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
}));

vi.mock('../services/dsu-orchestrator', () => ({
  generateAndSaveDsu: vi.fn(async (date: string) => ({
    markdown: '## Summary\nDid stuff.',
    filePath: `C:\\fake\\dsu\\${date}.md`,
  })),
}));

import { registerDsuHandlers } from './dsu-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { generateAndSaveDsu } from '../services/dsu-orchestrator';

describe('dsu-handlers', () => {
  beforeEach(() => {
    handlers.clear();
    vi.mocked(generateAndSaveDsu).mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 9, 10, 0, 0));
    registerDsuHandlers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delegates a valid, non-future date to generateAndSaveDsu and returns its result', async () => {
    const handler = handlers.get(IpcChannels.GenerateDsuSummary);
    const result = await handler?.({}, '2026-07-08');
    expect(generateAndSaveDsu).toHaveBeenCalledWith('2026-07-08');
    expect(result).toEqual({ markdown: '## Summary\nDid stuff.', filePath: 'C:\\fake\\dsu\\2026-07-08.md' });
  });

  it('accepts today as the maximum selectable date', async () => {
    const handler = handlers.get(IpcChannels.GenerateDsuSummary);
    await handler?.({}, '2026-07-09');
    expect(generateAndSaveDsu).toHaveBeenCalledWith('2026-07-09');
  });

  it('rejects a malformed date without generating', async () => {
    const handler = handlers.get(IpcChannels.GenerateDsuSummary);
    await expect(handler?.({}, 'yesterday')).rejects.toThrow('Invalid DSU date');
    expect(generateAndSaveDsu).not.toHaveBeenCalled();
  });

  it('rejects a future date without generating', async () => {
    const handler = handlers.get(IpcChannels.GenerateDsuSummary);
    await expect(handler?.({}, '2026-07-10')).rejects.toThrow('DSU date cannot be in the future');
    expect(generateAndSaveDsu).not.toHaveBeenCalled();
  });
});
```

Run: `npm run test:main -- dsu-handlers` → Expected: PASS (4 tests)

- [ ] **Step 7: Delete the two obsolete functions from `git-service.ts`**

Remove `getLastWorkingDayCutoff` and `getCommitSubjectsSince` from `src/main/services/git-service.ts`, and remove the `describe('getLastWorkingDayCutoff', ...)` and `describe('getCommitSubjectsSince', ...)` blocks (and the two names from the import line) in `git-service.test.ts`.

- [ ] **Step 8: Verify the whole main suite and typecheck are green**

Run: `npm run test:main` then `npm run typecheck`
Expected: PASS / no errors. (The preload still invokes `dsu:generate` without a date argument until Task 4 — `ipcRenderer.invoke` is untyped variadic, so this compiles; the renderer flow is feature-complete after Task 4.)

- [ ] **Step 9: Commit**

```bash
git add src/main/services/dsu-service.ts src/main/services/dsu-service.test.ts src/main/services/dsu-orchestrator.ts src/main/services/dsu-orchestrator.test.ts src/main/ipc/dsu-handlers.ts src/main/ipc/dsu-handlers.test.ts src/main/services/git-service.ts src/main/services/git-service.test.ts
git commit -m "feat: rewrite DSU pipeline around per-branch commit scans for a chosen day"
```

---

### Task 4: Renderer — date-picker modal, preload date argument, sidebar icon button

Two commits: (A) modal + preload + App wiring; (B) sidebar cleanup. Each compiles and tests green on its own.

**Files:**
- Rewrite: `src/renderer/components/dsu-summary-modal/dsu-summary-modal.tsx` + `.test.tsx` + `.stories.tsx`
- Modify: `src/preload/index.ts` + `src/preload/index.test.ts`
- Modify: `src/renderer/app.tsx` + `src/renderer/app.test.tsx`
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.tsx` + `.test.tsx` + `.stories.tsx`

**Interfaces:**
- Produces: `ClaudeOrchestratorApi.generateDsuSummary(date: string): Promise<DsuGenerateResponse>`.
- Produces: `DsuSummaryModalProps { isOpen: boolean; summary: string | undefined; filePath: string | undefined; isGenerating: boolean; onGenerate: (date: string) => void; onClose: () => void }`.
- Produces: `RepoSidebarProps` loses `isGeneratingDsu` (keeps `onGenerateDsuClick: () => void`, which now just opens the modal).

- [ ] **Step 1 (commit A): Update the preload**

In `src/preload/index.ts`, change the interface method to `generateDsuSummary(date: string): Promise<DsuGenerateResponse>;` and the implementation to:

```ts
  generateDsuSummary: (date) => ipcRenderer.invoke(IpcChannels.GenerateDsuSummary, date),
```

In `src/preload/index.test.ts`, in the existing `it('generateDsuSummary invokes the GenerateDsuSummary channel', ...)` test, change the call to `await (api.generateDsuSummary as (date: string) => Promise<unknown>)('2026-07-08');` and the assertion to `expect(ipcRendererInvoke).toHaveBeenCalledWith('dsu:generate', '2026-07-08');`.

- [ ] **Step 2 (commit A): Rewrite the modal tests (failing first)**

Replace `src/renderer/components/dsu-summary-modal/dsu-summary-modal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getLastWorkingDayStamp, toDateStamp } from '../../../shared/dates';
import { DsuSummaryModal } from './dsu-summary-modal';

function renderModal(overrides: Partial<Parameters<typeof DsuSummaryModal>[0]> = {}): void {
  render(
    <DsuSummaryModal
      isOpen
      summary={undefined}
      filePath={undefined}
      isGenerating={false}
      onGenerate={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

describe('DsuSummaryModal', () => {
  it('does not render when isOpen is false', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('defaults the date input to the last working day and caps it at today', () => {
    renderModal();
    const input = screen.getByLabelText('Day to summarize');
    expect(input).toHaveValue(getLastWorkingDayStamp(new Date()));
    expect(input).toHaveAttribute('max', toDateStamp(new Date()));
  });

  it('calls onGenerate with the picked date when Generate is clicked', async () => {
    const onGenerate = vi.fn();
    renderModal({ onGenerate });
    fireEvent.change(screen.getByLabelText('Day to summarize'), { target: { value: '2026-07-06' } });
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(onGenerate).toHaveBeenCalledWith('2026-07-06');
  });

  it('disables the Generate button and shows a spinner while isGenerating', () => {
    renderModal({ isGenerating: true });
    expect(screen.getByRole('button', { name: /Generating/ })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('renders the summary text and saved file path once provided', () => {
    renderModal({
      summary: '## demo / task-x\n- Fixed the bug',
      filePath: 'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\dsu\\2026-07-08.md',
    });
    expect(screen.getByText(/Fixed the bug/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-08\.md/)).toBeInTheDocument();
  });

  it('calls onClose when Close is clicked', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

Run: `npm run test:renderer -- dsu-summary-modal` → Expected: FAIL (new props don't exist yet)

- [ ] **Step 3 (commit A): Rewrite the modal component**

Replace `src/renderer/components/dsu-summary-modal/dsu-summary-modal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ModalOverlay } from '../modal-overlay/modal-overlay';
import { Spinner } from '../spinner/spinner';
import { getLastWorkingDayStamp, toDateStamp } from '../../../shared/dates';

export interface DsuSummaryModalProps {
  isOpen: boolean;
  summary: string | undefined;
  filePath: string | undefined;
  isGenerating: boolean;
  onGenerate: (date: string) => void;
  onClose: () => void;
}

export function DsuSummaryModal({
  isOpen,
  summary,
  filePath,
  isGenerating,
  onGenerate,
  onClose,
}: DsuSummaryModalProps): JSX.Element | null {
  const [date, setDate] = useState(() => getLastWorkingDayStamp(new Date()));

  // Re-derive the default whenever the modal opens: the app can stay running
  // across days, so a mount-time default would go stale.
  useEffect(() => {
    if (isOpen) {
      setDate(getLastWorkingDayStamp(new Date()));
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <ModalOverlay>
      <div role="dialog" aria-label="DSU Summary" className="flex max-h-[80vh] flex-col gap-4">
        <h2 className="text-lg font-semibold text-graphite-100">DSU Summary</h2>
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs text-graphite-400">
            Day to summarize
            <input
              type="date"
              value={date}
              max={toDateStamp(new Date())}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-md border border-graphite-700 bg-graphite-900 px-2 py-1.5 text-sm text-graphite-100"
            />
          </label>
          <button
            type="button"
            onClick={() => onGenerate(date)}
            disabled={isGenerating || date === ''}
            className="flex items-center justify-center gap-2 rounded-md bg-clay-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:bg-clay-500 disabled:opacity-50"
          >
            {isGenerating && <Spinner />}
            {isGenerating ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {summary !== undefined && (
          <pre className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-md border border-graphite-700 bg-graphite-900 p-3 text-sm text-graphite-100">
            {summary}
          </pre>
        )}
        {filePath !== undefined && <p className="text-xs text-graphite-400">Saved to {filePath}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-graphite-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400"
          >
            Close
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
```

Run: `npm run test:renderer -- dsu-summary-modal` → Expected: PASS (6 tests)

- [ ] **Step 4 (commit A): Update the modal stories**

Replace `src/renderer/components/dsu-summary-modal/dsu-summary-modal.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { DsuSummaryModal } from './dsu-summary-modal';

const meta: Meta<typeof DsuSummaryModal> = {
  component: DsuSummaryModal,
  title: 'Components/DsuSummaryModal',
  args: { onClose: fn(), onGenerate: fn(), isGenerating: false, summary: undefined, filePath: undefined },
};

export default meta;
type Story = StoryObj<typeof DsuSummaryModal>;

export const PickerOnly: Story = { args: { isOpen: true } };

export const Generating: Story = { args: { isOpen: true, isGenerating: true } };

export const WithSummary: Story = {
  args: {
    isOpen: true,
    summary:
      '## demo / task/fix-login-bug\n\n- Fixed a null check on the login form.\n\n## demo / task/search-bar\n\n- Wired up the task search input.',
    filePath: 'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\dsu\\2026-07-08.md',
  },
};

export const Closed: Story = { args: { isOpen: false } };
```

- [ ] **Step 5 (commit A): Rewire `App`**

In `src/renderer/app.tsx`:

Replace `handleGenerateDsu` with a date-taking version (the sidebar click no longer generates — it opens the modal):

```tsx
  async function handleGenerateDsu(date: string): Promise<void> {
    setErrorMessage(undefined);
    setIsGeneratingDsu(true);
    try {
      const result = await window.claudeOrchestrator.generateDsuSummary(date);
      setDsuSummary(result);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    } finally {
      setIsGeneratingDsu(false);
    }
  }
```

In the `<RepoSidebar>` element, change the DSU prop to `onGenerateDsuClick={() => setIsDsuModalOpen(true)}` (leave `isGeneratingDsu={isGeneratingDsu}` in place until commit B).

Replace the `<DsuSummaryModal ... />` element with:

```tsx
        <DsuSummaryModal
          isOpen={isDsuModalOpen}
          summary={dsuSummary?.markdown}
          filePath={dsuSummary?.filePath}
          isGenerating={isGeneratingDsu}
          onGenerate={(date) => void handleGenerateDsu(date)}
          onClose={() => setIsDsuModalOpen(false)}
        />
```

- [ ] **Step 6 (commit A): Update the `App` tests**

In `src/renderer/app.test.tsx`, the `generateDsuSummary` mock stays but now receives a date. Replace the two existing DSU tests with:

```tsx
  it('"Generate DSU" opens the modal, and Generate fetches the summary for the picked day', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Generate DSU' }));
    const dialog = await screen.findByRole('dialog', { name: 'DSU Summary' });
    expect(dialog).toBeInTheDocument();
    expect(generateDsuSummary).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(generateDsuSummary).toHaveBeenCalledWith(getLastWorkingDayStamp(new Date()));
    expect(await screen.findByText(/Fixed a null check/)).toBeInTheDocument();
  });

  it('shows a visible error when generating the DSU summary fails, instead of failing silently', async () => {
    generateDsuSummary.mockRejectedValueOnce(new Error('claude -p failed to generate the DSU summary'));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Generate DSU' }));
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('claude -p failed to generate the DSU summary');
  });
```

Add the import: `import { getLastWorkingDayStamp } from '../shared/dates';` (adjust to the file's existing relative-import style).

Run: `npm run test:renderer -- app` → Expected: PASS

- [ ] **Step 7: Commit A**

```bash
git add src/preload/index.ts src/preload/index.test.ts src/renderer/components/dsu-summary-modal src/renderer/app.tsx src/renderer/app.test.tsx
git commit -m "feat: pick the DSU day in the summary modal with a date input capped at today"
```

- [ ] **Step 8 (commit B): Sidebar cleanup — icon button, drop isGeneratingDsu**

In `src/renderer/components/repo-sidebar/repo-sidebar.tsx`:
- Remove `isGeneratingDsu: boolean;` from `RepoSidebarProps` and from the destructured parameters.
- Add `CalendarClock` to the `lucide-react` import; remove the `Spinner` import (its only use was this button).
- Replace the Generate DSU button with an icon button matching its two neighbors:

```tsx
        <button
          type="button"
          aria-label="Generate DSU"
          title="Generate DSU"
          onClick={onGenerateDsuClick}
          className="flex flex-1 items-center justify-center rounded-md border border-graphite-600 px-3 py-2 text-graphite-100 hover:border-clay-500 hover:text-clay-400"
        >
          <CalendarClock aria-hidden="true" className="h-4 w-4" />
        </button>
```

In `repo-sidebar.test.tsx`: delete the `isGeneratingDsu={false}` / `isGeneratingDsu` line from every `render(<RepoSidebar ... />)` call; delete the `it('disables the Generate DSU button and shows a spinner while isGeneratingDsu', ...)` test entirely. The `it('calls onGenerateDsuClick when "Generate DSU" is clicked', ...)` test keeps working — the accessible name now comes from `aria-label`.

In `repo-sidebar.stories.tsx`: remove `isGeneratingDsu: false` from the shared `args`.

In `src/renderer/app.tsx`: remove the `isGeneratingDsu={isGeneratingDsu}` line from `<RepoSidebar>` (the state itself stays — the modal uses it).

- [ ] **Step 9: Run the full renderer suite and typecheck**

Run: `npm run test:renderer` then `npm run typecheck`
Expected: PASS / no errors

- [ ] **Step 10: Commit B**

```bash
git add src/renderer/components/repo-sidebar src/renderer/app.tsx
git commit -m "feat: turn the Generate DSU button into an icon that opens the picker modal"
```

---

### Task 5: On-close auto-regenerate of today's DSU

**Files:**
- Modify: `src/main/services/dsu-orchestrator.ts` + `src/main/services/dsu-orchestrator.test.ts`
- Modify: `src/main/ipc/task-handlers.ts` + `src/main/ipc/task-handlers.test.ts`

**Interfaces:**
- Produces: `queueDsuAutoRegenerate(runGeneration?: (dateStamp: string) => Promise<DsuGenerateResponse>): Promise<void>` in `dsu-orchestrator.ts` — defaults to `generateAndSaveDsu`. The parameter exists so tests can inject a fake without shelling anything out; the returned promise (resolves when the possibly-coalesced run drains; never rejects) exists so tests are deterministic. Production callers fire-and-forget with `void`.
- Consumes (task-handlers): `queueDsuAutoRegenerate` fired after `task:close` and `task:remove` for non-scratch tasks.

- [ ] **Step 1: Write the failing orchestrator tests**

Append inside `describe('dsu-orchestrator', ...)` in `src/main/services/dsu-orchestrator.test.ts` (and add `queueDsuAutoRegenerate` to the import from `./dsu-orchestrator`, plus `import { toDateStamp } from '../../shared/dates';`):

```ts
  describe('queueDsuAutoRegenerate', () => {
    it("runs immediately when idle, passing today's date stamp", async () => {
      const runner = vi.fn(async () => ({ markdown: '', filePath: '' }));
      await queueDsuAutoRegenerate(runner);
      expect(runner).toHaveBeenCalledOnce();
      expect(runner).toHaveBeenCalledWith(toDateStamp(new Date()));
    });

    it('coalesces calls made while a run is in flight into a single follow-up run', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const runner = vi.fn(() => gate.then(() => ({ markdown: '', filePath: '' })));
      const firstRun = queueDsuAutoRegenerate(runner);
      void queueDsuAutoRegenerate(runner);
      void queueDsuAutoRegenerate(runner);
      expect(runner).toHaveBeenCalledOnce();
      release();
      // The returned promise resolves only after the coalesced follow-up run
      // drains, so awaiting it makes the assertion deterministic.
      await firstRun;
      expect(runner).toHaveBeenCalledTimes(2);
    });

    it('logs and swallows a failed run instead of rejecting', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const runner = vi.fn(async () => {
        throw new Error('claude exploded');
      });
      await queueDsuAutoRegenerate(runner);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
```

Run: `npm run test:main -- dsu-orchestrator` → Expected: FAIL — `queueDsuAutoRegenerate` is not exported

- [ ] **Step 2: Implement the coalescing trigger**

Add to `src/main/services/dsu-orchestrator.ts` (and add `toDateStamp` to the `../../shared/dates` import):

```ts
let activeRun: Promise<void> | null = null;
let hasQueuedRun = false;

// Closing a tab must never wait on (or fail because of) a DSU run —
// production callers `void` the returned promise. Back-to-back closes
// coalesce: one run at a time, at most one queued follow-up to pick up the
// latest state. The promise resolves once the coalesced chain drains and
// never rejects (failures are logged), which is what makes this testable.
export function queueDsuAutoRegenerate(
  runGeneration: (dateStamp: string) => Promise<DsuGenerateResponse> = generateAndSaveDsu,
): Promise<void> {
  if (activeRun) {
    hasQueuedRun = true;
    return activeRun;
  }
  activeRun = (async () => {
    do {
      hasQueuedRun = false;
      try {
        await runGeneration(toDateStamp(new Date()));
      } catch (err) {
        console.error('DSU auto-regenerate failed', err);
      }
    } while (hasQueuedRun);
    activeRun = null;
  })();
  return activeRun;
}
```

Run: `npm run test:main -- dsu-orchestrator` → Expected: PASS (8 tests)

- [ ] **Step 3: Write the failing task-handlers tests**

In `src/main/ipc/task-handlers.test.ts`, add alongside the other `vi.mock` blocks:

```ts
const queueDsuAutoRegenerate = vi.fn();

vi.mock('../services/dsu-orchestrator', () => ({
  queueDsuAutoRegenerate: (...args: unknown[]) => queueDsuAutoRegenerate(...args),
}));
```

Add `queueDsuAutoRegenerate.mockClear();` to the `beforeEach`, and add these tests at the end of `describe('task-handlers', ...)`:

```ts
  it('TaskClose queues a DSU auto-regenerate for a worktree task', async () => {
    store.tasks = [
      {
        id: 'task-1',
        repoId: 'repo-1',
        title: 'Fix login bug',
        worktreePath: 'C:\\w',
        status: 'todo',
        kind: 'worktree',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    ];
    const handler = handlers.get(IpcChannels.TaskClose);
    await handler?.({}, 'task-1');
    expect(killSession).toHaveBeenCalledWith('task-1');
    expect(queueDsuAutoRegenerate).toHaveBeenCalledOnce();
  });

  it('TaskClose does not queue a DSU auto-regenerate for a scratch task', async () => {
    store.tasks = [
      {
        id: 'task-1',
        title: 'Quick question',
        worktreePath: 'C:\\fake\\scratch\\task-1',
        status: 'todo',
        kind: 'scratch',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    ];
    const handler = handlers.get(IpcChannels.TaskClose);
    await handler?.({}, 'task-1');
    expect(queueDsuAutoRegenerate).not.toHaveBeenCalled();
  });

  it('TaskRemove queues a DSU auto-regenerate for a worktree task', async () => {
    store.tasks = [
      {
        id: 'task-1',
        repoId: 'repo-1',
        title: 'Fix login bug',
        worktreePath: 'C:\\w',
        status: 'todo',
        kind: 'worktree',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    ];
    const handler = handlers.get(IpcChannels.TaskRemove);
    await handler?.({}, 'task-1');
    expect(queueDsuAutoRegenerate).toHaveBeenCalledOnce();
  });

  it('TaskRemove does not queue a DSU auto-regenerate for a scratch task', async () => {
    store.tasks = [
      {
        id: 'task-1',
        title: 'Quick question',
        worktreePath: 'C:\\fake\\scratch\\task-1',
        status: 'todo',
        kind: 'scratch',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    ];
    const handler = handlers.get(IpcChannels.TaskRemove);
    await handler?.({}, 'task-1');
    expect(queueDsuAutoRegenerate).not.toHaveBeenCalled();
  });
```

Run: `npm run test:main -- task-handlers` → Expected: the 4 new tests FAIL

- [ ] **Step 4: Implement the hooks**

In `src/main/ipc/task-handlers.ts`, add the import:

```ts
import { queueDsuAutoRegenerate } from '../services/dsu-orchestrator';
```

Replace the `TaskClose` handler with:

```ts
  ipcMain.handle(IpcChannels.TaskClose, async (_event, taskId: string): Promise<void> => {
    killSession(taskId);
    const store = await readStore(getStorePath());
    const task = store.tasks.find((candidate) => candidate.id === taskId);
    if (task && task.kind !== 'scratch') {
      void queueDsuAutoRegenerate();
    }
  });
```

In the `TaskRemove` handler, add after the `await archiveTaskNotes(getTaskNotesPath(taskId));` line:

```ts
    if (task.kind !== 'scratch') {
      void queueDsuAutoRegenerate();
    }
```

- [ ] **Step 5: Run the full suites and typecheck**

Run: `npm run test:main`, `npm run test:renderer`, `npm run typecheck`
Expected: all PASS / no errors

- [ ] **Step 6: Commit**

```bash
git add src/main/services/dsu-orchestrator.ts src/main/services/dsu-orchestrator.test.ts src/main/ipc/task-handlers.ts src/main/ipc/task-handlers.test.ts
git commit -m "feat: auto-regenerate today's DSU when a tab or worktree closes"
```

---

## Acceptance Criteria

- [ ] Generate DSU opens a modal with a date input defaulting to the last working day and capped at today; Generate produces a per-branch summary for exactly that day.
- [ ] Sections are headed `repo-name / branch-name`, sourced by scanning each repo's local branches from its main clone — removed worktrees/tasks no longer hide work.
- [ ] A commit merged to master the same day appears once, under its feature branch.
- [ ] Output written to `<runtime-data-root>/dsu/<selected-date>.md`.
- [ ] Closing a non-scratch tab or removing a non-scratch task silently refreshes today's DSU file, coalescing rapid closes; scratch tasks never trigger it.
- [ ] Full suite green (`npm test`), typecheck clean.

---
*Added: 2026-07-09*
*Standards: https://github.com/paurodriguez0220/standards-docs*
