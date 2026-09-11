import type { Track } from '../types';

/** Quanto risco musical a pessoa quer NESTA sessão. */
export type DiscoveryMode = 'comfort' | 'balanced' | 'explore';

export const DISCOVERY_MODES: readonly DiscoveryMode[] = ['comfort', 'balanced', 'explore'];

export const DISCOVERY_MODE_COPY: Record<DiscoveryMode, { label: string; description: string }> = {
  comfort: {
    label: 'Comfort',
    description: 'Mostly familiar music, with occasional discoveries.',
  },
  balanced: {
    label: 'Balanced',
    description: 'A steady mix of favourites and music that fits your taste.',
  },
  explore: {
    label: 'Explore',
    description: 'More new music, broader neighbours and fewer familiar anchors.',
  },
};

/** Onde uma recomendação apareceu. Sem nomes de faixas nem de pessoas. */
export type DiscoverySurface =
  | 'discover_weekly'
  | 'rare_finds'
  | 'friends_favourites'
  | 'listen_again'
  | 'daily_flow'
  | 'heavy_rotation'
  | 'forgotten_favourites'
  | 'style_mix'
  | 'artist_mix'
  | 'genre_mix'
  | 'decade_mix'
  | 'artist_radio'
  | 'smart_shuffle'
  | 'autoplay_radio';

export type DiscoveryReason =
  | 'taste_neighbour'
  | 'new_from_your_artists'
  | 'friends_listening'
  | 'recently_played'
  | 'familiar_anchor'
  | 'session_discovery'
  | 'most_played'
  | 'forgotten_favourite'
  | 'style_match'
  | 'artist_neighbour'
  | 'genre_match'
  | 'decade_match';

/** Viaja com a fila em memória. O texto serve a UI; analytics leva só os códigos. */
export type DiscoveryContext = {
  surface: DiscoverySurface;
  reasonCode: DiscoveryReason;
  reason: string;
  mode: DiscoveryMode;
};

export type MixKind = 'mix' | 'radio' | 'flow';

function padrao(modo: DiscoveryMode, tipo: MixKind): readonly ('known' | 'new')[] {
  if (tipo === 'flow') {
    if (modo === 'comfort') return ['known', 'known', 'known', 'known', 'known', 'new'];
    if (modo === 'explore') return ['new', 'new', 'known'];
    return ['known', 'known', 'new'];
  }
  if (tipo === 'radio') {
    if (modo === 'comfort') return ['known', 'new'];
    if (modo === 'explore') return ['new', 'new', 'new', 'new', 'new', 'new', 'known'];
    return ['new', 'new', 'new', 'known'];
  }
  if (modo === 'comfort') return ['known', 'known', 'known', 'new'];
  if (modo === 'explore') return ['new', 'new', 'new', 'known'];
  return ['known', 'new'];
}

/**
 * Junta conhecidas e novas segundo uma regra visível, sem deitar nenhuma fora.
 * Quando um lado seca, continua pelo outro: o modo nunca transforma uma lista
 * válida numa lista curta só para cumprir uma proporção impossível.
 */
export function misturarPorFamiliaridade<T>(
  conhecidas: readonly T[],
  novas: readonly T[],
  limite: number,
  modo: DiscoveryMode,
  tipo: MixKind,
): T[] {
  const ordem = padrao(modo, tipo);
  const saida: T[] = [];
  let iConhecida = 0;
  let iNova = 0;
  while (saida.length < limite && (iConhecida < conhecidas.length || iNova < novas.length)) {
    let entrou = false;
    for (const lado of ordem) {
      if (saida.length >= limite) break;
      if (lado === 'known' && iConhecida < conhecidas.length) {
        saida.push(conhecidas[iConhecida++]);
        entrou = true;
      } else if (lado === 'new' && iNova < novas.length) {
        saida.push(novas[iNova++]);
        entrou = true;
      }
    }
    if (!entrou) break;
  }
  while (saida.length < limite && iConhecida < conhecidas.length) saida.push(conhecidas[iConhecida++]);
  while (saida.length < limite && iNova < novas.length) saida.push(novas[iNova++]);
  return saida;
}

/** Smart Shuffle: o modo decide a frequência, não inventa outro algoritmo. */
export function intervaloDoSmartShuffle(modo: DiscoveryMode): number {
  if (modo === 'comfort') return 6;
  if (modo === 'explore') return 2;
  return 4;
}

/**
 * Tenta deixar sete músicas entre repetições do mesmo artista. Se a lista não
 * tiver diversidade suficiente, escolhe a melhor alternativa restante em vez
 * de apagar música ou ficar preso.
 */
export function espacadasPorArtista<T>(
  entrada: readonly T[],
  artista: (item: T) => string,
  intervalo = 7,
): T[] {
  if (entrada.length < 3 || intervalo < 1) return [...entrada];
  const porUsar = [...entrada];
  const saida: T[] = [];
  while (porUsar.length) {
    const recentes = new Set(saida.slice(-intervalo).map(artista).filter(Boolean));
    let indice = porUsar.findIndex((item) => {
      const chave = artista(item);
      return !chave || !recentes.has(chave);
    });
    if (indice < 0) indice = 0;
    saida.push(porUsar.splice(indice, 1)[0]);
  }
  return saida;
}

export type RecommendationShelf =
  | 'descobrir' | 'nuncaLancado' | 'amigos' | 'ouvirDeNovo'
  | 'flow' | 'maisTocadas' | 'esquecidas';

export function contextoDaPrateleira(
  nome: RecommendationShelf,
  modo: DiscoveryMode,
  _guardada = false,
): DiscoveryContext {
  switch (nome) {
    case 'descobrir':
      return { surface: 'discover_weekly', reasonCode: 'taste_neighbour', reason: 'Because it is close to artists you play most', mode: modo };
    case 'nuncaLancado':
      return { surface: 'rare_finds', reasonCode: 'new_from_your_artists', reason: 'A new-to-you find from one of your artists', mode: modo };
    case 'amigos':
      return { surface: 'friends_favourites', reasonCode: 'friends_listening', reason: 'Popular with your Duotone friends', mode: modo };
    case 'ouvirDeNovo':
      return { surface: 'listen_again', reasonCode: 'recently_played', reason: 'Because you played it recently', mode: modo };
    case 'flow':
      return { surface: 'daily_flow', reasonCode: 'session_discovery', reason: 'Fits today’s listening flow', mode: modo };
    case 'maisTocadas':
      return { surface: 'heavy_rotation', reasonCode: 'most_played', reason: 'One of your most played tracks', mode: modo };
    case 'esquecidas':
      return { surface: 'forgotten_favourites', reasonCode: 'forgotten_favourite', reason: 'A favourite you have not played lately', mode: modo };
  }
}

function nomeSemSufixo(nome: string): string {
  return nome.replace(/\s+(?:mix|radio)$/i, '').trim();
}

export function contextoDaMistura(
  id: string,
  nome: string,
  modo: DiscoveryMode,
  _guardada = false,
): DiscoveryContext {
  const alvo = nomeSemSufixo(nome);
  if (id.startsWith('radio:')) {
    return { surface: 'artist_radio', reasonCode: 'artist_neighbour', reason: `Fits the sound around ${alvo}`, mode: modo };
  }
  if (id.startsWith('estilo:')) return { surface: 'style_mix', reasonCode: 'style_match', reason: `Fits the sound of ${alvo}`, mode: modo };
  if (id.startsWith('genero:')) return { surface: 'genre_mix', reasonCode: 'genre_match', reason: `From your ${alvo} collection`, mode: modo };
  if (id.startsWith('decada:')) return { surface: 'decade_mix', reasonCode: 'decade_match', reason: `From the ${alvo} music in your library`, mode: modo };
  return { surface: 'artist_mix', reasonCode: 'artist_neighbour', reason: `Fits your ${alvo} mix`, mode: modo };
}

export function contextoDoSmartShuffle(modo: DiscoveryMode): DiscoveryContext {
  return { surface: 'smart_shuffle', reasonCode: 'taste_neighbour', reason: 'Added by Smart Shuffle from what you are playing', mode: modo };
}

export function contextoDoRadioAutomatico(modo: DiscoveryMode): DiscoveryContext {
  return { surface: 'autoplay_radio', reasonCode: 'session_discovery', reason: 'Radio continued from your listening session', mode: modo };
}

export function contextoParaAnalytics(contexto: DiscoveryContext): Record<string, string> {
  return { superficie: contexto.surface, motivo: contexto.reasonCode, modo: contexto.mode };
}

export function chaveGuardada(track: Track): string {
  return `${track.source}:${track.sourceId}`;
}
