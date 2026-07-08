import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class GitCommandError extends Error {
  public readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(message);
    this.name = 'GitCommandError';
    this.stderr = stderr;
  }
}

async function runGit(args: string[], cwd?: string): Promise<void> {
  try {
    await execFileAsync('git', args, cwd ? { cwd } : undefined);
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    throw new GitCommandError(`git ${args.join(' ')} failed`, stderr);
  }
}

export async function cloneRepo(url: string, destinationPath: string): Promise<void> {
  await runGit(['clone', url, destinationPath]);
}

export async function addWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string,
): Promise<void> {
  await runGit(['worktree', 'add', worktreePath, '-b', branch], repoPath);
}

export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  await runGit(['worktree', 'remove', worktreePath], repoPath);
}
