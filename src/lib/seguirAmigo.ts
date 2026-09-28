/**
 * Seguir um amigo ("Listen along", 27/9) -- as decisões, puras.
 *
 * O João: "gostava de poder entrar com os meus amigos e só ouvir a queue deles
 * com eles". O Jam é outra coisa (uma sessão aberta de propósito, onde todos
 * põem músicas); isto é SEGUIR: a mesma música que ele, no mesmo segundo, sem
 * ele ter de abrir nada, e sem o que eu toco mexer na música dele.
 *
 * O que se segue é a PRESENÇA dele (a que a app já publica para os amigos: a
 * música, a posição e a velocidade, carimbadas com a hora do servidor, e as
 * próximas faixas -- `supabase/presenca-com-fila.sql`). A presença não diz
 * "em pausa": quando ele pausa, ou está a carregar a seguinte, a faixa some.
 * Por isso a falta de faixa espera um bocado antes de pausar, e muito mais
 * antes de desistir.
 *
 * Quem liga isto à app é `state/seguirAmigo.ts`. Sem imports: testado em Node
 * puro (scripts/test-seguir-amigo.ts).
 */

/** Uma faixa como a presença a traz (só o que se desenha e se toca). */
export type FaixaSimples = {
  source: 'youtube' | 'spotify';
  sourceId: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
};

/** A faixa dele na presença, com onde ia e a que velocidade. */
export type FaixaDoAmigo = FaixaSimples & {
  positionMs?: number;
  rate?: number;
  updatedAt?: string;
  /** As próximas (até 5), para o Up next de quem segue. */
  aSeguir?: FaixaSimples[];
};

/** A faixa dele sumiu: pausou, ou está a carregar a seguinte. Espera-se isto antes de pausar. */
export const ESPERA_SEM_FAIXA_MS = 12_000;
/** E isto antes de deixar de o seguir (fechou a app, saiu). */
export const DESISTIR_SEM_FAIXA_MS = 3 * 60_000;
/** Um desvio maior do que isto corrige-se com um salto... */
export const DESVIO_MAXIMO_MS = 4_000;
/** ...mas não mais do que um a cada este tempo: saltar sem parar é pior do que ir 5 s atrás. */
export const ENTRE_ACERTOS_MS = 15_000;
/** Quantas das próximas viajam na presença. */
export const PROXIMAS_NA_PRESENCA = 5;

export function chaveDaFaixa(f: { source: string; sourceId: string } | null | undefined): string | null {
  return f ? `${f.source}:${f.sourceId}` : null;
}

export type Olhar = {
  /** A faixa dele agora, ou null (pausou, a carregar, saiu). */
  dele: FaixaDoAmigo | null;
  /** Onde ele vai AGORA (já extrapolado com a hora do servidor), ou null se não se sabe. */
  ondeEle: number | null;
  /** Desde quando (relógio deste aparelho) não há faixa dele; null se há. */
  semFaixaDesde: number | null;
  agora: number;
  minha: {
    chave: string | null;
    posicaoMs: number;
    /** A intenção do leitor (o `isPlaying` da store). */
    aTocar: boolean;
    /** A faixa já soa: só assim um salto não se perde no carregamento. */
    pronta: boolean;
  };
  /** Quem segue pausou à mão: nada se mexe até voltar a carregar em play. */
  pausadoPorMim: boolean;
  /** Quando foi o último salto de acerto (relógio deste aparelho). */
  ultimoAcerto: number;
};

export type Acao =
  | { tipo: 'nada' }
  | { tipo: 'tocar'; faixa: FaixaDoAmigo }
  | { tipo: 'acertar'; posicaoMs: number }
  | { tipo: 'pausar' }
  | { tipo: 'retomar' }
  | { tipo: 'sair' };

export function decidir(o: Olhar): Acao {
  if (!o.dele) {
    const sem = o.semFaixaDesde === null ? 0 : o.agora - o.semFaixaDesde;
    if (sem >= DESISTIR_SEM_FAIXA_MS) return { tipo: 'sair' };
    // Quem pausou à mão já está parado; parar outra vez não diz nada.
    if (sem >= ESPERA_SEM_FAIXA_MS && o.minha.aTocar && !o.pausadoPorMim) return { tipo: 'pausar' };
    return { tipo: 'nada' };
  }
  // Pausado à mão (uma chamada, um aviso): não se mexe em nada até voltar a
  // carregar em play -- e aí vai-se direto para onde ele estiver.
  if (o.pausadoPorMim) return { tipo: 'nada' };
  if (chaveDaFaixa(o.dele) !== o.minha.chave) return { tipo: 'tocar', faixa: o.dele };
  if (!o.minha.aTocar) return { tipo: 'retomar' };
  if (!o.minha.pronta || o.ondeEle === null) return { tipo: 'nada' };
  if (Math.abs(o.minha.posicaoMs - o.ondeEle) > DESVIO_MAXIMO_MS && o.agora - o.ultimoAcerto >= ENTRE_ACERTOS_MS) {
    return { tipo: 'acertar', posicaoMs: Math.round(o.ondeEle) };
  }
  return { tipo: 'nada' };
}

/**
 * As próximas, como se publicam na presença: poucas, e só o que se desenha.
 * Sem a migração o servidor deita-as fora e o Up next de quem segue fica vazio.
 */
export function proximasParaAPresenca(
  faixas: readonly { source: string; sourceId: string; title: string; artist?: string | null; artworkUrl?: string | null; durationSeconds?: number | null }[],
): FaixaSimples[] {
  const fora: FaixaSimples[] = [];
  for (const f of faixas) {
    if (fora.length >= PROXIMAS_NA_PRESENCA) break;
    if ((f.source !== 'youtube' && f.source !== 'spotify') || !f.sourceId || !f.title) continue;
    fora.push({
      source: f.source,
      sourceId: f.sourceId,
      title: f.title,
      artist: f.artist ?? null,
      artworkUrl: f.artworkUrl ?? null,
      durationSeconds: f.durationSeconds ?? null,
    });
  }
  return fora;
}
