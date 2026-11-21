// A ponte `window.duotoneMini` da janela do mini leitor (F6): o mesmo contrato
// do `electron/preloadMini.cjs` (tipos em `src/desktop/electron.d.ts`), sobre o
// `invoke` do Tauri. Só nesta janela (o `mini.rs` põe-na só no construtor dela)
// e só na origem da app com `?janela=mini`.
//
// Os movimentos do rato com a janela a deixar passar os cliques chegam pela
// casca (`mini:rato-em`) e entram como `mousemove` no documento: é o `forward`
// do `setIgnoreMouseEvents` do Electron, que o Tauri não tem.
(() => {
  if (window.top !== window || location.origin !== '__ORIGEM__' || !/[?&]janela=mini\b/.test(location.search) || window.duotoneMini) return;
  const invoke = (comando, args) => window.__TAURI_INTERNALS__.invoke(comando, args);
  const pedir = (comando, args) => invoke(comando, args).catch(() => {});
  const ouvintes = new Map();
  const ouvir = (nome, f) => {
    if (!ouvintes.has(nome)) ouvintes.set(nome, new Set());
    ouvintes.get(nome).add(f);
    return () => { ouvintes.get(nome)?.delete(f); };
  };
  // O Rust chama isto (webview.eval) para entregar um acontecimento ao mini.
  Object.defineProperty(window, '__duotoneEvento', {
    value: (nome, dados) => { for (const f of ouvintes.get(nome) ?? []) { try { f(dados); } catch (e) {} } },
    configurable: false, writable: false,
  });
  ouvir('mini:rato-em', (p) => {
    if (!p) return;
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: Number(p.x) || 0, clientY: Number(p.y) || 0, bubbles: true }));
  });
  window.duotoneMini = Object.freeze({
    onEstado: (listener) => { const sair = ouvir('mini:estado', listener); pedir('mini_pronto', {}); return sair; },
    onTamanho: (listener) => ouvir('mini:tamanho', (v) => listener(Boolean(v))),
    onJanela: (listener) => ouvir('mini:janela', (v) => listener(Boolean(v))),
    onAncora: (listener) => ouvir('mini:ancora', (a) => listener(
      a && a.vertical === 'cima' ? 'cima' : 'baixo',
      a && a.horizontal === 'esquerda' ? 'esquerda' : 'direita',
    )),
    onRato: (listener) => ouvir('mini:rato', (v) => listener(Boolean(v))),
    onEscala: (listener) => ouvir('mini:escala', (e) => listener(Number(e) || 1)),
    pega: (fase) => pedir('mini_pega', { fase: String(fase) }),
    lista: (abrir) => pedir('mini_lista', { abrir: abrir === true }),
    onListaFechada: (listener) => ouvir('mini:lista-fechada', () => listener()),
    ignorarRato: (sim) => pedir('mini_ignorar_rato', { sim: sim === true }),
    comando: (comando) => pedir('mini_comando', { comando }),
  });
})();
