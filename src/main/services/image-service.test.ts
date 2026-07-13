import { describe, it, expect, vi, beforeEach } from 'vitest';

const mkdirMock = vi.fn();
const writeFileMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

import { saveClipboardImage, readClipboardImageDataUrl } from './image-service';

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

describe('readClipboardImageDataUrl', () => {
  it('returns undefined when the clipboard has no image', () => {
    const fakeClipboard = { readImage: () => ({ isEmpty: () => true }) } as Parameters<
      typeof readClipboardImageDataUrl
    >[0];
    expect(readClipboardImageDataUrl(fakeClipboard)).toBeUndefined();
  });

  it('returns the PNG data URL when the clipboard has an image', () => {
    const fakeClipboard = {
      readImage: () => ({ isEmpty: () => false, toDataURL: () => 'data:image/png;base64,AAAA' }),
    } as Parameters<typeof readClipboardImageDataUrl>[0];
    expect(readClipboardImageDataUrl(fakeClipboard)).toBe('data:image/png;base64,AAAA');
  });
});
