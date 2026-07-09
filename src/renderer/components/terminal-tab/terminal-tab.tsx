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

    // Ctrl+C is ambiguous in a terminal: with a selection, it should copy
    // (matching every other terminal app); with no selection, it must still
    // reach the pty untouched so SIGINT keeps working. Returning `false`
    // tells xterm to swallow the event instead of forwarding it via onData.
    terminal.attachCustomKeyEventHandler((event) => {
      // event.key is 'c' with no Shift held and 'C' with Shift held (Shift
      // changes the reported character) — accept either so Ctrl+C and
      // Ctrl+Shift+C both copy.
      if (event.type === 'keydown' && event.ctrlKey && event.key.toLowerCase() === 'c' && terminal.hasSelection()) {
        void navigator.clipboard.writeText(terminal.getSelection());
        return false;
      }
      return true;
    });

    const unsubscribe = window.claudeOrchestrator.onPtyOutput((event: PtyOutputEvent) => {
      if (event.taskId === taskId) {
        terminal.write(event.data);
      }
    });

    function readAsDataUrl(file: File): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }

    async function handlePastedImage(file: File): Promise<void> {
      try {
        const dataUrl = await readAsDataUrl(file);
        const filePath = await window.claudeOrchestrator.saveClipboardImage(dataUrl);
        const quotedPath = filePath.includes(' ') ? `"${filePath}"` : filePath;
        window.claudeOrchestrator.sendPtyInput(taskId, quotedPath);
      } catch (err) {
        terminal.write(`\r\n[Failed to paste image: ${toErrorMessage(err)}]\r\n`);
      }
    }

    function handlePaste(event: ClipboardEvent): void {
      const items = event.clipboardData?.items;
      // TEMPORARY diagnostic — remove once the real clipboard item shape for
      // a Windows screenshot paste is confirmed. Logs every paste this
      // listener actually sees, and exactly what clipboardData contains.
      console.log(
        '[paste-debug] handlePaste fired. items:',
        items ? Array.from(items).map((item) => ({ kind: item.kind, type: item.type })) : 'no clipboardData.items',
      );
      if (!items) {
        return;
      }
      const imageItem = Array.from(items).find((item) => SUPPORTED_IMAGE_TYPES.includes(item.type));
      if (!imageItem) {
        return;
      }
      const file = imageItem.getAsFile();
      if (!file) {
        return;
      }
      event.preventDefault();
      void handlePastedImage(file);
    }

    // xterm's own internal paste handler (on its hidden textarea, inside
    // this container) calls stopPropagation() before our bubble-phase
    // listener would ever see the event. Listening on the capture phase
    // runs us first, before that internal handler gets a chance to stop it.
    container.addEventListener('paste', handlePaste, { capture: true });

    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        fitAddon.fit();
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      unsubscribe();
      container.removeEventListener('paste', handlePaste, { capture: true });
      terminal.dispose();
    };
  }, [taskId]);

  return <div ref={containerRef} data-task-id={taskId} className="h-full w-full p-2" />;
}
