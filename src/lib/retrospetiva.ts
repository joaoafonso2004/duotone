/**
 * A retrospetiva de um ano, a partir do histórico que já existe.
 *
 * Não há dados novos aqui: são as mesmas linhas que alimentam as estatísticas,
 * agrupadas por ano civil e com três coisas que só fazem sentido a esta escala
 * — o mês em que mais ouviste, a hora do dia a que costumas ouvir, e quantos
 * artistas conheceste nesse ano.
 *
 * O `computeStats` faz o trabalho pesado (totais, tops, linha por mês) para os
 * números baterem certo com o ecrã de estatísticas. Duas contagens do mesmo
 * histórico que não coincidissem seriam pior do que não haver retrospetiva.
 */
import { computeStats, type ListeningStats, type PlayRow } from './listeningStats';

const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export interface Retrospetiva {
  ano: number;
  /** Totais, tops e a linha por mês — a mesma agregação do ecrã de estatísticas. */
  base: ListeningStats;
  mesMaior: { mes: number; nome: string; reproducoes: number } | null;
  /** Hora local a que mais ouves. 0–23. */
  horaPreferida: { hora: number; reproducoes: number } | null;
  /** Artistas cuja PRIMEIRA reprodução de sempre caiu neste ano. */
  artistasDescobertos: number;
  temDados: boolean;
}

/** Data local e não UTC: ouvir à meia-noite e um quarto de 1 de janeiro
 * pertence ao ano novo para quem está a ouvir, não ao anterior em UTC. */
function anoDe(iso: string): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).getFullYear();
}

/** Os anos com pelo menos uma reprodução, do mais recente para o mais antigo. */
export function anosComReproducoes(rows: PlayRow[]): number[] {
  const anos = new Set<number>();
  for (const r of rows) {
    const ano = anoDe(r.playedAt);
    if (ano !== null) anos.add(ano);
  }
  return Array.from(anos).sort((a, b) => b - a);
}

function nomeNormalizado(r: PlayRow): string | null {
  const nome = r.artist?.trim();
  // Mesma regra do computeStats: sem isto o "Unknown Artist" era sempre a
  // maior descoberta do ano de toda a gente.
  if (!nome || nome.toLowerCase() === 'unknown artist') return null;
  return nome.toLowerCase();
}

export function calcularRetrospetiva(rows: PlayRow[], ano: number): Retrospetiva {
  const doAno: PlayRow[] = [];
  /** Primeira vez de sempre que cada artista apareceu, em ms. */
  const estreias = new Map<string, number>();

  for (const r of rows) {
    const t = Date.parse(r.playedAt);
    if (!Number.isFinite(t)) continue;
    if (new Date(t).getFullYear() === ano) doAno.push(r);

    const nome = nomeNormalizado(r);
    if (nome === null) continue;
    const anterior = estreias.get(nome);
    if (anterior === undefined || t < anterior) estreias.set(nome, t);
  }

  // 'all' sobre linhas já filtradas: o período não corta nada, e a linha do
  // tempo sai agrupada por mês, que é o que um ano precisa.
  const base = computeStats(doAno, 'all');

  const porMes = new Map<number, number>();
  const porHora = new Map<number, number>();
  for (const r of doAno) {
    const d = new Date(Date.parse(r.playedAt));
    porMes.set(d.getMonth(), (porMes.get(d.getMonth()) ?? 0) + 1);
    porHora.set(d.getHours(), (porHora.get(d.getHours()) ?? 0) + 1);
  }

  let mesMaior: Retrospetiva['mesMaior'] = null;
  for (const [mes, reproducoes] of porMes) {
    if (!mesMaior || reproducoes > mesMaior.reproducoes) {
      mesMaior = { mes, nome: MESES_PT[mes]!, reproducoes };
    }
  }

  let horaPreferida: Retrospetiva['horaPreferida'] = null;
  for (const [hora, reproducoes] of porHora) {
    if (!horaPreferida || reproducoes > horaPreferida.reproducoes) {
      horaPreferida = { hora, reproducoes };
    }
  }

  let artistasDescobertos = 0;
  for (const [, estreia] of estreias) {
    if (new Date(estreia).getFullYear() === ano) artistasDescobertos++;
  }

  return {
    ano,
    base,
    mesMaior,
    horaPreferida,
    artistasDescobertos,
    temDados: doAno.length > 0,
  };
}

/** "às 23h", "à meia-noite", "ao meio-dia". */
export function descreverHora(hora: number): string {
  if (hora === 0) return 'à meia-noite';
  if (hora === 12) return 'ao meio-dia';
  return `às ${hora}h`;
}
