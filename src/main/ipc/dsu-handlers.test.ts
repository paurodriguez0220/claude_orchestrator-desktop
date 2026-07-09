import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
}));

vi.mock('../services/dsu-orchestrator', () => ({
  generateAndSaveDsu: vi.fn(async (date: string) => ({
    markdown: '## Summary\nDid stuff.',
    filePath: `C:\\fake\\dsu\\${date}.md`,
  })),
}));

import { registerDsuHandlers } from './dsu-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { generateAndSaveDsu } from '../services/dsu-orchestrator';

describe('dsu-handlers', () => {
  beforeEach(() => {
    handlers.clear();
    vi.mocked(generateAndSaveDsu).mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 9, 10, 0, 0));
    registerDsuHandlers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delegates a valid, non-future date to generateAndSaveDsu and returns its result', async () => {
    const handler = handlers.get(IpcChannels.GenerateDsuSummary);
    const result = await handler?.({}, '2026-07-08');
    expect(generateAndSaveDsu).toHaveBeenCalledWith('2026-07-08');
    expect(result).toEqual({ markdown: '## Summary\nDid stuff.', filePath: 'C:\\fake\\dsu\\2026-07-08.md' });
  });

  it('accepts today as the maximum selectable date', async () => {
    const handler = handlers.get(IpcChannels.GenerateDsuSummary);
    await handler?.({}, '2026-07-09');
    expect(generateAndSaveDsu).toHaveBeenCalledWith('2026-07-09');
  });

  it('rejects a malformed date without generating', async () => {
    const handler = handlers.get(IpcChannels.GenerateDsuSummary);
    await expect(handler?.({}, 'yesterday')).rejects.toThrow('Invalid DSU date');
    expect(generateAndSaveDsu).not.toHaveBeenCalled();
  });

  it('rejects a future date without generating', async () => {
    const handler = handlers.get(IpcChannels.GenerateDsuSummary);
    await expect(handler?.({}, '2026-07-10')).rejects.toThrow('DSU date cannot be in the future');
    expect(generateAndSaveDsu).not.toHaveBeenCalled();
  });
});
