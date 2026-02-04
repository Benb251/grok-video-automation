import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { AutomationService } from './services/AutomationService'

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Automation Service
  let automationService: AutomationService | null = null;
  let mainWindow: BrowserWindow | null = null;

  mainWindow = createWindow()

  ipcMain.handle('automation:init', async (_, accountsFolder, config) => {
    automationService = new AutomationService(accountsFolder, config, {
      onLog: (msg) => mainWindow?.webContents.send('automation:log', msg),
      onProgress: (data) => mainWindow?.webContents.send('automation:progress', data),
      onWorkerUpdate: (data) => mainWindow?.webContents.send('automation:worker-update', data),
      onError: (msg) => mainWindow?.webContents.send('automation:error', msg)
    });
    await automationService.initialize();

    return true;
  });

  ipcMain.handle('automation:scanProject', async (_, projectPath) => {
    const fs = require('fs');
    const path = require('path');

    if (!fs.existsSync(projectPath)) throw new Error('Project folder not found');

    // Find Script (.txt)
    const files = fs.readdirSync(projectPath);
    const scriptFile = files.find(f => f.endsWith('.txt'));
    if (!scriptFile) throw new Error('No script file (.txt) found in project folder');

    // Check Image folder
    const imagesPath = path.join(projectPath, 'image');
    if (!fs.existsSync(imagesPath)) throw new Error("'image' folder not found in project folder");

    return {
      scriptPath: path.join(projectPath, scriptFile),
      imagesPath: imagesPath
    };
  });

  ipcMain.handle('automation:start', async (_, scriptPath, imagesFolder) => {
    if (!automationService) throw new Error('Service not initialized');
    automationService.startBatch(scriptPath, imagesFolder).catch(err => {
      mainWindow?.webContents.send('automation:error', err.message);
    });
    return true;
  });

  ipcMain.handle('automation:stop', async () => {
    if (automationService) {
      automationService.stop();
    }
  });

  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
