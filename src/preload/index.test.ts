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

  it('onTaskFinishedStateChanged registers a listener on the task:finished-state-changed channel', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    const listener = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api.onTaskFinishedStateChanged as any)(listener);
    expect(ipcRendererOn).toHaveBeenCalledWith('task:finished-state-changed', expect.any(Function));
  });

  it('onTaskFinishedStateChanged returns an unsubscribe function that removes the same listener', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    const listener = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribe = (api.onTaskFinishedStateChanged as any)(listener) as () => void;
    expect(typeof unsubscribe).toBe('function');

    const registeredHandler = ipcRendererOn.mock.calls[ipcRendererOn.mock.calls.length - 1]?.[1];

    unsubscribe();

    expect(ipcRendererRemoveListener).toHaveBeenCalledWith('task:finished-state-changed', registeredHandler);
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

  it('setRepoUpdateBase invokes the RepoSetUpdateBase channel with the request', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.setRepoUpdateBase as any)('repo-1', false);
    expect(ipcRendererInvoke).toHaveBeenCalledWith('repo:set-update-base', {
      repoId: 'repo-1',
      updateBaseOnCreate: false,
    });
  });

  it('saveClipboardImage invokes the SaveClipboardImage channel with the data URL', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.saveClipboardImage as any)('data:image/png;base64,aGVsbG8=');
    expect(ipcRendererInvoke).toHaveBeenCalledWith('image:save-clipboard', 'data:image/png;base64,aGVsbG8=');
  });

  it('readClipboardImage invokes the ReadClipboardImage channel', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.readClipboardImage as any)();
    expect(ipcRendererInvoke).toHaveBeenCalledWith('image:read-clipboard');
  });

  it('getAppVersion invokes the GetAppVersion channel', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.getAppVersion as any)();
    expect(ipcRendererInvoke).toHaveBeenCalledWith('app:get-version');
  });

  it('setTaskStatus invokes the TaskSetStatus channel with the request', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.setTaskStatus as any)({ taskId: 'task-1', status: 'done' });
    expect(ipcRendererInvoke).toHaveBeenCalledWith('task:set-status', { taskId: 'task-1', status: 'done' });
  });

  it('linkAdo invokes the TaskLinkAdo channel with the taskId and adoId', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.linkAdo as any)('task-1', '1234');
    expect(ipcRendererInvoke).toHaveBeenCalledWith('task:link-ado', { taskId: 'task-1', adoId: '1234' });
  });

  it('unlinkAdo invokes the TaskUnlinkAdo channel with the taskId and adoId', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.unlinkAdo as any)('task-1', '1234');
    expect(ipcRendererInvoke).toHaveBeenCalledWith('task:unlink-ado', { taskId: 'task-1', adoId: '1234' });
  });

  it('taskSearch invokes the TaskSearch channel with the query string', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.taskSearch as any)('login');
    expect(ipcRendererInvoke).toHaveBeenCalledWith('task:search', 'login');
  });

  it('openTaskInEditor invokes the TaskOpenInEditor channel with the task id', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.openTaskInEditor as any)('task-1');
    expect(ipcRendererInvoke).toHaveBeenCalledWith('task:open-in-editor', 'task-1');
  });

  it('generateDsuSummary invokes the GenerateDsuSummary channel', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.generateDsuSummary as any)('2026-07-08');
    expect(ipcRendererInvoke).toHaveBeenCalledWith('dsu:generate', '2026-07-08');
  });

  it('listAdoTasks invokes the AdoListMyTasks channel with the email', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.listAdoTasks as any)('x@y.z');
    expect(ipcRendererInvoke).toHaveBeenCalledWith('ado:list-my-tasks', 'x@y.z');
  });

  it('getAdoConfig invokes the AdoConfig channel', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.getAdoConfig as any)();
    expect(ipcRendererInvoke).toHaveBeenCalledWith('ado:config');
  });

  it('createAdoWorkItem invokes the AdoCreateWorkItem channel with the request', async () => {
    await import('./index');
    const call = exposeInMainWorld.mock.calls[0];
    if (!call) throw new Error('exposeInMainWorld not called');
    const api = call[1] as Record<string, (...a: unknown[]) => unknown>;
    const request = { type: 'Task', title: 'Fix login' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (api.createAdoWorkItem as any)(request);
    expect(ipcRendererInvoke).toHaveBeenCalledWith('ado:create-work-item', request);
  });
});
