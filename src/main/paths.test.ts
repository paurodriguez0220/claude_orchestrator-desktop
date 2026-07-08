import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';

vi.mock('node:os', () => ({ homedir: () => 'C:\\Users\\paulo.rodriguez' }));

import { getRuntimeDataRoot, getStorePath, getReposRoot, getTaskNotesPath, getTaskTranscriptPath, getWorktreePath, getPastedImagesDir } from './paths';

describe('paths', () => {
  it('getRuntimeDataRoot is under the user profile, not the source repo', () => {
    expect(getRuntimeDataRoot()).toBe(join('C:\\Users\\paulo.rodriguez', 'claude-orchestrator'));
  });

  it('getStorePath points at store.json under the runtime root', () => {
    expect(getStorePath()).toBe(join(getRuntimeDataRoot(), 'store.json'));
  });

  it('getReposRoot points at repos/ under the runtime root', () => {
    expect(getReposRoot()).toBe(join(getRuntimeDataRoot(), 'repos'));
  });

  it('getTaskNotesPath returns tasks/<id>.md under the runtime root', () => {
    expect(getTaskNotesPath('abc123')).toBe(join(getRuntimeDataRoot(), 'tasks', 'abc123.md'));
  });

  it('getWorktreePath places the worktree as a sibling of the repo, in <repoName>-worktrees/<slug>', () => {
    const repoPath = 'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\repos\\my-repo';
    expect(getWorktreePath(repoPath, 'my-repo', 'fix-login-bug')).toBe(
      join(repoPath, '..', 'my-repo-worktrees', 'fix-login-bug'),
    );
  });

  it('getTaskTranscriptPath returns tasks/<id>.transcript.md under the runtime root', () => {
    expect(getTaskTranscriptPath('abc123')).toBe(join(getRuntimeDataRoot(), 'tasks', 'abc123.transcript.md'));
  });

  it('getPastedImagesDir points at pasted-images/ under the runtime root', () => {
    expect(getPastedImagesDir()).toBe(join(getRuntimeDataRoot(), 'pasted-images'));
  });
});
