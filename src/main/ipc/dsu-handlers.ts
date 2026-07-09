import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import type { DsuGenerateResponse } from '../../shared/ipc-channels';
import { isValidDateStamp, toDateStamp } from '../../shared/dates';
import { generateAndSaveDsu } from '../services/dsu-orchestrator';

export function registerDsuHandlers(): void {
  ipcMain.handle(
    IpcChannels.GenerateDsuSummary,
    async (_event, date: string): Promise<DsuGenerateResponse> => {
      if (!isValidDateStamp(date)) {
        throw new Error(`Invalid DSU date: ${date}`);
      }
      if (date > toDateStamp(new Date())) {
        throw new Error('DSU date cannot be in the future');
      }
      return generateAndSaveDsu(date);
    },
  );
}
