const { contextBridge, ipcRenderer } = require('electron');

/**
 * A ponte da janela do mini leitor (electron/miniLeitor.cjs). Pequena de
 * propósito: recebe o resumo do que toca e manda comandos de uma lista fechada
 * -- quem valida é o processo principal. Não tem nada da ponte da janela
 * principal (sessão, Discord, atualizações, EQ).
 */
contextBridge.exposeInMainWorld('duotoneMini', Object.freeze({
  /** O resumo do que toca (título, artista, capa, a tocar, posição). Pede o último ao ligar. */
  onEstado: (listener) => {
    const handler = (_event, resumo) => listener(resumo);
    ipcRenderer.on('mini:estado', handler);
    ipcRenderer.send('mini:pronto');
    return () => ipcRenderer.removeListener('mini:estado', handler);
  },
  /** Compacto (false) ou expandido (true). */
  onTamanho: (listener) => {
    const handler = (_event, expandido) => listener(Boolean(expandido));
    ipcRenderer.on('mini:tamanho', handler);
    return () => ipcRenderer.removeListener('mini:tamanho', handler);
  },
  /** A janela principal está à vista? (o botão ao lado do X é um interruptor) */
  onJanela: (listener) => {
    const handler = (_event, visivel) => listener(Boolean(visivel));
    ipcRenderer.on('mini:janela', handler);
    return () => ipcRenderer.removeListener('mini:janela', handler);
  },
  /** Para que lado da janela a barra recolhida se encosta: 'cima' ou 'baixo'. */
  onAncora: (listener) => {
    const handler = (_event, ancora) => listener(ancora === 'cima' ? 'cima' : 'baixo');
    ipcRenderer.on('mini:ancora', handler);
    return () => ipcRenderer.removeListener('mini:ancora', handler);
  },
  /** O rato está em cima da janela do mini? (o processo principal é que sabe) */
  onRato: (listener) => {
    const handler = (_event, dentro) => listener(Boolean(dentro));
    ipcRenderer.on('mini:rato', handler);
    return () => ipcRenderer.removeListener('mini:rato', handler);
  },
  /** Deixar o rato passar pela parte transparente (a barra recolhida). */
  ignorarRato: (sim) => ipcRenderer.send('mini:ignorar-rato', sim === true),
  comando: (comando) => ipcRenderer.send('mini:comando', comando),
}));
