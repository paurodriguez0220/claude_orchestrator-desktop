import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
}));

vi.mock('../services/ado-service', () => ({
  getAdoConfig: vi.fn(async () => ({ organization: 'https://dev.azure.com/myorg', project: 'MyProject' })),
}));

import { registerAdoHandlers } from './ado-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { getAdoConfig } from '../services/ado-service';

describe('ado-handlers', () => {
  beforeEach(() => {
    handlers.clear();
    vi.mocked(getAdoConfig)
      .mockClear()
      .mockResolvedValue({ organization: 'https://dev.azure.com/myorg', project: 'MyProject' });
    registerAdoHandlers();
  });

  it('AdoConfig returns getAdoConfig()\'s value', async () => {
    const handler = handlers.get(IpcChannels.AdoConfig);
    const result = await handler?.({});
    expect(getAdoConfig).toHaveBeenCalled();
    expect(result).toEqual({ organization: 'https://dev.azure.com/myorg', project: 'MyProject' });
  });
});
