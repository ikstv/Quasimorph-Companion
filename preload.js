const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'data', 'missions.json');

contextBridge.exposeInMainWorld('QM', {
  getData: () => {
    try {
      return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (e) {
      return { error: String(e), storyMissions: [], procMissionTypes: [] };
    }
  },
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close')
});
