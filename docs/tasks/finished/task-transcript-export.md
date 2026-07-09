# Task: Export the agent's conversation transcript to Markdown

**Status:** Done

## Goal

Periodically save a clean, human-readable Markdown export of each task's actual `claude` conversation (what was said, not raw terminal output) to disk — independent of, and never overwriting, the user's own hand-typed task notes.

## Context

Claude Code CLI already persists its own structured session transcript on disk (that's how `claude --continue` already works, with no involvement from this app). Confirmed on this machine: transcripts live at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`, where `<encoded-cwd>` replaces `\`, `:`, `.`, and `/` in the working directory path with `-` (e.g. `C:\Users\paulo.rodriguez\claude-orchestrator\repos\Digital.Knowledge-worktrees\chore-health-check-endpoint-conventions` becomes `C--Users-paulo-rodriguez-claude-orchestrator-repos-Digital-Knowledge-worktrees-chore-health-check-endpoint-conventions`). Since this app always spawns `claude` with `cwd` set to a task's `worktreePath`, that same encoding can be applied to locate the right transcript for any task.

Each JSONL line is one event. The two kinds of interest:
- `{"type":"user","message":{"role":"user","content":"..."},...}` — a user turn. `content` is usually a plain string.
- `{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking",...},{"type":"text","text":"..."},{"type":"tool_use",...}]},...}` — an assistant turn, where `content` is an array of typed blocks.

Everything else in the file (`mode`, `permission-mode`, `attachment`, `hook_success`, `skill_listing`, `deferred_tools_delta`, `agent_listing_delta`, `auto_mode`, `plan_mode_exit`, `last-prompt`, etc.) is session bookkeeping, not conversation content, and is ignored.

**This reads an undocumented, internal Claude Code CLI file format that could change between CLI versions.** The design treats every read as best-effort: a missing directory, missing file, or a line that fails to parse as JSON is skipped, never thrown — this is a background convenience export, not a user-initiated action a failure should interrupt.

## Proposed Design

### Locating a task's transcript

A new `src/main/services/transcript-service.ts` exports:
- `encodeProjectDirName(cwd: string): string` — replaces every `\`, `:`, `.`, and `/` character in `cwd` with `-`.
- `findLatestTranscriptFile(cwd: string): Promise<string | undefined>` — computes `join(homedir(), '.claude', 'projects', encodeProjectDirName(cwd))`, lists files ending in `.jsonl` in that directory, and returns the path of whichever has the newest mtime. Returns `undefined` (not a thrown error) if the directory doesn't exist or contains no `.jsonl` files — this covers a task that was just created and hasn't had a `claude` turn yet. A task's session can restart under a new session id (e.g. the existing "no conversation found" auto-recovery in `pty-manager.ts` starts a fresh session); only the latest file is used, not a stitched history across restarts.

### Parsing to Markdown

- `parseTranscriptToMarkdown(jsonlContent: string): string` — splits on newlines, `JSON.parse`s each non-empty line inside a `try`/`catch` (skip on parse failure, continue to the next line), and for each parsed entry:
  - `type: "user"` with a string `message.content` → emit `### You\n\n{content}\n\n`.
  - `type: "assistant"` → filter `message.content` (an array) to blocks where `type === "text"`, join their `.text` fields with a blank line between them; if the joined text is non-empty, emit `### Claude\n\n{text}\n\n`. A turn with only `thinking`/`tool_use` blocks and no `text` block produces no output (dropped entirely, not an empty heading).
  - Any other `type`, or a `user`/`assistant` entry whose `message.content` isn't in the expected shape (e.g. an array, for tool-result-only user turns), is skipped.
- `exportTranscript(cwd: string, outputPath: string): Promise<void>` — calls `findLatestTranscriptFile`; if `undefined`, returns without writing anything; otherwise reads the file, calls `parseTranscriptToMarkdown`, and writes the result to `outputPath` (creating parent directories as needed, mirroring `notes-service.ts`'s `writeTaskNotes` pattern).

### Where it's written

A new path helper in `src/main/paths.ts`: `getTaskTranscriptPath(taskId: string): string` → `join(getRuntimeDataRoot(), 'tasks', \`${taskId}.transcript.md\`)`. This is a sibling of the existing `<taskId>.md` notes file, in the same `tasks/` directory, but never read or written by anything in `notes-service.ts` — completely separate file, so the auto-export can never collide with or overwrite the user's own notes.

### Scheduling

This is main-process-only background work with no renderer/IPC involvement at all.

`src/main/services/pty-manager.ts` currently keeps `sessions: Map<string, IPty>`. It changes to `sessions: Map<string, { process: IPty; cwd: string }>` so a session's working directory is available without re-reading the store, and gains `listAliveSessions(): Array<{ taskId: string; cwd: string }>` (returns entries for every taskId still in the map — a session is only removed from the map by `killSession` or the process's own `onExit`, so "in the map" already means "alive").

A new `startTranscriptExportScheduler(intervalMs: number): void` in `transcript-service.ts` runs `setInterval` at the given interval; each tick calls `listAliveSessions()` and, for every entry, calls `exportTranscript(cwd, getTaskTranscriptPath(taskId))`, catching and `console.error`-logging any rejection per-task so one task's failure doesn't stop the others from exporting on that tick. This is started once, at app startup, alongside where `registerTaskHandlers`/`registerRepoHandlers` are already wired up, with `intervalMs` set to 5 minutes (`5 * 60 * 1000`) — matching the cadence already shipped for the task-notes periodic autosave.

## Non-Goals

- No in-app UI to view the exported transcript in v1 — it's a plain file on disk, open it in any Markdown viewer/editor. A follow-up could add a read-only tab in the notes panel.
- No faster-than-5-minute updates; no manual "export now" trigger.
- No stitching of multiple session-restart transcripts into one file — latest session only (see Context).
- No changes to `notes-service.ts` or the existing task-notes autosave — this is fully additive and separate.

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every 5 minutes, export a clean Markdown conversation summary for every task with a currently-alive `claude` session, to a file separate from the task's own notes.

**Architecture:** A new `transcript-service.ts` locates and parses Claude Code's own JSONL transcript files (an internal format, handled best-effort). `pty-manager.ts` is extended to track each session's `cwd` and expose the list of currently-alive sessions. A `setInterval`-based scheduler, started once at app startup, drives the periodic export for every alive session.

**Tech Stack:** Same as the rest of the project — TypeScript strict, Node.js `fs/promises`, Vitest.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one function/responsibility per concern.
- Every read of the external JSONL format is best-effort: missing files/directories and unparseable lines are skipped, never thrown — this must not surface as a UI error banner or crash the scheduler.
- Never write to or read from the existing per-task notes file (`<taskId>.md`) from this feature's code — the transcript export is a fully separate file (`<taskId>.transcript.md`).

---

### Task 1: Locate, parse, and export a transcript

**Files:**
- Create: `src/main/services/transcript-service.ts`
- Test: `src/main/services/transcript-service.test.ts`
- Modify: `src/main/paths.ts`
- Modify: `src/main/paths.test.ts`

**Interfaces:**
- Produces: `encodeProjectDirName(cwd: string): string`, `findLatestTranscriptFile(cwd: string): Promise<string | undefined>`, `parseTranscriptToMarkdown(jsonlContent: string): string`, `exportTranscript(cwd: string, outputPath: string): Promise<void>` — all named exports of `transcript-service.ts`.
- Produces: `getTaskTranscriptPath(taskId: string): string` — a named export of `paths.ts`, added alongside the existing `getTaskNotesPath`.

- [ ] **Step 1: Add the failing path-helper test**

Add this test to `src/main/paths.test.ts`, inside the existing `describe('paths', ...)` block, and add `getTaskTranscriptPath` to the existing import line from `./paths`:

```tsx
it('getTaskTranscriptPath returns tasks/<id>.transcript.md under the runtime root', () => {
  expect(getTaskTranscriptPath('abc123')).toBe(join(getRuntimeDataRoot(), 'tasks', 'abc123.transcript.md'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- paths`
Expected: FAIL — `getTaskTranscriptPath` is not exported by `./paths`

- [ ] **Step 3: Implement the path helper**

Add to `src/main/paths.ts`, right after the existing `getTaskNotesPath` function:

```ts
export function getTaskTranscriptPath(taskId: string): string {
  return join(getRuntimeDataRoot(), 'tasks', `${taskId}.transcript.md`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:main -- paths`
Expected: PASS

- [ ] **Step 5: Write the failing tests for the transcript service**

Create `src/main/services/transcript-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

const readdirMock = vi.fn();
const statMock = vi.fn();
const readFileMock = vi.fn();
const mkdirMock = vi.fn();
const writeFileMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  readdir: (...args: unknown[]) => readdirMock(...args),
  stat: (...args: unknown[]) => statMock(...args),
  readFile: (...args: unknown[]) => readFileMock(...args),
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

vi.mock('node:os', () => ({ homedir: () => 'C:\\Users\\paulo.rodriguez' }));

import {
  encodeProjectDirName,
  findLatestTranscriptFile,
  parseTranscriptToMarkdown,
  exportTranscript,
} from './transcript-service';

describe('transcript-service', () => {
  beforeEach(() => {
    readdirMock.mockReset();
    statMock.mockReset();
    readFileMock.mockReset();
    mkdirMock.mockReset();
    writeFileMock.mockReset();
  });

  describe('encodeProjectDirName', () => {
    it('replaces backslashes, colons, dots, and slashes with dashes', () => {
      expect(
        encodeProjectDirName(
          'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\repos\\Digital.Knowledge-worktrees\\chore-health-check-endpoint-conventions',
        ),
      ).toBe(
        'C--Users-paulo-rodriguez-claude-orchestrator-repos-Digital-Knowledge-worktrees-chore-health-check-endpoint-conventions',
      );
    });
  });

  describe('findLatestTranscriptFile', () => {
    it('returns undefined when the project directory does not exist', async () => {
      readdirMock.mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'ENOENT' }));
      expect(await findLatestTranscriptFile('C:\\repo-worktrees\\slug')).toBeUndefined();
    });

    it('returns undefined when the directory has no .jsonl files', async () => {
      readdirMock.mockResolvedValueOnce(['notes.txt']);
      expect(await findLatestTranscriptFile('C:\\repo-worktrees\\slug')).toBeUndefined();
    });

    it('returns the most recently modified .jsonl file', async () => {
      readdirMock.mockResolvedValueOnce(['old-session.jsonl', 'new-session.jsonl']);
      statMock.mockImplementation(async (path: string) => {
        if (path.includes('old-session')) {
          return { mtimeMs: 1000 };
        }
        return { mtimeMs: 2000 };
      });
      const projectDir = join('C:\\Users\\paulo.rodriguez', '.claude', 'projects', 'C--repo-worktrees-slug');
      expect(await findLatestTranscriptFile('C:\\repo-worktrees\\slug')).toBe(join(projectDir, 'new-session.jsonl'));
    });
  });

  describe('parseTranscriptToMarkdown', () => {
    it('extracts a user turn as a plain "### You" section', () => {
      const line = JSON.stringify({ type: 'user', message: { role: 'user', content: 'can you check this branch' } });
      expect(parseTranscriptToMarkdown(line)).toBe('### You\n\ncan you check this branch\n\n');
    });

    it('extracts only the text blocks of an assistant turn, skipping thinking and tool_use', () => {
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'internal reasoning' },
            { type: 'text', text: 'Here is what I found.' },
            { type: 'tool_use', name: 'Read', input: {} },
          ],
        },
      });
      expect(parseTranscriptToMarkdown(line)).toBe('### Claude\n\nHere is what I found.\n\n');
    });

    it('drops an assistant turn that has no text block (pure tool use)', () => {
      const line = JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: {} }] },
      });
      expect(parseTranscriptToMarkdown(line)).toBe('');
    });

    it('skips lines that are not valid JSON instead of throwing', () => {
      expect(() => parseTranscriptToMarkdown('not json at all')).not.toThrow();
      expect(parseTranscriptToMarkdown('not json at all')).toBe('');
    });

    it('skips entries that are not user or assistant turns', () => {
      const line = JSON.stringify({ type: 'mode', mode: 'normal' });
      expect(parseTranscriptToMarkdown(line)).toBe('');
    });

    it('joins multiple lines from a real transcript in order', () => {
      const lines = [
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' } }),
        JSON.stringify({
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'hi there' }] },
        }),
      ].join('\n');
      expect(parseTranscriptToMarkdown(lines)).toBe('### You\n\nhello\n\n### Claude\n\nhi there\n\n');
    });
  });

  describe('exportTranscript', () => {
    it('does nothing when no transcript file is found', async () => {
      readdirMock.mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'ENOENT' }));
      await exportTranscript('C:\\repo-worktrees\\slug', 'C:\\fake\\tasks\\abc.transcript.md');
      expect(writeFileMock).not.toHaveBeenCalled();
    });

    it('reads the latest transcript, converts it, and writes the result', async () => {
      readdirMock.mockResolvedValueOnce(['session.jsonl']);
      statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
      readFileMock.mockResolvedValueOnce(
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' } }),
      );
      await exportTranscript('C:\\repo-worktrees\\slug', 'C:\\fake\\tasks\\abc.transcript.md');
      expect(mkdirMock).toHaveBeenCalled();
      expect(writeFileMock).toHaveBeenCalledWith('C:\\fake\\tasks\\abc.transcript.md', '### You\n\nhello\n\n', 'utf-8');
    });
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test:main -- transcript-service`
Expected: FAIL — cannot find module `./transcript-service` (file doesn't exist yet)

- [ ] **Step 7: Implement the transcript service**

Create `src/main/services/transcript-service.ts`:

```ts
import { readdir, readFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

interface TranscriptUserMessage {
  type: 'user';
  message: { role: 'user'; content: string };
}

interface TranscriptAssistantContentBlock {
  type: string;
  text?: string;
}

interface TranscriptAssistantMessage {
  type: 'assistant';
  message: { role: 'assistant'; content: TranscriptAssistantContentBlock[] };
}

function isUserEntry(entry: unknown): entry is TranscriptUserMessage {
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }
  const candidate = entry as { type?: unknown; message?: { content?: unknown } };
  return candidate.type === 'user' && typeof candidate.message?.content === 'string';
}

function isAssistantEntry(entry: unknown): entry is TranscriptAssistantMessage {
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }
  const candidate = entry as { type?: unknown; message?: { content?: unknown } };
  return candidate.type === 'assistant' && Array.isArray(candidate.message?.content);
}

export function encodeProjectDirName(cwd: string): string {
  return cwd.replace(/[\\:.\/]/g, '-');
}

export async function findLatestTranscriptFile(cwd: string): Promise<string | undefined> {
  const projectDir = join(homedir(), '.claude', 'projects', encodeProjectDirName(cwd));
  let entries: string[];
  try {
    entries = await readdir(projectDir);
  } catch {
    return undefined;
  }
  const jsonlFiles = entries.filter((name) => name.endsWith('.jsonl'));
  if (jsonlFiles.length === 0) {
    return undefined;
  }
  const withMtimes = await Promise.all(
    jsonlFiles.map(async (name) => {
      const filePath = join(projectDir, name);
      const stats = await stat(filePath);
      return { filePath, mtimeMs: stats.mtimeMs };
    }),
  );
  withMtimes.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withMtimes[0]?.filePath;
}

export function parseTranscriptToMarkdown(jsonlContent: string): string {
  let markdown = '';
  for (const line of jsonlContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }
    let entry: unknown;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (isUserEntry(entry)) {
      markdown += `### You\n\n${entry.message.content}\n\n`;
    } else if (isAssistantEntry(entry)) {
      const text = entry.message.content
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n\n');
      if (text !== '') {
        markdown += `### Claude\n\n${text}\n\n`;
      }
    }
  }
  return markdown;
}

export async function exportTranscript(cwd: string, outputPath: string): Promise<void> {
  const transcriptFile = await findLatestTranscriptFile(cwd);
  if (transcriptFile === undefined) {
    return;
  }
  const raw = await readFile(transcriptFile, 'utf-8');
  const markdown = parseTranscriptToMarkdown(raw);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf-8');
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run test:main -- transcript-service`
Expected: PASS (all tests)

- [ ] **Step 9: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests pass

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add src/main/paths.ts src/main/paths.test.ts src/main/services/transcript-service.ts src/main/services/transcript-service.test.ts
git commit -m "feat: locate, parse, and export a task's Claude Code transcript to Markdown"
```

---

### Task 2: Track session cwd and list alive sessions

**Files:**
- Modify: `src/main/services/pty-manager.ts`
- Modify: `src/main/services/pty-manager.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `listAliveSessions(): Array<{ taskId: string; cwd: string }>` — a new named export of `pty-manager.ts`. All existing exports (`spawnClaudeSession`, `writeToSession`, `isSessionAlive`, `killSession`, `resizeSession`) keep their exact same signatures and behavior.

This task is a pure internal refactor (the session map's value type changes from the raw `pty.IPty` to `{ process: pty.IPty; cwd: string }`) plus one new function. No existing test should need to change.

- [ ] **Step 1: Write the failing tests**

Add these two tests to `src/main/services/pty-manager.test.ts`, inside the existing `describe('pty-manager', ...)` block, and add `listAliveSessions` to the existing import line from `./pty-manager`:

```tsx
it('listAliveSessions returns taskId/cwd pairs for every currently alive session', () => {
  spawnClaudeSession('task-9', 'C:\\repo-worktrees\\slug9', false, vi.fn());
  spawnClaudeSession('task-10', 'C:\\repo-worktrees\\slug10', false, vi.fn());
  expect(listAliveSessions()).toEqual(
    expect.arrayContaining([
      { taskId: 'task-9', cwd: 'C:\\repo-worktrees\\slug9' },
      { taskId: 'task-10', cwd: 'C:\\repo-worktrees\\slug10' },
    ]),
  );
  killSession('task-9');
  killSession('task-10');
});

it('listAliveSessions excludes a session after it is killed', () => {
  spawnClaudeSession('task-11', 'C:\\repo-worktrees\\slug11', false, vi.fn());
  killSession('task-11');
  expect(listAliveSessions()).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ taskId: 'task-11' })]),
  );
});
```

- [ ] **Step 2: Run tests to verify the new ones fail and the rest still pass**

Run: `npm run test:main -- pty-manager`
Expected: existing tests pass; the 2 new tests fail — `listAliveSessions` is not exported yet

- [ ] **Step 3: Implement**

Replace the full contents of `src/main/services/pty-manager.ts` with:

```ts
import * as pty from 'node-pty';

type PtyDataListener = (taskId: string, data: string) => void;

interface Session {
  process: pty.IPty;
  cwd: string;
}

const sessions = new Map<string, Session>();

// `claude --continue` exits immediately with this message when the target
// directory has no prior session to resume (e.g. a task whose worktree was
// created but never had a real conversation). Left unhandled, the PTY dies
// right after printing it and the terminal pane becomes permanently unusable
// for that task. Detect it and transparently retry as a fresh session.
const NO_CONVERSATION_MARKER = 'No conversation found to continue';

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
  const ptyProcess = pty.spawn('cmd.exe', args, {
    cwd,
    name: 'xterm-color',
    cols: 80,
    rows: 30,
  });

  let respawnedAsFresh = false;

  ptyProcess.onData((data) => {
    if (resume && !respawnedAsFresh && data.includes(NO_CONVERSATION_MARKER)) {
      respawnedAsFresh = true;
      ptyProcess.kill();
      if (sessions.get(taskId)?.process === ptyProcess) {
        sessions.delete(taskId);
      }
      spawnClaudeSession(taskId, cwd, false, onData);
      return;
    }
    onData(taskId, data);
  });
  ptyProcess.onExit(() => {
    if (sessions.get(taskId)?.process === ptyProcess) {
      sessions.delete(taskId);
    }
  });
  sessions.set(taskId, { process: ptyProcess, cwd });
}

export function writeToSession(taskId: string, data: string): void {
  sessions.get(taskId)?.process.write(data);
}

export function isSessionAlive(taskId: string): boolean {
  return sessions.has(taskId);
}

export function killSession(taskId: string): void {
  sessions.get(taskId)?.process.kill();
  sessions.delete(taskId);
}

export function resizeSession(taskId: string, cols: number, rows: number): void {
  sessions.get(taskId)?.process.resize(cols, rows);
}

export function listAliveSessions(): Array<{ taskId: string; cwd: string }> {
  return Array.from(sessions.entries()).map(([taskId, session]) => ({ taskId, cwd: session.cwd }));
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm run test:main -- pty-manager`
Expected: PASS (all tests, including the 2 new ones — this proves the refactor didn't change any existing behavior)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests pass

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/main/services/pty-manager.ts src/main/services/pty-manager.test.ts
git commit -m "feat: track each PTY session's cwd and expose listAliveSessions"
```

---

### Task 3: Scheduler and app wiring

**Files:**
- Modify: `src/main/services/transcript-service.ts`
- Modify: `src/main/services/transcript-service.test.ts`
- Modify: `src/main/index.ts`
- Modify: `docs/runbooks/manual-smoke-test.md`

**Interfaces:**
- Consumes: `listAliveSessions` from `./pty-manager` (Task 2), `getTaskTranscriptPath` from `../paths` (Task 1), `exportTranscript` from this same file (Task 1).
- Produces: `startTranscriptExportScheduler(intervalMs: number): void` — a new named export of `transcript-service.ts`.

This is the final task; `src/main/index.ts` has no test file today (it's the Electron app bootstrap — `app`/`BrowserWindow` aren't unit tested anywhere in this codebase) and this task doesn't add one, consistent with that existing convention. The wiring is verified via the manual smoke test instead.

- [ ] **Step 1: Add mocks and failing tests to the transcript-service test file**

In `src/main/services/transcript-service.test.ts`, add these two `vi.mock` calls right after the existing `vi.mock('node:os', ...)` call, and add `startTranscriptExportScheduler` to the existing import line from `./transcript-service`, and add an import of `listAliveSessions` from `./pty-manager`:

```ts
vi.mock('../paths', () => ({
  getTaskTranscriptPath: (taskId: string) => `C:\\fake\\tasks\\${taskId}.transcript.md`,
}));

vi.mock('./pty-manager', () => ({
  listAliveSessions: vi.fn(() => []),
}));
```

```ts
import { listAliveSessions } from './pty-manager';
```

Then append this new `describe` block at the end of the file, inside the outer `describe('transcript-service', ...)` block (before its closing `});`):

```ts
  describe('startTranscriptExportScheduler', () => {
    it('exports a transcript for every currently alive session on each interval tick', async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(listAliveSessions).mockReturnValue([
          { taskId: 'task-1', cwd: 'C:\\repo-worktrees\\slug1' },
          { taskId: 'task-2', cwd: 'C:\\repo-worktrees\\slug2' },
        ]);
        readdirMock.mockResolvedValue(['session.jsonl']);
        statMock.mockResolvedValue({ mtimeMs: 1000 });
        readFileMock.mockResolvedValue(
          JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
        );

        startTranscriptExportScheduler(5 * 60 * 1000);
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

        expect(writeFileMock).toHaveBeenCalledWith(
          'C:\\fake\\tasks\\task-1.transcript.md',
          '### You\n\nhi\n\n',
          'utf-8',
        );
        expect(writeFileMock).toHaveBeenCalledWith(
          'C:\\fake\\tasks\\task-2.transcript.md',
          '### You\n\nhi\n\n',
          'utf-8',
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not let one task\'s export failure stop others on the same tick', async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(listAliveSessions).mockReturnValue([
          { taskId: 'task-1', cwd: 'C:\\repo-worktrees\\slug1' },
          { taskId: 'task-2', cwd: 'C:\\repo-worktrees\\slug2' },
        ]);
        readdirMock.mockResolvedValue(['session.jsonl']);
        statMock.mockResolvedValue({ mtimeMs: 1000 });
        readFileMock.mockResolvedValue(
          JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
        );
        writeFileMock.mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce(undefined);
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        startTranscriptExportScheduler(5 * 60 * 1000);
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(writeFileMock).toHaveBeenCalledTimes(2);
        consoleErrorSpy.mockRestore();
      } finally {
        vi.useRealTimers();
      }
    });
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm run test:main -- transcript-service`
Expected: existing tests still pass; the 2 new tests fail — `startTranscriptExportScheduler` is not exported yet

- [ ] **Step 3: Implement the scheduler**

Add to the top of `src/main/services/transcript-service.ts`, alongside the existing imports:

```ts
import { getTaskTranscriptPath } from '../paths';
import { listAliveSessions } from './pty-manager';
```

Add this function at the end of `src/main/services/transcript-service.ts`:

```ts
export function startTranscriptExportScheduler(intervalMs: number): void {
  setInterval(() => {
    for (const { taskId, cwd } of listAliveSessions()) {
      void exportTranscript(cwd, getTaskTranscriptPath(taskId)).catch((err) => {
        console.error(`Failed to export transcript for task ${taskId}:`, err);
      });
    }
  }, intervalMs);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- transcript-service`
Expected: PASS (all tests)

- [ ] **Step 5: Wire the scheduler into app startup**

In `src/main/index.ts`, add the import at the top alongside the existing ones:

```ts
import { startTranscriptExportScheduler } from './services/transcript-service';
```

Then add the call inside `app.whenReady().then(() => { ... })`, right after `registerTaskHandlers(broadcastPtyData);`:

```ts
app.whenReady().then(() => {
  registerRepoHandlers();
  registerTaskHandlers(broadcastPtyData);
  startTranscriptExportScheduler(5 * 60 * 1000);

  // ...rest of the function is unchanged
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests pass

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7: Add a manual smoke-test step**

Add a new step to `docs/runbooks/manual-smoke-test.md` (append after the last existing numbered step, incrementing the number to 16):

```
16. Open a task and have a short back-and-forth with Claude. Wait 5 minutes (or temporarily lower the interval in `src/main/index.ts` to confirm the mechanism, then revert). Check `%USERPROFILE%\claude-orchestrator\tasks\<taskId>.transcript.md` — confirm it exists and contains a readable "### You" / "### Claude" back-and-forth matching what was actually said, with no raw JSON, ANSI escape codes, or internal "thinking" text in it.
```

- [ ] **Step 8: Commit**

```bash
git add src/main/services/transcript-service.ts src/main/services/transcript-service.test.ts src/main/index.ts docs/runbooks/manual-smoke-test.md
git commit -m "feat: periodically export every live session's transcript to Markdown"
```
