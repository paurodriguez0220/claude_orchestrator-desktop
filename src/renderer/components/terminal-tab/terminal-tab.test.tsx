import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const writeMock = vi.fn();
const openMock = vi.fn();
const onDataMock = vi.fn();
const loadAddonMock = vi.fn();

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function TerminalMock() {
    return {
      open: openMock,
      write: writeMock,
      onData: onDataMock,
      loadAddon: loadAddonMock,
      dispose: vi.fn(),
    };
  }),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(function FitAddonMock() {
    return { fit: vi.fn() };
  }),
}));

const sendPtyInput = vi.fn();
const unsubscribePtyOutput = vi.fn();
const onPtyOutput = vi.fn((_listener: (event: { taskId: string; data: string }) => void) => unsubscribePtyOutput);

beforeEach(() => {
  vi.stubGlobal('claudeOrchestrator', { sendPtyInput, onPtyOutput });
});

import { TerminalTab } from './terminal-tab';

describe('TerminalTab', () => {
  it('opens a terminal and registers a pty output listener on mount', () => {
    render(<TerminalTab taskId="task-1" />);
    expect(openMock).toHaveBeenCalled();
    expect(onPtyOutput).toHaveBeenCalledWith(expect.any(Function));
  });

  it('forwards local keystrokes to sendPtyInput for the right taskId', () => {
    render(<TerminalTab taskId="task-1" />);
    const onDataHandler = onDataMock.mock.calls[0]?.[0] as (data: string) => void;
    onDataHandler('ls\r');
    expect(sendPtyInput).toHaveBeenCalledWith('task-1', 'ls\r');
  });

  it('only writes pty output events matching this tab\'s taskId', () => {
    render(<TerminalTab taskId="task-1" />);
    const outputHandler = onPtyOutput.mock.calls[0]?.[0] as (event: { taskId: string; data: string }) => void;
    outputHandler({ taskId: 'task-2', data: 'ignored' });
    expect(writeMock).not.toHaveBeenCalledWith('ignored');
    outputHandler({ taskId: 'task-1', data: 'hello' });
    expect(writeMock).toHaveBeenCalledWith('hello');
  });

  it('unsubscribes the pty output listener on unmount', () => {
    const { unmount } = render(<TerminalTab taskId="task-1" />);
    unmount();
    expect(unsubscribePtyOutput).toHaveBeenCalled();
  });
});
