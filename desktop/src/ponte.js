// A ponte `window.duotoneDesktop` da casca Tauri: o mesmo contrato do
// `electron/preload.cjs` (tipos em `src/desktop/electron.d.ts`), sobre o
// `invoke` do Tauri. Corre em TODOS os frames (wry >= 0.51), por isso só se monta
// no frame principal e na origem da app; noutro frame (o do YouTube) não faz nada,
// e a ACL do Tauri recusa-lhe os comandos na mesma.
//
// O que ainda não existe na casca fica DE FORA (undefined): o renderer usa a ponte
// com `?.` e trata a falta como "não há". Cada fase acrescenta o seu bocado.
// O `scripts/test-ponte-tauri.mjs` confere que cada chave daqui existe no preload.
(() => {
  if (window.top !== window || location.origin !== '__ORIGEM__' || window.duotoneDesktop) return;
  const invoke = (comando, args) => window.__TAURI_INTERNALS__.invoke(comando, args);
  // Os pedidos de rede (F3): um erro do Rust chega como texto; a página espera um Error.
  const pedir = (comando, args) => invoke(comando, args).catch((e) => { throw new Error(String(e)); });
  const ouvintes = new Map();
  const ouvir = (nome, f) => {
    if (!ouvintes.has(nome)) ouvintes.set(nome, new Set());
    ouvintes.get(nome).add(f);
    return () => ouvintes.get(nome).delete(f);
  };
  // O Rust chama isto (webview.eval) para entregar um acontecimento à página.
  Object.defineProperty(window, '__duotoneEvento', {
    value: (nome, dados) => { for (const f of ouvintes.get(nome) || []) { try { f(dados); } catch (e) { console.error(e); } } },
  });

  // A visibilidade da janela vem do Rust (prova P3: o WebView2 diz sempre "visible"
  // com a janela escondida). O que a app já faz com o `visibilitychange` (parar o
  // glitch, aliviar a memória, espaçar sincronizações) passa a obedecer.
  let visibilidade = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilidade });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => visibilidade !== 'visible' });
  ouvir('janela:visibilidade', (estado) => {
    const nova = estado === 'visible' ? 'visible' : 'hidden';
    if (nova === visibilidade) return;
    visibilidade = nova;
    document.dispatchEvent(new Event('visibilitychange'));
  });

  const ponte = {
    platform: 'win32',
    discordApplicationId: '1547625164328538133',
    // F5, o arranque com o Windows (desktop/src/arranque.rs). Na Preview nunca se liga sozinho.
    getStartup: () => invoke('arranque_ler'),
    setStartup: (enabled, mode) => pedir('arranque_definir', { enabled, mode }),
    lerSaude: () => invoke('saude_ler'),
    // F5, a barra de tarefas (desktop/src/barra.rs): os botões da miniatura e a lista de saltos.
    onAtalho: (listener) => ouvir('atalho', (acao) => listener(String(acao))),
    estadoDaBarra: (estado) => { pedir('barra_estado', { estado }).catch(() => {}); },
    tirarAcaoDaBarra: () => pedir('barra_tirar_acao', {}),
    onAcaoDaBarra: (listener) => ouvir('barra:acao', () => listener()),
    // F5, as mensagens (desktop/src/notificacoes.rs): o toast com clique, o número na barra e o piscar.
    notifyMessage: (message) => { pedir('notificacao_mensagem', { mensagem: message }).catch(() => {}); },
    setUnreadMessages: (count, attention) => { pedir('notificacao_por_ler', { count, attention }).catch(() => {}); },
    onNotificationClick: (listener) => ouvir('notificacao:abrir', (conversa) => listener(conversa)),
    // F8: a memória e o CPU da casca e dos processos do WebView2, para o relatório.
    lerRecursos: () => pedir('diagnostico_recursos', {}),
    segundosSemInteracao: () => invoke('segundos_sem_interacao'),
    minimize: () => { void invoke('janela_minimizar'); },
    toggleMaximize: () => { void invoke('janela_alternar_maximizar'); },
    close: () => { void invoke('janela_fechar'); },
    getCloseToTray: () => invoke('fechar_para_tabuleiro_ler'),
    setCloseToTray: (enabled) => invoke('fechar_para_tabuleiro_definir', { enabled: enabled === true }),
    isMaximized: () => invoke('janela_maximizada'),
    onMaximizedChange: (listener) => ouvir('janela:maximizada', (v) => listener(Boolean(v))),
    // F3: os pedidos sem CORS (desktop/src/rede.rs), com as validações do main.cjs.
    pesquisarNoYouTube: (pedido) => pedir('yt_pesquisa', { pedido }),
    pesquisarCancoes: (pedido) => pedir('ytmusic_pesquisa', { pedido }),
    lerMixDoYouTube: (pedido) => pedir('yt_mix', { pedido }),
    lerRefraoDoYouTube: (pedido) => pedir('yt_refrao', { pedido }),
    lerArtistaDoYtMusic: (pedido) => pedir('ytmusic_artista', { pedido }),
    lerRadioDoYtMusic: (pedido) => pedir('ytmusic_radio', { pedido }),
    lerLetraDoYtMusic: (pedido) => pedir('ytmusic_letra', { pedido }),
    pedirAoCatalogo: (caminho) => pedir('catalogo_pedir', { caminho }),
    pedirAoSupabase: (pedido) => pedir('supabase_pedir', { pedido }),
    lerEmbedDoSpotify: (id) => pedir('spotify_embed', { id }),
    lerPlaylistDaApple: (url) => pedir('apple_playlist', { url }),
    resolverLinkDoDeezer: (url) => pedir('deezer_link', { url }),
    // F4, só no Tauri (decidido a 21/11): o motor só de áudio.
    // O resolvedor (ytstream.ts) fala com o InnerTube por aqui; o áudio serve-se em /audio/<id>.
    pedirAoInnerTube: (url, corpo, cabecalhos) => pedir('innertube_pedir', { url, corpo, cabecalhos }),
    sondarAudio: (url) => pedir('googlevideo_sondar', { url }),
    aquecerLigacoes: () => pedir('innertube_aquecer', {}),
    // O EQ e o tom vivem no grafo do motor só de áudio (MotorDeAudio.web.tsx),
    // que se regista em window.__duotoneMotor. Com o IFrame de recurso a tocar
    // não há onde os pôr no Tauri (não se injeta no frame do YouTube): diz-se a verdade.
    aplicarEqualizador: (ajuste) => (window.__duotoneMotor ? window.__duotoneMotor.aplicarEqualizador(ajuste) : Promise.resolve({ ok: false, porque: 'sem motor só de áudio' })),
    naoEsticarOTempo: () => (window.__duotoneMotor ? window.__duotoneMotor.naoEsticarOTempo() : Promise.resolve({ ok: false, porque: 'sem motor só de áudio' })),
    registarAudio: (id, url, tamanho, mime) => pedir('audio_registar', { id, url, tamanho, mime }),
    // F6, o mini leitor (desktop/src/mini.rs): esta janela publica o resumo e recebe os comandos.
    alternarMiniLeitor: () => { pedir('mini_alternar', {}).catch(() => {}); },
    miniLeitorAberto: () => pedir('mini_esta_aberto', {}),
    onMiniLeitorAberto: (listener) => ouvir('mini:aberto', (v) => listener(Boolean(v))),
    publicarNoMiniLeitor: (resumo) => { pedir('mini_estado', { resumo }).catch(() => {}); },
    onComandoDoMiniLeitor: (listener) => ouvir('mini:comando', (c) => listener(c)),
    miniLeitorNoModoLimpo: (ligado) => { pedir('mini_modo_limpo', { ligado: ligado === true }).catch(() => {}); },
    // O 1.º bocado buscado antes do clique (o rato parado em cima da música).
    adiantarAudio: (id, url, tamanho, mime) => pedir('audio_adiantar', { id, url, tamanho, mime }),
    audioNaCache: (id) => pedir('audio_na_cache', { id }),
    aliviarMemoria: () => {},
    atualizacaoAutomatica: true,
    procurarAtualizacao: () => Promise.resolve({ estado: 'atual' }),
    descargaDaAtualizacao: () => Promise.resolve(null),
    onDescargaDaAtualizacao: () => () => {},
    onProgressoDaAtualizacao: () => () => {},
  };
  Object.defineProperty(window, 'duotoneDesktop', { value: Object.freeze(ponte) });
})();
