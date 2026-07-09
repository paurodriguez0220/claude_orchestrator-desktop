import { ipcMain } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { IpcChannels } from '../../shared/ipc-channels';
import type { DsuGenerateResponse } from '../../shared/ipc-channels';
import { readStore } from '../services/store';
import { getLastWorkingDayCutoff, getCommitSubjectsSince } from '../services/git-service';
import { generateDsuSummary } from '../services/dsu-service';
import type { TaskCommitSummary } from '../services/dsu-service';
import { getStorePath, getDsuSummaryPath } from '../paths';

function todayDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function registerDsuHandlers(): void {
  ipcMain.handle(IpcChannels.GenerateDsuSummary, async (): Promise<DsuGenerateResponse> => {
    const store = await readStore(getStorePath());
    const cutoff = getLastWorkingDayCutoff(new Date());

    const taskSummaries: TaskCommitSummary[] = [];
    for (const task of store.tasks) {
      if (task.kind === 'scratch') {
        continue;
      }
      let commitSubjects: string[];
      try {
        commitSubjects = await getCommitSubjectsSince(task.worktreePath, cutoff);
      } catch {
        continue;
      }
      if (commitSubjects.length > 0) {
        taskSummaries.push({ title: task.title, commitSubjects });
      }
    }

    const markdown = await generateDsuSummary(taskSummaries);
    const filePath = getDsuSummaryPath(todayDateStamp());
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, markdown, 'utf-8');
    return { markdown, filePath };
  });
}
