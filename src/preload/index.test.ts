import { describe, it, expect, vi } from 'vitest';

const exposeInMainWorld = vi.fn();
const ipcRendererInvoke = vi.fn();
const ipcRendererSend = vi.fn();
const ipcRendererOn = vi.fn();
const ipcRendererRemoveListener = vi.fn();

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: {
    invoke: ipcRendererInvoke,
    send: ipcRendererSend,
    on: ipcRendererOn,
    removeListener: ipcRendererRemoveListener,
  },
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

  it('onPtyOutput returns an unsubscribe function that removes the same listener', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    const listener = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribe = (api.onPtyOutput as any)(listener) as () => void;
    expect(typeof unsubscribe).toBe('function');

    const registeredHandler = ipcRendererOn.mock.calls[ipcRendererOn.mock.calls.length - 1]?.[1];

    unsubscribe();

    expect(ipcRendererRemoveListener).toHaveBeenCalledWith('pty:output', registeredHandler);
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

  it('listBranches invokes the RepoBranches channel with the repoId', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.listBranches as any)('repo-1');
    expect(ipcRendererInvoke).toHaveBeenCalledWith('repo:branches', 'repo-1');
  });

  it('resizePty sends taskId/cols/rows on the PtyResize channel', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api.resizePty as any)('task-1', 120, 40);
    expect(ipcRendererSend).toHaveBeenCalledWith('pty:resize', { taskId: 'task-1', cols: 120, rows: 40 });
  });

  it('fetchRepo invokes the RepoFetch channel with the repoId', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.fetchRepo as any)('repo-1');
    expect(ipcRendererInvoke).toHaveBeenCalledWith('repo:fetch', 'repo-1');
  });
});
