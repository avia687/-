// AutoEdit desktop shell: starts the local engine/server and shows the UI in a window.
// No terminal, no setup: double-click and use.
const { app, BrowserWindow, shell, safeStorage, dialog } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PREFERRED_PORT = 47321;
let win = null;
let srv = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

/** OS-level encryption for API keys / tokens (Windows DPAPI, macOS Keychain). */
function osCipher() {
  if (!safeStorage.isEncryptionAvailable()) return undefined;
  return {
    kind: 'os',
    encrypt: (text) => safeStorage.encryptString(text).toString('base64'),
    decrypt: (b64) => safeStorage.decryptString(Buffer.from(b64, 'base64')),
  };
}

function unpacked(p) { return p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`); }

async function start() {
  const { startServer } = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'server.js')).href);
  srv = await startServer({
    port: PREFERRED_PORT,
    dataDir: app.getPath('userData'),
    exportDir: path.join(app.getPath('videos'), 'AutoEdit'),
    fontsDir: unpacked(path.join(__dirname, '..', 'assets', 'fonts')),
    cipher: osCipher(),
    host: {
      desktop: true,
      reveal: (file) => shell.showItemInFolder(file),
      openExternal: (url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); },
    },
  });
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 980, minHeight: 640,
    backgroundColor: '#0b0b0e', title: 'AutoEdit', autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.once('ready-to-show', () => win.show());
  // Links to the web (Meta developer site, OAuth) open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(srv.url)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  await win.loadURL(srv.url);
}

app.whenReady().then(start).catch((err) => {
  dialog.showErrorBox('AutoEdit', 'AutoEdit could not start. Please restart your computer and try again.\n\n' + String(err && err.message));
  app.quit();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (srv) srv.close(); });
