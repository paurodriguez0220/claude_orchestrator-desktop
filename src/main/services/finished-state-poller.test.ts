import { describe, it, expect, vi, beforeEach } from 'vitest';

const listAliveSessionsMock = vi.fn();
const isTaskFinishedMock = vi.fn();

vi.mock('./pty-manager', () => ({
  listAliveSessions: (...args: unknown[]) => listAliveSessionsMock(...args),
}));

vi.mock('./transcript-service', () => ({
  isTaskFinished: (...args: unknown[]) => isTaskFinishedMock(...args),
}));

import { startFinishedStatePoller } from './finished-state-poller';

describe('finished-state-poller', () => {
  beforeEach(() => {
    listAliveSessionsMock.mockReset();
    isTaskFinishedMock.mockReset();
  });

  it('calls the listener when a task flips from not-finished to finished', async () => {
    vi.useFakeTimers();
    try {
      listAliveSessionsMock.mockReturnValue([{ taskId: 'task-1', cwd: 'C:\\repo-worktrees\\slug1' }]);
      isTaskFinishedMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const onChange = vi.fn();

      startFinishedStatePoller(5000, onChange);
      await vi.advanceTimersByTimeAsync(5000);
      expect(onChange).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5000);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('task-1', true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not call the listener again while the state stays the same across ticks', async () => {
    vi.useFakeTimers();
    try {
      listAliveSessionsMock.mockReturnValue([{ taskId: 'task-1', cwd: 'C:\\repo-worktrees\\slug1' }]);
      isTaskFinishedMock.mockResolvedValue(true);
      const onChange = vi.fn();

      startFinishedStatePoller(5000, onChange);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('task-1', true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls the listener again when a finished task goes back to not-finished', async () => {
    vi.useFakeTimers();
    try {
      listAliveSessionsMock.mockReturnValue([{ taskId: 'task-1', cwd: 'C:\\repo-worktrees\\slug1' }]);
      isTaskFinishedMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const onChange = vi.fn();

      startFinishedStatePoller(5000, onChange);
      await vi.advanceTimersByTimeAsync(5000);
      expect(onChange).toHaveBeenNthCalledWith(1, 'task-1', true);

      await vi.advanceTimersByTimeAsync(5000);
      expect(onChange).toHaveBeenNthCalledWith(2, 'task-1', false);
      expect(onChange).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a rejected finished-state check as "not finished" instead of throwing or crashing the poller', async () => {
    vi.useFakeTimers();
    try {
      listAliveSessionsMock.mockReturnValue([{ taskId: 'task-1', cwd: 'C:\\repo-worktrees\\slug1' }]);
      isTaskFinishedMock.mockRejectedValue(new Error('unexpected transcript shape'));
      const onChange = vi.fn();

      startFinishedStatePoller(5000, onChange);
      await vi.advanceTimersByTimeAsync(5000);

      expect(onChange).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('only checks tasks that currently have an alive PTY session', async () => {
    vi.useFakeTimers();
    try {
      listAliveSessionsMock.mockReturnValue([]);
      const onChange = vi.fn();

      startFinishedStatePoller(5000, onChange);
      await vi.advanceTimersByTimeAsync(5000);

      expect(isTaskFinishedMock).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
