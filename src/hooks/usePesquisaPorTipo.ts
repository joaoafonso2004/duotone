import { useEffect, useState } from 'react';
import { pesquisarNoYtMusicCru } from '../api/ytMusic';
import { chaveDeArtista } from '../lib/artistName';
import {
  artistaEmDestaque, juntarPlaylists, lerAlbunsDaPesquisa, lerArtistasDaPesquisa, lerPlaylistsDaPesquisa, perguntaSemIntencao,
  type AlbumEncontrado, type ArtistaEncontrado, type PlaylistEncontrada,
} from '../lib/pesquisaPorTipo';

/** O separador de cima da pesquisa: as músicas são o `useMusicSearch` de sempre. */
export type SeparadorDaPesquisa = 'musicas' | 'artistas' | 'albuns' | 'playlists';

type Resultado = { artistas: ArtistaEncontrado[]; albuns: AlbumEncontrado[]; playlists: PlaylistEncontrada[] };
const VAZIO: Resultado = { artistas: [], albuns: [], playlists: [] };

/**
 * Em memória, por tipo e texto: voltar ao separador (ou à mesma pesquisa) não
 * pede outra vez. Um pedido falhado não fica, para a próxima tentar.
 */
const memoria = new Map<string, Promise<Resultado | null>>();

async function pedirPlaylists(q: string): Promise<Resultado | null> {
  // As de pessoas e as editoriais, em paralelo; basta uma responder.
  const [dePessoas, editoriais] = await Promise.all([
    pesquisarNoYtMusicCru(q, 'playlists'),
    pesquisarNoYtMusicCru(q, 'playlistsEditoriais'),
  ]);
  if (!dePessoas && !editoriais) return null;
  return {
    ...VAZIO,
    playlists: juntarPlaylists(q, lerPlaylistsDaPesquisa(editoriais, true), lerPlaylistsDaPesquisa(dePessoas, false)),
  };
}

function pedir(tipo: Exclude<SeparadorDaPesquisa, 'musicas'>, q: string): Promise<Resultado | null> {
  const chave = `${tipo}:${q.toLowerCase()}`;
  let pedido = memoria.get(chave);
  if (!pedido) {
    // "drake playlist" nos artistas e nos álbuns procura "drake": a palavra de
    // intenção só baralhava (vinham os álbuns de toda a gente).
    pedido = tipo === 'playlists' ? pedirPlaylists(q) : pesquisarNoYtMusicCru(perguntaSemIntencao(q), tipo).then((r) => {
      if (!r) return null;
      return tipo === 'artistas'
        ? { ...VAZIO, artistas: lerArtistasDaPesquisa(r) }
        : { ...VAZIO, albuns: lerAlbunsDaPesquisa(r) };
    });
    memoria.set(chave, pedido);
    void pedido.then((r) => { if (!r) memoria.delete(chave); });
  }
  return pedido;
}

/**
 * Os artistas, os álbuns e as playlists de uma pesquisa (29/9,
 * `lib/pesquisaPorTipo.ts`).
 *
 * Só pede o separador que está à vista: quem nunca sai das músicas não paga
 * nada. Sem chave nem quota (YouTube Music).
 */
export function usePesquisaPorTipo(query: string, separador: SeparadorDaPesquisa) {
  const [resultado, setResultado] = useState<Resultado>(VAZIO);
  const [loading, setLoading] = useState(false);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    const q = query.trim();
    setResultado(VAZIO);
    setFalhou(false);
    if (separador === 'musicas' || q.length < 2) { setLoading(false); return; }
    let atual = true;
    setLoading(true);
    const tipo = separador;
    const timer = setTimeout(() => {
      void pedir(tipo, q).then((r) => {
        if (!atual) return;
        setLoading(false);
        if (r) setResultado(r); else setFalhou(true);
      });
    }, 350);
    return () => { atual = false; clearTimeout(timer); };
  }, [query, separador]);
  return { ...resultado, loading, falhou };
}

/**
 * O artista em destaque no topo das Songs e das Playlists (29/9, como o
 * YouTube faz com "drake playlist"): o cartão dele, com o Mix. Usa a MESMA
 * pesquisa de artistas e a mesma memória do separador Artists, por isso ir lá
 * a seguir não pede nada. `null` quando a pergunta não é o nome de um artista.
 */
export function useArtistaEmDestaque(query: string, ativo: boolean): ArtistaEncontrado | null {
  const [artista, setArtista] = useState<ArtistaEncontrado | null>(null);
  useEffect(() => {
    const q = query.trim();
    setArtista(null);
    if (!ativo || q.length < 2) return;
    let atual = true;
    const timer = setTimeout(() => {
      void pedir('artistas', q).then((r) => {
        if (atual && r) setArtista(artistaEmDestaque(q, r.artistas, chaveDeArtista));
      });
    }, 350);
    return () => { atual = false; clearTimeout(timer); };
  }, [query, ativo]);
  return artista;
}
