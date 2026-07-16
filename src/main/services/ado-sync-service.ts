import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AdoSyncCreated, AdoSyncResult } from '../../shared/ipc-channels';
import { parseTasksMarkdown, appendAdoIds } from './tasks-md-parser';
import { createWorkItem } from './ado-service';

// Reads a worktree's tasks.md, creates an ADO child work item for every item
// that has no `#id` marker yet (under the parent from the frontmatter), then
// writes the created ids back into the file so a re-run is idempotent. A dry
// run reports what would happen without any ADO call or file write.
//
// This is only ever invoked from an explicit user action (the Sync button) —
// the app never syncs to ADO automatically.
export async function syncTasksToAdo(
  worktreePath: string,
  options: { dryRun: boolean },
): Promise<AdoSyncResult> {
  const tasksPath = join(worktreePath, 'tasks.md');

  let content: string;
  try {
    content = await readFile(tasksPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('No tasks.md found in this worktree — create one before syncing to ADO.');
    }
    throw err;
  }

  const parsed = parseTasksMarkdown(content);
  const creatable = parsed.items.filter((item) => item.adoId === undefined);
  const skipped = parsed.items.length - creatable.length;

  if (options.dryRun) {
    return {
      parentId: parsed.parentId,
      toCreate: creatable.map((item) => ({ type: item.type, title: item.title })),
      created: [],
      skipped,
    };
  }

  const created: AdoSyncCreated[] = [];
  for (const item of creatable) {
    const result = await createWorkItem({
      type: item.type,
      title: item.title,
      ...(item.description ? { description: item.description } : {}),
      ...(parsed.parentId !== undefined ? { parentId: parsed.parentId } : {}),
    });
    created.push({ title: item.title, id: result.id, url: result.url });
  }

  if (created.length > 0) {
    await writeFile(tasksPath, appendAdoIds(content, created.map((c) => c.id)), 'utf-8');
  }

  return { parentId: parsed.parentId, toCreate: [], created, skipped };
}
