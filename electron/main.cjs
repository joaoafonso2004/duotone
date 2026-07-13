const { app, BrowserWindow, ipcMain, Menu, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const isDev = !app.isPackaged;
let mainWindow = null;

protocol.registerSchemesAsPrivileged([{
  scheme: 'duotone',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

function registerAppProtocol() {
  const webRoot = path.resolve(__dirname, '..', 'dist-web');
  protocol.handle('duotone', (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^[/\\]+/, '');
    const file = path.resolve(webRoot, relative);
    if (file !== webRoot && !file.startsWith(`${webRoot}${path.sep}`)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function sendWindowState(win) {
  win.webContents.send('window:maximized', win.isMaximized());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Duotone',
    frame: false,
    show: false,
    backgroundColor: '#09090d',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => sendWindowState(win));
  win.on('unmaximize', () => sendWindowState(win));
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith('http://localhost:8081') : url.startsWith('duotone://app');
    if (!allowed) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  if (isDev) win.loadURL(process.env.DUOTONE_DEV_URL || 'http://localhost:8081');
  else win.loadURL('duotone://app/index.html');
  mainWindow = win;
}

ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.on('window:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
ipcMain.handle('window:is-maximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false);
ipcMain.on('context-menu', (event, items) => {
  const safeItems = Array.isArray(items) ? items.slice(0, 8) : [];
  Menu.buildFromTemplate(safeItems.map((item) => ({
    label: String(item.label || ''),
    enabled: item.enabled !== false,
    click: () => event.sender.send('context-menu:selected', String(item.id || '')),
  }))).popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  if (!isDev) registerAppProtocol();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
