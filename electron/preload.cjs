const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('duotoneDesktop', Object.freeze({
  platform: process.platform,
  getStartup: () => ipcRenderer.invoke('startup:get'),
  setStartup: (enabled, mode) => ipcRenderer.invoke('startup:set', enabled, mode),
  notifyMessage: (message) => ipcRenderer.send('notification:message', message),
  onNotificationClick: (listener) => {
    const handler = (_event, conversation) => listener(conversation);
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
  /** Pesquisa no YouTube pelo processo principal, que nao tem CORS. Feita
   * no renderer, o preflight leva 403 e a chamada morre antes da resposta. */
  pesquisarNoYouTube: (pedido) => ipcRenderer.invoke('yt:pesquisa', pedido),
  /** O catalogo (Deezer) pelo processo principal, pela mesma razao: no
   * renderer a resposta vem sem `Access-Control-Allow-Origin` e o browser
   * deita-a fora, o que deixava a descoberta toda vazia no Windows. Leva o
   * CAMINHO; o endereco e a lista de formas validas vivem do outro lado. */
  pedirAoCatalogo: (caminho) => ipcRenderer.invoke('catalogo:pedir', caminho),
  /** Mostra no Discord o que esta a tocar. `null` na actividade limpa; `null`
   * no id desliga. Devolve se o Discord esta do outro lado -- fechado e o caso
   * normal, e devolve false sem estragar nada. */
  definirPresencaNoDiscord: (clientId, actividade) => ipcRenderer.invoke('discord:presenca', clientId, actividade),
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
