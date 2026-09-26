/**
 * O que a barra de progresso de uma importação diz (26/9), igual no iPhone e
 * no PC. Puro e sem imports: `scripts/test-importacao-por-link.ts` confere.
 */
export interface ImportacaoParaFrases {
  tipo: 'spotify' | 'youtube';
  nome: string | null;
  estado: 'na-fila' | 'a-ler' | 'a-procurar' | 'a-guardar' | 'feita' | 'falhou';
  feitas: number;
  total: number;
  resultado?: { adicionadas: number; deFora: number; cortada: boolean };
  erro?: string;
}

const musicas = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;

export function frasesDaImportacao(
  i: ImportacaoParaFrases,
  naFila: number,
): { titulo: string; linha: string; fracao: number | null } {
  const nome = i.nome || (i.tipo === 'spotify' ? 'Spotify playlist' : 'YouTube playlist');
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
      const corte = r.cortada ? ' · first 100 only' : '';
      return { titulo: `${nome} is in your playlists`, linha: `${musicas(r.adicionadas)}${fora}${corte}`, fracao: 1 };
    }
    case 'falhou':
      return { titulo: `Couldn't import ${nome}`, linha: i.erro || 'Try again later.', fracao: null };
  }
}
