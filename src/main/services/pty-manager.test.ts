import { describe, it, expect, vi, beforeEach } from 'vitest';

const spawnMock = vi.fn();

interface FakeSession {
  onData: ReturnType<typeof vi.fn>;
  onExit: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
}

const createdSessions: FakeSession[] = [];

vi.mock('node-pty', () => ({
  spawn: (...args: unknown[]) => {
    spawnMock(...args);
    const session: FakeSession = {
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      kill: vi.fn(),
      resize: vi.fn(),
    };
    createdSessions.push(session);
    return session;
  },
}));

import { spawnClaudeSession, writeToSession, isSessionAlive, killSession, resizeSession, listAliveSessions } from './pty-manager';

describe('pty-manager', () => {
  beforeEach(() => {
    spawnMock.mockClear();
    createdSessions.length = 0;
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
    const onExitHandler = createdSessions[0]?.onExit.mock.calls[0]?.[0] as (() => void) | undefined;
    onExitHandler?.();
    expect(isSessionAlive('task-5')).toBe(false);
  });

  it('resizeSession calls resize on the live session for that taskId', () => {
    spawnClaudeSession('task-6', 'C:\\repo-worktrees\\slug6', false, vi.fn());
    resizeSession('task-6', 120, 40);
    expect(createdSessions[0]?.resize).toHaveBeenCalledWith(120, 40);
    killSession('task-6');
  });

  it('resizeSession is a no-op for an unknown taskId (does not throw)', () => {
    expect(() => resizeSession('unknown-task', 80, 30)).not.toThrow();
  });

  it('automatically falls back to a fresh session when --continue reports no conversation to continue', () => {
    const onData = vi.fn();
    spawnClaudeSession('task-7', 'C:\\repo-worktrees\\slug7', true, onData);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      'cmd.exe',
      ['/c', 'claude', '--continue'],
      expect.objectContaining({ cwd: 'C:\\repo-worktrees\\slug7' }),
    );

    const firstSession = createdSessions[0];
    const onDataHandler = firstSession?.onData.mock.calls[0]?.[0] as ((data: string) => void) | undefined;
    onDataHandler?.('No conversation found to continue\r\n');

    expect(firstSession?.kill).toHaveBeenCalledOnce();
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      'cmd.exe',
      ['/c', 'claude'],
      expect.objectContaining({ cwd: 'C:\\repo-worktrees\\slug7' }),
    );
    expect(isSessionAlive('task-7')).toBe(true);
    expect(onData).not.toHaveBeenCalledWith('task-7', 'No conversation found to continue\r\n');

    killSession('task-7');
  });

  it('forwards normal output to onData without treating it as a no-conversation signal', () => {
    const onData = vi.fn();
    spawnClaudeSession('task-8', 'C:\\repo-worktrees\\slug8', true, onData);
    const onDataHandler = createdSessions[0]?.onData.mock.calls[0]?.[0] as ((data: string) => void) | undefined;
    onDataHandler?.('Claude Code v2.1.198\r\n');
    expect(onData).toHaveBeenCalledWith('task-8', 'Claude Code v2.1.198\r\n');
    expect(spawnMock).toHaveBeenCalledTimes(1);
    killSession('task-8');
  });

  it('listAliveSessions returns taskId/cwd pairs for every currently alive session', () => {
    spawnClaudeSession('task-9', 'C:\\repo-worktrees\\slug9', false, vi.fn());
    spawnClaudeSession('task-10', 'C:\\repo-worktrees\\slug10', false, vi.fn());
    expect(listAliveSessions()).toEqual(
      expect.arrayContaining([
        { taskId: 'task-9', cwd: 'C:\\repo-worktrees\\slug9' },
        { taskId: 'task-10', cwd: 'C:\\repo-worktrees\\slug10' },
      ]),
    );
    killSession('task-9');
    killSession('task-10');
  });

  it('listAliveSessions excludes a session after it is killed', () => {
    spawnClaudeSession('task-11', 'C:\\repo-worktrees\\slug11', false, vi.fn());
    killSession('task-11');
    expect(listAliveSessions()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ taskId: 'task-11' })]),
    );
  });
});
