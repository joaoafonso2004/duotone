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
  /** Diferença dos minutos para o mês antes, em %, ou `null` sem nada lá. */
  variacao: number | null;
  artistas: { nome: string; escutas: number; capa: string | null }[];
  musicas: { titulo: string; artista: string | null; escutas: number; capa: string | null }[];
  /** A hora do dia a que mais se ouviu (0-23). */
  hora: number | null;
  /** Os dias seguidos com música mais longos, dentro do mês. */
  seguidos: number;
  /** Artistas ouvidos este mês que não se ouviram no anterior. */
  novos: number;
};

/** O resumo de `m`, a partir das linhas que cobrem o mês e o anterior. `null` se não vale um resumo. */
export function calcularResumoDoMes(linhas: readonly PlayRow[], m: Mes): ResumoDoMes | null {
  const antes = mesAnterior(new Date(m.ano, m.mes, 15));
  const doMesResumido = linhas.filter((r) => doMes(r, m));
  if (doMesResumido.length < MINIMO_DE_ESCUTAS) return null;
  const doMesAntes = linhas.filter((r) => doMes(r, antes));
  const base = computeStats(doMesResumido, 'all');
  const anterior = doMesAntes.length ? computeStats(doMesAntes, 'all') : null;

  const dias = new Set<number>();
  const porHora = new Map<number, number>();
  for (const r of doMesResumido) {
    const d = new Date(Date.parse(r.playedAt));
    dias.add(d.getDate());
    porHora.set(d.getHours(), (porHora.get(d.getHours()) ?? 0) + 1);
  }
  let hora: number | null = null;
  for (const [h, n] of porHora) if (hora === null || n > porHora.get(hora)!) hora = h;
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
  return {
    mes: m,
    nome: nomeDoMes(m),
    minutos,
    escutas: doMesResumido.length,
    dias: dias.size,
    variacao: minutosAntes > 0 ? Math.round(((minutos - minutosAntes) / minutosAntes) * 100) : null,
    artistas: base.topArtists.slice(0, 5).map((a) => ({ nome: a.name, escutas: a.plays, capa: a.artworkUrl ?? null })),
    musicas: base.topTracks.slice(0, 5).map((t) => ({ titulo: t.title, artista: t.artist, escutas: t.plays, capa: t.artworkUrl ?? null })),
    hora,
    seguidos,
    novos: anterior ? novos : 0,
  };
}

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
