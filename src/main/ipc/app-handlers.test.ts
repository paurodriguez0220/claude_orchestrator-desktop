import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
  app: {
    getVersion: () => '0.1.0',
  },
}));

import { registerAppHandlers } from './app-handlers';
import { IpcChannels } from '../../shared/ipc-channels';

describe('app-handlers', () => {
  beforeEach(() => {
    handlers.clear();
    registerAppHandlers();
  });

  it('GetAppVersion returns the Electron app version', async () => {
    const handler = handlers.get(IpcChannels.GetAppVersion);
    const result = await handler?.({});
    expect(result).toBe('0.1.0');
  });
});
