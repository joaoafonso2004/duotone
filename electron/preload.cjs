const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('duotoneDesktop', Object.freeze({
  platform: process.platform,
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (listener) => {
    const handler = (_event, value) => listener(Boolean(value));
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },
  showContextMenu: (items) => ipcRenderer.send('context-menu', items),
  onContextMenuSelection: (listener) => {
    const handler = (_event, id) => listener(String(id));
    ipcRenderer.on('context-menu:selected', handler);
    return () => ipcRenderer.removeListener('context-menu:selected', handler);
  },
}));
