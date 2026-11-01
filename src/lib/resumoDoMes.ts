/**
 * "O teu mês" (7/10): o resumo do mês anterior, em três páginas como uma
 * story do Instagram, por cima de tudo na primeira abertura do mês. Substituiu
 * o cartaz de sexta-feira (o "a semana em cinco números"), a pedido do João.
 *
 * As contas são as do resto da app: as linhas do `plays` (que só recebe o
 * que se OUVIU -- ver lib/contagemDeEscuta.ts), agregadas pelo `computeStats`
 * como as estatísticas. Os minutos são uma estimativa e a UI di-lo (`≈`).
 *
 * Sem imports de runtime (a não ser as contas puras das estatísticas):
 * `scripts/test-resumo-do-mes.ts`.
 */
import { computeStats, type PlayRow } from './listeningStats';

const MESES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Os primeiros dias do mês em que o resumo do anterior ainda aparece. */
export const DIAS_DE_JANELA = 7;
/** Abaixo disto não há resumo: um mês quase parado não merece um ecrã inteiro. */
export const MINIMO_DE_ESCUTAS = 20;

export type Mes = { ano: number; mes: number };

/** O mês anterior ao de `agora`, em hora local. */
export function mesAnterior(agora: Date): Mes {
  const d = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() };
}

export const chaveDoMes = (m: Mes) => `${m.ano}-${String(m.mes + 1).padStart(2, '0')}`;
export const nomeDoMes = (m: Mes) => MESES[m.mes]!;

/** Mostra-se nos primeiros `DIAS_DE_JANELA` dias, uma vez por mês. */
export function mostrarResumo(agora: Date, vistoEm: string | null): boolean {
  if (agora.getDate() > DIAS_DE_JANELA) return false;
  return vistoEm !== chaveDoMes(mesAnterior(agora));
}

/** O primeiro instante do mês ANTES do resumido: é de lá que se lê (para comparar). */
export function inicioDaLeitura(agora: Date): number {
  return new Date(agora.getFullYear(), agora.getMonth() - 2, 1).getTime();
}

const doMes = (r: PlayRow, m: Mes) => {
  const t = Date.parse(r.playedAt);
  if (!Number.isFinite(t)) return false;
  const d = new Date(t);
  return d.getFullYear() === m.ano && d.getMonth() === m.mes;
};

export type ResumoDoMes = {
  mes: Mes;
  nome: string;
  minutos: number;
  escutas: number;
  dias: number;
  /** Os dias que o mês tem (28 a 31). */
  diasDoMes: number;
  /** Diferença dos minutos para o mês antes, em %, ou `null` sem nada lá. */
  variacao: number | null;
  /** Os minutos do mês antes, para as duas barras da página do tempo, ou `null`. */
  minutosAntes: number | null;
  /** O nome curto do mês antes ("Sep"). */
  nomeAntes: string;
  artistas: {
    nome: string; escutas: number; capa: string | null;
    /** A parte das escutas do mês que foi dele, em %. */
    parte: number;
  }[];
  musicas: {
    titulo: string; artista: string | null; escutas: number; capa: string | null;
    /** Para o "Play your top 5": as escutas trazem a faixa. */
    source: string; sourceId: string; durationSeconds: number | null;
    /** Quanto tempo dela se ouviu no mês (a mesma estimativa dos minutos). */
    minutos: number;
  }[];
  /** A hora do dia a que mais se ouviu (0-23). */
  hora: number | null;
  /** Os dias seguidos com música mais longos, dentro do mês. */
  seguidos: number;
  /** Artistas ouvidos este mês que não se ouviram no anterior. */
  novos: number;
  /**
   * O calendário (1/11, `docs/recap-maquete.html`): os minutos de cada dia do
   * mês, do dia 1 ao último. Sai das mesmas escutas: zero pedidos.
   */
  porDia: number[];
  /** O dia da semana do dia 1, com a segunda a 0 (a grelha começa à segunda). */
  primeiroDia: number;
  /** O relógio: as escutas de cada hora do dia, das 0 às 23. */
  porHora: number[];
};

const MESES_CURTOS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Os dias que `m` tem. */
export function diasNoMes(m: Mes): number {
  return new Date(m.ano, m.mes + 1, 0).getDate();
}

/** O resumo de `m`, a partir das linhas que cobrem o mês e o anterior. `null` se não vale um resumo. */
export function calcularResumoDoMes(linhas: readonly PlayRow[], m: Mes): ResumoDoMes | null {
  const antes = mesAnterior(new Date(m.ano, m.mes, 15));
  const doMesResumido = linhas.filter((r) => doMes(r, m));
  if (doMesResumido.length < MINIMO_DE_ESCUTAS) return null;
  const doMesAntes = linhas.filter((r) => doMes(r, antes));
  const base = computeStats(doMesResumido, 'all');
  const anterior = doMesAntes.length ? computeStats(doMesAntes, 'all') : null;

  const diasDoMes = diasNoMes(m);
  const dias = new Set<number>();
  const porHora = Array.from({ length: 24 }, () => 0);
  const segundosPorDia = Array.from({ length: diasDoMes }, () => 0);
  // Os segundos de cada faixa (a chave do `computeStats`): o "about 3 h of it".
  const segundosPorFaixa = new Map<string, number>();
  for (const r of doMesResumido) {
    const d = new Date(Date.parse(r.playedAt));
    const s = Math.max(0, r.durationSeconds ?? 0);
    dias.add(d.getDate());
    porHora[d.getHours()]! += 1;
    segundosPorDia[d.getDate() - 1]! += s;
    const k = `${r.source}:${r.sourceId}`;
    segundosPorFaixa.set(k, (segundosPorFaixa.get(k) ?? 0) + s);
  }
  let hora: number | null = null;
  porHora.forEach((n, h) => { if (n > 0 && (hora === null || n > porHora[hora]!)) hora = h; });
  let seguidos = 0, corrida = 0;
  for (let dia = 1; dia <= 31; dia++) {
    corrida = dias.has(dia) ? corrida + 1 : 0;
    seguidos = Math.max(seguidos, corrida);
  }
  const artistaDe = (r: PlayRow) => r.artist?.trim().toLowerCase() || null;
  const ouvidosAntes = new Set(doMesAntes.map(artistaDe).filter(Boolean));
  const ouvidosAgora = new Set(doMesResumido.map(artistaDe).filter((a): a is string => !!a && a !== 'unknown artist'));
  let novos = 0;
  for (const a of ouvidosAgora) if (!ouvidosAntes.has(a)) novos++;

  const minutos = Math.round(base.estimatedMinutes);
  const minutosAntes = anterior ? Math.round(anterior.estimatedMinutes) : 0;
  const escutas = doMesResumido.length;
  const duracaoDe = new Map(doMesResumido.map((r) => [`${r.source}:${r.sourceId}`, r.durationSeconds ?? null]));
  return {
    mes: m,
    nome: nomeDoMes(m),
    minutos,
    escutas,
    dias: dias.size,
    diasDoMes,
    variacao: minutosAntes > 0 ? Math.round(((minutos - minutosAntes) / minutosAntes) * 100) : null,
    minutosAntes: minutosAntes > 0 ? minutosAntes : null,
    nomeAntes: MESES_CURTOS[antes.mes]!,
    artistas: base.topArtists.slice(0, 5).map((a) => ({
      nome: a.name, escutas: a.plays, capa: a.artworkUrl ?? null, parte: Math.round((a.plays / escutas) * 100),
    })),
    musicas: base.topTracks.slice(0, 5).map((t) => ({
      titulo: t.title, artista: t.artist, escutas: t.plays, capa: t.artworkUrl ?? null,
      source: t.source, sourceId: t.sourceId, durationSeconds: duracaoDe.get(`${t.source}:${t.sourceId}`) ?? null,
      minutos: Math.round((segundosPorFaixa.get(`${t.source}:${t.sourceId}`) ?? 0) / 60),
    })),
    hora,
    seguidos,
    novos: anterior ? novos : 0,
    porDia: segundosPorDia.map((s) => Math.round(s / 60)),
    primeiroDia: (new Date(m.ano, m.mes, 1).getDay() + 6) % 7,
    porHora,
  };
}

/** "3 h 52 min", "45 min", "2 h": quanto se ouviu de uma música. */
export function duracaoEmTexto(minutos: number): string {
  const h = Math.floor(minutos / 60), min = minutos % 60;
  if (!h) return `${min} min`;
  return min ? `${h} h ${min} min` : `${h} h`;
}

/**
 * A frase debaixo do número grande: "That's 8 days of nonstop music." Com
 * menos de um dia inteiro, a média por dia em que se ouviu, que diz mais.
 */
export function fraseDoTempo(r: Pick<ResumoDoMes, 'minutos' | 'dias'>): string {
  const diasInteiros = Math.round(r.minutos / (24 * 60));
  if (diasInteiros >= 1) return `That's ${diasInteiros} ${diasInteiros === 1 ? 'day' : 'days'} of nonstop music.`;
  const porDia = Math.round(r.minutos / Math.max(1, r.dias));
  return `About ${porDia} minutes on each day you listened.`;
}

/** O que diz o calendário por cima: "Every single day" ou "22 of 31 days". */
export function fraseDoCalendario(r: Pick<ResumoDoMes, 'dias' | 'diasDoMes'>): string {
  return r.dias >= r.diasDoMes ? 'Every single day' : `${r.dias} of ${r.diasDoMes} days`;
}

/**
 * Que ouvinte se é, pela hora a que mais se ouviu: a manhã (5-11), a tarde
 * (12-17), a noite (18-21) e a madrugada (22-4).
 */
export function tipoDeOuvinte(hora: number): string {
  if (hora >= 5 && hora <= 11) return 'A morning listener';
  if (hora >= 12 && hora <= 17) return 'An afternoon listener';
  if (hora >= 18 && hora <= 21) return 'An evening listener';
  return 'A night owl';
}

/**
 * As cinco capas da primeira página num leque: a primeira ao meio e à frente,
 * as outras para os lados, alternadas (0, -1, 1, -2, 2), cada vez mais atrás.
 */
export const LUGARES_DO_LEQUE = [0, -1, 1, -2, 2] as const;

/** "≈ 38 h" ou "≈ 45 min": o número grande da primeira página. */
export function tempoGrande(minutos: number): { valor: string; unidade: string } {
  if (minutos >= 120) return { valor: `${Math.round(minutos / 60)}`, unidade: 'hours' };
  return { valor: `${minutos}`, unidade: 'minutes' };
}

/** "11 pm", "midnight", "noon". */
export function horaEmTexto(hora: number): string {
  if (hora === 0) return 'midnight';
  if (hora === 12) return 'noon';
  return `${hora % 12} ${hora < 12 ? 'am' : 'pm'}`;
}
