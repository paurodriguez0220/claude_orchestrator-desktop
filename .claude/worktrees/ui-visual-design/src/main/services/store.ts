import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StoreData } from '../../shared/types';

export async function readStore(storePath: string): Promise<StoreData> {
  try {
    const raw = await readFile(storePath, 'utf-8');
    return JSON.parse(raw) as StoreData;
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
