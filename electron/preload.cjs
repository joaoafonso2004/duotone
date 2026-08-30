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
  /** Aplica os ganhos do equalizador dentro do frame do YouTube. Devolve
   * `{ ok }` — o renderer precisa de saber se pegou, para nao mostrar um EQ
   * ligado que nao esta a fazer nada. */
  aplicarEqualizador: (ganhos) => ipcRenderer.invoke('eq:aplicar', ganhos),
  showContextMenu: (items) => ipcRenderer.send('context-menu', items),
  onContextMenuSelection: (listener) => {
    const handler = (_event, id) => listener(String(id));
    ipcRenderer.on('context-menu:selected', handler);
    return () => ipcRenderer.removeListener('context-menu:selected', handler);
  },
  onMediaKeyPlayPause: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('media:play-pause', handler);
    return () => ipcRenderer.removeListener('media:play-pause', handler);
  },
  onMediaKeyNext: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('media:next', handler);
    return () => ipcRenderer.removeListener('media:next', handler);
  },
  onMediaKeyPrev: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('media:prev', handler);
    return () => ipcRenderer.removeListener('media:prev', handler);
  },
}));
