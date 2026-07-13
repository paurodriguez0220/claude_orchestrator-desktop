import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { Terminal } from '@xterm/xterm';

const writeMock = vi.fn();
const openMock = vi.fn();
const pasteMock = vi.fn();
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
      paste: pasteMock,
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
const clipboardRead = vi.fn(async (): Promise<{ types: string[]; getType: (type: string) => Promise<Blob> }[]> => []);
const clipboardReadText = vi.fn(async () => '');

function fakeClipboardItem(type: string, blob: Blob): { types: string[]; getType: (type: string) => Promise<Blob> } {
  return {
    types: [type],
    getType: async (requestedType: string) => {
      if (requestedType !== type) {
        throw new Error(`Unexpected type requested: ${requestedType}`);
      }
      return blob;
    },
  };
}

beforeEach(() => {
  fitMock.mockClear();
  resizeObserverDisconnectMock.mockClear();
  resizeObserverObserveMock.mockClear();
  resizeObserverCallback = undefined;
  saveClipboardImage.mockClear();
  sendPtyInput.mockClear();
  pasteMock.mockClear();
  writeMock.mockClear();
  attachCustomKeyEventHandlerMock.mockClear();
  hasSelectionMock.mockReset().mockReturnValue(false);
  getSelectionMock.mockReset().mockReturnValue('');
  clipboardWriteText.mockClear();
  clipboardRead.mockReset().mockResolvedValue([]);
  clipboardReadText.mockReset().mockResolvedValue('');
  vi.stubGlobal('claudeOrchestrator', { sendPtyInput, resizePty, onPtyOutput, saveClipboardImage });
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: clipboardWriteText, read: clipboardRead, readText: clipboardReadText },
    configurable: true,
  });
});

import { TerminalTab } from './terminal-tab';

function getCustomKeyEventHandler(): (event: KeyboardEvent) => boolean {
  const handler = attachCustomKeyEventHandlerMock.mock.calls[0]?.[0] as (event: KeyboardEvent) => boolean;
  if (!handler) {
    throw new Error('attachCustomKeyEventHandler was not called');
  }
  return handler;
}

// Paste is handled by a capture-phase 'paste' listener on the terminal
// container (the [data-task-id] div), so tests drive it by dispatching a
// cancelable paste event on that element rather than via the key handler.
function dispatchPaste(container: HTMLElement): Event {
  const terminalContainer = container.querySelector('[data-task-id]') as HTMLElement;
  const event = new Event('paste', { bubbles: true, cancelable: true });
  terminalContainer.dispatchEvent(event);
  return event;
}

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

  it('copies the selection to the clipboard on Ctrl+C when text is selected, without sending it to the pty', () => {
    hasSelectionMock.mockReturnValue(true);
    getSelectionMock.mockReturnValue('some selected output');
    render(<TerminalTab taskId="task-1" />);

    const result = getCustomKeyEventHandler()(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }));

    expect(clipboardWriteText).toHaveBeenCalledWith('some selected output');
    expect(result).toBe(false);
  });

  it('also copies on Ctrl+Shift+C (Shift makes event.key uppercase "C")', () => {
    hasSelectionMock.mockReturnValue(true);
    getSelectionMock.mockReturnValue('some selected output');
    render(<TerminalTab taskId="task-1" />);

    const result = getCustomKeyEventHandler()(
      new KeyboardEvent('keydown', { key: 'C', ctrlKey: true, shiftKey: true }),
    );

    expect(clipboardWriteText).toHaveBeenCalledWith('some selected output');
    expect(result).toBe(false);
  });

  it('lets Ctrl+C reach the pty as normal (e.g. to send SIGINT) when nothing is selected', () => {
    hasSelectionMock.mockReturnValue(false);
    render(<TerminalTab taskId="task-1" />);

    const result = getCustomKeyEventHandler()(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }));

    expect(clipboardWriteText).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('lets an unrelated key event pass through even when text is selected', () => {
    hasSelectionMock.mockReturnValue(true);
    getSelectionMock.mockReturnValue('some selected output');
    render(<TerminalTab taskId="task-1" />);

    const result = getCustomKeyEventHandler()(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true }));

    expect(clipboardWriteText).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('swallows the Ctrl+V keydown so xterm never emits the raw ^V control byte', () => {
    render(<TerminalTab taskId="task-1" />);

    const result = getCustomKeyEventHandler()(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }));

    expect(result).toBe(false);
  });

  it('suppresses xterm\'s built-in paste and pastes exactly once, so text is not doubled', async () => {
    clipboardRead.mockResolvedValue([]);
    clipboardReadText.mockResolvedValue('hello from clipboard');
    const { container } = render(<TerminalTab taskId="task-1" />);

    const event = dispatchPaste(container);

    // preventDefault + stopImmediatePropagation stop xterm's own paste handler
    // (the source of the second copy) from ever running.
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(pasteMock).toHaveBeenCalledWith('hello from clipboard'));
    expect(pasteMock).toHaveBeenCalledTimes(1);
  });

  it('routes pasted text through xterm\'s paste pipeline so multi-line text is bracketed and newline-normalized, not sent raw to the pty', async () => {
    const multiLine = 'first line\r\nsecond line\r\nthird line';
    clipboardRead.mockResolvedValue([]);
    clipboardReadText.mockResolvedValue(multiLine);
    const { container } = render(<TerminalTab taskId="task-1" />);

    dispatchPaste(container);

    // terminal.paste() applies bracketed-paste markers (when the running app
    // enabled the mode) and normalizes \r\n/\n line endings before emitting via
    // onData. Sending the raw string straight to the pty skips both, which
    // collapses a multi-line paste down to just its last line.
    await waitFor(() => expect(pasteMock).toHaveBeenCalledWith(multiLine));
    expect(sendPtyInput).not.toHaveBeenCalledWith('task-1', multiLine);
  });

  it('reads an image off the clipboard on paste, saves it via IPC, and types its path into the terminal', async () => {
    const fakeBlob = new Blob(['fake-image-bytes'], { type: 'image/png' });
    clipboardRead.mockResolvedValue([fakeClipboardItem('image/png', fakeBlob)]);
    const { container } = render(<TerminalTab taskId="task-1" />);

    dispatchPaste(container);

    await waitFor(() => expect(saveClipboardImage).toHaveBeenCalled());
    expect(sendPtyInput).toHaveBeenCalledWith(
      'task-1',
      'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\pasted-images\\abc123.png',
    );
    expect(clipboardReadText).not.toHaveBeenCalled();
  });

  it('quotes the pasted image path when it contains a space', async () => {
    saveClipboardImage.mockResolvedValueOnce('C:\\Users\\John Smith\\claude-orchestrator\\pasted-images\\abc123.png');
    const fakeBlob = new Blob(['fake-image-bytes'], { type: 'image/png' });
    clipboardRead.mockResolvedValue([fakeClipboardItem('image/png', fakeBlob)]);
    const { container } = render(<TerminalTab taskId="task-1" />);

    dispatchPaste(container);

    await waitFor(() =>
      expect(sendPtyInput).toHaveBeenCalledWith(
        'task-1',
        '"C:\\Users\\John Smith\\claude-orchestrator\\pasted-images\\abc123.png"',
      ),
    );
  });

  it('falls back to plain-text paste when the clipboard has no supported image', async () => {
    clipboardRead.mockResolvedValue([]);
    clipboardReadText.mockResolvedValue('hello from clipboard');
    const { container } = render(<TerminalTab taskId="task-1" />);

    dispatchPaste(container);

    await waitFor(() => expect(pasteMock).toHaveBeenCalledWith('hello from clipboard'));
    expect(saveClipboardImage).not.toHaveBeenCalled();
  });

  it('ignores an unsupported image type on the clipboard and falls back to text', async () => {
    const fakeBlob = new Blob(['fake-image-bytes'], { type: 'image/bmp' });
    clipboardRead.mockResolvedValue([fakeClipboardItem('image/bmp', fakeBlob)]);
    clipboardReadText.mockResolvedValue('fallback text');
    const { container } = render(<TerminalTab taskId="task-1" />);

    dispatchPaste(container);

    await waitFor(() => expect(pasteMock).toHaveBeenCalledWith('fallback text'));
    expect(saveClipboardImage).not.toHaveBeenCalled();
  });

  it('does not paste anything when the clipboard has neither a supported image nor text', async () => {
    clipboardRead.mockResolvedValue([]);
    clipboardReadText.mockResolvedValue('');
    const { container } = render(<TerminalTab taskId="task-1" />);

    dispatchPaste(container);

    await waitFor(() => expect(clipboardReadText).toHaveBeenCalled());
    expect(sendPtyInput).not.toHaveBeenCalledWith('task-1', expect.anything());
  });

  it('writes a visible error notice into the terminal when saving the pasted image fails', async () => {
    saveClipboardImage.mockRejectedValueOnce(new Error('Unsupported image type: image/bmp'));
    const fakeBlob = new Blob(['fake-image-bytes'], { type: 'image/png' });
    clipboardRead.mockResolvedValue([fakeClipboardItem('image/png', fakeBlob)]);
    const { container } = render(<TerminalTab taskId="task-1" />);

    dispatchPaste(container);

    await waitFor(() =>
      expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('Unsupported image type: image/bmp')),
    );
  });

  it('writes a visible error notice when reading the clipboard itself fails', async () => {
    clipboardRead.mockRejectedValue(new Error('clipboard-read is not allowed'));
    const { container } = render(<TerminalTab taskId="task-1" />);

    dispatchPaste(container);

    await waitFor(() =>
      expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('clipboard-read is not allowed')),
    );
  });
});
