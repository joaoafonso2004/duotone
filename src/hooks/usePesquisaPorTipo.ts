import { useEffect, useState } from 'react';
import { pesquisarNoYtMusicCru } from '../api/ytMusic';
import {
  lerAlbunsDaPesquisa, lerArtistasDaPesquisa, type AlbumEncontrado, type ArtistaEncontrado,
} from '../lib/pesquisaPorTipo';

/** O separador de cima da pesquisa: as músicas são o `useMusicSearch` de sempre. */
export type SeparadorDaPesquisa = 'musicas' | 'artistas' | 'albuns';

type Resultado = { artistas: ArtistaEncontrado[]; albuns: AlbumEncontrado[] };
const VAZIO: Resultado = { artistas: [], albuns: [] };

/**
 * Em memória, por tipo e texto: voltar ao separador (ou à mesma pesquisa) não
 * pede outra vez. Um pedido falhado não fica, para a próxima tentar.
 */
const memoria = new Map<string, Promise<Resultado | null>>();

function pedir(tipo: 'artistas' | 'albuns', q: string): Promise<Resultado | null> {
  const chave = `${tipo}:${q.toLowerCase()}`;
  let pedido = memoria.get(chave);
  if (!pedido) {
    pedido = pesquisarNoYtMusicCru(q, tipo).then((r) => {
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
 * Os artistas e os álbuns de uma pesquisa (29/9, `lib/pesquisaPorTipo.ts`).
 *
 * Só pede o separador que está à vista: quem nunca sai das músicas não paga
 * nada. Um pedido por texto e tipo, sem chave nem quota (YouTube Music).
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
