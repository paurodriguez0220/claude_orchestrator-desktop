import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { IpcChannels } from '../../shared/ipc-channels';
import type {
  TaskCreateRequest,
  TaskCreateResult,
  TaskNotesSetRequest,
  TaskNotesGetResponse,
  TaskSetStatusRequest,
  TaskLinkAdoRequest,
  AdoSyncTasksRequest,
  AdoSyncResult,
} from '../../shared/ipc-channels';
import type { TaskRecord } from '../../shared/types';
import { readStore, writeStore } from '../services/store';
import { assertAdoAuthenticated } from '../services/ado-service';
import { syncTasksToAdo } from '../services/ado-sync-service';
import {
  addWorktree,
  addWorktreeFromRef,
  addWorktreeForExistingBranch,
  removeWorktree,
  fetchRepo,
  getDefaultBranch,
} from '../services/git-service';
import { slugify, assertSafeBranchName } from '../services/slug';
import { readTaskNotes, writeTaskNotes, archiveTaskNotes } from '../services/notes-service';
import { spawnClaudeSession, isSessionAlive, killSession } from '../services/pty-manager';
import { openInVsCode } from '../services/editor-service';
import { queueDsuAutoRegenerate } from '../services/dsu-orchestrator';
import { getStorePath, getTaskNotesPath, getWorktreePath, getScratchPath } from '../paths';

export function registerTaskHandlers(onPtyData: (taskId: string, data: string) => void): void {
  ipcMain.handle(IpcChannels.TaskCreate, async (_event, request: TaskCreateRequest): Promise<TaskCreateResult> => {
    const store = await readStore(getStorePath());

    if (request.kind === 'scratch') {
      const taskId = randomUUID();
      const worktreePath = getScratchPath(taskId);
      await mkdir(worktreePath, { recursive: true });

      const now = new Date().toISOString();
      const task: TaskRecord = {
        id: taskId,
        title: request.title,
        adoIds: request.adoId ? [request.adoId] : undefined,
        worktreePath,
        status: 'todo',
        kind: 'scratch',
        createdAt: now,
        updatedAt: now,
      };
      store.tasks.push(task);
      await writeStore(getStorePath(), store);
      await writeTaskNotes(getTaskNotesPath(task.id), {
        frontmatter: {
          title: task.title,
          adoIds: task.adoIds,
          worktreePath: task.worktreePath,
          status: task.status,
          kind: task.kind,
        },
        body: '',
      });
      spawnClaudeSession(task.id, task.worktreePath, false, onPtyData);
      return task;
    }

    const repo = store.repos.find((candidate) => candidate.id === request.repoId);
    if (!repo) {
      throw new Error(`Unknown repo: ${request.repoId}`);
    }
    const existingBranch = request.existingBranch;
    const slug = existingBranch !== undefined ? slugify(existingBranch) : slugify(request.title);
    const branch = existingBranch !== undefined ? existingBranch : (request.branch ?? `${request.branchPrefix ?? 'feature/'}${slug}`);
    assertSafeBranchName(branch);

    const duplicateTask = store.tasks.find(
      (candidate) => candidate.repoId === repo.id && candidate.branch === branch,
    );
    if (duplicateTask) {
      throw new Error(
        `A task for branch "${branch}" already exists ("${duplicateTask.title}"). Open it from the sidebar instead of creating a new one.`,
      );
    }

    const worktreePath = getWorktreePath(repo.path, repo.name, slug);

    let baseUpdateWarning: string | undefined;

    if (existingBranch !== undefined) {
      // Resuming an existing branch — attach to it as-is, no rebasing of the base.
      await addWorktreeForExistingBranch(repo.path, worktreePath, branch);
    } else if (repo.updateBaseOnCreate === false) {
      // Opted out per repo: branch from the main clone's current HEAD (legacy).
      await addWorktree(repo.path, worktreePath, branch);
    } else {
      // Default: fetch and branch from the remote default branch so the new
      // worktree starts fresh. If the remote is unreachable, fall back to the
      // local HEAD rather than blocking task creation, and surface a warning.
      let startPoint: string | undefined;
      try {
        await fetchRepo(repo.path);
        startPoint = `origin/${await getDefaultBranch(repo.path)}`;
      } catch {
        baseUpdateWarning = "Couldn't reach the remote — branched from your local copy instead.";
      }
      if (startPoint !== undefined) {
        await addWorktreeFromRef(repo.path, worktreePath, branch, startPoint);
      } else {
        await addWorktree(repo.path, worktreePath, branch);
      }
    }

    const now = new Date().toISOString();
    const task: TaskRecord = {
      id: randomUUID(),
      repoId: repo.id,
      title: request.title,
      adoIds: request.adoId ? [request.adoId] : undefined,
      branch,
      worktreePath,
      status: 'todo',
      kind: request.kind ?? 'worktree',
      createdAt: now,
      updatedAt: now,
    };
    store.tasks.push(task);
    await writeStore(getStorePath(), store);
    await writeTaskNotes(getTaskNotesPath(task.id), {
      frontmatter: {
        title: task.title,
        adoIds: task.adoIds,
        branch: task.branch,
        worktreePath: task.worktreePath,
        status: task.status,
        kind: task.kind,
      },
      body: '',
    });
    spawnClaudeSession(task.id, task.worktreePath, false, onPtyData);
    // baseUpdateWarning is transient (renderer-only) and deliberately not part
    // of the persisted TaskRecord above.
    return baseUpdateWarning === undefined ? task : { ...task, baseUpdateWarning };
  });

  ipcMain.handle(IpcChannels.TaskList, async (): Promise<TaskRecord[]> => {
    const store = await readStore(getStorePath());
    return store.tasks;
  });

  ipcMain.handle(IpcChannels.TaskOpen, async (_event, taskId: string): Promise<void> => {
    if (isSessionAlive(taskId)) {
      return;
    }
    const store = await readStore(getStorePath());
    const task = store.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    spawnClaudeSession(taskId, task.worktreePath, true, onPtyData);
  });

  ipcMain.handle(IpcChannels.TaskOpenInEditor, async (_event, taskId: string): Promise<void> => {
    const store = await readStore(getStorePath());
    const task = store.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    await openInVsCode(task.worktreePath);
  });

  ipcMain.handle(IpcChannels.TaskClose, async (_event, taskId: string): Promise<void> => {
    killSession(taskId);
    const store = await readStore(getStorePath());
    const task = store.tasks.find((candidate) => candidate.id === taskId);
    if (task && task.kind !== 'scratch') {
      void queueDsuAutoRegenerate();
    }
  });

  ipcMain.handle(IpcChannels.TaskRemove, async (_event, taskId: string): Promise<void> => {
    const store = await readStore(getStorePath());
    const task = store.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    killSession(taskId);
    if (task.kind === 'scratch') {
      await rm(task.worktreePath, { recursive: true, force: true });
    } else {
      const repo = store.repos.find((candidate) => candidate.id === task.repoId);
      if (!repo) {
        throw new Error(`Unknown repo: ${task.repoId}`);
      }
      await removeWorktree(repo.path, task.worktreePath);
    }
    store.tasks = store.tasks.filter((candidate) => candidate.id !== taskId);
    await writeStore(getStorePath(), store);
    await archiveTaskNotes(getTaskNotesPath(taskId));
    if (task.kind !== 'scratch') {
      void queueDsuAutoRegenerate();
    }
  });

  ipcMain.handle(IpcChannels.TaskNotesGet, async (_event, taskId: string): Promise<TaskNotesGetResponse> => {
    const notes = await readTaskNotes(getTaskNotesPath(taskId));
    return { body: notes.body, status: notes.frontmatter.status };
  });

  ipcMain.handle(IpcChannels.TaskNotesSet, async (_event, request: TaskNotesSetRequest): Promise<void> => {
    const notes = await readTaskNotes(getTaskNotesPath(request.taskId));
    await writeTaskNotes(getTaskNotesPath(request.taskId), { ...notes, body: request.body });
  });

  ipcMain.handle(
    IpcChannels.TaskSetStatus,
    async (_event, request: TaskSetStatusRequest): Promise<void> => {
      const notesPath = getTaskNotesPath(request.taskId);
      const notes = await readTaskNotes(notesPath);
      await writeTaskNotes(notesPath, {
        ...notes,
        frontmatter: { ...notes.frontmatter, status: request.status },
      });
      const store = await readStore(getStorePath());
      const task = store.tasks.find((candidate) => candidate.id === request.taskId);
      if (task) {
        task.status = request.status;
        await writeStore(getStorePath(), store);
      }
    },
  );

  // Links/unlinks an ADO work item id on an existing worktree, keeping the
  // store record and the notes frontmatter in sync. Returns the updated list.
  async function updateAdoIds(taskId: string, mutate: (ids: string[]) => string[]): Promise<string[]> {
    const store = await readStore(getStorePath());
    const task = store.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    const next = mutate(task.adoIds ?? []);
    task.adoIds = next.length > 0 ? next : undefined;
    task.updatedAt = new Date().toISOString();
    await writeStore(getStorePath(), store);

    const notesPath = getTaskNotesPath(taskId);
    const notes = await readTaskNotes(notesPath);
    await writeTaskNotes(notesPath, {
      ...notes,
      frontmatter: { ...notes.frontmatter, adoIds: task.adoIds },
    });
    return next;
  }

  ipcMain.handle(IpcChannels.TaskLinkAdo, async (_event, request: TaskLinkAdoRequest): Promise<string[]> => {
    const adoId = request.adoId.trim();
    if (adoId === '') {
      throw new Error('ADO id must not be empty');
    }
    return updateAdoIds(request.taskId, (ids) => (ids.includes(adoId) ? ids : [...ids, adoId]));
  });

  ipcMain.handle(IpcChannels.TaskUnlinkAdo, async (_event, request: TaskLinkAdoRequest): Promise<string[]> => {
    return updateAdoIds(request.taskId, (ids) => ids.filter((id) => id !== request.adoId));
  });

  // Explicit, user-triggered sync of a worktree's tasks.md to ADO. A dry run
  // reports what would be created; a real run asserts auth, creates the child
  // work items, and links the parent + each created id onto the worktree so the
  // panel reflects them. Never invoked automatically.
  ipcMain.handle(IpcChannels.AdoSyncTasks, async (_event, request: AdoSyncTasksRequest): Promise<AdoSyncResult> => {
    const store = await readStore(getStorePath());
    const task = store.tasks.find((candidate) => candidate.id === request.taskId);
    if (!task) {
      throw new Error(`Unknown task: ${request.taskId}`);
    }
    if (!request.dryRun) {
      await assertAdoAuthenticated();
    }
    const result = await syncTasksToAdo(task.worktreePath, { dryRun: request.dryRun });
    if (!request.dryRun) {
      const toLink = [
        ...(result.parentId !== undefined ? [String(result.parentId)] : []),
        ...result.created.map((item) => String(item.id)),
      ];
      for (const adoId of toLink) {
        await updateAdoIds(request.taskId, (ids) => (ids.includes(adoId) ? ids : [...ids, adoId]));
      }
    }
    return result;
  });

  ipcMain.handle(IpcChannels.TaskSearch, async (_event, query: string): Promise<string[]> => {
    const store = await readStore(getStorePath());
    const needle = query.toLowerCase();
    const inMemoryMatchIds = store.tasks
      .filter(
        (task) =>
          task.title.toLowerCase().includes(needle) ||
          (task.branch ?? '').toLowerCase().includes(needle) ||
          (task.adoIds ?? []).some((id) => id.toLowerCase().includes(needle)),
      )
      .map((task) => task.id);
    if (inMemoryMatchIds.length > 0) {
      return inMemoryMatchIds;
    }

    const matchingIds: string[] = [];
    for (const task of store.tasks) {
      let body = '';
      try {
        body = (await readTaskNotes(getTaskNotesPath(task.id))).body;
      } catch {
        body = '';
      }
      if (body.toLowerCase().includes(needle)) {
        matchingIds.push(task.id);
      }
    }
    return matchingIds;
  });
}
