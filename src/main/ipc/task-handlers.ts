import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { IpcChannels } from '../../shared/ipc-channels';
import type { TaskCreateRequest, TaskNotesSetRequest, TaskNotesGetResponse } from '../../shared/ipc-channels';
import type { TaskRecord } from '../../shared/types';
import { readStore, writeStore } from '../services/store';
import { addWorktree, addWorktreeForExistingBranch, removeWorktree } from '../services/git-service';
import { slugify, assertSafeBranchName } from '../services/slug';
import { readTaskNotes, writeTaskNotes, archiveTaskNotes } from '../services/notes-service';
import { spawnClaudeSession, isSessionAlive, killSession } from '../services/pty-manager';
import { getStorePath, getTaskNotesPath, getWorktreePath, getScratchPath } from '../paths';

export function registerTaskHandlers(onPtyData: (taskId: string, data: string) => void): void {
  ipcMain.handle(IpcChannels.TaskCreate, async (_event, request: TaskCreateRequest): Promise<TaskRecord> => {
    const store = await readStore(getStorePath());

    if (request.kind === 'scratch') {
      const taskId = randomUUID();
      const worktreePath = getScratchPath(taskId);
      await mkdir(worktreePath, { recursive: true });

      const now = new Date().toISOString();
      const task: TaskRecord = {
        id: taskId,
        title: request.title,
        adoId: request.adoId,
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
          adoId: task.adoId,
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
    const branch = existingBranch !== undefined ? existingBranch : (request.branch ?? `task/${slug}`);
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

    if (existingBranch !== undefined) {
      await addWorktreeForExistingBranch(repo.path, worktreePath, branch);
    } else {
      await addWorktree(repo.path, worktreePath, branch);
    }

    const now = new Date().toISOString();
    const task: TaskRecord = {
      id: randomUUID(),
      repoId: repo.id,
      title: request.title,
      adoId: request.adoId,
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
        adoId: task.adoId,
        branch: task.branch,
        worktreePath: task.worktreePath,
        status: task.status,
        kind: task.kind,
      },
      body: '',
    });
    spawnClaudeSession(task.id, task.worktreePath, false, onPtyData);
    return task;
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

  ipcMain.handle(IpcChannels.TaskClose, async (_event, taskId: string): Promise<void> => {
    killSession(taskId);
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
  });

  ipcMain.handle(IpcChannels.TaskNotesGet, async (_event, taskId: string): Promise<TaskNotesGetResponse> => {
    const notes = await readTaskNotes(getTaskNotesPath(taskId));
    return { body: notes.body, status: notes.frontmatter.status };
  });

  ipcMain.handle(IpcChannels.TaskNotesSet, async (_event, request: TaskNotesSetRequest): Promise<void> => {
    const notes = await readTaskNotes(getTaskNotesPath(request.taskId));
    await writeTaskNotes(getTaskNotesPath(request.taskId), { ...notes, body: request.body });
  });

  ipcMain.handle(IpcChannels.TaskSearch, async (_event, query: string): Promise<string[]> => {
    const store = await readStore(getStorePath());
    const needle = query.toLowerCase();
    const inMemoryMatchIds = store.tasks
      .filter(
        (task) =>
          task.title.toLowerCase().includes(needle) ||
          task.branch.toLowerCase().includes(needle) ||
          (task.adoId ?? '').toLowerCase().includes(needle),
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
