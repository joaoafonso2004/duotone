const { app, BrowserWindow, ipcMain, Menu, net, protocol, shell, Tray, globalShortcut } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const isDev = !app.isPackaged;
let mainWindow = null;
let tray = null;
let isQuitting = false;

protocol.registerSchemesAsPrivileged([{
  scheme: 'duotone',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

const http = require('node:http');
const fs = require('node:fs');

let localServer = null;
const SERVER_PORT = 18081;

function startLocalServer() {
  const webRoot = path.resolve(__dirname, '..', 'dist-web');
  localServer = http.createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    const safeUrlPath = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath).replace(/^[/\\]+/, '');
    const filePath = path.resolve(webRoot, safeUrlPath);
    
    if (!filePath.startsWith(webRoot)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    
    fs.readFile(filePath, (err, data) => {
      if (err) {
        fs.readFile(path.resolve(webRoot, 'index.html'), (err2, data2) => {
          if (err2) {
            res.statusCode = 404;
            res.end('Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data2);
          }
        });
      } else {
        const ext = path.extname(filePath).toLowerCase();
        let contentType = 'application/octet-stream';
        if (ext === '.html') contentType = 'text/html; charset=utf-8';
        else if (ext === '.js') contentType = 'application/javascript; charset=utf-8';
        else if (ext === '.css') contentType = 'text/css; charset=utf-8';
        else if (ext === '.json') contentType = 'application/json; charset=utf-8';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.gif') contentType = 'image/gif';
        else if (ext === '.svg') contentType = 'image/svg+xml; charset=utf-8';
        else if (ext === '.ico') contentType = 'image/x-icon';
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      }
    });
  });
  
  localServer.listen(SERVER_PORT, '127.0.0.1', () => {
    console.log(`Local production server listening on http://127.0.0.1:${SERVER_PORT}`);
  });
}

function sendWindowState(win) {
  win.webContents.send('window:maximized', win.isMaximized());
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Duotone',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Duotone');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
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
      webSecurity: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => sendWindowState(win));
  win.on('unmaximize', () => sendWindowState(win));
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith('http://localhost:8081') : (url.startsWith(`http://127.0.0.1:${SERVER_PORT}`) || url.startsWith(`http://localhost:${SERVER_PORT}`));
    if (!allowed) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  if (isDev) win.loadURL(process.env.DUOTONE_DEV_URL || 'http://localhost:8081');
  else win.loadURL(`http://localhost:${SERVER_PORT}/index.html`);
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

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  if (!isDev) startLocalServer();

  createWindow();
  createTray();

  try {
    globalShortcut.register('MediaPlayPause', () => {
      if (mainWindow) mainWindow.webContents.send('media:play-pause');
    });
    globalShortcut.register('MediaNextTrack', () => {
      if (mainWindow) mainWindow.webContents.send('media:next');
    });
    globalShortcut.register('MediaPreviousTrack', () => {
      if (mainWindow) mainWindow.webContents.send('media:prev');
    });
  } catch (e) {
    console.error('Could not register global shortcuts:', e);
  }

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
