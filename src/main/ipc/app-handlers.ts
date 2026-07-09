import { app, ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';

export function registerAppHandlers(): void {
  ipcMain.handle(IpcChannels.GetAppVersion, async (): Promise<string> => {
    return app.getVersion();
  });
}
