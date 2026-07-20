import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import { getAdoConfig } from '../services/ado-service';

export function registerAdoHandlers(): void {
  ipcMain.handle(IpcChannels.AdoConfig, async (): Promise<{ organization: string; project: string }> => {
    return getAdoConfig();
  });
}
