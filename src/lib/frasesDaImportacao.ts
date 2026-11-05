/**
 * O que a barra de progresso de uma importação diz (26/9), igual no iPhone e
 * no PC. Puro e sem imports: `scripts/test-importacao-por-link.ts` confere.
 */
export interface ImportacaoParaFrases {
  tipo: 'spotify' | 'youtube' | 'deezer' | 'deezer-curto' | 'apple' | 'lista';
  nome: string | null;
  estado: 'na-fila' | 'a-ler' | 'a-procurar' | 'a-guardar' | 'feita' | 'falhou';
  feitas: number;
  total: number;
  resultado?: { adicionadas: number; deFora: number; cortada: boolean; limite?: number | null; destino?: 'playlist' | 'gostadas' };
  erro?: string;
}

const musicas = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;

/** O nome enquanto a playlist ainda não foi lida. */
const NOME_POR_TIPO: Record<ImportacaoParaFrases['tipo'], string> = {
  spotify: 'Spotify playlist',
  youtube: 'YouTube playlist',
  deezer: 'Deezer playlist',
  'deezer-curto': 'Deezer playlist',
  apple: 'Apple Music playlist',
  lista: 'your list',
};

export function frasesDaImportacao(
  i: ImportacaoParaFrases,
  naFila: number,
): { titulo: string; linha: string; fracao: number | null } {
  const nome = i.nome || NOME_POR_TIPO[i.tipo] || 'playlist';
  const depois = naFila > 0 ? ` · ${naFila} more after this` : '';
  switch (i.estado) {
    case 'na-fila':
    case 'a-ler':
      return { titulo: `Importing ${nome}`, linha: `Reading the playlist…${depois}`, fracao: null };
    case 'a-procurar':
      return {
        titulo: `Importing ${nome}`,
        linha: `${i.feitas} of ${musicas(i.total)}${depois}`,
        fracao: i.total > 0 ? Math.min(1, i.feitas / i.total) : null,
      };
    case 'a-guardar':
      return { titulo: `Importing ${nome}`, linha: `Saving…${depois}`, fracao: 1 };
    case 'feita': {
      const r = i.resultado!;
      const fora = r.deFora > 0 ? ` · ${r.deFora} not found` : '';
      const corte = r.cortada ? ` · first ${r.limite ?? 100} only` : '';
      const titulo = r.destino === 'gostadas' ? 'Added to your Liked Songs' : `${nome} is in your playlists`;
      return { titulo, linha: `${musicas(r.adicionadas)}${fora}${corte}`, fracao: 1 };
    }
    case 'falhou':
      return { titulo: `Couldn't import ${nome}`, linha: i.erro || 'Try again later.', fracao: null };
  }
}
