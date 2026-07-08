import { describe, it, expect, vi } from 'vitest';

const exposeInMainWorld = vi.fn();
const ipcRendererInvoke = vi.fn();
const ipcRendererSend = vi.fn();
const ipcRendererOn = vi.fn();

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke: ipcRendererInvoke, send: ipcRendererSend, on: ipcRendererOn },
}));

describe('preload', () => {
  it('exposes a "claudeOrchestrator" API on window', async () => {
    await import('./index');
    expect(exposeInMainWorld).toHaveBeenCalledWith('claudeOrchestrator', expect.any(Object));
  });

  it('addRepo invokes the RepoAdd channel', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.addRepo as any)('C:\\some\\path');
    expect(ipcRendererInvoke).toHaveBeenCalledWith('repo:add', { path: 'C:\\some\\path' });
  });

  it('onPtyOutput registers a listener on the pty:output channel', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    const listener = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api.onPtyOutput as any)(listener);
    expect(ipcRendererOn).toHaveBeenCalledWith('pty:output', expect.any(Function));
  });

  it('selectFolder invokes the DialogSelectFolder channel', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.selectFolder as any)();
    expect(ipcRendererInvoke).toHaveBeenCalledWith('dialog:select-folder');
  });
});
