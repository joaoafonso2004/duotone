import { chaveDeArtista, tituloNoLeitor } from '../lib/artistName';
import {
  canalPelasProvas, canalSemProvas, legendaDoAlbum, lerAlbunsDoCanal, lerCancoesComArtistas, type Prova,
} from '../lib/albunsDoArtista';
import type { Track } from '../types';
import type { YtRecommendedPlaylist } from './youtube';
import { lerCanalDoYtMusic, pesquisarCancoesCru } from './ytMusic';

/** Quantas músicas da biblioteca se procuram para saber qual é o canal. */
const PROVAS = 3;
/** Em memória, por sessão: não vale uma escrita no Supabase por página aberta. */
const memoria = new Map<string, Promise<YtRecommendedPlaylist[]>>();

/**
 * Os álbuns do artista desta página (28/9). Ver `lib/albunsDoArtista.ts`.
 *
 * Substitui a pesquisa de playlists "<nome> album" da Data API, que além de
 * trazer os álbuns de um homónimo custava 100 unidades por página aberta. Isto
 * é o YouTube Music, sem chave nem quota. Falhar é lista vazia: o separador diz
 * "No albums found", nunca mostra os de outra pessoa.
 */
export function albunsDoArtista(nome: string, faixas: readonly Track[]): Promise<YtRecommendedPlaylist[]> {
  const alvo = chaveDeArtista(nome);
  if (!alvo) return Promise.resolve([]);
  const provas: Prova[] = faixas
    .filter((t) => t.source === 'youtube')
    .slice(0, PROVAS)
    .map((t) => ({ videoId: t.sourceId, titulo: tituloNoLeitor(t) }));
  const chave = `${alvo}|${provas.map((p) => p.videoId).join(',')}`;
  let pedido = memoria.get(chave);
  if (!pedido) {
    pedido = procurar(nome, alvo, provas).catch(() => []);
    memoria.set(chave, pedido);
    // Uma falha (sem rede) não fica guardada: a próxima visita tenta outra vez.
    void pedido.then((lista) => { if (!lista.length) memoria.delete(chave); });
  }
  return pedido;
}

async function procurar(nome: string, alvo: string, provas: Prova[]): Promise<YtRecommendedPlaylist[]> {
  let canal: string | null;
  if (provas.length) {
    const respostas = await Promise.all(provas.map(async (prova) => ({
      prova,
      cancoes: lerCancoesComArtistas(await pesquisarCancoesCru(`${nome} ${prova.titulo}`)),
    })));
    canal = canalPelasProvas(respostas, alvo, chaveDeArtista);
  } else {
    canal = canalSemProvas(lerCancoesComArtistas(await pesquisarCancoesCru(nome)), alvo, chaveDeArtista);
  }
  if (!canal) return [];
  return lerAlbunsDoCanal(await lerCanalDoYtMusic(canal)).map((a) => ({
    id: a.id,
    title: a.titulo,
    artworkUrl: a.capa,
    channelTitle: legendaDoAlbum(a),
  }));
}
