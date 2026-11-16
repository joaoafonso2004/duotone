/**
 * Exportar a biblioteca (16/11, pedido do João; ideia da análise geral e do
 * Metrolist): uma cópia das Liked Songs, das playlists e dos álbuns guardados,
 * para guardar ou levar para outra app. Quem não conhece a Duotone confia mais
 * numa app de onde pode sair com os dados.
 *
 * Dois formatos:
 * - **JSON**: tudo, com a fonte e o id de cada música. É a cópia de segurança.
 * - **CSV**: uma linha por música, com as colunas do Exportify ("Track Name",
 *   "Artist Name(s)", "Album Name", "Duration (ms)"), que a própria Duotone
 *   importa (lib/spotifyCsv.ts) e que as ferramentas de passar playlists entre
 *   serviços conhecem. A coluna "Playlist" diz de onde vem cada linha.
 *
 * Aqui só as contas e o texto; quem recolhe é o `recolherBiblioteca.ts` e quem
 * grava é o `guardarExportacao` de cada plataforma.
 *
 * Sem imports: `scripts/test-exportar-biblioteca.ts`.
 */

export type FaixaExportada = {
  title: string;
  artist: string | null;
  album: string | null;
  durationSeconds: number | null;
  source: string;
  sourceId: string;
};

export type ExportacaoDaBiblioteca = {
  format: 'duotone-library';
  version: 1;
  app: string;
  exportedAt: string;
  likedSongs: FaixaExportada[];
  playlists: { name: string; createdAt: string | null; tracks: FaixaExportada[] }[];
  savedAlbums: { id: string; title: string; artist: string | null; year: string | null; kind: string | null; savedAt: string | null }[];
};

export const NOME_DAS_GOSTADAS = 'Liked Songs';

export function montarExportacao(d: {
  app: string;
  agora: Date;
  gostadas: readonly FaixaExportada[];
  playlists: readonly { name: string; createdAt?: string | null; tracks: readonly FaixaExportada[] }[];
  albuns: readonly { id: string; titulo: string; artista: string | null; ano: string | null; tipo: string | null; guardadoEm: number }[];
}): ExportacaoDaBiblioteca {
  return {
    format: 'duotone-library',
    version: 1,
    app: d.app,
    exportedAt: d.agora.toISOString(),
    likedSongs: [...d.gostadas],
    playlists: d.playlists.map((p) => ({ name: p.name, createdAt: p.createdAt ?? null, tracks: [...p.tracks] })),
    savedAlbums: d.albuns.map((a) => ({
      id: a.id, title: a.titulo, artist: a.artista, year: a.ano, kind: a.tipo,
      savedAt: a.guardadoEm ? new Date(a.guardadoEm).toISOString() : null,
    })),
  };
}

export function paraJSON(e: ExportacaoDaBiblioteca): string {
  return `${JSON.stringify(e, null, 2)}\n`;
}

/** Um campo do CSV: com aspas quando tem vírgula, aspas ou mudança de linha (RFC 4180). */
function campo(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const COLUNAS_DO_CSV = ['Track Name', 'Artist Name(s)', 'Album Name', 'Duration (ms)', 'Playlist', 'Source', 'Source ID'] as const;

export function paraCSV(e: ExportacaoDaBiblioteca): string {
  const linhas: string[] = [COLUNAS_DO_CSV.join(',')];
  const juntar = (lista: string, faixas: readonly FaixaExportada[]) => {
    for (const f of faixas) {
      linhas.push([
        campo(f.title), campo(f.artist), campo(f.album),
        campo(f.durationSeconds ? Math.round(f.durationSeconds * 1000) : null),
        campo(lista), campo(f.source), campo(f.sourceId),
      ].join(','));
    }
  };
  juntar(NOME_DAS_GOSTADAS, e.likedSongs);
  for (const p of e.playlists) juntar(p.name, p.tracks);
  // CRLF, como pede o formato: o Excel do Windows lê-o sem confusões.
  return `${linhas.join('\r\n')}\r\n`;
}

/** "duotone-library-2026-11-16.json" */
export function nomeDoFicheiro(agora: Date, extensao: 'json' | 'csv'): string {
  return `duotone-library-${agora.toISOString().slice(0, 10)}.${extensao}`;
}

/** Quantas músicas há no total (para o aviso no fim). */
export function contarExportacao(e: ExportacaoDaBiblioteca): { musicas: number; playlists: number; albuns: number } {
  return {
    musicas: e.likedSongs.length + e.playlists.reduce((s, p) => s + p.tracks.length, 0),
    playlists: e.playlists.length,
    albuns: e.savedAlbums.length,
  };
}

export const FRASES_DA_EXPORTACAO = {
  rotulo: 'Export library',
  descricao: 'A copy of your Liked Songs, playlists and saved albums.',
  csv: 'Spreadsheet (CSV)',
  json: 'Full backup (JSON)',
  aPreparar: 'Preparing your library…',
  feito: 'Library exported',
  falhou: "Couldn't export your library.",
} as const;
