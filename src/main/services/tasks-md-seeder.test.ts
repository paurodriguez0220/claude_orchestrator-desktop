import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedTasksMd } from './tasks-md-seeder';
import { parseTasksMarkdown } from './tasks-md-parser';

describe('seedTasksMd', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'seed-tasksmd-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('skips silently and writes nothing when the worktree folder does not exist', async () => {
    const ghost = join(root, 'not-created-yet');
    const seeded = await seedTasksMd(ghost, '500');
    expect(seeded).toBe(false);
    await expect(readFile(join(ghost, 'tasks.md'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('seeds tasks.md at the worktree root with the parent id pre-filled', async () => {
    const seeded = await seedTasksMd(root, '8301');
    expect(seeded).toBe(true);
    const content = await readFile(join(root, 'tasks.md'), 'utf-8');
    expect(content).toContain('## Work items');
    expect(parseTasksMarkdown(content).parentId).toBe(8301);
  });

  it('does not overwrite an existing tasks.md', async () => {
    await writeFile(join(root, 'tasks.md'), 'DO NOT TOUCH', 'utf-8');
    const seeded = await seedTasksMd(root, '500');
    expect(seeded).toBe(false);
    expect(await readFile(join(root, 'tasks.md'), 'utf-8')).toBe('DO NOT TOUCH');
  });

  it('appends an ADO convention note to an existing worktree CLAUDE.md', async () => {
    await writeFile(join(root, 'CLAUDE.md'), '# Project\n\nExisting content.\n', 'utf-8');
    await seedTasksMd(root, '500');
    const claude = await readFile(join(root, 'CLAUDE.md'), 'utf-8');
    expect(claude).toContain('Existing content.');
    expect(claude).toContain('tasks.md');
    expect(claude).toMatch(/append to it/i);
  });

  it('does not create a CLAUDE.md when the worktree has none', async () => {
    await seedTasksMd(root, '500');
    await expect(readFile(join(root, 'CLAUDE.md'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not duplicate the CLAUDE.md note when it is already present', async () => {
    await mkdir(root, { recursive: true });
    // First seed writes the note.
    await writeFile(join(root, 'CLAUDE.md'), '# Project\n', 'utf-8');
    await seedTasksMd(root, '500');
    const afterFirst = await readFile(join(root, 'CLAUDE.md'), 'utf-8');
    // Remove tasks.md so a second seed runs again, then confirm the note is not doubled.
    await rm(join(root, 'tasks.md'));
    await seedTasksMd(root, '500');
    const afterSecond = await readFile(join(root, 'CLAUDE.md'), 'utf-8');
    expect(afterSecond).toBe(afterFirst);
    expect(afterSecond.match(/## ADO tasks/g)?.length).toBe(1);
  });
});
