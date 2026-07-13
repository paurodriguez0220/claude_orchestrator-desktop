import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import type { AdoWorkItem } from '../../shared/ipc-channels';
import { assertAdoAuthenticated, getAdoConfig, listMyAssignedTasks } from '../services/ado-service';

export function registerAdoHandlers(): void {
  ipcMain.handle(IpcChannels.AdoListMyTasks, async (_event, email?: string): Promise<AdoWorkItem[]> => {
    await assertAdoAuthenticated();
    return listMyAssignedTasks(email);
  });

  ipcMain.handle(IpcChannels.AdoConfig, async (): Promise<{ organization: string; project: string }> => {
    return getAdoConfig();
  });
}
