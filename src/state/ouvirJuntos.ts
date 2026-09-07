import { create } from 'zustand';
import { AppState } from 'react-native';
import {
  continuoNaSessao, convidar, criarSessao, definirFaixa, entrar,
  lerMembros, lerSessao, marcarPronto, membroDaLinha, minhaSessaoAberta,
  pausar, permitirControlo, relogioActualizado, retomar, sair, sessaoDaLinha,
  type MembroDaSessao, type SessaoDeEscuta,
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
  relogio: Estimativa | null;
  /** O nosso id, guardado para não o pedir a cada render. */
  euId: string | null;

  souAnfitriao: () => boolean;
  possoControlar: () => boolean;
  /** Onde a sessão está agora, em ms. `null` sem informação suficiente. */
  posicaoAgora: () => number | null;

  ligar: (userId: string) => Promise<void>;
  desligar: () => void;

  abrir: (track: Track | null, amigos: readonly string[], mensagem?: string) => Promise<string>;
  juntarSe: (sessao: string) => Promise<void>;
  abandonar: () => Promise<void>;
  convidarMais: (amigos: readonly string[], mensagem?: string) => Promise<void>;

  anunciarFaixa: (track: Track) => Promise<void>;
  anunciarPausa: (posicaoMs: number) => Promise<void>;
  anunciarRetoma: () => Promise<void>;
  darControlo: (pode: boolean) => Promise<void>;
  anunciarProntidao: (pronta: boolean, percentagem?: number) => Promise<void>;
};

let canal: ReturnType<typeof supabase.channel> | null = null;
let batimento: ReturnType<typeof setInterval> | null = null;
let subscricaoDeEstado: { remove: () => void } | null = null;
/** Cresce a cada `ligar`: respostas de uma ligação antiga não escrevem estado. */
let geracao = 0;

export const useOuvirJuntos = create<Estado>((set, get) => ({
  sessao: null,
  membros: [],
  relogio: null,
  euId: null,

  souAnfitriao: () => {
    const { sessao, euId } = get();
    return !!sessao && !!euId && sessao.hostId === euId;
  },

  possoControlar: () => {
    const { sessao } = get();
    if (!sessao) return false;
    return get().souAnfitriao() || sessao.convidadosControlam;
  },

  posicaoAgora: () => {
    const { sessao, relogio } = get();
    if (!sessao) return null;
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

    const [membros, relogio] = await Promise.all([
      lerMembros(sessao.id),
      relogioActualizado(null),
    ]);
    if (minha !== geracao) return;
    set({ sessao, membros, relogio });

    canal = supabase
      .channel(`sessao:${sessao.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listening_sessions', filter: `id=eq.${sessao.id}` },
        (evento) => {
          if (minha !== geracao) return;
          const nova = sessaoDaLinha(evento.new as any);
          // Acabou: sai-se sozinho, sem esperar por ninguém.
          if (nova.acabouEm) { get().desligar(); return; }
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
      void Promise.all([lerSessao(s.id), lerMembros(s.id), relogioActualizado(get().relogio)])
        .then(([nova, membros, relogio]) => {
          if (minha !== geracao) return;
          if (!nova || nova.acabouEm) { get().desligar(); return; }
          set({ sessao: nova, membros, relogio });
        });
    });
  },

  desligar: () => {
    geracao++;
    if (canal) { void supabase.removeChannel(canal); canal = null; }
    if (batimento) { clearInterval(batimento); batimento = null; }
    subscricaoDeEstado?.remove();
    subscricaoDeEstado = null;
    set({ sessao: null, membros: [] });
  },

  // -------------------------------------------------------------------------

  abrir: async (track, amigos, mensagem) => {
    const id = await criarSessao(track);
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
    get().desligar();
    // Depois de desligar: a saída pode falhar por rede, e nesse caso é melhor
    // ficar de fora na app do que preso numa sessão que já não se quer. O
    // `last_seen` deixa de ser batido e o servidor esquece-nos.
    try { await sair(s.id); } catch { /* idem */ }
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
  },

  anunciarPausa: async (posicaoMs) => {
    const s = get().sessao;
    if (!s || !get().possoControlar()) return;
    await pausar(s.id, posicaoMs);
  },

  anunciarRetoma: async () => {
    const s = get().sessao;
    if (!s || !get().possoControlar()) return;
    await retomar(s.id);
  },

  darControlo: async (pode) => {
    const s = get().sessao;
    if (!s || !get().souAnfitriao()) return;
    await permitirControlo(s.id, pode);
  },

  anunciarProntidao: async (pronta, percentagem = 0) => {
    const s = get().sessao;
    if (!s) return;
    await marcarPronto(s.id, pronta, percentagem);
  },
}));

/** Só para testes: repõe a store entre casos. */
export function limparOuvirJuntos(): void {
  useOuvirJuntos.getState().desligar();
  useOuvirJuntos.setState({ relogio: null, euId: null });
}

export { membroDaLinha };
