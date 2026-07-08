import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Terminal } from '@xterm/xterm';

const writeMock = vi.fn();
const openMock = vi.fn();
const onDataMock = vi.fn();
const onResizeMock = vi.fn();
const loadAddonMock = vi.fn();
const fitMock = vi.fn();

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function TerminalMock() {
    return {
      open: openMock,
      write: writeMock,
      onData: onDataMock,
      onResize: onResizeMock,
      loadAddon: loadAddonMock,
      dispose: vi.fn(),
    };
  }),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(function FitAddonMock() {
    return { fit: fitMock };
  }),
}));

const sendPtyInput = vi.fn();
const resizePty = vi.fn();
const unsubscribePtyOutput = vi.fn();
const onPtyOutput = vi.fn((_listener: (event: { taskId: string; data: string }) => void) => unsubscribePtyOutput);

beforeEach(() => {
  fitMock.mockClear();
  vi.stubGlobal('claudeOrchestrator', { sendPtyInput, resizePty, onPtyOutput });
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

  it('applies the app color theme to the xterm instance', () => {
    render(<TerminalTab taskId="task-1" />);
    expect(Terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({ background: '#201c17' }),
      }),
    );
  });

  it('forwards xterm resize events to resizePty for the right taskId', () => {
    render(<TerminalTab taskId="task-1" />);
    const onResizeHandler = onResizeMock.mock.calls[0]?.[0] as (size: { cols: number; rows: number }) => void;
    onResizeHandler({ cols: 120, rows: 40 });
    expect(resizePty).toHaveBeenCalledWith('task-1', 120, 40);
  });

  it('re-fits the terminal when the window resizes', () => {
    render(<TerminalTab taskId="task-1" />);
    fitMock.mockClear();
    window.dispatchEvent(new Event('resize'));
    expect(fitMock).toHaveBeenCalled();
  });

  it('removes the window resize listener on unmount', () => {
    const { unmount } = render(<TerminalTab taskId="task-1" />);
    fitMock.mockClear();
    unmount();
    window.dispatchEvent(new Event('resize'));
    expect(fitMock).not.toHaveBeenCalled();
  });
});
