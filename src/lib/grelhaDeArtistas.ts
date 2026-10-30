/**
 * A grelha dos Artists do PC (30/10, passo 4 de `docs/PLANO-ELEVAR-PC.md`): a
 * ordem (Most played / A–Z / Recently added), a linha por baixo do título e as
 * contas do cartão em destaque. Puro, para o teste a correr em Node.
 */
import { compararTexto } from './ordenacao';

export type OrdemDosArtistas = 'plays' | 'az' | 'recent';

export const OPCOES_DOS_ARTISTAS: readonly { id: OrdemDosArtistas; rotulo: string }[] = [
  { id: 'plays', rotulo: 'Most played' },
  { id: 'az', rotulo: 'A–Z' },
  { id: 'recent', rotulo: 'Recently added' },
];

type Faixa = { source: string; sourceId: string; durationSeconds?: number | null };
type Grupo = { nome: string; chave: string; faixas: readonly Faixa[] };

const chaveDaFaixa = (f: Faixa) => `${f.source}:${f.sourceId}`;

/** A posição de cada faixa na biblioteca, como a loja a dá (as guardadas há pouco primeiro). */
export function posicoesDaBiblioteca(biblioteca: readonly Faixa[]): Map<string, number> {
  const mapa = new Map<string, number>();
  biblioteca.forEach((f, i) => { if (!mapa.has(chaveDaFaixa(f))) mapa.set(chaveDaFaixa(f), i); });
  return mapa;
}

/**
 * `porEscuta` é a lista como já vinha (por escuta, os favoritos primeiro, `ordenarArtistas`).
 * "A–Z" ignora maiúsculas e acentos. "Recently added" põe primeiro quem teve
 * uma música guardada há menos tempo (a posição mais cedo da biblioteca).
 * Devolve uma cópia: nunca altera a lista que recebe.
 */
export function ordenarGrelhaDeArtistas<T extends Grupo>(porEscuta: readonly T[], ordem: OrdemDosArtistas, posicoes: ReadonlyMap<string, number>): T[] {
  const copia = [...porEscuta];
  if (ordem === 'az') return copia.sort((a, b) => compararTexto(a.nome, b.nome));
  if (ordem === 'recent') {
    const mais = new Map<T, number>(copia.map((g) => [g, Math.min(...g.faixas.map((f) => posicoes.get(chaveDaFaixa(f)) ?? Infinity))] as [T, number]));
    return copia.sort((a, b) => {
      const pa = mais.get(a) ?? Infinity, pb = mais.get(b) ?? Infinity;
      return pa !== pb ? pa - pb : compararTexto(a.nome, b.nome);
    });
  }
  return copia;
}

/** "332 artists · by how much you listen", conforme a ordem; sem artistas, só a contagem. */
export function resumoDosArtistas(quantos: number, ordem: OrdemDosArtistas): string {
  const base = `${quantos} ${quantos === 1 ? 'artist' : 'artists'}`;
  if (quantos < 2) return base;
  return `${base} · ${ordem === 'az' ? 'A to Z' : ordem === 'recent' ? 'newest first' : 'by how much you listen'}`;
}

/** O artista em destaque: o primeiro por escuta que tem reproduções. Sem nenhuma, não há destaque. */
export function artistaEmDestaque<T extends Grupo>(porEscuta: readonly T[], jogadas: ReadonlyMap<string, number>): { grupo: T; jogadas: number } | null {
  for (const grupo of porEscuta) {
    const n = jogadas.get(grupo.chave) ?? 0;
    if (n > 0 && grupo.faixas.length > 0) return { grupo, jogadas: n };
  }
  return null;
}

/** "18 h" (a partir de 10 h, inteiras), "2.5 h", "40 min". */
export function horasDoArtista(faixas: readonly Faixa[]): string {
  const segundos = faixas.reduce((t, f) => t + (f.durationSeconds && f.durationSeconds > 0 ? f.durationSeconds : 0), 0);
  const horas = segundos / 3600;
  if (horas >= 10) return `${Math.round(horas)} h`;
  if (horas >= 1) return `${horas.toFixed(1)} h`;
  return `${Math.max(1, Math.round(segundos / 60))} min`;
}

/** "6.1k" a partir de mil; abaixo, o número. */
export function jogadasEmCurto(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
}
