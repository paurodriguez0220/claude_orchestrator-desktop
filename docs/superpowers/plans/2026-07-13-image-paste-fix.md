# Image paste fix — read the clipboard image in the main process

*Date: 2026-07-13 · Diagnosed bug, targeted fix*

## Root cause (already investigated)

Pasting an image never saves anything — the `pasted-images` folder is never even created.
In `terminal-tab.tsx`, `pasteFromClipboard` uses the renderer's `navigator.clipboard.read()` to
detect an image among `['image/png','image/jpeg','image/gif','image/webp']`. In this Electron
build that call doesn't reliably expose the clipboard image, so the image branch never fires and
`handlePastedImage`/`saveClipboardImage` never run. Text paste works because it uses
`navigator.clipboard.readText()`, which is reliable.

## Fix

Read the clipboard image in the **main process** via Electron's `clipboard.readImage()` (reliable
on Windows, and aligns with the repo rule that the main process owns all system access). The
renderer stops using `navigator.clipboard.read()` for images entirely; it asks main for the image,
and only falls back to `navigator.clipboard.readText()` for text.

Keep the path insertion exactly as today (`sendPtyInput` with the quoted path) — the bug is
detection, not insertion; do not change that behavior.

## Changes (exact integration points)

### 1. `src/shared/ipc-channels.ts`
Add to the `IpcChannels` enum, next to `SaveClipboardImage`:
```ts
ReadClipboardImage: 'image:read-clipboard',
```

### 2. `src/main/services/image-service.ts`
Add a unit-testable reader that takes just the piece of the clipboard it needs (so tests inject a
fake). Returns a PNG data URL, or `undefined` when the clipboard has no image:
```ts
import type { Clipboard } from 'electron';

export function readClipboardImageDataUrl(clipboard: Pick<Clipboard, 'readImage'>): string | undefined {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    return undefined;
  }
  return image.toDataURL();
}
```
(`NativeImage.toDataURL()` returns a `data:image/png;base64,…` URL, which the existing
`saveClipboardImage` already accepts.)

### 3. `src/main/ipc/image-handlers.ts`
Register a handler that calls the reader with Electron's real `clipboard`:
```ts
import { clipboard, ipcMain } from 'electron';
// ...existing imports...
import { readClipboardImageDataUrl, saveClipboardImage } from '../services/image-service';

// inside registerImageHandlers(), alongside the existing SaveClipboardImage handler:
ipcMain.handle(IpcChannels.ReadClipboardImage, (): string | undefined => {
  return readClipboardImageDataUrl(clipboard);
});
```

### 4. `src/preload/index.ts`
Add to the exposed API type (near `saveClipboardImage`) and its implementation:
```ts
// type:
readClipboardImage(): Promise<string | undefined>;
// impl:
readClipboardImage: () => ipcRenderer.invoke(IpcChannels.ReadClipboardImage),
```

### 5. `src/renderer/components/terminal-tab/terminal-tab.tsx`
Rewrite `pasteFromClipboard` to ask main for the image first, then fall back to text. Remove the
`navigator.clipboard.read()` loop and the now-unused `SUPPORTED_IMAGE_TYPES` constant and the
`readAsDataUrl`/`handlePastedImage` blob helpers (the data URL now comes from main):
```ts
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
      terminal.paste(text);
    }
  } catch (err) {
    terminal.write(`\r\n[Failed to paste: ${toErrorMessage(err)}]\r\n`);
  }
}
```
Keep the existing capture-phase `paste` listener, the Ctrl+V swallow, and `terminal.paste(text)`
for text (that's the shipped multi-line fix) exactly as they are.

## Tests (TDD)

- **`src/main/services/image-service.test.ts`:** add cases for `readClipboardImageDataUrl` — a
  fake clipboard whose `readImage()` returns `{ isEmpty: () => true }` yields `undefined`; one
  returning `{ isEmpty: () => false, toDataURL: () => 'data:image/png;base64,AAAA' }` yields that
  data URL.
- **`src/main/ipc/image-handlers.test.ts`:** the `ReadClipboardImage` handler returns the reader's
  result (mock `electron`'s `clipboard.readImage`).
- **`src/renderer/components/terminal-tab/terminal-tab.test.tsx`:** update the existing image-paste
  tests — they currently drive `navigator.clipboard.read()`; now stub
  `window.claudeOrchestrator.readClipboardImage`. Cases:
  - image present → `readClipboardImage` returns a data URL → `saveClipboardImage` called with it →
    `sendPtyInput` called with the (quoted-if-spaced) path; `navigator.clipboard.readText` NOT called.
  - no image → `readClipboardImage` returns `undefined` → falls back to text via `terminal.paste`.
  - failure → error notice written to the terminal.
  Update/replace the old `clipboardRead`-based tests accordingly; keep the text-paste and
  paste-once (no doubling) tests.

## Verify
`npm run typecheck` clean; `npm test` green.

## Out of scope
Routing the inserted path through `terminal.paste` (bracketing) — unchanged; sending images as
raw bytes to Claude instead of a path — not how the app works.
