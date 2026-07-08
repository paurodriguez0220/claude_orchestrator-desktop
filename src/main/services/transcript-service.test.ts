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
