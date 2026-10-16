import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Track } from '../types';

/**
 * As procuras de músicas do catálogo no YouTube, guardadas NO APARELHO (16/10).
 *
 * A descoberta (o Radio, o Smart Shuffle, as prateleiras da Home) pega numa
 * música do catálogo ("Isak — Max Win") e procura-a no YouTube: uma pesquisa
 * por música, e as mesmas repetiam-se a cada lote do Radio, a cada abertura da
 * Home. Era o grosso dos pedidos ao YouTube -- e uma ligação que pede demais é
 * travada por ele (`lib/pedidosAoYouTube.ts`). Agora a resposta fica 30 dias
 * (a que não se encontrou, 3). Fica no AsyncStorage e não no `yt_cache`: lá
 * cada leitura e cada escrita era um pedido ao Supabase (os logs).
 */

const CHAVE = 'duotone:procuras-no-youtube:v1';
const MAXIMO = 1500;
export const ACHADA_VALE_MS = 30 * 24 * 60 * 60_000;
export const FALHADA_VALE_MS = 3 * 24 * 60 * 60_000;
const ESCREVER_DEPOIS_MS = 4000;

type Faixa = Pick<Track, 'source' | 'sourceId' | 'title' | 'artist' | 'artworkUrl' | 'durationSeconds'>;
type Guardada = { em: number; faixa: Faixa | null };

let mapa: Map<string, Guardada> | null = null;
let carregamento: Promise<Map<string, Guardada>> | null = null;
let escrita: ReturnType<typeof setTimeout> | null = null;

export const chaveDaProcura = (artista: string, titulo: string): string =>
  `${artista}|${titulo}`.toLowerCase().replace(/\s+/g, ' ').trim();

function carregar(): Promise<Map<string, Guardada>> {
  if (mapa) return Promise.resolve(mapa);
  carregamento ??= AsyncStorage.getItem(CHAVE)
    .then((raw) => {
      const lidas = raw ? JSON.parse(raw) : [];
      return new Map<string, Guardada>(Array.isArray(lidas) ? lidas : []);
    })
    .catch(() => new Map<string, Guardada>())
    .then((m) => { mapa = m; return m; });
  return carregamento;
}

/** A procura guardada e ainda válida, ou `undefined` (nunca feita, ou velha). */
export async function procuraGuardada(chave: string, agora = Date.now()): Promise<{ faixa: Track | null } | undefined> {
  const m = await carregar();
  const g = m.get(chave);
  if (!g) return undefined;
  const vale = g.faixa ? ACHADA_VALE_MS : FALHADA_VALE_MS;
  if (agora - g.em > vale) return undefined;
  return { faixa: g.faixa ? { ...g.faixa, album: null } : null };
}

/** Guarda o que a procura deu (só quando ela CORREU: uma falha de rede não se guarda). */
export function guardarProcura(chave: string, faixa: Track | null, agora = Date.now()): void {
  void carregar().then((m) => {
    m.delete(chave);
    m.set(chave, {
      em: agora,
      faixa: faixa ? {
        source: faixa.source, sourceId: faixa.sourceId, title: faixa.title, artist: faixa.artist,
        artworkUrl: faixa.artworkUrl, durationSeconds: faixa.durationSeconds,
      } : null,
    });
    // As mais antigas saem primeiro (o Map guarda a ordem de entrada).
    while (m.size > MAXIMO) m.delete(m.keys().next().value as string);
    if (escrita) return;
    escrita = setTimeout(() => {
      escrita = null;
      void AsyncStorage.setItem(CHAVE, JSON.stringify([...m])).catch(() => {});
    }, ESCREVER_DEPOIS_MS);
  });
}
