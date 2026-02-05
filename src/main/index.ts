import { app, shell, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'

import { AutomationService } from './services/AutomationService'
import { parseScriptFile, updateScriptScene } from './services/ScriptParser'
import path from 'path'
import fs from 'fs'

// Inline implementation to avoid @electron-toolkit/utils initialization bug
const isDev = !app.isPackaged

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
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// Register custom protocol privileges MUST be done before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true, stream: true } }
])

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  app.setAppUserModelId('com.grok-desktop')

  // Register 'media' protocol for local file access (Robust checking)
  protocol.registerFileProtocol('media', (request, callback) => {
    try {
      // Decode URL to handle spaces and special chars
      // request.url comes in as media://... or media:///...

      const urlObj = new URL(request.url);
      let filePath = decodeURIComponent(urlObj.pathname);

      // Handle drive letter as hostname (e.g. media://c/Windows/...)
      // This happens if Chrome parses media://d/path where 'd' is host
      if (process.platform === 'win32' && urlObj.hostname && /^[a-zA-Z]$/.test(urlObj.hostname)) {
        filePath = `${urlObj.hostname}:${filePath}`;
      }
      // Handle drive letter in pathname (e.g. media:///C:/Windows/... or /C:/...)
      else if (process.platform === 'win32' && filePath.startsWith('/') && /^[a-zA-Z]:/.test(filePath.slice(1))) {
        filePath = filePath.slice(1);
      }

      console.log(`[Media Protocol] Request: ${request.url} -> FilePath: ${filePath}`);
      // Callback with object { path: ... } is strict for registerFileProtocol
      return callback({ path: filePath });

    } catch (error) {
      console.error('[Media Protocol] Error:', error);
    }
  });

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // Default open or close DevTools by F12
  app.on('browser-window-created', (_, window) => {
    window.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') {
        window.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
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

    const fullScriptPath = path.join(projectPath, scriptFile);
    let scenes = parseScriptFile(fullScriptPath);

    // Map images to scenes
    try {
      const imageFiles = fs.readdirSync(imagesPath);
      scenes = scenes.map(scene => {
        // Look for image matching scene number (e.g. "1.png", "Scene 1.png")
        const match = imageFiles.find(f => {
          const num = f.match(/\d+/);
          return num && parseInt(num[0]) === scene.sceneNumber;
        });

        return {
          ...scene,
          imagePath: match ? path.join(imagesPath, match) : undefined
        };
      });
    } catch (e) {
      console.error('Error mapping images:', e);
    }

    return {
      scriptPath: fullScriptPath,
      imagesPath: imagesPath,
      scenes: scenes
    };
  });

  ipcMain.handle('automation:start', async (_, scriptPath, imagesFolder) => {
    if (!automationService) throw new Error('Service not initialized');
    automationService.startBatch(scriptPath, imagesFolder).catch(err => {
      mainWindow?.webContents.send('automation:error', err.message);
    });
    return true;
  });

  ipcMain.handle('automation:updatePrompt', async (_, projectPath, sceneNumber, newPrompt) => {
    // Logic to find the script file in the directory
    if (fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory()) {
      const files = fs.readdirSync(projectPath);
      const scriptFile = files.find(f => f.endsWith('.txt'));
      if (scriptFile) {
        const fullScriptPath = path.join(projectPath, scriptFile);
        return updateScriptScene(fullScriptPath, sceneNumber, newPrompt);
      }
    }
    // Fallback: If it's already a file path (or failed to find), try directly
    return updateScriptScene(projectPath, sceneNumber, newPrompt);
  });

  ipcMain.handle('automation:retry', async (_, scriptPath, imagesFolder, sceneNumbers) => {
    if (!automationService) throw new Error('Service not initialized');
    // Force retry for specific scenes
    automationService.startBatch(scriptPath, imagesFolder, {
      specificScenes: sceneNumbers,
      force: true
    }).catch(err => {
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
