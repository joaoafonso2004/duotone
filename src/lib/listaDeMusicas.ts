import type { LinhaDaPlaylist } from './linkDePlaylist';
import { parseSpotifyCsv } from './spotifyCsv';

/**
 * Uma lista de músicas colada ou num ficheiro (5/11, a importação de qualquer
 * sítio): é por aqui que entra o que não se lê por link (Tidal, Amazon Music,
 * SoundCloud, as Liked Songs de outro serviço, que são privadas). Puro.
 *
 * - **Texto**: uma música por linha, "Artist - Song" (o hífen, o – ou o —), ou
 *   "Song by Artist". Os números e as marcas do princípio caem ("1.", "02)",
 *   "•"). O que não se percebe conta como ignorado e diz-se.
 * - **CSV**: pelo `parseSpotifyCsv`, que já conhece os cabeçalhos do Exportify
 *   em várias línguas e os genéricos ("Track name", "Artist name", "Title",
 *   "Artist", "Album") -- os do TuneMyMusic incluídos. Um CSV colado também.
 * - **M3U**: as linhas `#EXTINF:segundos,Artist - Song`.
 */
export interface ListaLida {
  linhas: LinhaDaPlaylist[];
  /** Linhas que não se perceberam (não contam as vazias nem os comentários). */
  ignoradas: number;
  formato: 'texto' | 'csv' | 'm3u';
}

const SEPARADOR = /^(.+?)\s+[-–—]\s+(.+)$/;
const POR = /^(.+?)\s+by\s+(.+)$/i;

/** Uma linha de texto, ou `null` se não se percebe. */
export function lerLinhaDeTexto(linha: string): LinhaDaPlaylist | null {
  const l = String(linha || '')
    .trim()
    // "1." e "02)" caem, mas não "311 - Amber": aí o número é a banda.
    .replace(/^(?:\d{1,4}\s*[.)]|[•*·-])\s+/, '')
    .trim();
  if (!l || /^https?:\/\//i.test(l)) return null;
  const s = SEPARADOR.exec(l);
  if (s) return linha2(s[1], s[2]);
  const p = POR.exec(l);
  if (p) return linha2(p[2], p[1]);
  return null;
}

function linha2(artista: string, titulo: string, durationMs: number | null = null): LinhaDaPlaylist | null {
  const artist = artista.replace(/^["']|["']$/g, '').trim();
  const title = titulo.replace(/^["']|["']$/g, '').trim();
  if (!artist || !title) return null;
  return { title, artist, album: null, durationMs, uri: null };
}

const pareceCsv = (texto: string) => {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? '';
  return (primeira.match(/,/g)?.length ?? 0) >= 1
    && /(track|title|song|name|artist|nome|faixa)/i.test(primeira)
    && /(artist|artista)/i.test(primeira);
};

/**
 * A mesma música duas vezes ("A - B" e "B by A") é uma pesquisa a mais e uma
 * linha repetida no cartão: fica a primeira.
 */
function semRepetidas(l: ListaLida): ListaLida {
  const vistas = new Set<string>();
  const linhas = l.linhas.filter((x) => {
    const chave = `${x.artist}\u0000${x.title}`.toLowerCase();
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
  return { ...l, linhas };
}

export function lerListaDeMusicas(texto: string, nomeDoFicheiro?: string | null): ListaLida {
  return semRepetidas(lerListaSemFiltro(texto, nomeDoFicheiro));
}

function lerListaSemFiltro(texto: string, nomeDoFicheiro?: string | null): ListaLida {
  const t = String(texto || '').replace(/^﻿/, '');
  const nome = String(nomeDoFicheiro || '').toLowerCase();

  if (/\.m3u8?$/.test(nome) || /^#EXTM3U/m.test(t) || /^#EXTINF/m.test(t)) {
    const linhas: LinhaDaPlaylist[] = [];
    let ignoradas = 0;
    for (const m of t.matchAll(/^#EXTINF:\s*(-?\d+)[^,\n]*,(.*)$/gm)) {
      const segundos = Number(m[1]);
      const s = SEPARADOR.exec(m[2].trim());
      const l = s ? linha2(s[1], s[2], segundos > 0 ? segundos * 1000 : null) : null;
      if (l) linhas.push(l); else ignoradas++;
    }
    return { linhas, ignoradas, formato: 'm3u' };
  }

  if (/\.csv$/.test(nome) || pareceCsv(t)) {
    const r = parseSpotifyCsv(t);
    if (!r.problem && r.rows.length) {
      return {
        linhas: r.rows.map((x) => ({ title: x.title, artist: x.artist, album: x.album ?? null, durationMs: x.durationMs ?? null, uri: x.uri ?? null })),
        ignoradas: r.skipped,
        formato: 'csv',
      };
    }
    if (/\.csv$/.test(nome)) return { linhas: [], ignoradas: 0, formato: 'csv' };
  }

  const linhas: LinhaDaPlaylist[] = [];
  let ignoradas = 0;
  for (const bruta of t.split(/\r?\n/)) {
    const l = bruta.trim();
    if (!l || l.startsWith('#')) continue;
    const lida = lerLinhaDeTexto(l);
    if (lida) linhas.push(lida); else ignoradas++;
  }
  return { linhas, ignoradas, formato: 'texto' };
}
