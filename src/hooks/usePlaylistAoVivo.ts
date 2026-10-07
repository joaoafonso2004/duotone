import { useEffect, useRef } from 'react';
import { ouvirMudancasDaPlaylist } from '../api/playlists';

/** Quanto se espera depois de um aviso: uma importação ou uma reordenação são vários. */
export const ESPERA_DEPOIS_DO_AVISO_MS = 700;

/**
 * Uma playlist colaborativa aberta relê-se quando OUTRA pessoa mexe nela (7/10,
 * supabase/playlists-ao-vivo.sql). Antes só se via ao reabrir a página -- e no
 * PC nem isso, que a página guardava a cópia. Também se relê quando o canal
 * volta a ligar: o que mudou entretanto não veio por ele.
 *
 * Cada releitura são uns quatro pedidos, e os pedidos são os logs do Supabase
 * (1 GB por ciclo): por isso só com `ativo` (a playlist tem colaboradores), as
 * minhas mudanças não releem nada (quem as fez já as tem), e vários avisos
 * seguidos são uma releitura só.
 */
export function usePlaylistAoVivo(
  id: string,
  ativo: boolean,
  eu: string | null | undefined,
  aoMudar: () => void,
): void {
  const acao = useRef(aoMudar);
  acao.current = aoMudar;
  useEffect(() => {
    if (!ativo) return;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const agendar = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => { espera = null; acao.current(); }, ESPERA_DEPOIS_DO_AVISO_MS);
    };
    const parar = ouvirMudancasDaPlaylist(id, (por) => { if (!eu || por !== eu) agendar(); }, agendar);
    return () => { parar(); if (espera) clearTimeout(espera); };
  }, [id, ativo, eu]);
}
