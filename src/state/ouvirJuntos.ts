import { registarOuvirJuntos, usePlayer } from './player';
import { confirmarFechoDaSessao } from '../lib/confirmarFechoDaSessao';
import { create } from 'zustand';
import { AppState } from 'react-native';
import {
  continuoNaSessao, convidar, criarSessao, definirFaixa, entrar,
  juntarAFila, juntarMuitasAFila, lerFila, lerMembros, lerSessao, marcarPronto, membroDaLinha,
  minhaSessaoAberta, pausar, permitirControlo, relogioActualizado, retomar,
  sair, sessaoDaLinha, tirarDaFila, avancarFila, procurarNaSessao,
  type ItemDaFila, type MembroDaSessao, type SessaoDeEscuta,
} from '../api/ouvirJuntos';
import { agoraNoServidor, type Estimativa } from '../lib/relogioPartilhado';
import { posicaoDaSessao } from '../lib/sincronizacao';
import { appEstaVisivel } from '../lib/appVisibility';
import { supabase } from '../lib/supabase';
import type { Track } from '../types';

/**
 * A sessão de escuta partilhada, do lado da app.
 *
 * ## Duas camadas, e não uma
 *
 * As TABELAS levam o que tem de ser verdade para quem chega a meio: quem está
 * na sessão, a faixa actual, as permissões. Chegam por `postgres_changes`, que
 * é durável e um pouco mais lento.
 *
 * A posição não passa por aqui, e é isso que mantém as escritas raras: guarda-se
 * o INSTANTE em que a faixa começou (uma escrita, quando a faixa muda) e cada
 * cliente deriva a posição sozinho. Não é preciso ninguém andar a anunciar onde
 * vai.
 *
 * ## O batimento é para saber quem lá está, não onde vai
 *
 * `continuo_na_sessao` de meio em meio minuto. Serve para a lista de membros
 * não ficar com fantasmas de gente que fechou a app à bruta.
 */

const BATIMENTO_MS = 30_000;

type Estado = {
  sessao: SessaoDeEscuta | null;
  membros: MembroDaSessao[];
  fila: ItemDaFila[];
  relogio: Estimativa | null;
  /** O nosso id, guardado para não o pedir a cada render. */
  euId: string | null;

  souAnfitriao: () => boolean;
  possoControlar: () => boolean;
  /** Onde a sessão está agora, em ms. `null` sem informação suficiente. */
  posicaoAgora: () => number | null;
  /**
   * A sessão acabou agora, e ainda não foi dito a quem cá está.
   *
   * O anfitrião a sair fecha a sessão para todos. Desaparecer a barra sem
   * explicação deixava as pessoas a pensar que a app tinha estoirado.
   */
  acabouSemAviso: boolean;
  limparAviso: () => void;
  /**
   * Uma frase curta que a barra mostra em vez do estado, por uns segundos.
   *
   * Existe porque um toque numa música dentro de uma sessão junta-a à fila em
   * vez de a tocar -- e sem uma palavra isso lê-se como o toque não ter feito
   * nada. A barra é onde a sessão fala; é lá que se diz.
   */
  aviso: string | null;

  ligar: (userId: string) => Promise<void>;
  desligar: () => void;

  abrir: (track: Track | null, amigos: readonly string[], mensagem?: string) => Promise<string>;
  juntarSe: (sessao: string) => Promise<void>;
  abandonar: () => Promise<void>;
  convidarMais: (amigos: readonly string[], mensagem?: string) => Promise<void>;

  anunciarFaixa: (track: Track) => Promise<void>;
  anunciarPausa: (posicaoMs: number) => Promise<void>;
  anunciarRetoma: () => Promise<void>;
  anunciarPosicao: (ms: number) => Promise<void>;
  darControlo: (pode: boolean) => Promise<void>;
  anunciarProntidao: (pronta: boolean, percentagem?: number) => Promise<void>;

  sugerir: (track: Track) => Promise<void>;
  /** A lista toda de uma vez, quando se dá play numa playlist cá dentro. */
  semearFila: (tracks: readonly Track[]) => Promise<void>;
  retirarSugestao: (item: string) => Promise<void>;
  /**
   * Tira a primeira da fila e põe-na a tocar. Só quem manda.
   *
   * Devolve `false` quando não havia nada ou a cabeça já mudou. Nunca autoriza
   * um fallback para repeat, rádio ou fila pessoal durante a sessão.
   */
  avancarPelaFila: () => Promise<boolean>;
  actualizar: () => Promise<void>;
};

let canal: ReturnType<typeof supabase.channel> | null = null;
let batimento: ReturnType<typeof setInterval> | null = null;
let subscricaoDeEstado: { remove: () => void } | null = null;
/** Cresce a cada `ligar`: respostas de uma ligação antiga não escrevem estado. */
let geracao = 0;
let leitura = 0;
let avancando = false;
let fecho: Promise<boolean> | null = null;


export const useOuvirJuntos = create<Estado>((set, get) => ({
  sessao: null,
  membros: [],
  fila: [],
  relogio: null,
  euId: null,
  acabouSemAviso: false,
  aviso: null,

  souAnfitriao: () => {
    const { sessao, euId } = get();
    return !!sessao && !!euId && sessao.hostId === euId;
  },

  possoControlar: () => {
    const { sessao } = get();
    if (!sessao) return false;
    return get().souAnfitriao() || sessao.convidadosControlam;
  },

  limparAviso: () => set({ acabouSemAviso: false }),

  posicaoAgora: () => {
    const { sessao, relogio } = get();
    if (!sessao) return null;
    // Em pausa a posição é absoluta -- `pausadaEmMs` -- e não passa por relógio
    // nenhum. A tocar deriva-se do `started_at`, e aí SEM ESTIMATIVA NÃO HÁ
    // RESPOSTA: o `agoraNoServidor` devolve o relógio local quando não tem
    // desvio medido, e isso não é a posição da sessão, é a posição segundo o
    // relógio deste telemóvel. Dois telemóveis, dois relógios, e o seek de
    // quem arrasta a barra deixa-os a um segundo um do outro sem que a
    // correcção dê por isso -- ela compara contra o mesmo relógio torto.
    //
    // Devolver `null` faz quem chama não saltar, que é o certo: ficar onde se
    // está é melhor do que saltar para um sítio inventado. O `actualizar()`
    // volta a medir a cada leitura enquanto não houver estimativa.
    if (sessao.aTocar && !relogio) return null;
    return posicaoDaSessao(
      {
        comecouEmServidor: sessao.comecouEmServidor,
        pausadaEmMs: sessao.pausadaEmMs,
        aTocar: sessao.aTocar,
        duracaoMs: (sessao.track?.durationSeconds ?? 0) * 1000,
      },
      agoraNoServidor(relogio, Date.now())
    );
  },

  // -------------------------------------------------------------------------

  ligar: async (userId) => {
    get().desligar();
    const minha = ++geracao;
    set({ euId: userId });

    // Reabrir a app não é sair de uma sessão.
    const sessao = await minhaSessaoAberta(userId);
    if (minha !== geracao) return;
    if (!sessao) return;

    const [membros, fila, relogio] = await Promise.all([
      lerMembros(sessao.id),
      lerFila(sessao.id),
      relogioActualizado(null),
    ]);
    if (minha !== geracao) return;
    set({ sessao, membros, fila, relogio });

    canal = supabase
      .channel(`sessao:${sessao.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listening_sessions', filter: `id=eq.${sessao.id}` },
        (evento) => {
          if (minha !== geracao) return;
          const nova = sessaoDaLinha(evento.new as any);
          // Acabou por decisão de outra pessoa -- normalmente o anfitrião a
          // sair. Sai-se sozinho, mas DIZ-SE: uma barra que desaparece sem
          // explicação lê-se como a app ter estoirado.
          if (nova.acabouEm) { get().desligar(); set({ acabouSemAviso: true }); return; }
          set({ sessao: nova });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listening_members', filter: `session_id=eq.${sessao.id}` },
        () => {
          if (minha !== geracao) return;
          void lerMembros(sessao.id).then((m) => { if (minha === geracao) set({ membros: m }); });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listening_queue', filter: `session_id=eq.${sessao.id}` },
        () => {
          if (minha !== geracao) return;
          void lerFila(sessao.id).then((f) => { if (minha === geracao) set({ fila: f }); });
        }
      )
      .subscribe();

    batimento = setInterval(() => {
      const s = get().sessao;
      if (!s || !appEstaVisivel()) return;
      void continuoNaSessao(s.id);
    }, BATIMENTO_MS);

    // Ao voltar ao primeiro plano, o relógio pode ter envelhecido e a sessão
    // pode ter mudado sem nós -- o realtime não entrega com a app suspensa.
    subscricaoDeEstado = AppState.addEventListener('change', () => {
      if (!appEstaVisivel() || minha !== geracao) return;
      const s = get().sessao;
      if (!s) return;
      void Promise.all([
        lerSessao(s.id), lerMembros(s.id), lerFila(s.id), relogioActualizado(get().relogio),
      ]).then(([nova, membros, fila, relogio]) => {
        if (minha !== geracao) return;
        // Acabou enquanto a app estava suspensa: o realtime não entrega aí, e
        // é ao voltar que se descobre.
        if (!nova || nova.acabouEm) { get().desligar(); set({ acabouSemAviso: true }); return; }
        set({ sessao: nova, membros, fila, relogio });
      });
    });
  },

  desligar: () => {
    geracao++;
    if (canal) { void supabase.removeChannel(canal); canal = null; }
    if (batimento) { clearInterval(batimento); batimento = null; }
    subscricaoDeEstado?.remove();
    subscricaoDeEstado = null;
    set({ sessao: null, membros: [], fila: [], aviso: null });
  },

  // -------------------------------------------------------------------------

  abrir: async (track, amigos, mensagem) => {
    const id = await criarSessao(track);
    // A criação começa pausada no servidor. Preservar a audição actual antes
    // de ligar o seguidor; caso contrário o anfitrião pausava ao abrir o Jam.
    const p = usePlayer.getState();
    if (track && p.current?.sourceId === track.sourceId && p.current.source === track.source) {
      const tocava = p.isPlaying;
      await pausar(id, p.positionMs);
      if (tocava) await retomar(id);
    }
    if (amigos.length) await convidar(id, amigos, mensagem);
    const euId = get().euId;
    if (euId) await get().ligar(euId);
    return id;
  },

  juntarSe: async (sessao) => {
    await entrar(sessao);
    const euId = get().euId;
    if (euId) await get().ligar(euId);
  },

  abandonar: async () => {
    const s = get().sessao;
    if (!s) return;
    await sair(s.id);
    if (get().sessao?.id === s.id) get().desligar();
    set({ acabouSemAviso: false });
  },

  convidarMais: async (amigos, mensagem) => {
    const s = get().sessao;
    if (!s || !amigos.length) return;
    await convidar(s.id, amigos, mensagem);
  },

  // -------------------------------------------------------------------------

  anunciarFaixa: async (track) => {
    const s = get().sessao;
    if (!s || !get().possoControlar()) return;
    await definirFaixa(s.id, track);
    if (get().sessao?.id === s.id) await get().actualizar();
  },

  anunciarPausa: async (posicaoMs) => {
    const s = get().sessao;
    if (!s || !get().possoControlar()) return;
    await pausar(s.id, posicaoMs);
    if (get().sessao?.id === s.id) await get().actualizar();
  },

  anunciarRetoma: async () => {
    const s = get().sessao;
    if (!s || !get().possoControlar()) return;
    await retomar(s.id);
    if (get().sessao?.id === s.id) await get().actualizar();
  },

  darControlo: async (pode) => {
    const s = get().sessao;
    if (!s || !get().souAnfitriao()) return;
    await permitirControlo(s.id, pode);
    if (get().sessao?.id === s.id) await get().actualizar();
  },

  anunciarProntidao: async (pronta, percentagem = 0) => {
    const s = get().sessao;
    if (!s) return;
    await marcarPronto(s.id, pronta, percentagem);
  },

  // Sugerir NAO exige a permissao de controlo, e e essa a diferenca entre
  // ouvir com alguem e assistir a alguem: pôr uma musica na fila nao
  // interrompe ninguem.
  sugerir: async (track) => {
    const s = get().sessao;
    if (!s) return;
    await juntarAFila(s.id, track);
    if (get().sessao?.id !== s.id) return;
    await get().actualizar();
    const aviso = `Added · ${track.title?.slice(0, 26) ?? 'song'}`;
    set({ aviso });
    setTimeout(() => {
      if (get().sessao?.id === s.id && get().aviso === aviso) set({ aviso: null });
    }, 3500);
  },

  /**
   * Dar play numa playlist dentro do jam põe a playlist na fila de todos.
   *
   * Sem isto só entrava a música tocada e a fila partilhada ficava vazia --
   * quem quisesse ouvir um disco a dois tinha de o acrescentar faixa a faixa,
   * e no fim de cada música a sessão parava à espera de mão humana.
   *
   * Falhar aqui não estraga o play: a faixa já foi anunciada, e a lista é o
   * extra. Por isso o erro só aparece como aviso.
   */
  semearFila: async (tracks) => {
    const s = get().sessao;
    if (!s || !tracks.length) return;
    try {
      const entraram = await juntarMuitasAFila(s.id, tracks);
      if (get().sessao?.id !== s.id) return;
      await get().actualizar();
      if (entraram <= 0) return;
      const aviso = `Queued ${entraram} song${entraram === 1 ? '' : 's'}`;
      set({ aviso });
      setTimeout(() => {
        if (get().sessao?.id === s.id && get().aviso === aviso) set({ aviso: null });
      }, 3500);
    } catch {
      if (get().sessao?.id === s.id) set({ aviso: 'Could not queue the rest of the list.' });
    }
  },

  retirarSugestao: async (item) => {
    await tirarDaFila(item);
    await get().actualizar();
  },

  anunciarPosicao: async (ms) => {
    const s = get().sessao;
    if (!s || !get().possoControlar()) return;
    await procurarNaSessao(s.id, ms);
    if (get().sessao?.id === s.id) await get().actualizar();
  },

  actualizar: async () => {
    const s = get().sessao;
    if (!s) return;
    const minha = geracao, pedido = ++leitura;
    const [nova, fila] = await Promise.all([lerSessao(s.id), lerFila(s.id)]);
    if (minha !== geracao || pedido !== leitura || get().sessao?.id !== s.id) return;
    if (nova?.acabouEm) { get().desligar(); set({ acabouSemAviso: true }); return; }
    if (nova) set({ sessao: nova, fila });
  },

  avancarPelaFila: async () => {
    const s = get().sessao;
    if (!s || !get().possoControlar() || avancando) return false;
    // A mesma função alimenta o Smart Cache, o crossfade e o avanço.
    const seguinte = usePlayer.getState().proximaFaixa();
    const primeira = get().fila[0];
    if (!seguinte || !primeira) return false;
    avancando = true;
    try {
      const avancou = await avancarFila(s.id, primeira.id);
      if (get().sessao?.id === s.id) await get().actualizar();
      return avancou;
    } finally { avancando = false; }
  },
}));

/** Só para testes: repõe a store entre casos. */
export function limparOuvirJuntos(): void {
  useOuvirJuntos.getState().desligar();
  useOuvirJuntos.setState({ relogio: null, euId: null });
}

export { membroDaLinha };

// A ponte existe mesmo com o player vazio e durante o primeiro render.
registarOuvirJuntos(() => {
  const s = useOuvirJuntos.getState();
  if (!s.sessao) return null;
  const id = s.sessao.id;
  const aindaAqui = () => useOuvirJuntos.getState().sessao?.id === id;
  return {
    sessao: s.sessao, fila: s.fila,
    anfitriao: s.souAnfitriao(), convidadosControlam: s.sessao.convidadosControlam,
    sugerir: s.sugerir, semearFila: s.semearFila, anunciarFaixa: s.anunciarFaixa,
    alternarPausa: async () => {
      if (!aindaAqui()) return;
      const actual = useOuvirJuntos.getState();
      if (actual.sessao?.aTocar) await actual.anunciarPausa(actual.posicaoAgora() ?? usePlayer.getState().positionMs);
      else await actual.anunciarRetoma();
    },
    procurar: s.anunciarPosicao,
    avancar: async (automatico) => {
      if (!aindaAqui()) return;
      let actual = useOuvirJuntos.getState();
      // O fim automático tem um único dono, mesmo com convidados com controlo.
      if (automatico ? !actual.souAnfitriao() : !actual.possoControlar()) return;
      const versao = actual.sessao;
      // Uma sugestão pode ter chegado ao servidor antes do evento realtime.
      // Reler também evita consumir a fila antiga depois de uma mudança remota.
      await actual.actualizar();
      if (!aindaAqui()) return;
      actual = useOuvirJuntos.getState();
      if (actual.sessao?.track?.sourceId !== versao?.track?.sourceId ||
          actual.sessao?.comecouEmServidor !== versao?.comecouEmServidor) return;
      if (!usePlayer.getState().proximaFaixa()) {
        if (automatico) await actual.anunciarPausa(usePlayer.getState().durationMs);
        return;
      }
      await actual.avancarPelaFila();
    },
    sairAoFechar: () => {
      if (fecho) return fecho;
      const operacao = (async () => {
        if (s.souAnfitriao() && !await confirmarFechoDaSessao()) return false;
        if (!aindaAqui()) return !useOuvirJuntos.getState().sessao;
        await useOuvirJuntos.getState().abandonar();
        return true;
      })();
      fecho = operacao;
      void operacao.then(() => { fecho = null; }, () => { fecho = null; });
      return operacao;
    },
    avisarErro: () => {
      if (aindaAqui()) useOuvirJuntos.setState({ aviso: 'Could not update Jam. Please try again.' });
    },
  };
});
