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

    container.addEventListener('paste', handlePaste);

    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        fitAddon.fit();
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      unsubscribe();
      container.removeEventListener('paste', handlePaste);
      terminal.dispose();
    };
  }, [taskId]);

  return <div ref={containerRef} data-task-id={taskId} className="h-full w-full p-2" />;
}
