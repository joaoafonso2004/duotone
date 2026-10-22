import { useEffect, useMemo, useState } from 'react';
import { fotoDoArtista, vizinhancaConfirmada } from '../api/catalogo';
import { chaveDeArtista, tituloNoLeitor } from '../lib/artistName';
import { parecidosAVista } from '../lib/musicasDoArtista';
import type { Track } from '../types';

/** Quantas músicas dele na biblioteca servem de prova de quem ele é. */
const PROVAS = 6;

/**
 * Os fãs e os parecidos de um artista, para a página dele (20/10, variante A
 * de `docs/artista-maquete.html`): o "5.1M fans" por baixo do nome e o "Fans
 * also like".
 *
 * **A mesma decisão das recomendações** (`vizinhancaConfirmada`, com as
 * músicas dele na biblioteca como prova): por um nome só vinham os parecidos
 * de um homónimo. Espera pela biblioteca (`pronta`) por isso mesmo.
 *
 * **Quanto custa.** A vizinhança vive em memória, depois no disco do aparelho,
 * e só depois no `yt_cache` do Supabase (`api/cache.ts`): os artistas que as
 * recomendações já decidiram não pedem nada, e um artista que este aparelho
 * nunca viu custa uma leitura ao Supabase (mais uma escrita se for novo para
 * toda a gente) -- uma vez por aparelho, não por visita. Os pedidos ao
 * catálogo (Deezer) não são do Supabase.
 */
export function useVizinhancaDoArtista(nome: string, faixas: readonly Track[], pronta: boolean): {
  fas: number | null; parecidos: string[];
} {
  const [estado, setEstado] = useState<{ fas: number | null; parecidos: string[] }>({ fas: null, parecidos: [] });
  const provas = useMemo(
    () => [...new Set(faixas.slice(0, PROVAS * 2).map((f) => tituloNoLeitor(f)).filter(Boolean))].slice(0, PROVAS),
    [faixas],
  );
  const chaveDasProvas = provas.join('|');
  useEffect(() => {
    setEstado({ fas: null, parecidos: [] });
    if (!pronta || !nome) return;
    let vivo = true;
    void vizinhancaConfirmada(nome, provas)
      .then((v) => {
        if (!vivo || !v) return;
        setEstado({ fas: v.artista.fas || null, parecidos: parecidosAVista(v.semelhantes, nome, chaveDeArtista) });
      })
      .catch(() => { /* sem catálogo, a página fica sem os fãs e sem os parecidos */ });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chaveDasProvas` resume as provas
  }, [nome, pronta, chaveDasProvas]);
  return estado;
}

/**
 * A foto de um artista do catálogo (a mesma da página dele), para os "Fans also
 * like". Fica em memória durante a sessão (`fotoDoArtista`); não passa pelo
 * Supabase.
 */
export function useFotoDoArtista(nome: string): string | null {
  const [foto, setFoto] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setFoto(null);
    void fotoDoArtista(nome).then((url) => { if (vivo) setFoto(url); });
    return () => { vivo = false; };
  }, [nome]);
  return foto;
}
