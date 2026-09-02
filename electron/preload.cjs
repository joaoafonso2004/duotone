const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('duotoneDesktop', Object.freeze({
  platform: process.platform,
  getStartup: () => ipcRenderer.invoke('startup:get'),
  setStartup: (enabled, mode) => ipcRenderer.invoke('startup:set', enabled, mode),
  notifyMessage: (message) => ipcRenderer.send('notification:message', message),
  onNotificationClick: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('notification:open', handler);
    return () => ipcRenderer.removeListener('notification:open', handler);
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (listener) => {
    const handler = (_event, value) => listener(Boolean(value));
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },
  /** Aplica `{ ganhos, compensacao }` dentro do frame do YouTube. Devolve
   * `{ ok }` — o renderer precisa de saber se pegou, para nao mostrar um EQ
   * ligado que nao esta a fazer nada. A `compensacao` e a margem que impede a
   * curva de cortar a onda. */
  aplicarEqualizador: (ajuste) => ipcRenderer.invoke('eq:aplicar', ajuste),
  /** Poe o `preservesPitch` a false dentro do frame do YouTube. Sem isto o
   * browser estica o tempo para manter o tom, e a camara lenta enche-se de
   * artefactos. */
  naoEsticarOTempo: () => ipcRenderer.invoke('player:preservar-tom'),
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
