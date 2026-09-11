import { proximaFaixa, decisaoDeControlo, restoDaLista, baralhada, type PonteJam } from '../lib/jam';
import {ensureLyrics} from './lyrics';
import { useConnectivity } from './connectivity';
import { filterSuggestions } from './recommendationFeedback';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { temAudioNativo } from '../../modules/duotone-audio';
import { recordPlayInSupabase, registarInicioDaFaixa } from '../api/plays';
import { incrementPlayCount } from '../lib/playCounts';
import { avancarEscuta, novaEscuta, type Escuta } from '../lib/contagemDeEscuta';
import { reconcileOrder, shuffleKeys, stepIndex, trackKey, upcomingIndexes } from '../lib/shuffle';
import {
  A_CADA, deveSugerir, escolherSugestao, modoDeShuffle, posicaoDaSugestao, proximoModo,
} from '../lib/smartShuffle';
import { radioSeeds, shouldExtendWithRadio } from '../lib/radio';
import { fetchRadioTracks } from '../api/radio';
import { candidatasParaDescoberta } from '../api/descoberta';
import { artistasParaRecomendacoes } from '../api/plays';
import { chaveDeArtista } from '../lib/artistName';
import {
  setShuffle as persistShuffle, setShuffleInteligente as persistShuffleInteligente,
  setPlaybackRate as persistPlaybackRate, setEqPadrao as persistEqPadrao,
} from '../lib/prefs';
import { queueTrackAdjustment } from './trackAdjustments';
import { movido } from '../lib/arrastarFila';
import { useAuth } from './auth';
import { applyPlaybackAlternative } from '../lib/playbackAlternatives';
import {
  pauseMountedSourceBeforeChange,
  replayMountedSource,
  requestPause,
  requestPlay,
  restoredPlaybackState,
  type PlaybackControls,
} from '../lib/playerLifecycle';
import {
  prazoDoTemporizador, restanteDoTemporizador, saltoAposFalha,
  colocarASeguir, sessaoParaGuardar, substituicaoDe,
} from '../lib/playerQueue';
import {
  derivados, INICIAL as MAQUINA_INICIAL, transicao,
  type EstadoDeReproducao, type Evento,
} from '../lib/playbackMachine';
import { arredondar as arredondarRate, RATE_NORMAL } from '../lib/playbackRate';
import {
  aoTocar as ajusteAoTocar, chaveDaFaixa, CHAVE_DO_PADRAO, compensacaoLinear, fundirAjustes,
  normalizar as normalizarGanhos, padraoGuardado, PLANO, type Ganhos, type MemoriaDeAjustes,
} from '../lib/equalizer';
import type { Track } from '../types';
import {
  contextoDoRadioAutomatico, contextoDoSmartShuffle, contextoParaAnalytics,
  type DiscoveryContext,
} from '../lib/contextoDaDescoberta';
import { registar } from '../lib/eventos';

/** Controlo do player YouTube (registado pelo YouTubePlayerView). */
export type YtControls = PlaybackControls;

/**
 * A posição e o instante a que ela se refere andam SEMPRE juntos.
 *
 * Escrever `positionMs` sozinho deixava o `positionAt` a apontar para a
 * posição anterior -- e o handoff, que extrapola a partir dele, mostrava no
 * outro dispositivo uma posição que nunca existiu. Passando por aqui, o par
 * não se pode separar por distração.
 */
const posicao = (ms: number) => ({ positionMs: ms, positionAt: Date.now() });

/**
 * Quanto tempo a sugestao do shuffle inteligente espera antes de entrar.
 *
 * Ela deixou de travar o botao de seguinte, e por isso passou a correr em
 * paralelo com a mudanca de faixa -- o que a punha a competir com o `playTrack`
 * pela fila. Este atraso poe-na depois de tudo assentar.
 *
 * Exportado para os testes poderem esperar por ela sem adivinhar o numero.
 */
export const ATRASO_DA_SUGESTAO_MS = 2000;

/** Registada sincronamente pela store Jam, sem depender da montagem do player. */
let ouvirJuntos: () => PonteJam | null = () => null;
export function registarOuvirJuntos(fn: typeof ouvirJuntos): void { ouvirJuntos = fn; }

/** Contexto sem conteúdo: acompanha a fila apenas em memória. */
let contextosDaFila=new Map<string,DiscoveryContext>();
let contextoAtual:DiscoveryContext|null=null;
export function contextoDaRecomendacaoAtual():DiscoveryContext|null{return contextoAtual;}

function registarSaltoDeRecomendacao(positionMs:number):void{
  if(!contextoAtual)return;
  registar('recomendacao_saltada',{
    ...contextoParaAnalytics(contextoAtual),
    antes_30s:positionMs<30_000,
    posicao_s:Math.max(0,Math.round(positionMs/1000)),
  });
}

/**
 * A escuta da faixa que está a tocar: quanto já se ouviu dela, e se já contou.
 * Ver lib/contagemDeEscuta.ts.
 *
 * Em memória e não na store: muda a cada leitura da posição e nenhum ecrã a
 * mostra. A `faixaDaEscuta` é a que CONTA, que nem sempre é a que toca -- uma
 * cópia aprendida (`applyPlaybackAlternative`) ou a substituta de uma que
 * falhou contam como a original, que é a que está na biblioteca.
 */
let escuta: Escuta | null = null;
let faixaDaEscuta: Track | null = null;

function comecarEscuta(conta: Track, chave: string, duracaoMs: number | null, jaOuvidoMs = 0): Escuta {
  escuta = novaEscuta(chave, duracaoMs, jaOuvidoMs);
  faixaDaEscuta = conta;
  // O início fica registado à parte, porque deixou de haver outro registo
  // dele: é por aqui que o Rare Finds não volta a oferecer como novidade uma
  // música que se saltou.
  registarInicioDaFaixa(conta).catch(() => {});
  return escuta;
}

/** Cada leitura da posição, dos dois motores. Conta a faixa quando ela passa do limiar. */
function medirEscuta(
  s: { current: Track | null; playbackRate: number; isPlaying: boolean },
  posicaoMs: number,
  duracaoMs: number,
): void {
  const atual = s.current;
  if (!atual) return;
  const chave = trackKey(atual);
  // Uma faixa que não se viu começar -- o handoff, a sessão restaurada no
  // arranque, a seguinte depois de se remover a que tocava. O que já passou
  // conta como ouvido: se foi noutro dispositivo, foi lá que contou.
  const e = escuta && escuta.chave === chave
    ? escuta
    : comecarEscuta(atual, chave, atual.durationSeconds ? atual.durationSeconds * 1000 : duracaoMs || null, posicaoMs);
  const r = avancarEscuta(e, {
    posicaoMs, instante: Date.now(), ritmo: s.playbackRate, aTocar: s.isPlaying, duracaoMs,
  });
  escuta = r.escuta;
  if (r.contar && faixaDaEscuta) {
    // Local; alimenta o "Most played" e o perfil.
    incrementPlayCount(faixaDaEscuta).catch(() => {});
    // No Supabase, para as recomendações e para "A tua escuta".
    recordPlayInSupabase(faixaDaEscuta).catch(() => {});
  }
}

/** Erros de comandos ficam visíveis na barra e nunca caem em reprodução local. */
async function comandarJam(acao: (s: PonteJam) => Promise<void>): Promise<void> {
  const s = ouvirJuntos();
  if (!s) return;
  try { await acao(s); } catch { s.avisarErro(); }
}

const getInitialVolume = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem('duotone-volume');
      if (stored !== null) {
        const parsed = Number(stored);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to read volume from localStorage', e);
    }
  }
  return 80;
};

/** off = pára no fim · all = repete a fila · one = repete a música atual. */
export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  current: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  playbackConfirmed: boolean;
  closing: boolean;
  closeGain: number;
  /** A verdade sobre a reproducao. `isPlaying`/`buffering` derivam daqui. */
  maquina: EstadoDeReproducao;
  /** overlay Now Playing expandido vs mini-player */
  expanded: boolean;
  /** modo de repetição (botão no player) */
  repeatMode: RepeatMode;
  /** ordem aleatória ao avançar (botão no player) */
  shuffle: boolean;
  /** Percurso do shuffle, por chave de faixa. Materializado (Fisher-Yates)
   * em vez de sorteado a cada `next()`: só assim cada faixa toca uma vez e o
   * "anterior" volta pelo caminho por onde veio. Ver lib/shuffle.ts.
   * Não é persistido — regenera-se sozinho. */
  shuffleOrder: string[];
  /**
   * Segundo estado do botão de shuffle: intercala faixas que NÃO estão na
   * fila, relacionadas com o que se anda a ouvir.
   *
   * Vive à parte do `shuffle` em vez de o transformar num modo de três
   * valores porque o `shuffle` booleano é lido em quinze sítios — o ciclo do
   * botão está no `lib/smartShuffle.ts` e a UI pergunta-lhe o modo.
   * "Inteligente" só existe com o shuffle ligado.
   */
  shuffleInteligente: boolean;
  /** Faixas normais tocadas desde a última sugestão. */
  desdeASugestao: number;
  /** Chaves do que já foi sugerido nesta sessão: repetir uma sugestão é pior
   * do que não sugerir nada. */
  sugeridas: string[];
  /** Rádio: quando a fila acaba, continuar com música parecida em vez de
   * ficar em silêncio. Preferência do utilizador (Definições). */
  autoplayRadio: boolean;
  /** true enquanto a cauda da fila veio do rádio — só para a UI o dizer. */
  radioActive: boolean;
  /** Normalizar o volume entre faixas (iOS). O YouTube não masteriza nada e
   * o salto de volume entre uploads é o defeito mais audível da fonte.
   * Ver lib/loudness.ts. */
  volumeNormalization: boolean;
  /** Segundos de passagem entre faixas. 0 desliga. Vive aqui e nao so nas
   * preferencias porque o player le-o a cada tique, dentro de um intervalo. */
  crossfadeSegundos: number;
  /** mostrar o botão de recuar 15s no player expandido (preferência das Definições) */
  showRewindButton: boolean;
  positionMs: number;
  /**
   * O instante (Date.now) a que a `positionMs` se refere.
   *
   * Existe por causa do handoff: o outro dispositivo extrapola a posição a
   * partir daqui, e se este carimbo fosse o da ESCRITA em vez do da amostra,
   * mostrava a posição de um momento qualquer. Ver `instanteDaAmostra` em
   * src/lib/handoff.ts. Não se persiste -- uma posição guardada volta a ser
   * verdade no instante em que a app abre, e é isso que o restauro carimba.
   */
  positionAt: number;
  durationMs: number;
  /** a resolver/descarregar a faixa (ainda não começou a tocar áudio) */
  buffering: boolean;
  error: string | null;
  sleepTimerTimeLeft: number;
  /** Instante absoluto (Date.now) em que o sleep timer expira. É a fonte de
   * verdade: um contador decrementado por setInterval congela em background
   * (o iOS suspende timers JS), mas um deadline absoluto verificado também
   * no timeUpdate do player nativo (que continua a disparar em background)
   * pausa a música à hora certa mesmo com o ecrã bloqueado. */
  sleepTimerEndsAt: number | null;
  /** Velocidade de reproducao, 0,25 a 2 em degraus de 0,1 (ver
   * `lib/playbackRate.ts`). Substituiu os tres presets. */
  playbackRate: number;
  /** Os dez ganhos do equalizador, em dB, aplicados pelo motor de cada plataforma. */
  eqGanhos: Ganhos;
  /** O que cada faixa lembra da ultima vez que a ouviste. */
  ajustesPorFaixa: MemoriaDeAjustes;
  /**
   * O padrão para faixas SEM registo. A velocidade vem das Definições; o EQ é
   * sempre Flat. É outra coisa do que `playbackRate`/`eqGanhos`, aplicados agora.
   *
   * Sem esta separacao os ajustes pingavam: a faixa seguinte nao tinha registo,
   * nada a repunha, e ficava com o que a anterior deixou.
   */
  padraoRate: number;
  padraoGanhos: Ganhos;
  /** false quando o grafo do EQ nao pegou. A UI tem de o dizer em vez de
   * mostrar deslizadores que nao fazem nada. */
  eqAtivo: boolean;
  /**
   * Sem `comoPadrao`: muda ESTA faixa e passa a lembrar-se dela.
   * Com `comoPadrao`: muda só o equalizador base das Definições, que vale para
   * as faixas que não tenham o seu -- e NÃO toca na que está a tocar.
   */
  setEqGanhos: (g: number[], comoPadrao?: boolean) => void;
  _carregarAjustes: (m: MemoriaDeAjustes, ganhos: number[], rate: number) => void;
  /** Progresso (0..1) do download da faixa atual, ou null se não está a descarregar. */
  downloadProgress: number | null;
  /** false quando a faixa vem do restauro da sessão anterior — o player
   * prepara o áudio mas não começa a tocar até o utilizador carregar em play. */
  autoplayOnLoad: boolean;
  /** Posição (ms) a retomar após restauro da sessão; consumida uma vez. */
  resumePositionMs: number | null;
  volume: number;
  setVolume: (v: number) => void;

  /**
   * `interno`: esta chamada NAO e uma escolha do utilizador.
   *
   * Serve para o `next`, o `prev`, o radio e o motor da sessao -- que fazem a
   * fila andar, e nao querem que um toque seja reinterpretado. Tudo o resto e,
   * por definicao, alguem a tocar numa musica.
   */
  playTrack: (track: Track, queue?: Track[], shouldExpand?: boolean, interno?: boolean, discoveryContext?: DiscoveryContext) => Promise<void>;
  /** Troca apenas a fonte da faixa atual depois de um vídeo indisponível.
   * Não conta uma segunda reprodução e mantém a posição da faixa na fila. */
  replaceUnavailableTrack: (failedSourceId: string, replacement: Track) => boolean;
  /** Remove da sessão uma fonte que não toca e avança sem esperar pelo rádio. */
  skipUnavailableTrack: (failedSourceId: string) => Promise<void>;
  /** Assume uma sessão vinda de outro dispositivo (handoff), a partir de uma
   * posição. O que já passou conta como ouvido: se a origem passou do limiar,
   * a reprodução já foi contada lá, e contá-la outra vez inflacionava o "Most
   * played" sempre que se trocasse de dispositivo. Se não passou, conta aqui
   * quando passar. Ver lib/contagemDeEscuta.ts. */
  adoptSession: (session: {
    track: Track;
    queue: Track[];
    queueIndex: number;
    positionMs: number;
  }) => void;
  /**
   * Toca uma lista inteira em modo aleatório (botões "Shuffle" da biblioteca e
   * das playlists). Com `inteligente`, liga também o shuffle que intercala
   * sugestões — é o mesmo modo do botão do leitor, para não haver dois
   * "inteligentes" diferentes na app.
   */
  playShuffled: (tracks: Track[], inteligente?: boolean) => Promise<void>;
  /**
   * O botão Play de uma LISTA -- Songs, uma playlist, as guardadas.
   *
   * Existe para dar a este gesto um significado próprio dentro de um jam.
   * Tocar numa música é "esta agora"; carregar em Play na tua biblioteca é
   * "quero ouvir isto", e isso não pode apagar o que toda a gente está a
   * ouvir. Lá dentro a lista vai para a fila partilhada; só arranca sozinha
   * quando não há nada a dar.
   *
   * Fora de um jam não muda nada: é o que os botões já faziam.
   */
  tocarLista: (tracks: Track[], aleatorio: boolean, inteligente?: boolean) => Promise<void>;
  playNext: (track: Track) => void;
  addToQueue: (track: Track) => void;
  togglePlay: () => Promise<void>;
  _sincronizarPausa: (aTocar: boolean) => void;
  /** Como o `_sincronizarPausa`, mas sem a guarda da intenção. Ver lá. */
  _forcarReproducao: (aTocar: boolean) => void;
  next: (manual?: boolean) => Promise<void>;
  prev: () => Promise<void>;
  close: () => Promise<void>;
  prepararFecho: () => Promise<boolean>;
  setExpanded: (v: boolean) => void;
  setRepeatMode: (m: RepeatMode) => void;
  cycleRepeat: () => void;
  setShuffle: (v: boolean) => void;
  setSleepTimer: (minutes: number) => void;
  tickSleepTimer: () => void;
  /** Verifica o deadline do sleep timer (chamado no tick de foreground E no
   * timeUpdate do player nativo, para funcionar em background). */
  checkSleepTimer: () => void;
  _setDownloadProgress: (p: number | null) => void;
  setPlaybackRate: (rate: number, comoPadrao?: boolean) => void;
  pausePlayback: () => void;
  toggleShuffle: () => void;
  /** Mete na fila uma faixa relacionada. Devolve se conseguiu. */
  /** Semeia varias sugestoes de uma vez. Devolve quantas entraram. */
  semearSugestoes: () => Promise<number>;
  intercalarSugestao: () => Promise<boolean>;
  setShowRewindButton: (v: boolean) => void;
  setError: (e: string | null) => void;
  /** Reordena o que se vê em "Up next" -- com shuffle ligado também. */
  reordenarProximas: (de: number, para: number) => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  removeFromQueue: (index: number) => void;

  seekTo: (ms: number, interno?: boolean) => Promise<void>;

  /** Decisão da fila pessoal. Consumidores devem usar proximaFaixa. */
  peekNextTrack: () => Track | null;
  /** Única decisão pública: fila Jam durante a sessão, fila pessoal fora dela. */
  proximaFaixa: () => Track | null;

  /** As faixas que vêm a seguir, pela ordem em que vão MESMO tocar, com o
   * índice real na fila (para remover/reordenar). Com shuffle ligado isto
   * não é `queue.slice(queueIndex + 1)` — a lista "Up next" mentia. */
  upcomingQueue: () => { track: Track; index: number }[];

  setAutoplayRadio: (v: boolean) => void;
  setVolumeNormalization: (v: boolean) => void;
  /** Acrescenta faixas do rádio à fila, se fizer sentido agora. Devolve se
   * chegou mesmo a acrescentar. Chamado de dois sítios: em antecipação
   * (useAutoplayRadio, para não haver silêncio) e no `next()` como rede de
   * segurança. */
  extendQueueWithRadio: () => Promise<boolean>;

  /** interno — devolve o percurso do shuffle alinhado com a fila atual,
   * gerando-o se ainda não existir. Sem isto, remover uma faixa da fila
   * deixava o percurso a apontar para uma chave que já lá não está e o
   * `next()` julgava a fila acabada. */
  _ensureShuffleOrder: () => string[];

  /** interno — ponte com o WebView do YouTube */
  _yt: YtControls | null;
  registerYtControls: (c: YtControls | null) => void;
  _onYtStateChange: (s: 'playing' | 'paused' | 'ended') => void;
  _setProgress: (positionMs: number, durationMs: number) => void;
  _setIsPlaying: (v: boolean) => void;
  _setBuffering: (v: boolean) => void;
  activeBackend: 'resolving' | 'native' | 'webview';
  _setActiveBackend: (backend: 'resolving' | 'native' | 'webview') => void;
}

// O middleware `persist` chama o storage em CADA `set`, incluindo o progresso.
// `createJSONStorage` faria o JSON.stringify ANTES de chegar a um debounce e,
// numa fila com 2.000 faixas, serializava-a várias vezes por segundo mesmo que
// só escrevesse no disco de três em três. Este storage adia também a própria
// serialização: durante o intervalo guarda apenas a referência para o retrato
// mais recente.
function deferredJsonStorage(): PersistStorage<any> {
  let pendingName: string | null = null;
  let pendingValue: StorageValue<any> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    getItem: async (name: string) => {
      const raw = await AsyncStorage.getItem(name);
      return raw ? JSON.parse(raw) : null;
    },
    setItem: (name: string, value: StorageValue<any>) => {
      pendingName = name;
      pendingValue = value;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          const key = pendingName;
          const v = pendingValue;
          pendingName = null;
          pendingValue = null;
          if (key && v != null) {
            // Só aqui — uma vez por janela — se percorre e serializa a fila.
            AsyncStorage.setItem(key, JSON.stringify(v)).catch(() => {});
          }
        }, 3000);
      }
    },
    removeItem: (name: string) => {
      if (pendingName === name) {
        pendingName = null;
        pendingValue = null;
        if (timer) clearTimeout(timer);
        timer = null;
      }
      return AsyncStorage.removeItem(name);
    },
  };
}

/**
 * O `isPlaying` e o `buffering` deixaram de se escrever a mao: saem da maquina
 * de estados (`lib/playbackMachine.ts`), que e onde as combinacoes sem sentido
 * ficam impossiveis. Escrevia-os em 23 sitios diferentes; agora ha um evento.
 */
function passo(estado: EstadoDeReproducao, tipo: Evento['tipo']) {
  const maquina = transicao(estado, { tipo } as Evento);
  return { maquina, ...derivados(maquina),
    ...(tipo === 'a-tocar' ? {playbackConfirmed:true} : tipo === 'motor-pronto' ? {} : {playbackConfirmed:false}),
    ...(tipo === 'faixa-escolhida' || tipo === 'parou-tudo' ? {closing:false,closeGain:1} : {}),
  };
}

/**
 * Manda os ganhos ao processo principal, que os instala DENTRO do frame do
 * YouTube. Uma falha aqui nao estraga o som — sem grafo o video toca na mesma —
 * mas tem de se saber, para a UI nao mostrar um EQ ligado que nao faz nada.
 *
 * Vai junto a MARGEM (`compensacao`), calculada aqui e nao no processo
 * principal, para a conta viver so num sitio: o `lib/equalizer.ts`, que e o
 * unico que sabe as bandas e o que elas somam quando se sobrepoem.
 */
async function aplicarEqNoMotor(ganhos: number[]): Promise<void> {
  const ponte = typeof window !== 'undefined' ? window.duotoneDesktop : undefined;
  if (!ponte?.aplicarEqualizador) {
    // No telemovel nao ha ponte nenhuma: quem aplica os ganhos e o modulo
    // nativo, a partir do YouTubePlayerView. O que se decide aqui e so se a
    // UI pode dizer que o EQ esta ligado — e no iOS isso depende de o binario
    // incluir o modulo, que numa build antiga ou no Expo Go nao inclui.
    usePlayer.setState({ eqAtivo: temAudioNativo });
    return;
  }
  try {
    const r = await ponte.aplicarEqualizador({ ganhos, compensacao: compensacaoLinear(ganhos) });
    usePlayer.setState({ eqAtivo: !!r?.ok });
  } catch {
    usePlayer.setState({ eqAtivo: false });
  }
}

/** Guarda também 1×/Flat: a reposição precisa de viajar para o outro aparelho. */
function lembrarDaFaixa(): void {
  const { current, playbackRate, eqGanhos, ajustesPorFaixa } = usePlayer.getState();
  if (!current) return;
  const chave = chaveDaFaixa(current);
  const value={rate:playbackRate,ganhos:normalizarGanhos(eqGanhos),visto:Date.now()};
  const nova=fundirAjustes(ajustesPorFaixa,{[chave]:value});
  usePlayer.setState({ajustesPorFaixa:nova});
  const auth=useAuth.getState(),userId=auth.session?.user.id??auth.offlineUserId;
  if(userId)queueTrackAdjustment(userId,chave,value);

}

/**
 * O equalizador BASE, escrito onde ele sincroniza mesmo.
 *
 * Gémeo do `lembrarDaFaixa` aqui em cima, e de propósito: é a mesma memória, a
 * mesma fusão por data e a mesma fila de envio. O que muda é só a chave -- ver
 * o `CHAVE_DO_PADRAO` no `lib/equalizer.ts` para o porquê de ela viver aqui e
 * não numa preferência.
 *
 * O `pref:eqPadrao` continua a ser escrito por quem chama: é o que a app lê
 * antes de a sincronização acordar, e é o que resta quando não há conta.
 *
 * Escreve-se SEMPRE com valores concretos, nunca a null: uma linha com os dois
 * a null é deitada fora pelo `daPersistencia`, e voltar o padrão a plano é uma
 * escolha tão explícita como qualquer outra -- tem de viajar como as outras.
 */
function guardarOPadrao(rate: number, ganhos: readonly number[]): void {
  const value = { rate, ganhos: normalizarGanhos(ganhos), visto: Date.now() };
  usePlayer.setState({
    ajustesPorFaixa: fundirAjustes(usePlayer.getState().ajustesPorFaixa, { [CHAVE_DO_PADRAO]: value }),
  });
  const auth = useAuth.getState(), userId = auth.session?.user.id ?? auth.offlineUserId;
  if (userId) queueTrackAdjustment(userId, CHAVE_DO_PADRAO, value);
}

/** Guarda contra duas idas à rede do rádio em simultâneo. */
let radioInFlight = false;
/** Impede que uma resolucao lenta de uma faixa antiga substitua um clique mais recente. */
let playRequestId = 0;

/**
 * Quantas candidatas se pedem por sugestao, e de quantos artistas.
 *
 * Os valores por omissao do `candidatasParaDescoberta` sao 12 e 2 -- estreitos
 * de mais para uma coisa que corre de quatro em quatro faixas durante horas.
 */
const POR_SUGESTAO = 30;
const ALVOS_DA_SUGESTAO = 4;

/**
 * O retrato do que se ouve, para os alvos nao virem so das ultimas tres faixas.
 *
 * Falha em silencio: sem historico devolve `undefined` e o `escolherAlvos`
 * volta a olhar so para o contexto, que e o que fazia antes.
 */
async function retratoDeEscutas(): Promise<Map<string, number> | undefined> {
  try {
    const mapa = new Map<string, number>();
    for (const a of await artistasParaRecomendacoes(20)) {
      const k = chaveDeArtista(a.name);
      if (k) mapa.set(k, Math.max(mapa.get(k) ?? 0, a.plays));
    }
    return mapa.size ? mapa : undefined;
  } catch {
    return undefined;
  }
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
  current: null,
  queue: [],
  queueIndex: 0,
  isPlaying: false,
  maquina: MAQUINA_INICIAL,
  playbackConfirmed: false,
  closing: false,
  closeGain: 1,
  expanded: false,
  repeatMode: 'off',
  shuffle: false,
  shuffleOrder: [],
  shuffleInteligente: false,
  desdeASugestao: 0,
  sugeridas: [],
  autoplayRadio: true,
  radioActive: false,
  volumeNormalization: true,
  crossfadeSegundos: 0,
  showRewindButton: false,
  positionMs: 0,
  positionAt: Date.now(),
  durationMs: 0,
  buffering: false,
  error: null,
  sleepTimerTimeLeft: 0,
  sleepTimerEndsAt: null,
  playbackRate: RATE_NORMAL,
  eqGanhos: PLANO,
  ajustesPorFaixa: {},
  padraoRate: RATE_NORMAL,
  padraoGanhos: PLANO,
  eqAtivo: false,
  downloadProgress: null,
  autoplayOnLoad: true,
  resumePositionMs: null,
  volume: getInitialVolume(),
  _yt: null,
  activeBackend: 'resolving',

  playTrack: async (track, queue, shouldExpand, interno = false, discoveryContext) => {
    if (!interno && ouvirJuntos()) {
      contextosDaFila.clear();
      contextoAtual=null;
      await comandarJam(async s => {
        // Sem licença para mandar, tocar numa música é propô-la -- e propõe-se
        // uma, não a playlist de onde saiu: encher a fila dos outros sem
        // autorização não é sugerir, é tomar conta.
        if (decisaoDeControlo(s) === 'sugerir') { await s.sugerir(track); return; }
        await s.anunciarFaixa(track);
        // A lista vai atrás da faixa. Dar play num álbum dentro do jam tem de
        // dar o álbum, senão a sessão pára no fim da primeira música à espera
        // que alguém acrescente a seguinte à mão.
        const resto = restoDaLista(queue, track);
        if (resto.length) await s.semearFila(resto);
      });
      return;
    }
    const anterior=get().current;
    // `applyPlaybackAlternative` e o download podem demorar. O backend da
    // faixa anterior tem de se calar no proprio gesto, antes desses awaits;
    // esperar pelo efeito do componente deixava a capa nova com o som velho.
    pauseMountedSourceBeforeChange(anterior, track, get()._yt);
    if(!interno){
      if(contextoAtual&&anterior&&trackKey(anterior)!==trackKey(track))registarSaltoDeRecomendacao(get().positionMs);
      contextosDaFila.clear();
      if(discoveryContext){
        for(const item of queue?.length?queue:[track])contextosDaFila.set(trackKey(item),discoveryContext);
      }
    }
    const contextoSeguinte=discoveryContext??contextosDaFila.get(trackKey(track))??null;
    const mudou=!anterior||trackKey(anterior)!==trackKey(track);
    contextoAtual=contextoSeguinte;
    if(contextoSeguinte&&mudou)registar('recomendacao_tocada',contextoParaAnalytics(contextoSeguinte));
    // As letras começam em paralelo com a resolução do áudio, antes de abrir a capa.
    void ensureLyrics(track);
    const requestId = ++playRequestId;
    set({closing:false,closeGain:1,playbackConfirmed:false});
    get()._yt?.setVolume?.(get().volume);
    // Fast path dentro do gesto do utilizador: importante para a faixa
    // restaurada, cujo iframe ja existe e pode estar sujeito a autoplay.
    const immediateControls = replayMountedSource(get().current, track, get()._yt);
    // Conta as faixas desde a ultima sugestao, para o shuffle inteligente
    // saber quando e a proxima. O `intercalarSugestao` poe isto a zero.
    set({ desdeASugestao: get().desdeASugestao + 1 });
    const originalQueue = queue && queue.length > 0 ? queue : [track];
    const index = Math.max(
      0,
      originalQueue.findIndex(
        (t) => t.source === track.source && t.sourceId === track.sourceId
      )
    );
    // Se esta fonte já falhou antes e foi encontrada uma cópia segura, usar o
    // ID aprendido sem alterar título, capa, histórico ou playlist guardada.
    // Numa sessão todos recebem o mesmo sourceId. Uma alternativa lembrada
    // só neste dispositivo não pode trocar a faixa por baixo da sincronização.
    const playableTrack = ouvirJuntos() ? track : await applyPlaybackAlternative(track).catch(() => track);
    if (requestId !== playRequestId) return;
    // Ao escolher de novo a faixa restaurada do arranque, o sourceId nao
    // muda e o YouTubePlayerView nao remonta. Guardar os controlos existentes
    // permite reiniciar esse mesmo player depois de atualizar o estado.
    const reusedControls = immediateControls
      ?? replayMountedSource(get().current, playableTrack, get()._yt);
    const q = originalQueue.slice();
    if (q[index]) q[index] = playableTrack;
    set({
      current: playableTrack,
      queue: q,
      queueIndex: index,
      error: null,
      ...posicao(0),
      durationMs: (playableTrack.durationSeconds ?? 0) * 1000,
      // Faixa nova: volta a resolver, e leva a intencao atras — quem estava a
      // ouvir e carregou em "seguinte" continua a querer ouvir. Se o motor foi
      // reaproveitado nao ha nada a carregar, por isso ja fica pronto.
      ...(reusedControls
        ? passo(transicao(get().maquina, { tipo: 'faixa-escolhida' }), 'motor-pronto')
        : passo(get().maquina, 'faixa-escolhida')),
      activeBackend: reusedControls ? get().activeBackend : 'resolving',
      downloadProgress: null,
      autoplayOnLoad: true,
      resumePositionMs: null,
    });
    // A reprodução já não conta no clique: conta quando se ouve metade, ou
    // quatro minutos, e quem mede é o `_setProgress`. Conta a `track` e não a
    // `playableTrack`, porque a cópia aprendida conta como a original.
    comecarEscuta(track, trackKey(playableTrack),
      playableTrack.durationSeconds ? playableTrack.durationSeconds * 1000 : null);

    // O que ESTA faixa lembra. Sem registo volta ao padrao, de proposito: o
    // ajuste de uma musica nao pode pingar para a seguinte, senao ouvias tudo
    // com o EQ que puseste numa so.
    {
      const st = get();
      // O padrão NÃO vem do que a faixa anterior deixou: velocidade das
      // Definições e EQ Flat. Era esse o bug: sem registo nada era reposto e a
      // música seguinte herdava a velocidade e o EQ da anterior.
      const aplicar = ajusteAoTocar(
        st.ajustesPorFaixa,
        chaveDaFaixa(playableTrack),
        { rate: st.padraoRate, ganhos: st.padraoGanhos },
      );
      set({ playbackRate: arredondarRate(aplicar.rate), eqGanhos: aplicar.ganhos });
      // O grafo vive dentro do frame do YouTube, que muda de video a cada
      // faixa — os ganhos tem de ser reaplicados sempre, mesmo quando sao os
      // mesmos. O atraso da tempo ao iframe de trocar de <video>.
      const ganhos = get().eqGanhos;
      setTimeout(() => { void aplicarEqNoMotor(ganhos); }, 900);
    }
  },

  replaceUnavailableTrack: (failedSourceId, replacement) => {
    const jam = ouvirJuntos();
    if (jam) {
      if (!jam.anfitriao || get().current?.sourceId !== failedSourceId) return false;
      void comandarJam(s => s.anunciarFaixa(replacement));
      return true;
    }
    let replaced = false;
    const falhada = get().current;
    set((state) => {
      // A decisao vive em `lib/playerQueue.ts` e tem teste em Node puro: o que
      // sobra aqui e so escrever o resultado na store.
      const troca = substituicaoDe(state, failedSourceId, replacement, trackKey);
      if (!troca) return {};
      replaced = true;
      return {
        ...troca,
        error: null,
        ...posicao(0),
        durationMs: (troca.current.durationSeconds ?? 0) * 1000,
        ...passo(state.maquina, 'faixa-escolhida'),
        activeBackend: 'resolving' as const,
        downloadProgress: null,
        autoplayOnLoad: true,
        resumePositionMs: null,
      };
    });
    // A substituta é a mesma música noutro upload: a escuta continua, e conta
    // como a original. Sem isto o `_setProgress` via uma faixa nova e contava
    // a substituta.
    const substituta = get().current;
    if (replaced && escuta && falhada && substituta && escuta.chave === trackKey(falhada)) {
      escuta = { ...escuta, chave: trackKey(substituta), posicaoMs: null, instante: null };
    }
    return replaced;
  },

  skipUnavailableTrack: async (failedSourceId) => {
    const state = get();
    if (!state.current || state.current.sourceId !== failedSourceId) return;
    if (ouvirJuntos()) {
      get().pausePlayback();
      await comandarJam(s => s.avancar(true));
      return;
    }

    const { alvo, fila, ordem } = saltoAposFalha(
      { ...state, shuffleOrder: state.shuffle ? state._ensureShuffleOrder() : state.shuffleOrder },
      { trackKey, stepIndex, shuffleKeys },
    );
    if (ordem !== state.shuffleOrder) set({ shuffleOrder: ordem });

    if (alvo) {
      await get().playTrack(alvo, fila, false, true);
      return;
    }

    // Era a ultima faixa reproduzivel. Terminar ja, sem a chamada de rede do
    // radio automatico que deixava "Skipping..." visivel indefinidamente.
    set({
      current: null,
      queue: fila,
      queueIndex: 0,
      shuffleOrder: ordem,
      ...passo(state.maquina, 'parou-tudo'),
      error: null,
      ...posicao(0),
      durationMs: 0,
      activeBackend: 'resolving',
      downloadProgress: null,
    });
  },

  adoptSession: ({ track, queue, queueIndex, positionMs }) => {
    if (ouvirJuntos()) return; // O handoff pessoal não substitui a sessão partilhada.
    // A escuta recomeça no `_setProgress`, com o que já se ouviu no outro
    // dispositivo como ouvido: se lá passou do limiar, já contou lá. Mesmo que
    // seja a faixa que este tinha, é outra escuta.
    escuta = null;
    const q = queue.length > 0 ? queue : [track];
    const index = Math.max(0, Math.min(queueIndex, q.length - 1));
    set({
      current: track,
      queue: q,
      queueIndex: index,
      error: null,
      ...posicao(positionMs),
      durationMs: (track.durationSeconds ?? 0) * 1000,
      ...passo(get().maquina, 'faixa-escolhida'),
      activeBackend: 'resolving',
      downloadProgress: null,
      autoplayOnLoad: true,
      shuffleOrder: get().shuffle ? reconcileOrder(get().shuffleOrder, q, index) : [],
      // Os dois motores retomam por caminhos diferentes: o nativo consome o
      // `resumePositionMs` no beginPlayback, o do desktop lê o `positionMs`
      // no onReady do IFrame. Preencher os dois é o que faz o handoff cair
      // no segundo certo nas duas plataformas.
      resumePositionMs: positionMs > 1500 ? positionMs : null,
    });
  },

  tocarLista: async (tracks, aleatorio, inteligente = false) => {
    if (tracks.length === 0) return;
    if (ouvirJuntos()) {
      const lista = aleatorio ? baralhada(tracks) : tracks;
      await comandarJam(async s => {
        // Há música a dar para toda a gente: a lista vai para a fila e não
        // interrompe nada. Carregar em Play na tua biblioteca não é motivo
        // para apagar o que os outros estavam a ouvir -- para isso toca-se
        // numa música, que continua a querer dizer "esta agora".
        if (s.temFaixa || decisaoDeControlo(s) === 'sugerir') {
          await s.semearFila(lista);
          return;
        }
        // Sessão parada, sem nada a dar: aí Play quer mesmo dizer play.
        await s.anunciarFaixa(lista[0]);
        const resto = restoDaLista(lista, lista[0]);
        if (resto.length) await s.semearFila(resto);
      });
      return;
    }
    if (aleatorio) { await get().playShuffled(tracks, inteligente); return; }
    await get().playTrack(tracks[0], tracks, true);
  },

  playShuffled: async (tracks, inteligente = false) => {
    if (tracks.length === 0) return;
    if (ouvirJuntos()) {
      await get().playTrack(tracks[Math.floor(Math.random() * tracks.length)], tracks, true);
      return;
    }
    // O que estava nos botões era `sort(() => Math.random() - 0.5)`: um
    // baralhamento enviesado (comparador inconsistente — o TimSort do V8
    // deixa os elementos perto de onde estavam) que além disso NÃO ligava o
    // modo aleatório do player. Resultado: o botão Shuffle e o interruptor
    // do player discordavam, e a fila ficava fisicamente desordenada face à
    // biblioteca. Agora liga-se o modo a sério e a ordem é Fisher-Yates.
    const start = Math.floor(Math.random() * tracks.length);
    // Percurso limpo: sem isto o reconcile aproveitaria a ordem da fila
    // anterior e a primeira faixa podia cair no fim do percurso.
    set({
      shuffle: true,
      shuffleOrder: [],
      shuffleInteligente: inteligente,
      // A contagem recomeça: as sugestões contam-se a partir do início desta
      // audição, não do que ficou de uma sessão anterior.
      desdeASugestao: 0,
    });
    persistShuffle(true).catch(() => {});
    persistShuffleInteligente(inteligente).catch(() => {});
    await get().playTrack(tracks[start], tracks, true, true);
    // SEMEAR AQUI, e depois do `playTrack`. O botão da barra inferior
    // (`toggleShuffle`) já semeava, mas este caminho -- o Play das Liked
    // Songs e das playlists -- não: montava uma fila nova por cima da que
    // tinha sido semeada e ficava sem sugestão nenhuma. O modo dizia "smart
    // shuffle" e não entrava nada na fila até à quarta faixa, e só voltava
    // ao normal quem desligasse e ligasse outra vez o botão de baixo.
    //
    // Depois e não antes porque é o `playTrack` que monta a fila, e o
    // `semearSugestoes` semeia na fila que existe nesse momento.
    if (inteligente) void get().semearSugestoes();
  },

  playNext: (track) => {
    // NUMA SESSAO, "a seguir" tem de querer dizer a seguir. Isto mandava a
    // faixa para o FUNDO da fila partilhada, e com a fila cheia era o mesmo
    // que "adicionar" -- nao havia forma nenhuma de ouvir uma musica a seguir
    // a esta sem carregar nela e atropelar o som de toda a gente.
    if (ouvirJuntos()) { void comandarJam(s => s.sugerir(track, true)); return; }
    const { queue } = get();
    if (queue.length === 0) {
      // Sem nada a tocar, "a seguir" é agora. Passar pelo caminho normal é
      // importante: só ele resolve e arranca o áudio.
      void get().playTrack(track, [track], true);
      return;
    }
    const estado = get();
    const shuffleOrder = estado.shuffle ? estado._ensureShuffleOrder() : [];
    set(colocarASeguir({ ...estado, shuffleOrder }, track, trackKey));
  },

  addToQueue: (track) => {
    if (ouvirJuntos()) { void comandarJam(s => s.sugerir(track)); return; }
    const { queue } = get();
    if (queue.length === 0) {
      set({
        current: track,
        queue: [track],
        queueIndex: 0,
        ...passo(get().maquina, 'faixa-escolhida'),
        ...posicao(0),
        durationMs: (track.durationSeconds ?? 0) * 1000,
      });
      return;
    }
    set({ queue: [...queue, track] });
  },

  _sincronizarPausa: (aTocar) => {
    set({ autoplayOnLoad: aTocar });
    const { isPlaying, _yt } = get();
    if (isPlaying === aTocar) return;
    set(aTocar
      ? { ...requestPlay(_yt), ...passo(get().maquina, 'quer-tocar') }
      : { ...requestPause(_yt), ...passo(get().maquina, 'quer-parar') });
  },

  /**
   * O mesmo, sem a guarda -- e a guarda existe por uma razão que aqui não vale.
   *
   * O `isPlaying` é a INTENÇÃO, não "o motor está a dar som" (ver a
   * `playbackMachine`). Numa faixa que acabou sozinha a intenção continua a ser
   * "tocar", e é isso que se quer: quem estava a ouvir continua a querer ouvir.
   *
   * Só que numa sessão isso deixava o convidado parado. A faixa acabava, o
   * motor emitia `ended`, o anfitrião avançava, e a confirmação chegava ao
   * convidado com `aTocar = true` -- igual à intenção que já lá estava. O
   * `_sincronizarPausa` saía pela guarda sem mandar nada ao motor, e o arranque
   * ficava dependente de o `autoplayOnLoad` sobreviver à troca de faixa. Quando
   * não sobrevivia, ficava tudo nos 0:00 e só pausar e retomar curava -- porque
   * só uma transição verdadeira chegava a chamar `play()` no motor.
   *
   * Aqui a ordem vai sempre, mesmo que a intenção já concorde. Numa sessão a
   * confirmação do servidor é uma ORDEM, não uma opinião sobre o que já se
   * queria: quem a aplica não pode presumir nada sobre o estado do motor.
   */
  _forcarReproducao: (aTocar) => {
    set({ autoplayOnLoad: aTocar });
    const { _yt } = get();
    set(aTocar
      ? { ...requestPlay(_yt), ...passo(get().maquina, 'quer-tocar') }
      : { ...requestPause(_yt), ...passo(get().maquina, 'quer-parar') });
  },

  togglePlay: async () => {
    if (ouvirJuntos()) {
      await comandarJam(async s => { if (decisaoDeControlo(s) === 'anunciar') await s.alternarPausa(); });
      return;
    }
    const { current, isPlaying, _yt } = get();
    if (!current) return;
    // Os helpers do `playerLifecycle` fazem o efeito (play/pause no motor) e
    // tratam do `error`/`autoplayOnLoad`, mas NAO podem mandar no `isPlaying`:
    // quem manda nisso e a maquina, e o `passo` vem depois de proposito para
    // ganhar ao que eles devolvem. Sem isto a pausa nao pegava — a confirmacao
    // do motor chegava a seguir e repunha o estado anterior.
    if (isPlaying) {
      // Se o iframe ainda nao estiver pronto, a pausa tem de ficar registada
      // para o onReady nao arrancar alguns milissegundos depois.
      set({ ...requestPause(_yt), ...passo(get().maquina, 'quer-parar') });
    } else {
      // No restauro `_yt` pode ainda ser null. Antes o clique perdia-se; agora
      // fica como intencao pendente e o onReady do player chama playVideo().
      set({ ...requestPlay(_yt), ...passo(get().maquina, 'quer-tocar') });
    }
  },

  next: async (manual = true) => {
    if (ouvirJuntos()) { await comandarJam(s => s.avancar(false)); return; }
    if (get().queue.length === 0) return;
    if(manual)registarSaltoDeRecomendacao(get().positionMs);

    // SHUFFLE INTELIGENTE: de quatro em quatro faixas entra uma que nao esta
    // na fila, relacionada com o que se anda a ouvir. Sai daqui e nao do
    // percurso do shuffle de proposito — a sugestao ENTRA na fila, para
    // aparecer na lista e se poder saltar ou guardar como qualquer outra.
    //
    // Se a rede falhar nao acontece nada: cai no shuffle normal. Uma
    // funcionalidade de descoberta nao pode partir a reproducao.
    if (deveSugerir(modoDeShuffle(get().shuffle, get().shuffleInteligente), get().desdeASugestao)) {
      // NAO SE ESPERA POR ISTO. Era `await`, e era a resposta a pergunta "porque
      // e que o botao de seguinte demora": a sugestao e uma ida a rede -- duas
      // consultas ao Supabase mais uma pesquisa no YouTube -- e acontecia de
      // quatro em quatro faixas ANTES de a musica sequer mudar. O utilizador
      // carregava e ficava a olhar para a faixa antiga enquanto a app procurava
      // uma sugestao para dali a umas musicas.
      //
      // A sugestao entra na fila para uma posicao mais a frente: nao ha razao
      // nenhuma para ela travar a faixa que se quer ouvir AGORA. Vai para tras
      // e insere-se na fila que existir quando chegar.
      //
      // FALHAR REPOE O CONTADOR NA MESMA. Sem isto, a partir do primeiro
      // falhanco a condicao ficava verdadeira para sempre e CADA mudanca de
      // faixa ia a rede, que tem quota diaria.
      // DEPOIS de a faixa mudar, e nao ao mesmo tempo.
      //
      // Correr isto em paralelo com o avanco reintroduzia a corrida que o
      // comentario mais abaixo descreve: a sugestao inseria-se na fila e o
      // `playTrack`, que recebe a fila por argumento, gravava a copia ANTIGA
      // por cima -- a sugestao desaparecia sem deixar rasto. O atraso poe-na
      // depois de tudo assentar, e a insercao ja usa a fila que existir nessa
      // altura.
      //
      // Dois segundos nao custam nada a uma descoberta que so vai tocar dali a
      // umas faixas, e custam tudo se estiverem a travar o botao de seguinte.
      setTimeout(() => {
        void get().intercalarSugestao().then((entrou) => {
          if (!entrou) set({ desdeASugestao: 0 });
        });
      }, ATRASO_DA_SUGESTAO_MS);
    }

    // A FILA LÊ-SE AQUI, DEPOIS DA SUGESTÃO, e não no início da função.
    //
    // Isto era o bug que fazia o shuffle inteligente calar-se depois das
    // primeiras faixas semeadas: o `intercalarSugestao` mete uma faixa na
    // fila e a chave dela no percurso, mas quem estivesse com a cópia de
    // ANTES via um percurso que já a conhecia e uma fila que ainda não. Duas
    // consequências, as duas más:
    //
    //  - o `stepIndex` procurava a chave nessa fila velha, não a encontrava
    //    e devolvia `null` -- a sugestão era saltada, e ia-se parar ao rádio
    //    do fim da fila como se o percurso tivesse acabado;
    //  - e o `playTrack` recebe a fila por argumento e GRAVA-A por cima da
    //    que está na loja, portanto apagava a sugestão que acabara de
    //    entrar. Nunca chegava a aparecer no "Up next".
    //
    // As semeadas no arranque sobreviviam porque entram pelo `toggleShuffle`
    // e pelo `playShuffled`, fora daqui -- daí parecer que o modo funcionava
    // duas ou três vezes e desistia.
    const { queue, queueIndex, repeatMode, shuffle, playTrack } = get();

    // Fim da fila: em vez de silêncio, o rádio. Normalmente já estendeu a
    // fila em antecipação (useAutoplayRadio) e nem se chega aqui; isto é a
    // rede de segurança para quando a rede foi lenta. Não recursa em ciclo:
    // se estender, a fila cresceu e a chamada seguinte encontra faixa; se
    // não estender, pára.
    const stopOrRadio = async () => {
      if (await get().extendQueueWithRadio()) {
        await get().next(false);
        return;
      }
      set(passo(get().maquina, 'quer-parar'));
    };

    // Shuffle: seguir o percurso materializado, não sortear.
    //
    // O que estava aqui antes sorteava um índice diferente do atual a cada
    // chamada. Isso repete faixas antes de tocar as outras todas — numa fila
    // de 20, ouvir as 20 sem repetição era praticamente impossível.
    if (shuffle && queue.length > 1) {
      const order = get()._ensureShuffleOrder();
      const target = stepIndex(order, queue, queueIndex, 1);
      if (target !== null) {
        await playTrack(queue[target], queue, false, true);
        return;
      }
      // Percurso esgotado: com repeat "all" baralha-se outra vez (como a
      // Spotify) em vez de repetir a mesma ordem.
      if (repeatMode === 'all') {
        const fresh = shuffleKeys(queue, queueIndex);
        set({ shuffleOrder: fresh });
        const first = stepIndex(fresh, queue, queueIndex, 1);
        if (first !== null) {
          await playTrack(queue[first], queue, false, true);
          return;
        }
      }
      await stopOrRadio();
      return;
    }

    if (queueIndex + 1 < queue.length) {
      await playTrack(queue[queueIndex + 1], queue, false, true);
    } else if (repeatMode === 'all') {
      await playTrack(queue[0], queue, false, true);
    } else {
      await stopOrRadio();
    }
  },

  prev: async () => {
    if (ouvirJuntos()) {
      await get().seekTo(0);
      return;
    }
    const { queue, queueIndex, repeatMode, playTrack, positionMs, seekTo } = get();
    // Comportamento standard (Spotify/Apple Music): com mais de 3s de
    // reprodução, "anterior" recomeça a faixa atual em vez de recuar na fila.
    if (positionMs > 3000) {
      await seekTo(0);
      return;
    }
    // Com shuffle, "anterior" volta pelo caminho por onde veio — impossível
    // enquanto a ordem era sorteada a cada salto.
    if (get().shuffle && queue.length > 1) {
      const order = get()._ensureShuffleOrder();
      const target = stepIndex(order, queue, queueIndex, -1);
      if (target !== null) {
        await playTrack(queue[target], queue, false, true);
        return;
      }
      if (repeatMode === 'all') {
        const lastKey = order[order.length - 1];
        const last = queue.findIndex((t) => trackKey(t) === lastKey);
        if (last >= 0) await playTrack(queue[last], queue, false, true);
      }
      return;
    }
    if (queueIndex - 1 >= 0) {
      await playTrack(queue[queueIndex - 1], queue, false, true);
    } else if (repeatMode === 'all' && queue.length > 0) {
      await playTrack(queue[queue.length - 1], queue, false, true);
    }
  },

  prepararFecho: async () => {
    const s = ouvirJuntos();
    if (!s) return true;
    try { return await s.sairAoFechar(); } catch { s.avisarErro(); return false; }
  },

  close: async () => {
    if (!await get().prepararFecho()) return;
    ++playRequestId; // Respostas de uma resolução antiga não reabrem o player.
    // Parar o áudio ANTES de desmontar o player (com staysActiveInBackground
    // a media podia continuar a tocar mesmo depois de fechar o ecrã).
    get()._yt?.pause();
    set({
      closing: false, closeGain: 1,
      current: null,
      queue: [],
      queueIndex: 0,
      ...passo(get().maquina, 'parou-tudo'),
      expanded: false,
      ...posicao(0),
      durationMs: 0,
      error: null,
      activeBackend: 'resolving',
    });
    contextosDaFila.clear();
    contextoAtual=null;
  },

  setAutoplayRadio: (v) => set({ autoplayRadio: v }),

  setVolumeNormalization: (v) => set({ volumeNormalization: v }),

  extendQueueWithRadio: async () => {
    if (ouvirJuntos()) return false;
    const { autoplayRadio, current, queue, queueIndex, repeatMode } = get();
    if (
      !shouldExtendWithRadio(autoplayRadio, !!current, get().upcomingQueue().length, repeatMode)
    ) {
      return false;
    }
    // Duas idas à rede em simultâneo (o efeito de antecipação e o `next()`
    // disparam quase ao mesmo tempo) duplicavam as faixas na fila.
    if (radioInFlight) return false;
    radioInFlight = true;
    try {
      const tracks = filterSuggestions(await fetchRadioTracks(radioSeeds(queue, queueIndex), queue));
      if(useConnectivity.getState().offline||get().queue!==queue||!get().autoplayRadio)return false;
      if (tracks.length === 0) return false;

      // A fila pode ter mudado enquanto isto foi à rede — reler o estado,
      // nunca usar o que foi capturado no início.
      const live = get();
      const merged = [...live.queue, ...tracks];
      const contexto=contextoDoRadioAutomatico();
      for(const track of tracks)contextosDaFila.set(trackKey(track),contexto);
      set({
        queue: merged,
        radioActive: true,
        shuffleOrder: live.shuffle
          ? reconcileOrder(live.shuffleOrder, merged, live.queueIndex)
          : [],
      });
      registar('recomendacao_mostrada',{...contextoParaAnalytics(contexto),quantidade:tracks.length});
      return true;
    } catch {
      return false;
    } finally {
      radioInFlight = false;
    }
  },

  upcomingQueue: () => {
    const { queue, queueIndex, shuffle, shuffleOrder } = get();
    if (queue.length === 0) return [];
    if (!shuffle || shuffleOrder.length === 0) {
      return queue
        .slice(queueIndex + 1)
        .map((track, i) => ({ track, index: queueIndex + 1 + i }));
    }
    return upcomingIndexes(shuffleOrder, queue, queueIndex).map((index) => ({
      track: queue[index],
      index,
    }));
  },

  _ensureShuffleOrder: () => {
    const { queue, queueIndex, shuffleOrder } = get();
    const order = reconcileOrder(shuffleOrder, queue, queueIndex);
    set({ shuffleOrder: order });
    return order;
  },

  proximaFaixa: () => proximaFaixa(ouvirJuntos(), get().peekNextTrack),

  peekNextTrack: () => {
    const { queue, queueIndex, repeatMode, shuffle, shuffleOrder } = get();
    if (queue.length === 0) return null;
    // Repeat "one" volta à mesma faixa: já está em cache, nada a pré-carregar.
    if (repeatMode === 'one') return null;

    if (shuffle && queue.length > 1) {
      // Sem percurso ainda (shuffle acabado de ligar sem nenhum salto), não
      // se adivinha — gerar aqui daria uma ordem diferente da que o `next()`
      // vai usar, e pré-carregava-se a faixa errada.
      if (shuffleOrder.length === 0) return null;
      const target = stepIndex(shuffleOrder, queue, queueIndex, 1);
      // Fim do percurso com repeat "all": vai baralhar outra vez, é
      // imprevisível por definição. Melhor não pré-carregar nada.
      return target !== null ? queue[target] : null;
    }

    if (queueIndex + 1 < queue.length) return queue[queueIndex + 1];
    if (repeatMode === 'all') return queue[0];
    return null;
  },

  seekTo: async (ms, interno = false) => {
    if (!interno && ouvirJuntos()) {
      await comandarJam(async s => { if (decisaoDeControlo(s) === 'anunciar') await s.procurar(ms); });
      return;
    }
    const { current, _yt, durationMs } = get();
    if (!current) return;
    const clamped = Math.max(0, Math.min(ms, durationMs));
    set(posicao(clamped));
    _yt?.seek(clamped);
  },

  setExpanded: (v) => set({ expanded: v }),
  setRepeatMode: (m) => set({ repeatMode: m }),
  cycleRepeat: () =>
    set((s) => ({
      repeatMode: s.repeatMode === 'off' ? 'all' : s.repeatMode === 'all' ? 'one' : 'off',
    })),
  // Ligar o shuffle gera o percurso de raiz (com a faixa atual à cabeça);
  // desligar deita-o fora, para a próxima vez começar limpo.
  setShuffle: (v) =>
    set((s) => ({
      shuffle: v,
      shuffleOrder: v ? shuffleKeys(s.queue, s.queueIndex) : [],
    })),
  /** O botão cicla off → normal → inteligente → off. */
  toggleShuffle: () => {
    const seguinte = proximoModo(modoDeShuffle(get().shuffle, get().shuffleInteligente));
    set({ shuffleInteligente: seguinte === 'inteligente' });
    persistShuffleInteligente(seguinte === 'inteligente').catch(() => {});
    get().setShuffle(seguinte !== 'off');
    // LIGAR O MODO TEM DE SE VER. Sem isto a primeira sugestao so entrava ao
    // fim de quatro faixas: carregava-se no botao, olhava-se para o "Up next"
    // e estava tudo igual -- que foi exatamente a queixa. Agora semeiam-se
    // algumas de imediato, e a partir dai o ritmo normal toma conta.
    if (seguinte === 'inteligente') void get().semearSugestoes();
  },

  /**
   * Mete VARIAS sugestoes na fila de uma vez, espalhadas pelo que vem a
   * seguir. E o que faz ligar o modo ter efeito visivel.
   *
   * Espalhadas e nao todas juntas: tres seguidas fariam a playlist parecer
   * outra. Vao de tres em tres faixas, que e o mesmo ritmo com que entram
   * depois.
   */
  semearSugestoes: async () => {
    const { queue, queueIndex, sugeridas } = get();
    if (queue.length === 0) return 0;
    try {
      const contexto = radioSeeds(queue, queueIndex);
      if (contexto.length === 0) return 0;
      const naFila = new Set(queue.map((t) => trackKey(t)));
      const candidatas = await candidatasParaDescoberta(
        contexto, naFila, new Set(sugeridas),
        // Mais fundo e mais largo, e e isto que corrige o "aparecem sempre as
        // mesmas".
        //
        // Estava a usar os valores por omissao: DOIS alvos, tirados apenas das
        // ultimas tres faixas ouvidas. Dentro de uma playlist essas tres sao
        // quase sempre do mesmo mundo, portanto os dois alvos eram sempre os
        // mesmos, os vizinhos deles eram sempre os mesmos, e a lista de onde
        // se escolhe era sempre a mesma meia duzia. O `sugeridas` evitava o
        // repetido exacto; nao evitava o poco ser raso.
        //
        // Quatro alvos e o que a descoberta ja usa, e o retrato das escutas
        // faz os alvos representarem o que se ouve E NAO so o que esta a dar
        // agora.
        POR_SUGESTAO, ALVOS_DA_SUGESTAO, await retratoDeEscutas(),
      );
      if(useConnectivity.getState().offline||get().queue!==queue||!get().shuffleInteligente)return 0;
      if (candidatas.length === 0) return 0;

      const filtradas=filterSuggestions(candidatas);
      const quantas = Math.min(3, filtradas.length);
      let fila = [...get().queue];
      let ordem = [...get().shuffleOrder];
      const novas: string[] = [];
      const base = get().queueIndex;
      // O mesmo ritmo das sugestões uma a uma: uma a cada `A_CADA` faixas.
      const intervalo=A_CADA;
      const contextoDaSugestao=contextoDoSmartShuffle();

      for (let i = 0; i < quantas; i++) {
        const t = filtradas[i];
        const chave = trackKey(t);
        if (!chave || fila.some((q) => trackKey(q) === chave)) continue;
        const posicao = Math.min(base + 1 + (i + 1) * intervalo, fila.length);
        fila = [...fila.slice(0, posicao), t, ...fila.slice(posicao)];
        if (ordem.length > 0) {
          const actual = fila[base] ? trackKey(fila[base]) : null;
          const onde = actual ? ordem.indexOf(actual) : -1;
          const alvo = onde >= 0 ? Math.min(onde + 1 + (i + 1) * intervalo, ordem.length) : ordem.length;
          ordem = [...ordem.slice(0, alvo), chave, ...ordem.slice(alvo)];
        }
        novas.push(chave);
        contextosDaFila.set(chave,contextoDaSugestao);
      }
      if (novas.length === 0) return 0;

      set({
        queue: fila,
        shuffleOrder: ordem,
        sugeridas: [...sugeridas, ...novas].slice(-200),
        desdeASugestao: 0,
      });
      registar('recomendacao_mostrada',{...contextoParaAnalytics(contextoDaSugestao),quantidade:novas.length});
      return novas.length;
    } catch {
      return 0;
    }
  },

  /**
   * Mete na fila uma faixa relacionada e toca-a. Devolve se conseguiu.
   *
   * As candidatas vêm do mesmo sítio que o rádio (`api/radio.ts`), que já sabe
   * partir das últimas ouvidas e excluir o que já lá está. Falhar aqui NÃO é
   * um erro: quem falha volta ao shuffle normal e o utilizador nem dá por
   * isso — uma funcionalidade de descoberta não pode partir a reprodução.
   */
  intercalarSugestao: async () => {
    const { queue, queueIndex, sugeridas } = get();
    if (queue.length === 0) return false;
    try {
      // O CONTEXTO sao as ultimas ouvidas e nao so a atual: numa fila variada
      // a ultima faixa pode nao representar o que se esteve a ouvir.
      const contexto = radioSeeds(queue, queueIndex);
      if (contexto.length === 0) return false;
      const naFila = new Set(queue.map((t) => trackKey(t)));
      const candidatas = await candidatasParaDescoberta(
        contexto, naFila, new Set(sugeridas),
        // Mais fundo e mais largo, e e isto que corrige o "aparecem sempre as
        // mesmas".
        //
        // Estava a usar os valores por omissao: DOIS alvos, tirados apenas das
        // ultimas tres faixas ouvidas. Dentro de uma playlist essas tres sao
        // quase sempre do mesmo mundo, portanto os dois alvos eram sempre os
        // mesmos, os vizinhos deles eram sempre os mesmos, e a lista de onde
        // se escolhe era sempre a mesma meia duzia. O `sugeridas` evitava o
        // repetido exacto; nao evitava o poco ser raso.
        //
        // Quatro alvos e o que a descoberta ja usa, e o retrato das escutas
        // faz os alvos representarem o que se ouve E NAO so o que esta a dar
        // agora.
        POR_SUGESTAO, ALVOS_DA_SUGESTAO, await retratoDeEscutas(),
      );
      if(useConnectivity.getState().offline||!get().shuffleInteligente)return false;
      const escolhida = escolherSugestao(
        filterSuggestions(candidatas), (t) => trackKey(t), naFila, new Set(sugeridas),
      );
      if (!escolhida) return false;

      // A fila de AGORA, e nao a de quando esta procura comecou.
      //
      // Isto deixou de correr antes de a faixa mudar (ver o `next`), por isso
      // quando chega aqui a fila ja avancou. Insistir na copia antiga ou
      // desistir por ela ter mudado era, nos dois casos, transformar uma ida a
      // rede num desperdicio.
      const filaAgora = get().queue;
      const indiceAgora = get().queueIndex;
      if (filaAgora.length === 0) return false;
      // Entretanto pode ter entrado por outro caminho.
      if (filaAgora.some((t) => trackKey(t) === trackKey(escolhida))) return false;

      const posicao = posicaoDaSugestao(filaAgora.length, indiceAgora);
      const nova = [...filaAgora.slice(0, posicao), escolhida, ...filaAgora.slice(posicao)];
      const chave = trackKey(escolhida);
      contextosDaFila.set(chave,contextoDoSmartShuffle());

      // O PERCURSO DO SHUFFLE NAO SE LIMPA: enfia-se a chave logo a seguir a
      // atual. Limpa-lo obrigava a gerar um percurso novo, e num percurso novo
      // as faixas JA OUVIDAS voltam a entrar -- o shuffle inteligente partia a
      // garantia de cada faixa tocar uma vez, que e o que este percurso existe
      // para dar. Apanhado numa captura de ecra do utilizador, com uma faixa
      // ja tocada de volta no "Up next".
      const ordem = get().shuffleOrder;
      let novaOrdem = ordem;
      if (ordem.length > 0) {
        const actual = filaAgora[indiceAgora] ? trackKey(filaAgora[indiceAgora]) : null;
        const onde = actual ? ordem.indexOf(actual) : -1;
        novaOrdem = onde >= 0
          ? [...ordem.slice(0, onde + 1), chave, ...ordem.slice(onde + 1)]
          : [...ordem, chave];
      }

      // NAO interrompe: a sugestao entra na fila e toca quando la chegar. A
      // tocar de imediato nunca chegava a estar no "Up next" -- e no iOS, onde
      // trocar de faixa descarrega o ficheiro primeiro, calava a musica
      // durante segundos.
      set({
        queue: nova,
        shuffleOrder: novaOrdem,
        sugeridas: [...sugeridas, chave].slice(-200),
        desdeASugestao: 0,
      });
      registar('recomendacao_mostrada',{
        ...contextoParaAnalytics(contextoDoSmartShuffle()),
        quantidade:1,
      });
      return true;
    } catch {
      return false;
    }
  },
  setShowRewindButton: (v) => set({ showRewindButton: v }),
  setError: (e) => set({ error: e }),

  setVolume: (v) => {
    const clamped = Math.max(0, Math.min(100, v));
    set({ volume: clamped });
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('duotone-volume', String(clamped));
      } catch (e) {
        console.warn('Failed to save volume to localStorage', e);
      }
    }
    get()._yt?.setVolume?.(clamped * get().closeGain);
  },

  registerYtControls: (c) => {
    set({ _yt: c });
    if (c && c.setVolume) {
      c.setVolume(get().volume * get().closeGain);
    }
  },

  _setActiveBackend: (b) => set({ activeBackend: b }),

  _onYtStateChange: (s) => {
    if (get().closing && s === 'ended') return;
    if (s === 'ended') {
      if (ouvirJuntos()) { void comandarJam(jam => jam.avancar(true)); return; }
      const { repeatMode, _yt } = get();
      if (repeatMode === 'one') {
        _yt?.seek(0);
        _yt?.play();
        return;
      }
      get().next(false);
      return;
    }
    // Confirmacao DO MOTOR: mexe na fase, nunca na intencao. Uma confirmacao
    // atrasada ressuscitava a reproducao depois de o utilizador pausar.
    set(passo(get().maquina, s === 'playing' ? 'a-tocar' : 'em-pausa'));
  },

  _setProgress: (positionMs, durationMs) => {
    set({ ...posicao(positionMs), durationMs });
    medirEscuta(get(), positionMs, durationMs);
  },

  _setIsPlaying: (v) => set(passo(get().maquina, v ? 'quer-tocar' : 'quer-parar')),

  _setBuffering: (v) => set(passo(get().maquina, v ? 'a-encher' : 'motor-pronto')),

  setSleepTimer: (minutes) => {
    const { fimEm, restanteS } = prazoDoTemporizador(minutes, Date.now());
    set({ sleepTimerEndsAt: fimEm, sleepTimerTimeLeft: restanteS });
  },

  tickSleepTimer: () => get().checkSleepTimer(),

  checkSleepTimer: () => {
    const { sleepTimerEndsAt, sleepTimerTimeLeft } = get();
    if (!sleepTimerEndsAt) return;
    const { restanteS, terminou } = restanteDoTemporizador(sleepTimerEndsAt, Date.now());
    if (restanteS !== sleepTimerTimeLeft) set({ sleepTimerTimeLeft: restanteS });
    if (terminou) {
      set({ sleepTimerEndsAt: null });
      get().pausePlayback();
    }
  },

  _setDownloadProgress: (p) => set({ downloadProgress: p }),

  setEqGanhos: (g, comoPadrao = false) => {
    const ganhos = normalizarGanhos(g);
    if (comoPadrao) {
      // SÓ o padrão -- é a mesma decisão, e a mesma razão, do `setPlaybackRate`
      // aqui em baixo. Mexer na definição não pode alterar a música que está a
      // tocar: é o que o próprio controlo promete ("aplica-se às faixas que não
      // tenham equalizador próprio"), e escrever também o `eqGanhos` fazia dele
      // um equalizador disfarçado de definição. O valor passa a valer a partir
      // da faixa seguinte que não tenha ajuste seu -- ver `ajusteAoTocar`.
      //
      // Persistido aqui e não nos ecrãs de Definições: são dois, o do telemóvel
      // e o do PC, e assim nenhum se pode esquecer.
      set({ padraoGanhos: ganhos });
      persistEqPadrao(ganhos).catch(() => {});
      guardarOPadrao(get().padraoRate, ganhos);
      return;
    }
    set({ eqGanhos: ganhos });
    void aplicarEqNoMotor(ganhos);
    lembrarDaFaixa();
  },

  /** Hidratação e atualizações remotas; aplica também à faixa já aberta. */
  _carregarAjustes: (m, ganhos, rate) => {
    // A LINHA GANHA À PREFERÊNCIA. Ela é a única das duas que atravessa
    // aparelhos vivos -- e chega aqui já fundida pela data, com a edição mais
    // recente de qualquer aparelho por cima. Sem linha nenhuma (ninguém ainda
    // tocou no controlo depois desta versão) vale o que veio das preferências,
    // que é o comportamento de sempre.
    const doServidor = padraoGuardado(m);
    const g = normalizarGanhos(doServidor?.ganhos ?? ganhos);
    const r = arredondarRate(doServidor?.rate ?? rate);
    // Escrito também na preferência local: é dela que o arranque seguinte lê,
    // antes de a sincronização acordar, e é ela que os dois ecrãs de Definições
    // mostram. NÃO se chama o `guardarOPadrao` aqui -- isto é a chegada de uma
    // edição, não uma edição, e reenviá-la era um ciclo.
    if (doServidor) {
      persistEqPadrao(g).catch(() => {});
      persistPlaybackRate(r).catch(() => {});
    }
    // O PADRAO e o que vem das Definicoes. Ate aqui era tambem o que ficava
    // aplicado, e isso era um bug que se lia como "nao guardou": a sessao
    // restaura a faixa PAUSADA, sem passar pelo `playTrack` — e o `playTrack`
    // e o unico sitio que aplicava o que a faixa lembra. Resultado: mexias no
    // EQ, fechavas a app, e ao voltar aparecia tudo a zero. Os dados estavam
    // guardados; o que faltava era aplica-los ao restaurar.
    const faixa = get().current;
    const aplicar = faixa
      ? ajusteAoTocar(m, chaveDaFaixa(faixa), { rate: r, ganhos: g })
      : { rate: r, ganhos: g };
    const ganhosMudaram=aplicar.ganhos.some((v,i)=>v!==get().eqGanhos[i]);
    set({
      ajustesPorFaixa: m,
      padraoGanhos: g,
      padraoRate: r,
      eqGanhos: aplicar.ganhos.every((v,i)=>v===get().eqGanhos[i])?get().eqGanhos:aplicar.ganhos,
      playbackRate: arredondarRate(aplicar.rate),
    });
    if(ganhosMudaram)void aplicarEqNoMotor(aplicar.ganhos);
  },

  setPlaybackRate: (rate, comoPadrao = false) => {
    const v = arredondarRate(rate);
    if (comoPadrao) {
      // SÓ o padrão. Mexer na definição não pode alterar a música que está a
      // tocar — é o que o próprio controlo promete ("the default for tracks
      // you have not set individually"), e escrever também o `playbackRate`
      // fazia dele um controlo de velocidade disfarçado de definição. O valor
      // passa a valer a partir da faixa seguinte que não tenha ajuste próprio
      // (ver `ajusteAoTocar`, onde o padrão é aplicado a cada mudança).
      set({ padraoRate: v });
      // Persistido aqui e não nos ecrãs de Definições: são dois (telemóvel e
      // desktop) e assim nenhum se pode esquecer. Antes o preset voltava a
      // "normal" a cada arranque, apesar de estar apresentado como definição.
      persistPlaybackRate(v).catch(() => {});
      guardarOPadrao(v, get().padraoGanhos);
    } else {
      if (get().playbackRate === v) return;
      set({ playbackRate: v });
      lembrarDaFaixa();
    }
  },

  /**
   * Reordena o que se VÊ em "Up next", com shuffle ligado ou desligado.
   *
   * Com o shuffle desligado o que está à frente do utilizador é a fila, e
   * mexer na fila chega. Com o shuffle ligado não é: a ordem visível sai do
   * `shuffleOrder`, que é uma lista de chaves, e a fila por baixo pode estar
   * em qualquer ordem. Mover a FILA nesse caso não mudava nada do que se via
   * -- e era por isso que reordenar estava simplesmente desligado com o
   * shuffle ligado.
   *
   * Desligar o gesto era a resposta certa para as setas, que só sabiam mexer
   * na fila. Para o arrasto a resposta certa é outra: mexer no sítio onde a
   * ordem vive mesmo.
   */
  reordenarProximas: (de, para) => {
    if (de === para) return;
    const proximas = get().upcomingQueue();
    const origem = proximas[de], destino = proximas[para];
    if (!origem || !destino) return;
    if (!get().shuffle) {
      get().moveQueueItem(origem.index, destino.index);
      return;
    }
    const ordem = get()._ensureShuffleOrder();
    const i = ordem.indexOf(trackKey(origem.track));
    const j = ordem.indexOf(trackKey(destino.track));
    if (i < 0 || j < 0) return;
    set({ shuffleOrder: movido(ordem, i, j) });
  },

  moveQueueItem: (fromIndex, toIndex) => {
    const { queue, queueIndex } = get();
    if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) return;

    const newQueue = [...queue];
    const [movedItem] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, movedItem);

    let newIndex = queueIndex;
    if (fromIndex === queueIndex) {
      newIndex = toIndex;
    } else if (fromIndex < queueIndex && toIndex >= queueIndex) {
      newIndex = queueIndex - 1;
    } else if (fromIndex > queueIndex && toIndex <= queueIndex) {
      newIndex = queueIndex + 1;
    }

    set({ queue: newQueue, queueIndex: newIndex });
  },

  removeFromQueue: (index) => {
    if (ouvirJuntos()) return; // A fila Jam usa retirarSugestao, por id do servidor.
    const { queue, queueIndex } = get();
    if (index < 0 || index >= queue.length) return;

    const newQueue = [...queue];
    newQueue.splice(index, 1);

    let newIndex = queueIndex;
    if (index === queueIndex) {
      if (newQueue.length === 0) {
        set({ current: null, queue: [], queueIndex: 0, ...passo(get().maquina, 'parou-tudo') });
        return;
      }
      newIndex = Math.min(queueIndex, newQueue.length - 1);
      set({ queue: newQueue, queueIndex: newIndex, current: newQueue[newIndex] });
      return;
    } else if (index < queueIndex) {
      newIndex = queueIndex - 1;
    }

    set({ queue: newQueue, queueIndex: newIndex });
  },

  pausePlayback: () => {
    const { isPlaying, _yt } = get();
    if (isPlaying) {
      _yt?.pause();
      set(passo(get().maquina, 'quer-parar'));
    }
  },
    }),
    {
      name: 'player-session',
      storage: deferredJsonStorage(),
      // Persistimos apenas o necessário para "continuar a ouvir" após a app
      // ser morta: faixa atual, fila e posição. Repeat/shuffle já vivem nas
      // prefs; o resto é estado transitório.
      partialize: sessaoParaGuardar,
      // No restauro, a sessão volta PAUSADA: o player prepara o áudio
      // (autoplayOnLoad=false) e retoma na posição guardada quando o
      // utilizador carregar em play.
      merge: (persisted: any, current) => {
        if (!persisted?.current) return current;
        return {
          ...current,
          ...persisted,
          // Uma sessao gravada por uma versao anterior nao tem estes dois
          // campos. Sem o `??`, o `sugeridas` chegava `undefined` e a lista da
          // fila rebentava no primeiro `includes` -- a app parte ao ABRIR, na
          // primeira vez depois da atualizacao.
          sugeridas: persisted.sugeridas ?? current.sugeridas,
          desdeASugestao: persisted.desdeASugestao ?? current.desdeASugestao,
          ...restoredPlaybackState(persisted.positionMs),
          // A posição guardada é verdade AGORA: a sessão volta em pausa,
          // portanto não andou nada desde que foi gravada. Sem este carimbo
          // o handoff publicava-a com a hora do arranque do módulo.
          positionAt: Date.now(),
          // A cache de ajustes pode chegar antes da sessão. Aplicá-la aqui
          // cobre essa ordem sem iniciar reprodução nem alterar a posição.
          ...(() => {
            const adjustment=ajusteAoTocar(current.ajustesPorFaixa,chaveDaFaixa(persisted.current),{rate:current.padraoRate,ganhos:current.padraoGanhos});
            return {playbackRate:arredondarRate(adjustment.rate),eqGanhos:adjustment.ganhos};
          })(),
          // A maquina TEM de acompanhar o restauro. Sem isto ficava em
          // `sem-faixa` com uma faixa carregada, e como a maquina ignora
          // ordens sem faixa, o botao de play deixava de responder ao abrir a
          // app. Pausado e por resolver e exatamente o que o restauro e.
          maquina: { intencao: 'parar', fase: 'a-resolver' } as const,
        };
      },
    }
  )
);
