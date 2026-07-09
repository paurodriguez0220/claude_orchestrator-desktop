import { useEffect, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { PtyOutputEvent } from '../../../shared/ipc-channels';

export interface TerminalTabProps {
  taskId: string;
}

const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

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

    function readAsDataUrl(blob: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    }

    async function handlePastedImage(blob: Blob): Promise<void> {
      try {
        const dataUrl = await readAsDataUrl(blob);
        const filePath = await window.claudeOrchestrator.saveClipboardImage(dataUrl);
        const quotedPath = filePath.includes(' ') ? `"${filePath}"` : filePath;
        window.claudeOrchestrator.sendPtyInput(taskId, quotedPath);
      } catch (err) {
        terminal.write(`\r\n[Failed to paste image: ${toErrorMessage(err)}]\r\n`);
      }
    }

    // Reading the clipboard directly (rather than relying on the native
    // 'paste' DOM event) sidesteps a real Electron/Chromium quirk: xterm's
    // own internal paste handler stops the event from ever reaching a
    // listener on an ancestor element, and even routing around that via a
    // capture-phase listener still saw an empty clipboardData.items — the
    // browser doesn't populate it for capture-phase listeners on ancestors.
    // Actively reading via the Async Clipboard API has neither problem.
    async function pasteFromClipboard(): Promise<void> {
      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const clipboardItem of clipboardItems) {
          const imageType = clipboardItem.types.find((type) => SUPPORTED_IMAGE_TYPES.includes(type));
          if (imageType) {
            const blob = await clipboardItem.getType(imageType);
            await handlePastedImage(blob);
            return;
          }
        }
        const text = await navigator.clipboard.readText();
        if (text) {
          window.claudeOrchestrator.sendPtyInput(taskId, text);
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
      // Ctrl+V always means paste here — we take over entirely (including
      // plain-text paste) rather than letting xterm's own paste handling
      // run at all, so there's exactly one paste code path to reason about.
      if (key === 'v') {
        void pasteFromClipboard();
        return false;
      }
      return true;
    });

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
      resizeObserver.disconnect();
      unsubscribe();
      terminal.dispose();
    };
  }, [taskId]);

  return <div ref={containerRef} data-task-id={taskId} className="h-full w-full p-2" />;
}
