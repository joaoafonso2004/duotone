import { useEffect, useState } from 'react';
import { artistasEmAlta } from '../api/catalogo';
import { saveToLibrary } from '../api/library';
import { pesquisarFaixas } from '../api/search';
import { decidirBoasVindas } from '../lib/boasVindas';
import { pareceMusica } from '../lib/musica';
import { getArtistasSemente, getBoasVindasFeitas, setArtistasSemente, setBoasVindasFeitas } from '../lib/prefs';
import type { Track } from '../types';
import { useAbertura } from './abertura';
import { useAuth } from './auth';
import { useMisturaDoDia } from './misturaDoDia';
import { useRecomendacoes } from './recomendacoes';
import { useSaved } from './saved';

/**
 * O questionário da primeira vez, a parte que o iPhone e o PC partilham (26/9).
 * Cada lado desenha o seu (`components/BoasVindas.tsx`, `desktop/BoasVindas.web.tsx`);
 * quando aparece decide o `lib/boasVindas.ts`.
 */
export function useBoasVindas(): { aberto: boolean; fechar: () => void } {
  const userId = useAuth((s) => s.session?.user.id ?? null);
  const bibliotecaLida = useSaved((s) => s.loaded);
  const guardadas = useSaved((s) => s.keys.size);
  const aberturaAFrente = useAbertura((s) => s.aFrente);
  const [feito, setFeito] = useState<boolean | null>(null);
  const [aberto, setAberto] = useState(false);

  // Lê-se um pouco depois de entrar: a fusão das preferências da conta
  // (lib/prefsSync) corre ao entrar, e é ela que traz o "feito" do outro aparelho.
  useEffect(() => {
    setFeito(null);
    setAberto(false);
    if (!userId) return;
    let vivo = true;
    const t = setTimeout(() => { void getBoasVindasFeitas().then((f) => { if (vivo) setFeito(f); }); }, 2500);
    return () => { vivo = false; clearTimeout(t); };
  }, [userId]);

  useEffect(() => {
    if (!userId || aberto) return;
    const d = decidirBoasVindas({ feito, bibliotecaLida, guardadas, aberturaAFrente });
    if (d === 'mostrar') setAberto(true);
    else if (d === 'marcar-feito') { setFeito(true); void setBoasVindasFeitas(); }
  }, [userId, feito, bibliotecaLida, guardadas, aberturaAFrente, aberto]);

  return {
    aberto,
    fechar: () => { setAberto(false); setFeito(true); void setBoasVindasFeitas(); },
  };
}

export type ArtistaSugerido = { nome: string; capa: string | null };

export async function sugerirArtistas(): Promise<ArtistaSugerido[]> {
  try { return await artistasEmAlta(18); } catch { return []; }
}

/** Duas músicas de cada artista escolhido, para o passo das músicas não abrir vazio. */
export async function sugerirMusicas(artistas: readonly string[]): Promise<Track[]> {
  const vistas = new Set<string>();
  const saida: Track[] = [];
  for (const nome of artistas.slice(0, 3)) {
    try {
      const faixas = (await pesquisarFaixas(nome)).filter((t) => pareceMusica(t));
      let deste = 0;
      for (const t of faixas) {
        if (deste >= 2 || vistas.has(t.sourceId)) continue;
        vistas.add(t.sourceId);
        saida.push(t);
        deste++;
      }
    } catch {
      // Um artista sem resultados não estraga o passo: há a pesquisa.
    }
  }
  return saida;
}

/**
 * O fim: os artistas ficam como sementes das recomendações (as mesmas do
 * "Escolhe três artistas" do iPhone), as músicas vão para as Liked Songs, e as
 * prateleiras refazem-se já com isso.
 */
export async function concluirBoasVindas(artistas: readonly string[], musicas: readonly Track[]): Promise<void> {
  if (artistas.length) {
    const antes = await getArtistasSemente().catch(() => [] as string[]);
    await setArtistasSemente([...new Set([...artistas, ...antes])]);
  }
  for (const t of musicas) {
    try {
      await saveToLibrary(t);
      useSaved.getState().markSaved(t, true);
    } catch {
      // Uma que falhe não impede as outras.
    }
  }
  await setBoasVindasFeitas();
  if (artistas.length || musicas.length) {
    void useRecomendacoes.getState().carregar(true);
    void useMisturaDoDia.getState().carregar(true);
  }
}
