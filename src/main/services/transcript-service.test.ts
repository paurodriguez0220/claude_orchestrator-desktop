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

vi.mock('../paths', () => ({
  getTaskTranscriptPath: (taskId: string) => `C:\\fake\\tasks\\${taskId}.transcript.md`,
}));

vi.mock('./pty-manager', () => ({
  listAliveSessions: vi.fn(() => []),
}));

import { listAliveSessions } from './pty-manager';

import {
  encodeProjectDirName,
  findLatestTranscriptFile,
  parseTranscriptToMarkdown,
  exportTranscript,
  startTranscriptExportScheduler,
  isTaskFinished,
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

  describe('isTaskFinished', () => {
    it('returns false when no transcript file is found', async () => {
      readdirMock.mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'ENOENT' }));
      expect(await isTaskFinished('C:\\repo-worktrees\\slug')).toBe(false);
    });

    it('returns true when the last relevant entry is an assistant turn with stop_reason "end_turn"', async () => {
      readdirMock.mockResolvedValueOnce(['session.jsonl']);
      statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
      readFileMock.mockResolvedValueOnce(
        [
          JSON.stringify({ type: 'user', message: { role: 'user', content: 'can you check this branch' } }),
          JSON.stringify({
            type: 'assistant',
            message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] },
          }),
        ].join('\n'),
      );
      expect(await isTaskFinished('C:\\repo-worktrees\\slug')).toBe(true);
    });

    it('returns false when the last relevant entry is an assistant turn still using a tool (stop_reason "tool_use")', async () => {
      readdirMock.mockResolvedValueOnce(['session.jsonl']);
      statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
      readFileMock.mockResolvedValueOnce(
        JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            stop_reason: 'tool_use',
            content: [{ type: 'tool_use', name: 'Read', input: {} }],
          },
        }),
      );
      expect(await isTaskFinished('C:\\repo-worktrees\\slug')).toBe(false);
    });

    it('returns false when the last relevant entry is a user turn (Claude has not responded yet)', async () => {
      readdirMock.mockResolvedValueOnce(['session.jsonl']);
      statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
      readFileMock.mockResolvedValueOnce(
        [
          JSON.stringify({
            type: 'assistant',
            message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] },
          }),
          JSON.stringify({ type: 'user', message: { role: 'user', content: 'one more thing' } }),
        ].join('\n'),
      );
      expect(await isTaskFinished('C:\\repo-worktrees\\slug')).toBe(false);
    });

    it('ignores non-turn entries (e.g. "summary") when finding the last relevant turn', async () => {
      readdirMock.mockResolvedValueOnce(['session.jsonl']);
      statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
      readFileMock.mockResolvedValueOnce(
        [
          JSON.stringify({
            type: 'assistant',
            message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] },
          }),
          JSON.stringify({ type: 'summary', summary: 'Fixed the login bug' }),
        ].join('\n'),
      );
      expect(await isTaskFinished('C:\\repo-worktrees\\slug')).toBe(true);
    });

    it('returns false without throwing when a line is not valid JSON', async () => {
      readdirMock.mockResolvedValueOnce(['session.jsonl']);
      statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
      readFileMock.mockResolvedValueOnce('not json at all');
      expect(await isTaskFinished('C:\\repo-worktrees\\slug')).toBe(false);
    });

    it('returns false without throwing when reading the transcript file fails', async () => {
      readdirMock.mockResolvedValueOnce(['session.jsonl']);
      statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
      readFileMock.mockRejectedValueOnce(new Error('EBUSY: file locked'));
      expect(await isTaskFinished('C:\\repo-worktrees\\slug')).toBe(false);
    });
  });

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
});
