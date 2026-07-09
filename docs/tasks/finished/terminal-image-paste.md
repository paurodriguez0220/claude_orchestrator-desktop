# Task: Paste images into the terminal

**Status:** Done

## Goal

Let a pasted image (e.g. a screenshot) reach Claude — today it silently does nothing.

## Context

Root-cause investigation (via `superpowers:systematic-debugging`) confirmed there is no clipboard/paste handling anywhere in the codebase (`grep -ri "paste|clipboard"` across `src/` returns zero matches). This is not a regression — it was never implemented. `TerminalTab` wraps xterm.js, which only handles plain-text paste out of the box (it reads `clipboardData.getData('text/plain')` via its own hidden textarea); it has no support for image clipboard data. A real native terminal (iTerm2, Windows Terminal) can special-case a pasted/dropped image because it owns the whole window; this app's terminal is a custom xterm.js instance inside Electron, which gives it the same opportunity — it just doesn't use it yet.

## Proposed Design

### Detection

`TerminalTab` adds a native `paste` event listener on the terminal's container element (separate from xterm.js's own internal paste handling — xterm's hidden input textarea is a descendant of the container, so its paste events bubble up and are observable there). On paste, it inspects `event.clipboardData.items` for an entry whose MIME type starts with `image/`. If none is found — the normal case, a text paste — nothing changes; the event proceeds and xterm.js handles it exactly as it does today. If an image entry is found, `event.preventDefault()` stops xterm's own (would-be-broken) text paste, and the image is handled as described below instead.

### Saving the image

The image `Blob` is read into a base64 data URL (`FileReader.readAsDataURL`) in the renderer, then sent to a new `SaveClipboardImage` IPC call: `saveClipboardImage(dataUrl: string): Promise<string>` (no `taskId` needed — the saved file isn't organized per-task). The main-process handler decodes the base64 payload, derives a file extension from the data URL's MIME prefix (`image/png` → `.png`, `image/jpeg` → `.jpg`, `image/gif` → `.gif`, `image/webp` → `.webp`; anything else is rejected with an error), and writes it to `claude-orchestrator/pasted-images/<uuid>.<ext>` (a new top-level folder under the existing runtime data root, alongside `repos/`/`tasks/`), returning the absolute path.

### Getting it to Claude

The renderer takes the returned path and sends it into that task's terminal via the existing `sendPtyInput(taskId, data)` — exactly as if it had been typed — wrapping it in double quotes if it contains a space. This mirrors how a real terminal behaves when you drag-and-drop a file into it: the path appears on the input line, and you press Enter yourself (along with typing anything else) when ready. Claude Code CLI reads the file at that path as an attached image once you send it.

## Non-Goals

- No automatic cleanup of old files under `pasted-images/` — flagged as a future improvement, not urgent for a personal single-user tool.
- No thumbnail/preview rendering inside the terminal itself.
- No support for multiple images in one paste event — only the first image item found is handled.
- No changes to xterm.js's existing text-paste behavior.

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasting an image into a task's terminal saves it to disk and types its file path into that terminal's input line.

**Architecture:** A new `image-service.ts` decodes a base64 data URL to a file under a new `pasted-images/` runtime directory (`paths.ts` gains `getPastedImagesDir()`). A new `SaveClipboardImage` IPC channel + `image-handlers.ts` wires that service to the renderer via preload. `TerminalTab` gains a `paste` event listener that detects image clipboard data, calls the new IPC channel, and forwards the resulting path into the PTY via the existing `sendPtyInput`.

**Tech Stack:** Same as the rest of the project — TypeScript strict, React 18, Node.js `fs/promises`, Vitest + React Testing Library, Electron IPC.

### Global Constraints

- TypeScript `strict: true`. No `any`. No unjustified non-null assertions.
- Named exports only, kebab-case filenames, one function/responsibility per concern.
- A normal text paste must be completely unaffected — the new paste listener only intervenes when an image MIME type is actually present in the clipboard data.
- The saved file's extension must be derived from the actual image MIME type, not assumed — an unrecognized image MIME type is rejected with a clear error, not silently mis-written.
- This plan's files do not overlap with `app.tsx`, `new-task-modal.tsx`, or `repo-sidebar.tsx` — it is safe to implement in parallel with other in-flight work touching those files.

---

### Task 1: `saveClipboardImage` service

**Files:**
- Modify: `src/main/paths.ts`
- Modify: `src/main/paths.test.ts`
- Create: `src/main/services/image-service.ts`
- Create: `src/main/services/image-service.test.ts`

**Interfaces:**
- Produces: `getPastedImagesDir(): string` in `paths.ts`. `saveClipboardImage(dataUrl: string, destinationDir: string): Promise<string>` in `image-service.ts` — decodes `dataUrl`, writes the file under `destinationDir`, returns the full written file path. Throws `Error` with a message starting `"Invalid image data URL"` if `dataUrl` doesn't match the `data:<mime>;base64,<data>` shape, or `"Unsupported image type: <mime>"` if the MIME type isn't one of `image/png`, `image/jpeg`, `image/gif`, `image/webp`.

- [ ] **Step 1: Write the failing path-helper test**

Add to `src/main/paths.test.ts`, inside the existing `describe('paths', ...)` block, and add `getPastedImagesDir` to the existing import line from `./paths`:

```ts
it('getPastedImagesDir points at pasted-images/ under the runtime root', () => {
  expect(getPastedImagesDir()).toBe(join(getRuntimeDataRoot(), 'pasted-images'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- paths`
Expected: FAIL — `getPastedImagesDir` is not exported by `./paths`

- [ ] **Step 3: Implement the path helper**

Add to `src/main/paths.ts`, right after the existing `getReposRoot` function:

```ts
export function getPastedImagesDir(): string {
  return join(getRuntimeDataRoot(), 'pasted-images');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:main -- paths`
Expected: PASS

- [ ] **Step 5: Write the failing image-service tests**

Create `src/main/services/image-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mkdirMock = vi.fn();
const writeFileMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

import { saveClipboardImage } from './image-service';

describe('saveClipboardImage', () => {
  beforeEach(() => {
    mkdirMock.mockReset();
    writeFileMock.mockReset();
  });

  it('writes a decoded PNG to the destination directory with a .png extension', async () => {
    const dataUrl = 'data:image/png;base64,aGVsbG8=';
    const result = await saveClipboardImage(dataUrl, 'C:\\fake\\pasted-images');
    expect(mkdirMock).toHaveBeenCalledWith('C:\\fake\\pasted-images', { recursive: true });
    expect(writeFileMock).toHaveBeenCalledOnce();
    const [writtenPath, writtenBuffer] = writeFileMock.mock.calls[0] as [string, Buffer];
    expect(writtenPath.startsWith('C:\\fake\\pasted-images')).toBe(true);
    expect(writtenPath.endsWith('.png')).toBe(true);
    expect(Buffer.isBuffer(writtenBuffer)).toBe(true);
    expect(writtenBuffer.toString('utf-8')).toBe('hello');
    expect(result).toBe(writtenPath);
  });

  it('maps image/jpeg to a .jpg extension', async () => {
    const dataUrl = 'data:image/jpeg;base64,aGVsbG8=';
    const result = await saveClipboardImage(dataUrl, 'C:\\fake\\pasted-images');
    expect(result.endsWith('.jpg')).toBe(true);
  });

  it('rejects an unsupported image type', async () => {
    const dataUrl = 'data:image/bmp;base64,aGVsbG8=';
    await expect(saveClipboardImage(dataUrl, 'C:\\fake\\pasted-images')).rejects.toThrow(
      'Unsupported image type: image/bmp',
    );
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed data URL', async () => {
    await expect(saveClipboardImage('not-a-data-url', 'C:\\fake\\pasted-images')).rejects.toThrow(
      'Invalid image data URL',
    );
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test:main -- image-service`
Expected: FAIL — cannot find module `./image-service` (file doesn't exist yet)

- [ ] **Step 7: Implement the service**

Create `src/main/services/image-service.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export async function saveClipboardImage(dataUrl: string, destinationDir: string): Promise<string> {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error('Invalid image data URL');
  }
  const mimeType = match[1]!;
  const base64Data = match[2]!;
  const extension = MIME_TO_EXTENSION[mimeType];
  if (!extension) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }
  await mkdir(destinationDir, { recursive: true });
  const filePath = join(destinationDir, `${randomUUID()}.${extension}`);
  await writeFile(filePath, Buffer.from(base64Data, 'base64'));
  return filePath;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run test:main -- image-service`
Expected: PASS (all 4 tests)

- [ ] **Step 9: Run the full main suite and both typecheck projects**

Run: `npm run test:main`
Expected: all pass

Run these two SEPARATELY (not via `npm run typecheck`, whose `&&` chaining skips the second command if the first fails):
- `npx tsc --noEmit -p tsconfig.json`
- `npx tsc --noEmit -p tsconfig.node.json`
Expected: no errors in the four files this task touches (other pre-existing errors elsewhere, if any, are not this task's concern)

- [ ] **Step 10: Commit**

```bash
git add src/main/paths.ts src/main/paths.test.ts src/main/services/image-service.ts src/main/services/image-service.test.ts
git commit -m "feat: add saveClipboardImage service for decoding pasted images to disk"
```

---

### Task 2: `SaveClipboardImage` IPC channel

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Create: `src/main/ipc/image-handlers.ts`
- Create: `src/main/ipc/image-handlers.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.test.ts`

**Interfaces:**
- Consumes: `saveClipboardImage` from `../services/image-service` (Task 1), `getPastedImagesDir` from `../paths` (Task 1).
- Produces: `IpcChannels.SaveClipboardImage = 'image:save-clipboard'`. `registerImageHandlers(): void` in `image-handlers.ts`. `saveClipboardImage(dataUrl: string): Promise<string>` added to the preload's `ClaudeOrchestratorApi`.

- [ ] **Step 1: Add the IPC channel**

In `src/shared/ipc-channels.ts`, add `SaveClipboardImage` to the `IpcChannels` object, right after `DialogSelectFolder`:

```ts
  DialogSelectFolder: 'dialog:select-folder',
  SaveClipboardImage: 'image:save-clipboard',
} as const;
```

- [ ] **Step 2: Write the failing image-handlers test**

Create `src/main/ipc/image-handlers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
}));

vi.mock('../services/image-service', () => ({
  saveClipboardImage: vi.fn(async () => 'C:\\fake\\pasted-images\\abc.png'),
}));

vi.mock('../paths', () => ({
  getPastedImagesDir: () => 'C:\\fake\\pasted-images',
}));

import { registerImageHandlers } from './image-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { saveClipboardImage } from '../services/image-service';

describe('image-handlers', () => {
  beforeEach(() => {
    handlers.clear();
    vi.mocked(saveClipboardImage).mockClear();
    registerImageHandlers();
  });

  it('SaveClipboardImage delegates to saveClipboardImage with the pasted-images directory', async () => {
    const handler = handlers.get(IpcChannels.SaveClipboardImage);
    const result = await handler?.({}, 'data:image/png;base64,aGVsbG8=');
    expect(saveClipboardImage).toHaveBeenCalledWith('data:image/png;base64,aGVsbG8=', 'C:\\fake\\pasted-images');
    expect(result).toBe('C:\\fake\\pasted-images\\abc.png');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:main -- image-handlers`
Expected: FAIL — cannot find module `./image-handlers`

- [ ] **Step 4: Implement the handler**

Create `src/main/ipc/image-handlers.ts`:

```ts
import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import { saveClipboardImage } from '../services/image-service';
import { getPastedImagesDir } from '../paths';

export function registerImageHandlers(): void {
  ipcMain.handle(IpcChannels.SaveClipboardImage, async (_event, dataUrl: string): Promise<string> => {
    return saveClipboardImage(dataUrl, getPastedImagesDir());
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:main -- image-handlers`
Expected: PASS

- [ ] **Step 6: Wire the handler into app startup**

In `src/main/index.ts`, add the import alongside the existing ones:

```ts
import { registerImageHandlers } from './ipc/image-handlers';
```

Add the call inside `app.whenReady().then(() => { ... })`, right after `registerTaskHandlers(broadcastPtyData);` (before or after `startTranscriptExportScheduler(...)` if present — order between these two doesn't matter):

```ts
  registerRepoHandlers();
  registerTaskHandlers(broadcastPtyData);
  registerImageHandlers();
```

- [ ] **Step 7: Write the failing preload test**

Add to `src/preload/index.test.ts`:

```ts
it('saveClipboardImage invokes the SaveClipboardImage channel with the data URL', async () => {
  await import('./index');
  const call = exposeInMainWorld.mock.calls[0];
  if (!call) throw new Error('exposeInMainWorld not called');
  const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (api.saveClipboardImage as any)('data:image/png;base64,aGVsbG8=');
  expect(ipcRendererInvoke).toHaveBeenCalledWith('image:save-clipboard', 'data:image/png;base64,aGVsbG8=');
});
```

- [ ] **Step 8: Run test to verify it fails**

Run whichever command covers `src/preload/index.test.ts` (check `package.json`/vitest config `include` patterns — Task 2 of the `code-review-task-kind` plan already identified this for a prior `preload` addition; use the same command here).
Expected: FAIL — `saveClipboardImage` is not a property of the exposed API

- [ ] **Step 9: Implement**

In `src/preload/index.ts`, add `saveClipboardImage` to the `ClaudeOrchestratorApi` interface (right after `onPtyOutput`) and to the `api` object:

```ts
export interface ClaudeOrchestratorApi {
  selectFolder(): Promise<string | undefined>;
  addRepo(path: string): Promise<RepoRecord>;
  cloneRepo(url: string, name: string): Promise<RepoRecord>;
  listRepos(): Promise<RepoRecord[]>;
  listBranches(repoId: string): Promise<BranchOption[]>;
  fetchRepo(repoId: string): Promise<void>;
  createTask(request: TaskCreateRequest): Promise<TaskRecord>;
  listTasks(): Promise<TaskRecord[]>;
  openTask(taskId: string): Promise<void>;
  closeTask(taskId: string): Promise<void>;
  removeTask(taskId: string): Promise<void>;
  getTaskNotes(taskId: string): Promise<TaskNotesGetResponse>;
  setTaskNotes(request: TaskNotesSetRequest): Promise<void>;
  sendPtyInput(taskId: string, data: string): void;
  resizePty(taskId: string, cols: number, rows: number): void;
  onPtyOutput(listener: (event: PtyOutputEvent) => void): () => void;
  saveClipboardImage(dataUrl: string): Promise<string>;
}
```

```ts
  onPtyOutput: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: PtyOutputEvent): void => listener(payload);
    ipcRenderer.on(IpcChannels.PtyOutput, handler);
    return () => ipcRenderer.removeListener(IpcChannels.PtyOutput, handler);
  },
  saveClipboardImage: (dataUrl) => ipcRenderer.invoke(IpcChannels.SaveClipboardImage, dataUrl),
};
```

(Note: `fetchRepo` may or may not already be present in this interface depending on whether the `code-review-task-kind` plan has merged yet — if it's there, keep it; if not, don't add it here, that's a different plan's concern. Only add `saveClipboardImage`.)

- [ ] **Step 10: Run test to verify it passes**

Run the same command as Step 8.
Expected: PASS

- [ ] **Step 11: Run the full suite and both typecheck projects separately**

Run: `npm test`
Expected: all pass

Run `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.node.json` SEPARATELY.
Expected: no errors in the six files this task touches

- [ ] **Step 12: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/ipc/image-handlers.ts src/main/ipc/image-handlers.test.ts src/main/index.ts src/preload/index.ts src/preload/index.test.ts
git commit -m "feat: add the SaveClipboardImage IPC channel end-to-end"
```

---

### Task 3: Detect and handle image paste in `TerminalTab`

**Files:**
- Modify: `src/renderer/components/terminal-tab/terminal-tab.tsx`
- Modify: `src/renderer/components/terminal-tab/terminal-tab.test.tsx`

**Interfaces:**
- Consumes: `window.claudeOrchestrator.saveClipboardImage(dataUrl: string): Promise<string>` (Task 2), `window.claudeOrchestrator.sendPtyInput(taskId, data)` (already exists).
- Produces: no new exports — internal behavior change to `TerminalTab` only.

This task depends on Task 2 being merged first (the preload API it calls must exist).

- [ ] **Step 1: Add the saveClipboardImage mock and write the failing tests**

In `src/renderer/components/terminal-tab/terminal-tab.test.tsx`, add a new mock near the existing `sendPtyInput`/`resizePty`/`onPtyOutput` consts:

```ts
const saveClipboardImage = vi.fn(async () => 'C:\\Users\\paulo.rodriguez\\claude-orchestrator\\pasted-images\\abc123.png');
```

Add `saveClipboardImage` to the `vi.stubGlobal('claudeOrchestrator', { sendPtyInput, resizePty, onPtyOutput });` call in `beforeEach`, making it `vi.stubGlobal('claudeOrchestrator', { sendPtyInput, resizePty, onPtyOutput, saveClipboardImage });`, and add `saveClipboardImage.mockClear();` alongside the other `.mockClear()` calls already in `beforeEach`.

Append these tests inside the existing `describe('TerminalTab', ...)` block:

```tsx
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

it('removes the paste listener on unmount', () => {
  const { container, unmount } = render(<TerminalTab taskId="task-1" />);
  const terminalContainer = container.querySelector('[data-task-id="task-1"]') as HTMLDivElement;
  const removeEventListenerSpy = vi.spyOn(terminalContainer, 'removeEventListener');
  unmount();
  expect(removeEventListenerSpy).toHaveBeenCalledWith('paste', expect.any(Function));
});
```

Add `waitFor` to the existing `import { render } from '@testing-library/react';` line at the top of the file, making it `import { render, waitFor } from '@testing-library/react';`.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm run test:renderer -- terminal-tab`
Expected: existing tests pass; the 4 new tests fail — no paste handling exists yet

- [ ] **Step 3: Implement**

In `src/renderer/components/terminal-tab/terminal-tab.tsx`, add the paste handler inside the existing `useEffect` (the one that creates the terminal), after the existing `terminal.onData(...)` block and before the `ResizeObserver` setup:

```tsx
    function readAsDataUrl(file: File): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }

    async function handlePastedImage(file: File): Promise<void> {
      const dataUrl = await readAsDataUrl(file);
      const filePath = await window.claudeOrchestrator.saveClipboardImage(dataUrl);
      const quotedPath = filePath.includes(' ') ? `"${filePath}"` : filePath;
      window.claudeOrchestrator.sendPtyInput(taskId, quotedPath);
    }

    function handlePaste(event: ClipboardEvent): void {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }
      const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'));
      if (!imageItem) {
        return;
      }
      event.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) {
        return;
      }
      void handlePastedImage(file);
    }

    container.addEventListener('paste', handlePaste);
```

Add `container.removeEventListener('paste', handlePaste);` to the effect's cleanup function (the one that already does `window.removeEventListener('resize', ...)`/`resizeObserver.disconnect()`/etc. — add this line alongside those, order doesn't matter relative to the others).

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm run test:renderer -- terminal-tab`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full suite and both typecheck projects separately**

Run: `npm test`
Expected: all pass

Run `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.node.json` SEPARATELY.
Expected: no errors in the two files this task touches

- [ ] **Step 6: Add a manual smoke-test step**

Add a new step to `docs/runbooks/manual-smoke-test.md` (append after the last existing numbered step, incrementing the number):

```
Copy a screenshot to the clipboard (e.g. Win+Shift+S), click into an open task's terminal, and paste (Ctrl+V) — confirm a file path appears on the terminal's input line (not garbled text or nothing), pointing at a new file under `%USERPROFILE%\claude-orchestrator\pasted-images\`. Open that file to confirm it's a valid, viewable image. Then paste some normal copied text — confirm it still pastes as plain text exactly as before.
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/terminal-tab/terminal-tab.tsx src/renderer/components/terminal-tab/terminal-tab.test.tsx docs/runbooks/manual-smoke-test.md
git commit -m "feat: detect pasted images in the terminal and forward their file path to claude"
```
