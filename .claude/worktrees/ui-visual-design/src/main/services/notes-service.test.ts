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
