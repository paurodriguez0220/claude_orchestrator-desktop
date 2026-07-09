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

// Windows refuses to create files at paths beyond MAX_PATH (260 chars) unless
// git is told to opt in to long-path support. Our worktree layout (repo root +
// "-worktrees/<slug>/...") adds enough prefix length that otherwise-fine repos
// with deeply nested files can fail checkout with "Filename too long". Apply
// this to every git invocation rather than per-callsite — it's a no-op for
// commands that don't touch the working tree, and there's no reason a single
// call site should be exempt.
const LONG_PATHS_ARGS = ['-c', 'core.longpaths=true'];

async function runGit(args: string[], cwd?: string): Promise<void> {
  try {
    await execFileAsync('git', [...LONG_PATHS_ARGS, ...args], cwd ? { cwd } : undefined);
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    throw new GitCommandError(`git ${args.join(' ')} failed`, stderr);
  }
}

async function runGitCapture(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', [...LONG_PATHS_ARGS, ...args], { cwd });
    return stdout;
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

export async function addWorktreeForExistingBranch(
  repoPath: string,
  worktreePath: string,
  branch: string,
): Promise<void> {
  await runGit(['worktree', 'add', worktreePath, branch], repoPath);
}

export async function listBranches(repoPath: string): Promise<{ local: string[]; remote: string[] }> {
  const localOutput = await runGitCapture(['branch', '--format=%(refname:short)'], repoPath);
  const remoteOutput = await runGitCapture(['branch', '-r', '--format=%(refname:short)'], repoPath);
  const local = localOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const remote = remoteOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith('/HEAD'));
  return { local, remote };
}

export async function fetchRepo(repoPath: string): Promise<void> {
  await runGit(['fetch'], repoPath);
}

export function getLastWorkingDayCutoff(now: Date): Date {
  const isMonday = now.getDay() === 1;
  const daysBack = isMonday ? 3 : 1;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack, 0, 0, 0, 0);
}

export async function getCommitSubjectsSince(worktreePath: string, cutoff: Date): Promise<string[]> {
  const output = await runGitCapture(['log', `--since=${cutoff.toISOString()}`, '--pretty=%s'], worktreePath);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface BranchCommit {
  hash: string;
  subject: string;
}

export async function getBranchCommitsInRange(
  repoPath: string,
  branch: string,
  from: Date,
  to: Date,
): Promise<BranchCommit[]> {
  const output = await runGitCapture(
    ['log', branch, `--since=${from.toISOString()}`, `--until=${to.toISOString()}`, '--pretty=%H%x09%s'],
    repoPath,
  );
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const tabIndex = line.indexOf('\t');
      return { hash: line.slice(0, tabIndex), subject: line.slice(tabIndex + 1) };
    });
}
