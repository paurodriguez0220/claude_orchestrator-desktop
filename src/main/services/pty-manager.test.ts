import { describe, it, expect, vi, beforeEach } from 'vitest';

const spawnMock = vi.fn();
const onExitMock = vi.fn();
const resizeMock = vi.fn();

vi.mock('node-pty', () => ({
  spawn: (...args: unknown[]) => {
    spawnMock(...args);
    return {
      onData: vi.fn(),
      onExit: onExitMock,
      write: vi.fn(),
      kill: vi.fn(),
      resize: resizeMock,
    };
  },
}));

import { spawnClaudeSession, writeToSession, isSessionAlive, killSession, resizeSession } from './pty-manager';

describe('pty-manager', () => {
  beforeEach(() => {
    spawnMock.mockClear();
    onExitMock.mockClear();
    resizeMock.mockClear();
  });

  it('spawns a fresh session via cmd.exe /c claude when not resuming', () => {
    spawnClaudeSession('task-1', 'C:\\repo-worktrees\\slug', false, vi.fn());
    expect(spawnMock).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'claude'],
      expect.objectContaining({ cwd: 'C:\\repo-worktrees\\slug' }),
    );
    killSession('task-1');
  });

  it('spawns with --continue when resuming', () => {
    spawnClaudeSession('task-2', 'C:\\repo-worktrees\\slug2', true, vi.fn());
    expect(spawnMock).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'claude', '--continue'],
      expect.objectContaining({ cwd: 'C:\\repo-worktrees\\slug2' }),
    );
    killSession('task-2');
  });

  it('does not spawn a second session for a taskId that is already alive', () => {
    spawnClaudeSession('task-3', 'C:\\repo-worktrees\\slug3', false, vi.fn());
    expect(isSessionAlive('task-3')).toBe(true);
    spawnClaudeSession('task-3', 'C:\\repo-worktrees\\slug3', false, vi.fn());
    expect(spawnMock).toHaveBeenCalledTimes(1);
    killSession('task-3');
  });

  it('isSessionAlive is false after killSession', () => {
    spawnClaudeSession('task-4', 'C:\\repo-worktrees\\slug4', false, vi.fn());
    killSession('task-4');
    expect(isSessionAlive('task-4')).toBe(false);
  });

  it('writeToSession is a no-op for an unknown taskId (does not throw)', () => {
    expect(() => writeToSession('unknown-task', 'echo hi\n')).not.toThrow();
  });

  it('removes the session from the map when the underlying process exits on its own', () => {
    spawnClaudeSession('task-5', 'C:\\repo-worktrees\\slug5', false, vi.fn());
    expect(isSessionAlive('task-5')).toBe(true);
    const onExitHandler = onExitMock.mock.calls[0]?.[0] as (() => void) | undefined;
    onExitHandler?.();
    expect(isSessionAlive('task-5')).toBe(false);
  });

  it('resizeSession calls resize on the live session for that taskId', () => {
    spawnClaudeSession('task-6', 'C:\\repo-worktrees\\slug6', false, vi.fn());
    resizeSession('task-6', 120, 40);
    expect(resizeMock).toHaveBeenCalledWith(120, 40);
    killSession('task-6');
  });

  it('resizeSession is a no-op for an unknown taskId (does not throw)', () => {
    expect(() => resizeSession('unknown-task', 80, 30)).not.toThrow();
  });
});
