/**
 * Os retratos que viajam entre uma grelha e a página de um item (30/10, a volta
 * dos passos 2 e 4 de `docs/PLANO-ELEVAR-PC.md`): as chaves com que cada cartão
 * da grelha se regista (`desktop/viagem.web.ts`), e a que cartão chega a volta.
 * Puro, para o teste a correr em Node.
 */
import { chaveDeArtista } from './artistName';

/** A chave de cada retrato montado na grelha. Uma só maneira de a escrever: quem parte e quem chega têm de coincidir. */
export const RETRATO = {
  playlist: (id: string) => `playlist:${id}`,
  artista: (chave: string) => `artista:${chave}`,
  /** O cartão em destaque da grelha dos Artists: o mesmo artista, outro cartão. */
  artistaEmDestaque: (chave: string) => `artista:${chave}:destaque`,
} as const;

type Rota = { name: string; id?: unknown; value?: unknown };

/**
 * Para onde voltam os retratos quando se sai da página de um item de volta à
 * grelha dele: os cartões onde pode chegar, por ordem (o da grelha, e a seguir
 * o do destaque). Só a página de uma playlist volta às Playlists e a de um
 * artista aos Artists; qualquer outro caminho (uma pesquisa, a Home) volta
 * como sempre, sem viagem.
 */
export function retratosDaVolta(de: Rota, para: Rota): string[] | null {
  if (de.name === 'playlist' && para.name === 'playlists' && typeof de.id === 'string' && de.id) return [RETRATO.playlist(de.id)];
  if (de.name === 'artist' && para.name === 'artists' && typeof de.value === 'string' && de.value) {
    const chave = chaveDeArtista(de.value);
    return [RETRATO.artista(chave), RETRATO.artistaEmDestaque(chave)];
  }
  return null;
}
