import type { View } from 'react-native';
import type { ParametrosDoAlbum } from '../screens/AlbumScreen';
import { entrarPeloQuadrado } from '../state/vooDoQuadrado';

/**
 * Abrir um álbum (26/11, item 15 do plano de melhorias): a página `Album`, pelo
 * quadrado quando há um cartão de onde sair (`no`: a capa, ou o `currentTarget`
 * do toque), senão a entrar como as outras. Para todos os sítios que abriam a
 * folha: os lançamentos e a pesquisa da Home, a discografia do artista, os álbuns
 * guardados e os álbuns mandados numa conversa.
 */
export function abrirAlbum(
  navigation: { navigate: (rota: string, params: object) => void },
  album: Omit<ParametrosDoAlbum, 'voo'>,
  no?: unknown,
): void {
  const navegar = (voo: string | undefined) => navigation.navigate('Album', { ...album, ...(voo ? { voo } : {}) });
  if (!no) { navegar(undefined); return; }
  entrarPeloQuadrado(no as View, {
    capas: album.capa ? [album.capa] : [], raio: 12, destino: 'centro', navegar,
  });
}
