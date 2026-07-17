import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, RendererApi } from '../shared/ipc'
import type { DungeonParameters } from '../generator'

const api: RendererApi = {
  getInitialState: () => ipcRenderer.invoke('app:init'),
  generate: (params: DungeonParameters, seed?: number) => ipcRenderer.invoke('dungeon:generate', params, seed),
  installToHammerwatch: () => ipcRenderer.invoke('dungeon:install'),
  exportFolder: () => ipcRenderer.invoke('dungeon:export-folder'),
  exportZip: () => ipcRenderer.invoke('dungeon:export-zip'),
  pickHammerwatchPath: () => ipcRenderer.invoke('settings:pick-path'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
  importParametersTxt: () => ipcRenderer.invoke('params:import'),
  exportParametersTxt: (params: DungeonParameters) => ipcRenderer.invoke('params:export', params)
}

contextBridge.exposeInMainWorld('api', api)
