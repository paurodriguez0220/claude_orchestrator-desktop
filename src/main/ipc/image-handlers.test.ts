import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

const readImageMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
  clipboard: {
    readImage: (...args: unknown[]) => readImageMock(...args),
  },
}));

vi.mock('../services/image-service', () => ({
  saveClipboardImage: vi.fn(async () => 'C:\\fake\\pasted-images\\abc.png'),
  readClipboardImageDataUrl: vi.fn(() => 'data:image/png;base64,AAAA'),
}));

vi.mock('../paths', () => ({
  getPastedImagesDir: () => 'C:\\fake\\pasted-images',
}));

import { registerImageHandlers } from './image-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { saveClipboardImage, readClipboardImageDataUrl } from '../services/image-service';
import { clipboard } from 'electron';

describe('image-handlers', () => {
  beforeEach(() => {
    handlers.clear();
    readImageMock.mockClear();
    vi.mocked(saveClipboardImage).mockClear();
    vi.mocked(readClipboardImageDataUrl).mockClear().mockReturnValue('data:image/png;base64,AAAA');
    registerImageHandlers();
  });

  it('SaveClipboardImage delegates to saveClipboardImage with the pasted-images directory', async () => {
    const handler = handlers.get(IpcChannels.SaveClipboardImage);
    const result = await handler?.({}, 'data:image/png;base64,aGVsbG8=');
    expect(saveClipboardImage).toHaveBeenCalledWith('data:image/png;base64,aGVsbG8=', 'C:\\fake\\pasted-images');
    expect(result).toBe('C:\\fake\\pasted-images\\abc.png');
  });

  it('ReadClipboardImage delegates to readClipboardImageDataUrl with the real clipboard', () => {
    const handler = handlers.get(IpcChannels.ReadClipboardImage);
    const result = handler?.({});
    expect(readClipboardImageDataUrl).toHaveBeenCalledWith(clipboard);
    expect(result).toBe('data:image/png;base64,AAAA');
  });

  it('ReadClipboardImage returns undefined when the clipboard has no image', () => {
    vi.mocked(readClipboardImageDataUrl).mockReturnValue(undefined);
    const handler = handlers.get(IpcChannels.ReadClipboardImage);
    const result = handler?.({});
    expect(result).toBeUndefined();
  });
});
