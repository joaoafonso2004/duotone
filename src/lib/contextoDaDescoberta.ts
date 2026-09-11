import type { Track } from '../types';

/**
 * Porque é que uma recomendação apareceu, e como se mistura o conhecido com o
 * novo.
 *
 * Chamava-se `discoveryControl.ts`, do seletor Comfort / Balanced / Explore que
 * a 2.6.4 trouxe e que saiu a 11/9/2026 por decisão do João. Ficou o que o
 * seletor não inventou: a razão que cada sugestão mostra ("Because it is close
 * to artists you play most"), os códigos que a medição leva, e as proporções
 * do antigo Balanced -- que eram as que toda a gente tinha, e continuam.
 */

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
};

export type MixKind = 'mix' | 'radio' | 'flow';

/**
 * A ordem em que entram conhecidas e novas, por tipo de lista.
 *
 * O Flow ancora em música tua (duas tuas, uma nova); as misturas alternam; o
 * rádio dá três novas por cada tua -- a mesma promessa que a prateleira
 * "Radio" escreve por baixo do título (`NOVAS_POR_TUA` em lib/misturas.ts).
 */
function padrao(tipo: MixKind): readonly ('known' | 'new')[] {
  if (tipo === 'flow') return ['known', 'known', 'new'];
  if (tipo === 'radio') return ['new', 'new', 'new', 'known'];
  return ['known', 'new'];
}

/**
 * Junta conhecidas e novas segundo uma regra visível, sem deitar nenhuma fora.
 * Quando um lado seca, continua pelo outro: a proporção nunca transforma uma
 * lista válida numa lista curta só para ser cumprida.
 */
export function misturarPorFamiliaridade<T>(
  conhecidas: readonly T[],
  novas: readonly T[],
  limite: number,
  tipo: MixKind,
): T[] {
  const ordem = padrao(tipo);
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
  _guardada = false,
): DiscoveryContext {
  switch (nome) {
    case 'descobrir':
      return { surface: 'discover_weekly', reasonCode: 'taste_neighbour', reason: 'Because it is close to artists you play most' };
    case 'nuncaLancado':
      return { surface: 'rare_finds', reasonCode: 'new_from_your_artists', reason: 'A new-to-you find from one of your artists' };
    case 'amigos':
      return { surface: 'friends_favourites', reasonCode: 'friends_listening', reason: 'Popular with your Duotone friends' };
    case 'ouvirDeNovo':
      return { surface: 'listen_again', reasonCode: 'recently_played', reason: 'Because you played it recently' };
    case 'flow':
      return { surface: 'daily_flow', reasonCode: 'session_discovery', reason: 'Fits today’s listening flow' };
    case 'maisTocadas':
      return { surface: 'heavy_rotation', reasonCode: 'most_played', reason: 'One of your most played tracks' };
    case 'esquecidas':
      return { surface: 'forgotten_favourites', reasonCode: 'forgotten_favourite', reason: 'A favourite you have not played lately' };
  }
}

function nomeSemSufixo(nome: string): string {
  return nome.replace(/\s+(?:mix|radio)$/i, '').trim();
}

export function contextoDaMistura(
  id: string,
  nome: string,
  _guardada = false,
): DiscoveryContext {
  const alvo = nomeSemSufixo(nome);
  if (id.startsWith('radio:')) {
    return { surface: 'artist_radio', reasonCode: 'artist_neighbour', reason: `Fits the sound around ${alvo}` };
  }
  if (id.startsWith('estilo:')) return { surface: 'style_mix', reasonCode: 'style_match', reason: `Fits the sound of ${alvo}` };
  if (id.startsWith('genero:')) return { surface: 'genre_mix', reasonCode: 'genre_match', reason: `From your ${alvo} collection` };
  if (id.startsWith('decada:')) return { surface: 'decade_mix', reasonCode: 'decade_match', reason: `From the ${alvo} music in your library` };
  return { surface: 'artist_mix', reasonCode: 'artist_neighbour', reason: `Fits your ${alvo} mix` };
}

export function contextoDoSmartShuffle(): DiscoveryContext {
  return { surface: 'smart_shuffle', reasonCode: 'taste_neighbour', reason: 'Added by Smart Shuffle from what you are playing' };
}

export function contextoDoRadioAutomatico(): DiscoveryContext {
  return { surface: 'autoplay_radio', reasonCode: 'session_discovery', reason: 'Radio continued from your listening session' };
}

export function contextoParaAnalytics(contexto: DiscoveryContext): Record<string, string> {
  return { superficie: contexto.surface, motivo: contexto.reasonCode };
}

export function chaveGuardada(track: Track): string {
  return `${track.source}:${track.sourceId}`;
}
