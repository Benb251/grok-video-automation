import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  automation: {
    init: (accountsFolder: string, config: any) => ipcRenderer.invoke('automation:init', accountsFolder, config),
    scanProject: (projectPath: string) => ipcRenderer.invoke('automation:scanProject', projectPath),
    start: (scriptPath: string, imagesFolder: string) => ipcRenderer.invoke('automation:start', scriptPath, imagesFolder),
    updatePrompt: (scriptPath: string, sceneNumber: number, newPrompt: string) => ipcRenderer.invoke('automation:updatePrompt', scriptPath, sceneNumber, newPrompt),
    retry: (scriptPath: string, imagesFolder: string, sceneNumbers: number[]) => ipcRenderer.invoke('automation:retry', scriptPath, imagesFolder, sceneNumbers),
    stop: () => ipcRenderer.invoke('automation:stop'),
    onLog: (callback: (msg: string) => void) => ipcRenderer.on('automation:log', (_, msg) => callback(msg)),
    onProgress: (callback: (data: any) => void) => ipcRenderer.on('automation:progress', (_, data) => callback(data)),
    onWorkerUpdate: (callback: (data: any) => void) => ipcRenderer.on('automation:worker-update', (_, data) => callback(data)),
    onError: (callback: (msg: string) => void) => ipcRenderer.on('automation:error', (_, msg) => callback(msg)),
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('automation:log')
      ipcRenderer.removeAllListeners('automation:progress')
      ipcRenderer.removeAllListeners('automation:error')
    }
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
