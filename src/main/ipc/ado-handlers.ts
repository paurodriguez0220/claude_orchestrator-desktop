import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import type { AdoWorkItem, AdoCreateWorkItemRequest, AdoCreateWorkItemResult } from '../../shared/ipc-channels';
import { assertAdoAuthenticated, getAdoConfig, listMyAssignedTasks, createWorkItem } from '../services/ado-service';

export function registerAdoHandlers(): void {
  ipcMain.handle(IpcChannels.AdoListMyTasks, async (_event, email?: string): Promise<AdoWorkItem[]> => {
    await assertAdoAuthenticated();
    return listMyAssignedTasks(email);
  });

  ipcMain.handle(IpcChannels.AdoConfig, async (): Promise<{ organization: string; project: string }> => {
    return getAdoConfig();
  });

  ipcMain.handle(
    IpcChannels.AdoCreateWorkItem,
    async (_event, request: AdoCreateWorkItemRequest): Promise<AdoCreateWorkItemResult> => {
      await assertAdoAuthenticated();
      return createWorkItem(request);
    },
  );
}
