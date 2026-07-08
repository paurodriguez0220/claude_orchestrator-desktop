import { join } from 'node:path';
import { homedir } from 'node:os';

export function getRuntimeDataRoot(): string {
  return join(homedir(), 'claude-orchestrator');
}

export function getStorePath(): string {
  return join(getRuntimeDataRoot(), 'store.json');
}

export function getReposRoot(): string {
  return join(getRuntimeDataRoot(), 'repos');
}

export function getTaskNotesPath(taskId: string): string {
  return join(getRuntimeDataRoot(), 'tasks', `${taskId}.md`);
}

export function getTaskTranscriptPath(taskId: string): string {
  return join(getRuntimeDataRoot(), 'tasks', `${taskId}.transcript.md`);
}

export function getWorktreePath(repoPath: string, repoName: string, taskSlug: string): string {
  return join(repoPath, '..', `${repoName}-worktrees`, taskSlug);
}
