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
