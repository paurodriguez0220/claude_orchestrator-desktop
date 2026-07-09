import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { Terminal } from '@xterm/xterm';

const writeMock = vi.fn();
const openMock = vi.fn();
const onDataMock = vi.fn();
const onResizeMock = vi.fn();
const loadAddonMock = vi.fn();
const fitMock = vi.fn();
const attachCustomKeyEventHandlerMock = vi.fn();
const hasSelectionMock = vi.fn(() => false);
const getSelectionMock = vi.fn(() => '');

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function TerminalMock() {
    return {
      open: openMock,
      write: writeMock,
      onData: onDataMock,
      onResize: onResizeMock,
      loadAddon: loadAddonMock,
      attachCustomKeyEventHandler: attachCustomKeyEventHandlerMock,
      hasSelection: hasSelectionMock,
      getSelection: getSelectionMock,
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
const saveClipboardImage = vi.fn(async () => 'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\pasted-images\\abc123.png');

const resizeObserverDisconnectMock = vi.fn();
const resizeObserverObserveMock = vi.fn();
let resizeObserverCallback: ((entries: ResizeObserverEntry[]) => void) | undefined;

class ResizeObserverMock {
  constructor(callback: (entries: ResizeObserverEntry[]) => void) {
    resizeObserverCallback = callback;
  }
  observe = resizeObserverObserveMock;
  unobserve = vi.fn();
  disconnect = resizeObserverDisconnectMock;
}

const clipboardWriteText = vi.fn(async () => undefined);

beforeEach(() => {
  fitMock.mockClear();
  resizeObserverDisconnectMock.mockClear();
  resizeObserverObserveMock.mockClear();
  resizeObserverCallback = undefined;
  saveClipboardImage.mockClear();
  attachCustomKeyEventHandlerMock.mockClear();
  hasSelectionMock.mockReset().mockReturnValue(false);
  getSelectionMock.mockReset().mockReturnValue('');
  clipboardWriteText.mockClear();
  vi.stubGlobal('claudeOrchestrator', { sendPtyInput, resizePty, onPtyOutput, saveClipboardImage });
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: clipboardWriteText },
    configurable: true,
  });
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

  it('re-fits the terminal when the container is resized (e.g. becomes visible again)', () => {
    const { container } = render(<TerminalTab taskId="task-1" />);
    const terminalContainer = container.querySelector('[data-task-id="task-1"]') as HTMLDivElement;
    Object.defineProperty(terminalContainer, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(terminalContainer, 'clientHeight', { value: 600, configurable: true });
    fitMock.mockClear();

    expect(resizeObserverCallback).toBeDefined();
    resizeObserverCallback?.([]);

    expect(fitMock).toHaveBeenCalled();
  });

  it('does not fit while the container is hidden (zero width/height)', () => {
    const { container } = render(<TerminalTab taskId="task-1" />);
    const terminalContainer = container.querySelector('[data-task-id="task-1"]') as HTMLDivElement;
    Object.defineProperty(terminalContainer, 'clientWidth', { value: 0, configurable: true });
    Object.defineProperty(terminalContainer, 'clientHeight', { value: 0, configurable: true });
    fitMock.mockClear();

    resizeObserverCallback?.([]);

    expect(fitMock).not.toHaveBeenCalled();
  });

  it('disconnects the resize observer on unmount', () => {
    const { unmount } = render(<TerminalTab taskId="task-1" />);
    unmount();
    expect(resizeObserverDisconnectMock).toHaveBeenCalled();
  });

  it('detects a pasted image, saves it via IPC, and types its path into the terminal', async () => {
    const { container } = render(<TerminalTab taskId="task-1" />);
    const terminalContainer = container.querySelector('[data-task-id="task-1"]') as HTMLDivElement;

    const fakeFile = new File(['fake-image-bytes'], 'image.png', { type: 'image/png' });
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { items: [{ type: 'image/png', getAsFile: () => fakeFile }] },
    });

    terminalContainer.dispatchEvent(pasteEvent);

    await waitFor(() => expect(saveClipboardImage).toHaveBeenCalled());
    expect(sendPtyInput).toHaveBeenCalledWith(
      'task-1',
      'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\pasted-images\\abc123.png',
    );
    expect(pasteEvent.defaultPrevented).toBe(true);
  });

  it('quotes the pasted image path when it contains a space', async () => {
    saveClipboardImage.mockResolvedValueOnce('C:\\Users\\John Smith\\claude-orchestrator\\pasted-images\\abc123.png');
    const { container } = render(<TerminalTab taskId="task-1" />);
    const terminalContainer = container.querySelector('[data-task-id="task-1"]') as HTMLDivElement;

    const fakeFile = new File(['fake-image-bytes'], 'image.png', { type: 'image/png' });
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { items: [{ type: 'image/png', getAsFile: () => fakeFile }] },
    });

    terminalContainer.dispatchEvent(pasteEvent);

    await waitFor(() =>
      expect(sendPtyInput).toHaveBeenCalledWith(
        'task-1',
        '"C:\\Users\\John Smith\\claude-orchestrator\\pasted-images\\abc123.png"',
      ),
    );
  });

  it('does not intercept a normal text paste', () => {
    const { container } = render(<TerminalTab taskId="task-1" />);
    const terminalContainer = container.querySelector('[data-task-id="task-1"]') as HTMLDivElement;

    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { items: [{ type: 'text/plain', getAsFile: () => null }] },
    });

    terminalContainer.dispatchEvent(pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(false);
    expect(saveClipboardImage).not.toHaveBeenCalled();
  });

  it('does not intercept a paste with an unsupported image type', () => {
    const { container } = render(<TerminalTab taskId="task-1" />);
    const terminalContainer = container.querySelector('[data-task-id="task-1"]') as HTMLDivElement;

    const fakeFile = new File(['fake-image-bytes'], 'image.bmp', { type: 'image/bmp' });
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { items: [{ type: 'image/bmp', getAsFile: () => fakeFile }] },
    });

    terminalContainer.dispatchEvent(pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(false);
    expect(saveClipboardImage).not.toHaveBeenCalled();
  });

  it('writes a visible error notice into the terminal when saving the pasted image fails', async () => {
    saveClipboardImage.mockRejectedValueOnce(new Error('Unsupported image type: image/bmp'));
    const { container } = render(<TerminalTab taskId="task-1" />);
    const terminalContainer = container.querySelector('[data-task-id="task-1"]') as HTMLDivElement;

    const fakeFile = new File(['fake-image-bytes'], 'image.png', { type: 'image/png' });
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { items: [{ type: 'image/png', getAsFile: () => fakeFile }] },
    });

    terminalContainer.dispatchEvent(pasteEvent);

    await waitFor(() =>
      expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('Unsupported image type: image/bmp')),
    );
  });

  it('copies the selection to the clipboard on Ctrl+C when text is selected, without sending it to the pty', () => {
    hasSelectionMock.mockReturnValue(true);
    getSelectionMock.mockReturnValue('some selected output');
    render(<TerminalTab taskId="task-1" />);
    const customKeyEventHandler = attachCustomKeyEventHandlerMock.mock.calls[0]?.[0] as (
      event: KeyboardEvent,
    ) => boolean;

    const result = customKeyEventHandler(
      new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }),
    );

    expect(clipboardWriteText).toHaveBeenCalledWith('some selected output');
    expect(result).toBe(false);
  });

  it('also copies on Ctrl+Shift+C (Shift makes event.key uppercase "C")', () => {
    hasSelectionMock.mockReturnValue(true);
    getSelectionMock.mockReturnValue('some selected output');
    render(<TerminalTab taskId="task-1" />);
    const customKeyEventHandler = attachCustomKeyEventHandlerMock.mock.calls[0]?.[0] as (
      event: KeyboardEvent,
    ) => boolean;

    const result = customKeyEventHandler(
      new KeyboardEvent('keydown', { key: 'C', ctrlKey: true, shiftKey: true }),
    );

    expect(clipboardWriteText).toHaveBeenCalledWith('some selected output');
    expect(result).toBe(false);
  });

  it('lets Ctrl+C reach the pty as normal (e.g. to send SIGINT) when nothing is selected', () => {
    hasSelectionMock.mockReturnValue(false);
    render(<TerminalTab taskId="task-1" />);
    const customKeyEventHandler = attachCustomKeyEventHandlerMock.mock.calls[0]?.[0] as (
      event: KeyboardEvent,
    ) => boolean;

    const result = customKeyEventHandler(
      new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }),
    );

    expect(clipboardWriteText).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('lets an unrelated key event pass through even when text is selected', () => {
    hasSelectionMock.mockReturnValue(true);
    getSelectionMock.mockReturnValue('some selected output');
    render(<TerminalTab taskId="task-1" />);
    const customKeyEventHandler = attachCustomKeyEventHandlerMock.mock.calls[0]?.[0] as (
      event: KeyboardEvent,
    ) => boolean;

    const result = customKeyEventHandler(
      new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }),
    );

    expect(clipboardWriteText).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('removes the paste listener on unmount', () => {
    const { container, unmount } = render(<TerminalTab taskId="task-1" />);
    const terminalContainer = container.querySelector('[data-task-id="task-1"]') as HTMLDivElement;
    const removeEventListenerSpy = vi.spyOn(terminalContainer, 'removeEventListener');
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('paste', expect.any(Function), { capture: true });
  });

  it('registers the paste listener on the capture phase, so it runs before xterm\'s own internal handler can stop propagation', () => {
    const addEventListenerSpy = vi.spyOn(HTMLDivElement.prototype, 'addEventListener');
    render(<TerminalTab taskId="task-1" />);
    expect(addEventListenerSpy).toHaveBeenCalledWith('paste', expect.any(Function), { capture: true });
    addEventListenerSpy.mockRestore();
  });
});
