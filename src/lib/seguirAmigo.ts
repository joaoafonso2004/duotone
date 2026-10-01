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
/**
 * Um desvio maior do que isto corrige-se com um salto (1/10).
 *
 * Eram 4 s, e o atraso ficava: o salto para onde ele ia demora a soar (no PC o
 * leitor do YouTube carrega o sítio novo), ele anda entretanto, e o que sobrava
 * -- uns 2 a 5 s -- estava abaixo da tolerância e nunca mais se corrigia. O
 * Jam, com 0,6 s, não tinha isto. Aqui é 1 s: a posição dele vem da presença
 * (publicada pelo telemóvel dele, com a rede pelo meio), e é menos certa do que
 * a hora de arranque de um Jam.
 */
export const DESVIO_MAXIMO_MS = 1_000;
/** Acima disto ele saltou (arrastou a barra) ou a música acabou de começar: segue-se sempre. */
export const DESVIO_GRANDE_MS = 4_000;
/**
 * Depois de um salto, espera-se isto antes de medir outra vez: o tempo de o
 * sítio novo soar. É o descanso do Jam (`DESCANSO_APOS_SALTO_MS`). O segundo
 * salto é que acerta: cai perto de onde já se está, que o leitor já tem.
 */
export const ENTRE_ACERTOS_MS = 5_000;
/**
 * Afinações (desvios pequenos) por música, no máximo. Se a presença dele vier
 * sempre um bocado atrasada, perseguir esse erro era saltar de 5 em 5 s a
 * música inteira. Um desvio grande segue-se sempre.
 */
export const AFINACOES_POR_FAIXA = 3;
/** Projetar uma posição para a frente nunca mais do que isto: um motor calado há mais tempo não está a tocar. */
export const PROJECAO_MAXIMA_MS = 5_000;
/** Quantas das próximas viajam na presença. */
export const PROXIMAS_NA_PRESENCA = 5;

/**
 * Onde vai uma música AGORA, a partir da última posição que o motor deu (1/10).
 *
 * O motor só atualiza a posição de tempos a tempos; lida crua, ia até um
 * segundo atrás. Projeta-se pelo tempo desde então e pela velocidade -- só a
 * soar, e nunca mais do que `PROJECAO_MAXIMA_MS`.
 */
export function posicaoProjetada(
  p: { positionMs: number; positionAt: number; aSoar: boolean; ritmo: number },
  agora: number,
): number {
  const base = Math.max(0, p.positionMs || 0);
  if (!p.aSoar || !Number.isFinite(p.positionAt)) return base;
  const ritmo = Number.isFinite(p.ritmo) && p.ritmo >= 0.25 && p.ritmo <= 4 ? p.ritmo : 1;
  return base + Math.min(PROJECAO_MAXIMA_MS, Math.max(0, agora - p.positionAt)) * ritmo;
}

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
  /** Quantas afinações (desvios pequenos) já se fizeram nesta música. */
  afinacoes: number;
};

export type Acao =
  | { tipo: 'nada' }
  | { tipo: 'tocar'; faixa: FaixaDoAmigo }
  | { tipo: 'acertar'; posicaoMs: number; afinacao: boolean }
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
  const desvio = Math.abs(o.minha.posicaoMs - o.ondeEle);
  if (desvio <= DESVIO_MAXIMO_MS || o.agora - o.ultimoAcerto < ENTRE_ACERTOS_MS) return { tipo: 'nada' };
  const afinacao = desvio <= DESVIO_GRANDE_MS;
  if (afinacao && o.afinacoes >= AFINACOES_POR_FAIXA) return { tipo: 'nada' };
  return { tipo: 'acertar', posicaoMs: Math.round(o.ondeEle), afinacao };
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
