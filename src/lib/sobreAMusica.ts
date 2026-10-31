/**
 * A aba "About" do Now Playing e do painel da direita (31/10, da maquete
 * `docs/now-playing-maquete.html`): o que se sabe de uma música e do artista dela a partir
 * do que a app JÁ TEM, sem pedidos novos -- as contagens de escuta que estão no aparelho
 * (`contagensNoAparelho`), a biblioteca em memória e o que o catálogo já confirmou.
 * Puro, para o teste a correr em Node.
 */
import { chaveDeArtista, displayArtist } from './artistName';
import type { Track } from '../types';

/** Uma linha das contagens de escuta (a forma de `PlayCountEntry`, em `lib/playCounts.ts`). */
export type Contagem = {
  source: Track['source'];
  sourceId: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
  count: number;
  lastPlayed: number;
};

export type MaisOuvida = { faixa: Track; vezes: number };

/** Quantas se mostram em "Your most played of theirs". */
export const MAIS_OUVIDAS = 3;

/** A contagem como faixa, para tocar e para mostrar (título e artista como em qualquer lista). */
export function faixaDaContagem(c: Contagem): Track {
  return {
    source: c.source, sourceId: c.sourceId, title: c.title, artist: c.artist,
    album: null, artworkUrl: c.artworkUrl, durationSeconds: c.durationSeconds,
  };
}

const chaveDaFaixa = (f: { source: string; sourceId: string }) => `${f.source}:${f.sourceId}`;

/**
 * Quanto ouviste de um artista: o total de reproduções e as que mais ouviste. A chave é a
 * canónica (`chaveDeArtista`), a mesma da grelha dos Artists, por isso `Juice WRLD` e
 * `JUICE WRLD` são o mesmo. A que toca agora fica de fora das mais ouvidas: está à vista.
 */
export function sobreOArtista(
  contagens: readonly Contagem[], chave: string, aExcluir?: { source: string; sourceId: string } | null,
): { jogadas: number; maisOuvidas: MaisOuvida[] } {
  if (!chave) return { jogadas: 0, maisOuvidas: [] };
  const dele: MaisOuvida[] = [];
  let jogadas = 0;
  for (const c of contagens) {
    if (!(c.count > 0)) continue;
    const faixa = faixaDaContagem(c);
    if (chaveDeArtista(displayArtist(faixa)) !== chave) continue;
    jogadas += c.count;
    if (aExcluir && chaveDaFaixa(faixa) === chaveDaFaixa(aExcluir)) continue;
    dele.push({ faixa, vezes: c.count });
  }
  dele.sort((a, b) => b.vezes - a.vezes || a.faixa.title.localeCompare(b.faixa.title));
  return { jogadas, maisOuvidas: dele.slice(0, MAIS_OUVIDAS) };
}

/** Quantas vezes ouviste esta música e quando foi a última (`null` = ainda não). */
export function sobreAFaixa(
  contagens: readonly Contagem[], faixa: { source: string; sourceId: string } | null,
): { vezes: number; ultima: number | null } {
  if (!faixa) return { vezes: 0, ultima: null };
  const c = contagens.find((x) => x.source === faixa.source && x.sourceId === faixa.sourceId);
  return c && c.count > 0 ? { vezes: c.count, ultima: c.lastPlayed || null } : { vezes: 0, ultima: null };
}

/** "once", "14 times": para o "You played it". */
export function textoDeVezes(n: number): string {
  if (!(n > 0)) return 'Not yet';
  return n === 1 ? 'Once' : `${n} times`;
}

const DIA = 86_400_000;

/** Há quanto tempo: "Today", "Yesterday", "3 days ago", "2 weeks ago", "5 months ago", "Over a year ago". */
export function haQuanto(quando: number | null, agora: number): string {
  if (!quando) return '—';
  const dias = Math.floor((agora - quando) / DIA);
  if (dias <= 0) return 'Today';
  if (dias === 1) return 'Yesterday';
  if (dias < 14) return `${dias} days ago`;
  if (dias < 60) return `${Math.floor(dias / 7)} weeks ago`;
  if (dias < 365) return `${Math.floor(dias / 30)} months ago`;
  return 'Over a year ago';
}

/** Um número de reproduções, curto: 182, 1.2K. */
export function numeroCurto(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(Math.round(n / 100) / 10).toString()}K`;
  return String(Math.round(n));
}

/** O tempo do refrão como se escreve num botão: 48 -> "0:48", 125 -> "2:05". */
export function relogio(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
