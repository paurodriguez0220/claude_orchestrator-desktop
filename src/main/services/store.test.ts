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

  it('migrates a legacy task adoId string to a one-element adoIds list on read', async () => {
    files.set(
      'C:\\fake\\store.json',
      JSON.stringify({
        repos: [],
        tasks: [
          {
            id: 't1',
            title: 'Legacy',
            adoId: '1234',
            worktreePath: 'C:\\wt',
            status: 'todo',
            kind: 'worktree',
            createdAt: '2026-07-08T00:00:00.000Z',
            updatedAt: '2026-07-08T00:00:00.000Z',
          },
        ],
      }),
    );
    const result = await readStore('C:\\fake\\store.json');
    expect(result.tasks[0]?.adoIds).toEqual(['1234']);
    expect((result.tasks[0] as { adoId?: string }).adoId).toBeUndefined();
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
