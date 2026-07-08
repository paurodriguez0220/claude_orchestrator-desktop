import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { join } from 'node:path';
import { registerRepoHandlers } from './ipc/repo-handlers';
import { registerTaskHandlers } from './ipc/task-handlers';
import { registerImageHandlers } from './ipc/image-handlers';
import { startTranscriptExportScheduler } from './services/transcript-service';
import { IpcChannels } from '../shared/ipc-channels';

function broadcastPtyData(taskId: string, data: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.PtyOutput, { taskId, data });
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerRepoHandlers();
  registerTaskHandlers(broadcastPtyData);
  registerImageHandlers();
  startTranscriptExportScheduler(5 * 60 * 1000);

  ipcMain.on(IpcChannels.PtyInput, (_event, { taskId, data }: { taskId: string; data: string }) => {
    void import('./services/pty-manager').then(({ writeToSession }) => writeToSession(taskId, data));
  });

  ipcMain.on(IpcChannels.PtyResize, (_event, { taskId, cols, rows }: { taskId: string; cols: number; rows: number }) => {
    void import('./services/pty-manager').then(({ resizeSession }) => resizeSession(taskId, cols, rows));
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
