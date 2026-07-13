import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Clipboard } from 'electron';

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

export function readClipboardImageDataUrl(clipboard: Pick<Clipboard, 'readImage'>): string | undefined {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    return undefined;
  }
  return image.toDataURL();
}
