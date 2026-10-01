import { create } from 'zustand';
import type { Track } from '../types';
import { posicaoDoAmigo } from '../lib/posicaoDoAmigo';
import { chaveDaFaixa, decidir, posicaoProjetada, type FaixaDoAmigo, type FaixaSimples } from '../lib/seguirAmigo';
import { agoraNoServidor as agoraPeloRelogio, type Estimativa } from '../lib/relogioPartilhado';
import { relogioActualizado } from '../api/ouvirJuntos';
import { registarSeguirAmigo, usePlayer } from './player';
import { agoraNoServidor, ouvirPresencas, presencaDe, relerPresencas } from './social';
import { useOuvirJuntos } from './ouvirJuntos';
import { guardarEmSegundoPlano } from '../lib/descarregarFaixa';

/**
 * Seguir um amigo ("Listen along", 27/9). As decisões estão em
 * `lib/seguirAmigo.ts`; aqui liga-se isso à presença dele e ao leitor.
 *
 * - Um tique por segundo, só enquanto se segue (é local: não vai à rede), e
 *   um sempre que chega uma presença dele pelo Realtime.
 * - Tocar noutra música, ou entrar num Jam, deixa de o seguir. Pausar à mão
 *   não: fica-se parado até voltar a carregar em play, e aí vai-se direto para
 *   onde ele estiver.
 * - Enquanto se segue, o fim de uma música NÃO avança a fila pessoal nem chama
 *   o rádio (`registarSeguirAmigo`, na store): quem manda na seguinte é ele.
 * - Anda-se à velocidade DELE (`ritmo`), senão desviava-se uns segundos por
 *   minuto de um slowed.
 * - A hora do servidor é a do Jam (1/10): o relógio medido como o NTP, em vez
 *   da hora que veio com a lista das presenças, que vinha atrasada a viagem de
 *   volta. A posição dos dois lados projeta-se para o instante (`posicaoProjetada`).
 */

type Seguido = { id: string; nome: string };

interface EstadoDeSeguir {
  seguindo: Seguido | null;
  /** A velocidade dele; null sem ninguém a seguir. */
  ritmo: number | null;
  /** As próximas dele (a presença traz até cinco), para o Up next. */
  aSeguir: Track[];
  /** O que se diz quando se deixa de o seguir sem ser por vontade própria. */
  aviso: string | null;
  iniciar: (id: string, nome: string) => void;
  parar: (aviso?: string | null) => void;
  limparAviso: () => void;
}

/** O tique do motor. Local; a rede só entra pela presença. */
const TIQUE_MS = 1000;
/** Sem notícias dele há isto (o Realtime calou?), relê-se a presença. Ele publica de 75 em 75 s. */
const RELER_SEM_NOTICIAS_MS = 100_000;

let desligar: (() => void) | null = null;

export const useSeguirAmigo = create<EstadoDeSeguir>()((set) => ({
  seguindo: null,
  ritmo: null,
  aSeguir: [],
  aviso: null,
  iniciar: (id, nome) => {
    desligar?.();
    set({ seguindo: { id, nome }, ritmo: null, aSeguir: [], aviso: null });
    desligar = ligar(id, nome);
  },
  parar: (aviso = null) => {
    desligar?.();
    desligar = null;
    set({ seguindo: null, ritmo: null, aSeguir: [], aviso });
  },
  limparAviso: () => set({ aviso: null }),
}));

registarSeguirAmigo(() => !!useSeguirAmigo.getState().seguindo);

/** A velocidade a que o motor anda, com alguém a seguir: a dele. null sem ninguém. */
export function ritmoDeQuemSigo(): number | null {
  return useSeguirAmigo.getState().ritmo;
}

function paraFaixa(f: FaixaSimples): Track {
  return {
    source: f.source,
    sourceId: f.sourceId,
    title: f.title,
    artist: f.artist ?? null,
    album: null,
    artworkUrl: f.artworkUrl ?? null,
    durationSeconds: f.durationSeconds ?? null,
  };
}

/** A música dele que ainda vale (a presença traz a validade), esteja ele à frente ou não. */
function faixaDele(id: string): FaixaDoAmigo | null {
  const p = presencaDe(id);
  if (!p?.currently_playing || !p.playing_until) return null;
  if (Date.parse(p.playing_until) <= agoraNoServidor()) return null;
  return p.currently_playing as unknown as FaixaDoAmigo;
}

function ritmoDe(f: FaixaDoAmigo | null): number {
  const r = Number(f?.rate);
  return Number.isFinite(r) && r >= 0.25 && r <= 4 ? r : 1;
}

function mesmaLista(a: readonly Track[], b: readonly FaixaSimples[]): boolean {
  return a.length === b.length && a.every((t, i) => chaveDaFaixa(t) === chaveDaFaixa(b[i]));
}

function ligar(id: string, nome: string): () => void {
  let vivo = true;
  let semFaixaDesde: number | null = null;
  let ultimoAcerto = 0;
  let pausadoPorMim = false;
  /** Ações NOSSAS em curso: o que o leitor fizer entretanto não é do utilizador. */
  let aplicando = 0;
  let ultimaNoticia = Date.now();
  let adiantada: string | null = null;
  let afinacoes = 0;
  // O relógio do Jam: mede-se ao começar e volta-se a medir quando envelhece
  // (`relogioActualizado` só vai à rede nessa altura). Sem ele, a hora das
  // presenças, como antes.
  let relogio: Estimativa | null = null;
  // Uma medição de cada vez, e sem rede não se insiste a cada tique: são cinco
  // pedidos por ronda.
  let aMedir = false;
  let falhouEm = 0;
  const medirRelogio = () => {
    if (aMedir || (!relogio && Date.now() - falhouEm < 30_000)) return;
    aMedir = true;
    void relogioActualizado(relogio)
      .then((r) => { if (vivo) relogio = r; if (!r) falhouEm = Date.now(); })
      .catch(() => { falhouEm = Date.now(); })
      .finally(() => { aMedir = false; });
  };
  medirRelogio();
  const horaDoServidor = () => (relogio ? agoraPeloRelogio(relogio, Date.now()) : agoraNoServidor());

  const aplicar = (fn: () => unknown) => {
    aplicando++;
    Promise.resolve()
      .then(fn)
      .catch(() => {})
      .finally(() => { aplicando--; });
  };

  const olhar = () => {
    if (!vivo || aplicando > 0) return;
    // Um Jam é outra coisa: quem entra num deixa de seguir.
    if (useOuvirJuntos.getState().sessao) { useSeguirAmigo.getState().parar(null); return; }

    const dele = faixaDele(id);
    const agora = Date.now();
    semFaixaDesde = dele ? null : (semFaixaDesde ?? agora);

    const estado = useSeguirAmigo.getState();
    const ritmo = ritmoDe(dele);
    const proximas = dele?.aSeguir ?? [];
    if (estado.ritmo !== ritmo || (dele && !mesmaLista(estado.aSeguir, proximas))) {
      useSeguirAmigo.setState({ ritmo, ...(dele ? { aSeguir: proximas.map(paraFaixa) } : {}) });
    }
    // A seguinte DELE vem já para o telemóvel (em Wi-Fi, atrás de tudo, como a
    // Daily mix): quando ele passar a ela, não se espera pelo download. Não
    // entra na fila de quem segue -- o crossfade e o Smart Cache passavam a ela
    // sozinhos, e quem manda na seguinte é ele.
    const seguinte = proximas[0] ? chaveDaFaixa(proximas[0]) : null;
    if (seguinte && seguinte !== adiantada) {
      adiantada = seguinte;
      void guardarEmSegundoPlano([paraFaixa(proximas[0])]).catch(() => 0);
    }

    const s = usePlayer.getState();
    const onde = dele ? posicaoDoAmigo(dele, horaDoServidor()) : null;
    const pronta = s.playbackConfirmed && !s.buffering;
    const acao = decidir({
      dele,
      ondeEle: onde?.ms ?? null,
      semFaixaDesde,
      agora,
      minha: {
        chave: chaveDaFaixa(s.current),
        // Onde vai AGORA, e não onde ia no último aviso do motor.
        posicaoMs: posicaoProjetada({ positionMs: s.positionMs, positionAt: s.positionAt, aSoar: s.isPlaying && pronta, ritmo }, agora),
        aTocar: s.isPlaying,
        pronta,
      },
      pausadoPorMim,
      ultimoAcerto,
      afinacoes,
    });

    switch (acao.tipo) {
      case 'tocar': {
        // A seguinte acerta-se quando soar (o tique vê-a desviada e salta).
        ultimoAcerto = 0;
        afinacoes = 0;
        const faixa = paraFaixa(acao.faixa);
        // `interno`: não abre o leitor, não passa pelo Jam, não conta como
        // escolha do utilizador para a origem da fila.
        aplicar(() => usePlayer.getState().playTrack(faixa, [faixa], false, true));
        break;
      }
      case 'acertar':
        ultimoAcerto = agora;
        if (acao.afinacao) afinacoes++;
        aplicar(() => usePlayer.getState().seekTo(acao.posicaoMs, true));
        break;
      case 'pausar':
        aplicar(() => usePlayer.getState()._forcarReproducao(false));
        break;
      case 'retomar':
        ultimoAcerto = 0;
        aplicar(() => usePlayer.getState()._forcarReproducao(true));
        break;
      case 'sair':
        useSeguirAmigo.getState().parar(`${nome} stopped listening`);
        break;
      default:
        break;
    }
  };

  // O que o utilizador faz no leitor. Os nossos passos vêm com `aplicando`.
  const pararDeOuvirOLeitor = usePlayer.subscribe((s, p) => {
    if (!vivo || aplicando > 0) return;
    if (chaveDaFaixa(s.current) !== chaveDaFaixa(p.current)) {
      // Escolheu outra música: deixou de o seguir. Sem aviso -- foi ele.
      if (chaveDaFaixa(s.current) !== chaveDaFaixa(faixaDele(id))) useSeguirAmigo.getState().parar(null);
      return;
    }
    if (s.isPlaying !== p.isPlaying) pausadoPorMim = !s.isPlaying;
  });

  const pararDeOuvirPresencas = ouvirPresencas((p) => {
    if (p.user_id !== id) return;
    ultimaNoticia = Date.now();
    olhar();
  });

  const tique = setInterval(() => {
    medirRelogio();
    if (Date.now() - ultimaNoticia >= RELER_SEM_NOTICIAS_MS) {
      ultimaNoticia = Date.now();
      void relerPresencas().catch(() => {});
    }
    olhar();
  }, TIQUE_MS);

  // Sem a presença dele cá (a lista ainda não foi lida), pede-se já.
  if (!presencaDe(id)) void relerPresencas().then(olhar, () => {});
  else olhar();

  return () => {
    vivo = false;
    clearInterval(tique);
    pararDeOuvirOLeitor();
    pararDeOuvirPresencas();
  };
}
