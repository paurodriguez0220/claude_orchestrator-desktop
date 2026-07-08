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

import { cloneRepo, addWorktree, addWorktreeForExistingBranch, removeWorktree, listBranches, GitCommandError } from './git-service';

describe('git-service', () => {
  beforeEach(() => {
    execFileMock.mockClear();
    mockError = null;
  });

  it('cloneRepo calls git clone with an argument array, never a shell string', async () => {
    await cloneRepo('https://github.com/paurodriguez0220/demo.git', 'C:\\dest\\demo');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['clone', 'https://github.com/paurodriguez0220/demo.git', 'C:\\dest\\demo'],
      undefined,
    );
  });

  it('addWorktree calls git worktree add with cwd set to the repo path', async () => {
    await addWorktree('C:\\repo', 'C:\\repo-worktrees\\slug', 'task/slug');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['worktree', 'add', 'C:\\repo-worktrees\\slug', '-b', 'task/slug'],
      { cwd: 'C:\\repo' },
    );
  });

  it('removeWorktree calls git worktree remove with cwd set to the repo path', async () => {
    await removeWorktree('C:\\repo', 'C:\\repo-worktrees\\slug');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', 'C:\\repo-worktrees\\slug'],
      { cwd: 'C:\\repo' },
    );
  });

  it('addWorktreeForExistingBranch calls git worktree add without -b', async () => {
    await addWorktreeForExistingBranch('C:\\repo', 'C:\\repo-worktrees\\slug', 'feature-x');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['worktree', 'add', 'C:\\repo-worktrees\\slug', 'feature-x'],
      { cwd: 'C:\\repo' },
    );
  });

  it('listBranches returns parsed local and remote branch names, excluding the remote HEAD pointer', async () => {
    execFileMock.mockImplementation((...args: unknown[]) => {
      const gitArgs = args[1] as string[];
      if (gitArgs[0] === 'branch' && gitArgs[1] === '-r') {
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
});
