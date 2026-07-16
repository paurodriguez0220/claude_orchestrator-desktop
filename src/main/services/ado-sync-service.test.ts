import { describe, it, expect, vi, beforeEach } from 'vitest';

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
}));

const createWorkItem = vi.fn();

vi.mock('./ado-service', () => ({
  createWorkItem: (...args: unknown[]) => createWorkItem(...args),
}));

import { syncTasksToAdo } from './ado-sync-service';
import { writeFile } from 'node:fs/promises';

const WT = 'C:\\wt';
const TASKS_MD = 'C:\\wt\\tasks.md';

function seed(content: string): void {
  files.clear();
  files.set(TASKS_MD, content);
}

describe('syncTasksToAdo', () => {
  beforeEach(() => {
    createWorkItem.mockReset();
    vi.mocked(writeFile).mockClear();
  });

  it('throws a friendly error when the worktree has no tasks.md', async () => {
    files.clear();
    await expect(syncTasksToAdo(WT, { dryRun: true })).rejects.toThrow(/no tasks\.md/i);
  });

  it('dry run reports what would be created without calling ADO or writing the file', async () => {
    seed(
      [
        '---',
        'adoParent: 500',
        '---',
        '## Work items',
        '- [ ] (Task) Alpha',
        '- [x] (Task) Beta #42',
      ].join('\n'),
    );
    const result = await syncTasksToAdo(WT, { dryRun: true });
    expect(result.parentId).toBe(500);
    expect(result.toCreate).toEqual([{ type: 'Task', title: 'Alpha' }]);
    expect(result.skipped).toBe(1);
    expect(result.created).toEqual([]);
    expect(createWorkItem).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('creates a child under the parent for each un-synced item and copies the description', async () => {
    seed(
      [
        '---',
        'adoParent: 500',
        '---',
        '## Work items',
        '- [ ] (Task) Alpha',
        '  > Do the alpha thing.',
      ].join('\n'),
    );
    createWorkItem.mockResolvedValue({ id: 900, url: 'http://ado/900' });
    const result = await syncTasksToAdo(WT, { dryRun: false });
    expect(createWorkItem).toHaveBeenCalledWith({
      type: 'Task',
      title: 'Alpha',
      description: 'Do the alpha thing.',
      parentId: 500,
    });
    expect(result.created).toEqual([{ title: 'Alpha', id: 900, url: 'http://ado/900' }]);
  });

  it('appends the created id back into tasks.md so a re-run skips it', async () => {
    seed(['---', 'adoParent: 500', '---', '## Work items', '- [ ] (Task) Alpha'].join('\n'));
    createWorkItem.mockResolvedValue({ id: 900, url: 'http://ado/900' });
    await syncTasksToAdo(WT, { dryRun: false });
    expect(files.get(TASKS_MD)).toContain('- [ ] (Task) Alpha #900');
  });

  it('skips items that already carry an id and never re-creates them', async () => {
    seed(['## Work items', '- [x] (Task) Beta #42'].join('\n'));
    const result = await syncTasksToAdo(WT, { dryRun: false });
    expect(createWorkItem).not.toHaveBeenCalled();
    expect(result.created).toEqual([]);
    expect(result.skipped).toBe(1);
    expect(writeFile).not.toHaveBeenCalled();
  });
});
