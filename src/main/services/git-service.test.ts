import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockError: { stderr?: string } | null = null;

const execFileMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => {
    const callback = args[args.length - 1] as (
      err: { stderr?: string } | null,
      result?: { stdout: string; stderr: string }
    ) => void;
    const result = execFileMock(...args.slice(0, -1));

    if (mockError) {
      callback(mockError);
    } else {
      callback(null, result ?? { stdout: '', stderr: '' });
    }
  },
}));

import { cloneRepo, addWorktree, addWorktreeForExistingBranch, removeWorktree, listBranches, fetchRepo, getLastWorkingDayCutoff, getCommitSubjectsSince, GitCommandError } from './git-service';

describe('git-service', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    mockError = null;
  });

  it('cloneRepo calls git clone with an argument array, never a shell string, and enables long paths', async () => {
    await cloneRepo('https://github.com/paurodriguez0220/demo.git', 'C:\\dest\\demo');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['-c', 'core.longpaths=true', 'clone', 'https://github.com/paurodriguez0220/demo.git', 'C:\\dest\\demo'],
      undefined,
    );
  });

  it('addWorktree calls git worktree add with cwd set to the repo path, and enables long paths', async () => {
    await addWorktree('C:\\repo', 'C:\\repo-worktrees\\slug', 'task/slug');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['-c', 'core.longpaths=true', 'worktree', 'add', 'C:\\repo-worktrees\\slug', '-b', 'task/slug'],
      { cwd: 'C:\\repo' },
    );
  });

  it('removeWorktree calls git worktree remove with cwd set to the repo path, and enables long paths', async () => {
    await removeWorktree('C:\\repo', 'C:\\repo-worktrees\\slug');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['-c', 'core.longpaths=true', 'worktree', 'remove', 'C:\\repo-worktrees\\slug'],
      { cwd: 'C:\\repo' },
    );
  });

  it('addWorktreeForExistingBranch calls git worktree add without -b, and enables long paths', async () => {
    await addWorktreeForExistingBranch('C:\\repo', 'C:\\repo-worktrees\\slug', 'feature-x');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['-c', 'core.longpaths=true', 'worktree', 'add', 'C:\\repo-worktrees\\slug', 'feature-x'],
      { cwd: 'C:\\repo' },
    );
  });

  it('listBranches returns parsed local and remote branch names, excluding the remote HEAD pointer', async () => {
    execFileMock.mockImplementation((...args: unknown[]) => {
      const gitArgs = args[1] as string[];
      if (gitArgs.includes('-r')) {
        return { stdout: 'origin/HEAD\norigin/main\norigin/feature-y\n', stderr: '' };
      }
      return { stdout: 'main\nfeature-x\n', stderr: '' };
    });
    const result = await listBranches('C:\\repo');
    expect(result).toEqual({
      local: ['main', 'feature-x'],
      remote: ['origin/main', 'origin/feature-y'],
    });
  });

  it('fetchRepo calls git fetch with cwd set to the repo path, and enables long paths', async () => {
    await fetchRepo('C:\\repo');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['-c', 'core.longpaths=true', 'fetch'],
      { cwd: 'C:\\repo' },
    );
  });

  it('wraps a failing git command in GitCommandError with the real stderr', async () => {
    mockError = Object.assign(new Error('exit 128'), {
      stderr: 'fatal: destination path already exists',
    });

    const thrownError = await cloneRepo('https://github.com/x/y.git', 'C:\\dest').catch(
      (err) => err,
    );
    expect(thrownError).toBeInstanceOf(GitCommandError);
    expect(thrownError.stderr).toBe('fatal: destination path already exists');
  });

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
});
