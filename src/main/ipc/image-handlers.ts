import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import { saveClipboardImage } from '../services/image-service';
import { getPastedImagesDir } from '../paths';

export function registerImageHandlers(): void {
  ipcMain.handle(IpcChannels.SaveClipboardImage, async (_event, dataUrl: string): Promise<string> => {
    return saveClipboardImage(dataUrl, getPastedImagesDir());
  });
}
