const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SAVE_DIR = process.env.QM_SAVE_DIR ||
  path.join(os.homedir(), 'AppData', 'LocalLow', 'Magnum Scriptum Ltd', 'Quasimorph');

function stripBOM(buf) {
  return (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)
    ? buf.slice(3) : buf;
}

async function readSaveJson(file) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const buf = await fs.promises.readFile(file);
      return JSON.parse(stripBOM(buf).toString('utf8'));
    } catch (e) {
      if (attempt === 0 && (e.code === 'EBUSY' || e.code === 'EPERM')) {
        await new Promise(r => setTimeout(r, 100));
        continue;
      }
      throw e;
    }
  }
}

async function readSaveSlot(slot) {
  const header = path.join(SAVE_DIR, `slot_${slot}_header.dat`);
  const session = path.join(SAVE_DIR, `slot_${slot}_session.dat`);
  if (!fs.existsSync(session)) return { ok: false, reason: 'no-save', dir: SAVE_DIR };
  try {
    const [h, s] = await Promise.all([
      fs.existsSync(header) ? readSaveJson(header) : Promise.resolve(null),
      readSaveJson(session)
    ]);
    return { ok: true, slot, header: h, session: s, dir: SAVE_DIR };
  } catch (e) {
    return { ok: false, reason: String(e.message || e), dir: SAVE_DIR };
  }
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0b0c0e',
    show: false,
    title: 'Quasimorph Companion',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
}

ipcMain.on('win:minimize', () => win && win.minimize());
ipcMain.on('win:maximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
});
ipcMain.on('win:close', () => win && win.close());

ipcMain.handle('save:read', (_e, slot = 0) => readSaveSlot(slot));

let saveWatcher = null;
let watchDebounce = null;
ipcMain.on('save:watch:start', (e) => {
  if (saveWatcher || !fs.existsSync(SAVE_DIR)) return;
  try {
    saveWatcher = fs.watch(SAVE_DIR, { persistent: false }, (_evt, name) => {
      if (!name || !/slot_\d+_(session|header)\.dat$/.test(name)) return;
      clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => e.sender.send('save:changed'), 200);
    });
  } catch { /* watch unavailable — renderer stays cold */ }
});
ipcMain.on('save:watch:stop', () => {
  if (saveWatcher) { try { saveWatcher.close(); } catch {} saveWatcher = null; }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
