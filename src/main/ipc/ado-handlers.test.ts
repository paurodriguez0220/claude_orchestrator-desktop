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
  assertAdoAuthenticated: vi.fn(async () => undefined),
  getAdoConfig: vi.fn(async () => ({ organization: 'https://dev.azure.com/myorg', project: 'MyProject' })),
  listMyAssignedTasks: vi.fn(async () => [
    { id: 101, title: 'Fix login', type: 'Bug', state: 'Active', areaPath: 'Proj\\Team', storyPoints: 3 },
  ]),
}));

import { registerAdoHandlers } from './ado-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { assertAdoAuthenticated, getAdoConfig, listMyAssignedTasks } from '../services/ado-service';

describe('ado-handlers', () => {
  beforeEach(() => {
    handlers.clear();
    vi.mocked(assertAdoAuthenticated).mockClear().mockResolvedValue(undefined);
    vi.mocked(getAdoConfig)
      .mockClear()
      .mockResolvedValue({ organization: 'https://dev.azure.com/myorg', project: 'MyProject' });
    vi.mocked(listMyAssignedTasks)
      .mockClear()
      .mockResolvedValue([
        { id: 101, title: 'Fix login', type: 'Bug', state: 'Active', areaPath: 'Proj\\Team', storyPoints: 3 },
      ]);
    registerAdoHandlers();
  });

  it('AdoListMyTasks checks auth then delegates to listMyAssignedTasks, returning its value', async () => {
    const handler = handlers.get(IpcChannels.AdoListMyTasks);
    const result = await handler?.({}, 'x@y.z');
    expect(assertAdoAuthenticated).toHaveBeenCalled();
    expect(listMyAssignedTasks).toHaveBeenCalledWith('x@y.z');
    expect(result).toEqual([
      { id: 101, title: 'Fix login', type: 'Bug', state: 'Active', areaPath: 'Proj\\Team', storyPoints: 3 },
    ]);
  });

  it('AdoConfig returns getAdoConfig()\'s value', async () => {
    const handler = handlers.get(IpcChannels.AdoConfig);
    const result = await handler?.({});
    expect(getAdoConfig).toHaveBeenCalled();
    expect(result).toEqual({ organization: 'https://dev.azure.com/myorg', project: 'MyProject' });
  });
});
