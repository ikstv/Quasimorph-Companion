const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'data', 'missions.json');
const weaponsPath = path.join(__dirname, 'data', 'weapons.json');

contextBridge.exposeInMainWorld('QM', {
  getData: () => {
    try {
      return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (e) {
      return { error: String(e), storyMissions: [], procMissionTypes: [] };
    }
  },
  getWeapons: () => {
    try {
      return JSON.parse(fs.readFileSync(weaponsPath, 'utf8'));
    } catch {
      return null;
    }
  },
  getSave: (slot = 0) => ipcRenderer.invoke('save:read', slot),
  watchSave: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('save:changed', handler);
    ipcRenderer.send('save:watch:start');
    return () => {
      ipcRenderer.removeListener('save:changed', handler);
      ipcRenderer.send('save:watch:stop');
    };
  },
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close')
});
