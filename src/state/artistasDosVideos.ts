import AsyncStorage from '@react-native-async-storage/async-storage';
import { artistasDosVideosConhecidos, ouvirArtistasDosVideos, registarArtistasDoVideo } from '../lib/artistName';

/**
 * Os artistas de cada vídeo (`registarArtistasDoVideo`, lib/artistName.ts),
 * guardados no aparelho (11/10). Vêm das respostas do YouTube Music que a app
 * já lê (a página de um artista, o rádio): não custam pedidos nem tocam no
 * Supabase. É o que deixa o `displayArtist` corrigir uma música guardada com o
 * artista errado no catálogo partilhado.
 */
const CHAVE = 'artistas-dos-videos:v1';
const GUARDAR_DEPOIS_MS = 3000;
let espera: ReturnType<typeof setTimeout> | undefined;

function guardar(): void {
  const linhas = [...artistasDosVideosConhecidos()];
  void AsyncStorage.setItem(CHAVE, JSON.stringify(linhas)).catch(() => {});
}

/** No arranque (`App.tsx`): lê o que estava guardado e passa a guardar o que se aprende. */
export async function carregarArtistasDosVideos(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(CHAVE);
    const linhas: unknown = v ? JSON.parse(v) : [];
    if (Array.isArray(linhas)) {
      for (const l of linhas) {
        if (Array.isArray(l) && typeof l[0] === 'string' && typeof l[1] === 'string') registarArtistasDoVideo(l[0], l[1].split(' & '));
      }
    }
  } catch { /* começa vazio */ }
  // Depois de ler: o que se lê não volta a escrever-se.
  ouvirArtistasDosVideos(() => {
    clearTimeout(espera);
    espera = setTimeout(guardar, GUARDAR_DEPOIS_MS);
  });
}
