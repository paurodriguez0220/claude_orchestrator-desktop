import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StoreData, TaskRecord } from '../../shared/types';

// Migrates a task record from the pre-multi-link shape: a single `adoId`
// string becomes a one-element `adoIds` list, and the legacy field is dropped.
function migrateTask(task: TaskRecord & { adoId?: string }): TaskRecord {
  if (task.adoIds === undefined && task.adoId) {
    const { adoId, ...rest } = task;
    return { ...rest, adoIds: [adoId] };
  }
  const { adoId: _legacy, ...rest } = task;
  return rest;
}

export async function readStore(storePath: string): Promise<StoreData> {
  try {
    const raw = await readFile(storePath, 'utf-8');
    const data = JSON.parse(raw) as StoreData;
    return { ...data, tasks: data.tasks.map(migrateTask) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { repos: [], tasks: [] };
    }
    throw err;
  }
}

export async function writeStore(storePath: string, data: StoreData): Promise<void> {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(data, null, 2), 'utf-8');
}
