import { useEffect, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { PtyOutputEvent } from '../../../shared/ipc-channels';

export interface TerminalTabProps {
  taskId: string;
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

export function TerminalTab({ taskId }: TerminalTabProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const terminal = new Terminal({
      theme: {
        background: '#201c17',
        foreground: '#e8e1d4',
        cursor: '#d97a52',
        selectionBackground: '#3d362d',
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();

    terminal.onResize(({ cols, rows }) => {
      window.claudeOrchestrator.resizePty(taskId, cols, rows);
    });

    terminal.onData((data: string) => {
      window.claudeOrchestrator.sendPtyInput(taskId, data);
    });

    // Detecting the clipboard image via the renderer's Async Clipboard API
    // (navigator.clipboard.read()) doesn't reliably expose it in this
    // Electron build, so the image branch never fired. Reading it in the
    // main process via Electron's clipboard.readImage() is reliable on
    // Windows and aligns with the repo rule that main owns all system
    // access. Text still falls back to navigator.clipboard.readText(),
    // which has always worked.
    async function pasteFromClipboard(): Promise<void> {
      try {
        const imageDataUrl = await window.claudeOrchestrator.readClipboardImage();
        if (imageDataUrl) {
          const filePath = await window.claudeOrchestrator.saveClipboardImage(imageDataUrl);
          const quotedPath = filePath.includes(' ') ? `"${filePath}"` : filePath;
          window.claudeOrchestrator.sendPtyInput(taskId, quotedPath);
          return;
        }
        const text = await navigator.clipboard.readText();
        if (text) {
          // Hand the text to xterm's paste pipeline rather than shipping the
          // raw string straight to the pty. terminal.paste() normalizes line
          // endings (\r\n/\n -> \r) and, when the running app has enabled
          // bracketed paste mode (Claude Code does), wraps the text in
          // ESC[200~ ... ESC[201~ so a multi-line block arrives as one literal
          // paste. Skipping this made multi-line pastes collapse to just their
          // last line. The transformed text is then emitted through onData,
          // which forwards it to sendPtyInput for this task — still one paste.
          terminal.paste(text);
        }
      } catch (err) {
        terminal.write(`\r\n[Failed to paste: ${toErrorMessage(err)}]\r\n`);
      }
    }

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown' || !event.ctrlKey) {
        return true;
      }
      const key = event.key.toLowerCase();
      // Ctrl+C is ambiguous in a terminal: with a selection, it should copy
      // (matching every other terminal app); with no selection, it must
      // still reach the pty untouched so SIGINT keeps working. event.key is
      // 'c' with no Shift held and 'C' with Shift held (Shift changes the
      // reported character) — accept either so Ctrl+C and Ctrl+Shift+C both
      // copy. Returning `false` tells xterm to swallow the event instead of
      // forwarding it via onData.
      if (key === 'c' && terminal.hasSelection()) {
        void navigator.clipboard.writeText(terminal.getSelection());
        return false;
      }
      // Swallow Ctrl+V so xterm doesn't emit the raw ^V (0x16) control byte to
      // the pty. The actual paste is handled by the 'paste' listener below —
      // pasting here too would send everything twice.
      if (key === 'v') {
        return false;
      }
      return true;
    });

    // xterm attaches its own 'paste' handler to its helper <textarea>, which
    // inserts the pasted text into the pty independently of ours — so relying
    // on a Ctrl+V key handler *and* letting that native handler run pastes
    // everything twice. Intercept 'paste' in the capture phase on the
    // container (an ancestor of xterm's textarea) to stop the native handler
    // from ever running, then do the single paste ourselves via the async
    // clipboard API (which, unlike the paste event, also exposes images).
    // This path also covers right-click / middle-click paste, not just Ctrl+V.
    function handlePaste(event: Event): void {
      event.preventDefault();
      event.stopImmediatePropagation();
      void pasteFromClipboard();
    }
    container.addEventListener('paste', handlePaste, true);

    const unsubscribe = window.claudeOrchestrator.onPtyOutput((event: PtyOutputEvent) => {
      if (event.taskId === taskId) {
        terminal.write(event.data);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        fitAddon.fit();
      }
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('paste', handlePaste, true);
      resizeObserver.disconnect();
      unsubscribe();
      terminal.dispose();
    };
  }, [taskId]);

  return <div ref={containerRef} data-task-id={taskId} className="h-full w-full p-2" />;
}
