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
