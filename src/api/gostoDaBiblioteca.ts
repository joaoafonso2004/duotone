import { chaveDeArtista } from '../lib/artistName';
import { gostoAPartirDoSpotify } from '../lib/gostoDoSpotify';
import { artistasPorFrequencia } from '../lib/leitorWebDoSpotify';
import type { LinhaDaPlaylist } from '../lib/linkDePlaylist';
import { setGostoDoSpotify } from '../lib/prefs';

/**
 * O gosto do Spotify a partir da biblioteca importada pela conta (11/11), no
 * PC e no iPhone. Antes saía só dos "artistas mais ouvidos" do login oficial,
 * que só aceita as cinco contas registadas no painel do Spotify. Agora quem
 * importa as Liked Songs e as playlists dá à app o mesmo sinal: os artistas que
 * lá mais aparecem. A regra de como pesa continua em `lib/gostoDoSpotify.ts`
 * (soma-se ao histórico, envelhece, nunca vai para o `plays`).
 */
export async function guardarGostoDaBiblioteca(linhas: readonly LinhaDaPlaylist[]): Promise<void> {
  const artistas = artistasPorFrequencia(linhas, 50);
  // Com menos do que isto não há gosto nenhum a ler.
  if (artistas.length < 3) return;
  await setGostoDoSpotify(gostoAPartirDoSpotify({ curto: [], medio: [], longo: artistas, recentes: [] }, chaveDeArtista, Date.now()));
}
