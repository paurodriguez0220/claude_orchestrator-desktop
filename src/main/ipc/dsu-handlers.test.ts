import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StoreData } from '../../shared/types';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const mkdirMock = vi.fn();
const writeFileMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
}));

vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

let store: StoreData = { repos: [], tasks: [] };

vi.mock('../services/store', () => ({
  readStore: vi.fn(async () => store),
}));

const cutoffFixture = new Date(2026, 6, 8, 0, 0, 0, 0);

vi.mock('../services/git-service', () => ({
  getLastWorkingDayCutoff: vi.fn(() => cutoffFixture),
  getCommitSubjectsSince: vi.fn(),
}));

vi.mock('../services/dsu-service', () => ({
  generateDsuSummary: vi.fn(async () => '## Summary\nDid stuff.'),
}));

vi.mock('../paths', () => ({
  getStorePath: () => 'C:\\fake\\store.json',
  getDsuSummaryPath: (date: string) => `C:\\fake\\dsu\\${date}.md`,
}));

import { registerDsuHandlers } from './dsu-handlers';
import { IpcChannels } from '../../shared/ipc-channels';
import { getCommitSubjectsSince } from '../services/git-service';
import { generateDsuSummary } from '../services/dsu-service';

describe('dsu-handlers', () => {
  beforeEach(() => {
    handlers.clear();
    mkdirMock.mockReset();
    writeFileMock.mockReset();
    vi.mocked(getCommitSubjectsSince).mockReset();
    vi.mocked(generateDsuSummary).mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 9, 10, 0, 0));
    registerDsuHandlers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('collects commit subjects per non-scratch task, skips tasks with zero commits, and writes the result', async () => {
    store = {
      repos: [],
      tasks: [
        {
          id: 'task-1',
          repoId: 'repo-1',
          title: 'Fix login bug',
          worktreePath: 'C:\\demo-worktrees\\fix-login-bug',
          status: 'in-progress',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
        {
          id: 'task-2',
          repoId: 'repo-1',
          title: 'Untouched task',
          worktreePath: 'C:\\demo-worktrees\\untouched',
          status: 'todo',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
        {
          id: 'task-3',
          title: 'Quick question',
          worktreePath: 'C:\\fake\\scratch\\task-3',
          status: 'todo',
          kind: 'scratch',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
    };
    vi.mocked(getCommitSubjectsSince).mockImplementation(async (worktreePath: string) =>
      worktreePath === 'C:\\demo-worktrees\\fix-login-bug' ? ['fix: handle empty input'] : [],
    );

    const handler = handlers.get(IpcChannels.GenerateDsuSummary);
    const result = await handler?.({});

    expect(getCommitSubjectsSince).toHaveBeenCalledWith('C:\\demo-worktrees\\fix-login-bug', cutoffFixture);
    expect(getCommitSubjectsSince).toHaveBeenCalledWith('C:\\demo-worktrees\\untouched', cutoffFixture);
    expect(getCommitSubjectsSince).not.toHaveBeenCalledWith('C:\\fake\\scratch\\task-3', expect.anything());
    expect(generateDsuSummary).toHaveBeenCalledWith([
      { title: 'Fix login bug', commitSubjects: ['fix: handle empty input'] },
    ]);
    expect(mkdirMock).toHaveBeenCalledWith('C:\\fake\\dsu', { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith('C:\\fake\\dsu\\2026-07-09.md', '## Summary\nDid stuff.', 'utf-8');
    expect(result).toEqual({ markdown: '## Summary\nDid stuff.', filePath: 'C:\\fake\\dsu\\2026-07-09.md' });
  });

  it('skips a task whose git log fails (e.g. a removed worktree) instead of failing the whole request', async () => {
    store = {
      repos: [],
      tasks: [
        {
          id: 'task-1',
          repoId: 'repo-1',
          title: 'Stale task',
          worktreePath: 'C:\\gone',
          status: 'todo',
          kind: 'worktree',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
    };
    vi.mocked(getCommitSubjectsSince).mockRejectedValueOnce(new Error('not a git repository'));

    const handler = handlers.get(IpcChannels.GenerateDsuSummary);
    const result = await handler?.({});

    expect(generateDsuSummary).toHaveBeenCalledWith([]);
    expect(result).toEqual({ markdown: '## Summary\nDid stuff.', filePath: 'C:\\fake\\dsu\\2026-07-09.md' });
  });
});
