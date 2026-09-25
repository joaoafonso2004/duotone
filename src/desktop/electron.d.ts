export {};

declare module 'react-native' {
  interface PressableStateCallbackType {
    hovered: boolean;
    focused: boolean;
  }
  interface ViewProps {
    onDoubleClick?: () => void;
    onContextMenu?: (event: unknown) => void;
  }
}

declare global {
  /** O que a janela principal manda ao mini leitor (validado no electron/miniLeitor.cjs). */
  interface ResumoDoMiniLeitor {
    titulo: string | null;
    artista: string | null;
    capa: string | null;
    aTocar: boolean;
    guardada: boolean;
    posicaoMs: number;
    duracaoMs: number;
  }
  interface Window {
    /** Só na janela do mini leitor (electron/preloadMini.cjs). */
    duotoneMini?: {
      onEstado: (listener: (resumo: ResumoDoMiniLeitor) => void) => () => void;
      onTamanho: (listener: (expandido: boolean) => void) => () => void;
      onJanela?: (listener: (visivel: boolean) => void) => () => void;
      onAncora?: (listener: (ancora: 'cima' | 'baixo') => void) => () => void;
      ignorarRato?: (sim: boolean) => void;
      comando: (comando: { tipo: string; ms?: number }) => void;
    };
    duotoneDesktop?: {
      platform: string;
      /** Id público da aplicação oficial Duotone no Discord. */
      discordApplicationId?: string;
      getStartup?: () => Promise<{ enabled: boolean; mode: 'window' | 'tray'; available: boolean }>;
      setStartup?: (enabled: boolean, mode: 'window' | 'tray') => Promise<{ enabled: boolean; mode: 'window' | 'tray'; available: boolean }>;
      notifyMessage?: (message: { id: string; title: string; body: string;friendId?:string;groupId?:string }) => void;
      onNotificationClick?: (listener: (conversation?:{friendId?:string;groupId?:string}) => void) => () => void;
      pesquisarNoYouTube?: (pedido: { query?: string; clientVersion: string; params?: string; continuation?: string }) => Promise<any>;
      /** Um GET ao catálogo pelo processo principal, que não tem CORS. Leva só
       * o caminho (`/artist/123/related?limit=25`); o endereço e as formas que
       * passam vivem no `electron/main.cjs`. Devolve `null` num HTTP mau, que é
       * o que o `api/catalogo.ts` já sabe ler. */
      pedirAoCatalogo?: (caminho: string) => Promise<any>;
      /** A presença do Discord, pelo socket local dele. `null` na actividade
       * limpa; `null` no id desliga. Devolve se o Discord respondeu. */
      definirPresencaNoDiscord?: (
        clientId: string | null,
        actividade: Record<string, unknown> | null,
      ) => Promise<boolean>;
      /** Entrega o segredo de um clique no botão nativo "Juntar-se". */
      onDiscordJoin?: (listener: (secret: string) => void) => () => void;
      /** A saúde do processo principal (electron/saude.cjs): os incidentes
       *  guardados desde a última leitura (e apagados ao ler) e quando o
       *  processo começou, para medir o arranque a frio. */
      lerSaude?: () => Promise<{ incidentes: unknown[]; processoComecouEm: number | null }>;
      /** Segundos desde o último toque no rato ou no teclado do sistema
       *  inteiro (`powerMonitor.getSystemIdleTime`). Ver lib/presencaAtiva.ts. */
      segundosSemInteracao?: () => Promise<number>;
      minimize(): void;
      toggleMaximize(): void;
      close(): void;
      getCloseToTray?: () => Promise<boolean>;
      setCloseToTray?: (enabled: boolean) => Promise<boolean>;
      isMaximized(): Promise<boolean>;
      onMaximizedChange(listener: (maximized: boolean) => void): () => void;
      /** Aplica os ganhos do equalizador dentro do frame do YouTube.
       * Falhar aqui nao estraga o som: sem grafo, o video toca na mesma.
       * A `compensacao` e o multiplicador de amplitude que impede a curva de
       * cortar a onda — calculada no `lib/equalizer.ts`. */
      aplicarEqualizador?: (
        ajuste: { ganhos: number[]; compensacao: number },
      ) => Promise<{ ok: boolean; porque?: string }>;
      /** Faz o tom acompanhar a velocidade em vez de o browser esticar o
       * tempo — e o time-stretch que estraga a camara lenta. */
      naoEsticarOTempo?: () => Promise<{ ok: boolean; antes?: boolean; agora?: boolean }>;
      /** Durante o crossfade com a janela escondida: sem estrangular os temporizadores. */
      naoEstrangular?: (sim: boolean) => void;
      /** "Update now": descarrega e instala a versão nova (electron/atualizacao.cjs).
       *  Com `ok`, a app fecha-se e o instalador volta a abri-la. */
      instalarAtualizacao?: () => Promise<{ ok: boolean; versao?: string; erro?: string }>;
      /** O progresso do download, de 0 a 1. Devolve o cancelamento. */
      onProgressoDaAtualizacao?: (listener: (progresso: number) => void) => () => void;
      /** F11 e Esc, apanhados pelo processo principal (o iframe do YouTube
       *  engole as teclas quando tem o foco). Devolve o cancelamento. */
      onTeclaDoModoLimpo?(listener: (tecla: string) => void): () => void;
      /** Atalhos globais (electron/atalhos.cjs). `presos`: gravados mas recusados pelo Windows. */
      lerAtalhos?: () => Promise<{ atalhos: Record<string, string>; presos: string[] }>;
      definirAtalho?: (
        acao: string,
        tecla: { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean } | null,
      ) => Promise<{ ok: boolean; erro?: string; outra?: string; accelerator?: string; atalhos?: Record<string, string>; presos?: string[]; aviso?: string | null }>;
      aGravarAtalho?: (sim: boolean) => Promise<boolean>;
      onAtalho?: (listener: (acao: string) => void) => () => void;
      /** Mini leitor (electron/miniLeitor.cjs). */
      alternarMiniLeitor?: () => void;
      miniLeitorAberto?: () => Promise<boolean>;
      onMiniLeitorAberto?: (listener: (aberto: boolean) => void) => () => void;
      publicarNoMiniLeitor?: (resumo: ResumoDoMiniLeitor) => void;
      onComandoDoMiniLeitor?: (listener: (comando: { tipo: string; ms?: number }) => void) => () => void;
      miniLeitorNoModoLimpo?: (ligado: boolean) => void;
      showContextMenu(items: { id: string; label: string; enabled?: boolean }[]): void;
      onContextMenuSelection(listener: (id: string) => void): () => void;
    };
  }
}
