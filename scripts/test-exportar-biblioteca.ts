/**
 * Exportar a biblioteca (16/11): o JSON, o CSV com as colunas do Exportify, e
 * a prova de que o CSV volta a entrar pelo importador da própria Duotone
 * (lib/spotifyCsv.ts). E a ligação nas duas plataformas, lida como texto.
 *
 * Correr: node --experimental-strip-types scripts/test-exportar-biblioteca.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  COLUNAS_DO_CSV, contarExportacao, FRASES_DA_EXPORTACAO, montarExportacao, nomeDoFicheiro, paraCSV, paraJSON, type FaixaExportada,
} from '../src/lib/exportarBiblioteca.ts';
import { parseSpotifyCsv } from '../src/lib/spotifyCsv.ts';

let falhas = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

const f = (title: string, artist: string | null, extra: Partial<FaixaExportada> = {}): FaixaExportada => ({
  title, artist, album: null, durationSeconds: 200, source: 'youtube', sourceId: `id-${title}`, ...extra,
});
const agora = new Date('2026-11-16T10:00:00Z');
const exportacao = montarExportacao({
  app: 'Duotone 6.0.6',
  agora,
  gostadas: [f('Creep', 'Radiohead', { album: 'Pablo Honey', durationSeconds: 238.6 })],
  playlists: [
    { name: 'Gym, "bruto"', createdAt: '2026-10-01T00:00:00Z', tracks: [f('Line\nBreak, Song', 'A, B'), f('Sem artista', null, { durationSeconds: null })] },
    { name: 'vazia', tracks: [] },
  ],
  albuns: [{ id: 'OLAK5uy_x', titulo: 'GNX', artista: 'Kendrick Lamar', ano: '2024', tipo: 'Album', guardadoEm: Date.parse('2026-11-15T12:00:00Z') }],
});

caso('o JSON leva tudo, e volta igual', () => {
  const lido = JSON.parse(paraJSON(exportacao));
  assert.equal(lido.format, 'duotone-library');
  assert.equal(lido.version, 1);
  assert.equal(lido.exportedAt, '2026-11-16T10:00:00.000Z');
  assert.equal(lido.likedSongs[0].sourceId, 'id-Creep');
  assert.deepEqual(lido.playlists.map((p: { name: string }) => p.name), ['Gym, "bruto"', 'vazia']);
  assert.deepEqual(lido.savedAlbums[0], { id: 'OLAK5uy_x', title: 'GNX', artist: 'Kendrick Lamar', year: '2024', kind: 'Album', savedAt: '2026-11-15T12:00:00.000Z' });
  assert.deepEqual(contarExportacao(exportacao), { musicas: 3, playlists: 2, albuns: 1 });
});

caso('o CSV: as colunas do Exportify, as Liked Songs primeiro, aspas onde é preciso e CRLF', () => {
  const csv = paraCSV(exportacao);
  const linhas = csv.split('\r\n');
  assert.equal(linhas[0], COLUNAS_DO_CSV.join(','));
  assert.equal(linhas[1], 'Creep,Radiohead,Pablo Honey,238600,Liked Songs,youtube,id-Creep');
  assert.ok(csv.includes('"Line\nBreak, Song","A, B",,200000,"Gym, ""bruto""",youtube,"id-Line\nBreak, Song"'), 'vírgulas, aspas e mudanças de linha entre aspas');
  assert.ok(csv.includes('Sem artista,,,,"Gym, ""bruto""",youtube,id-Sem artista'), 'sem artista e sem duração ficam vazios');
  assert.ok(csv.endsWith('\r\n'));
});

caso('o CSV volta a entrar pelo importador da Duotone', () => {
  const r = parseSpotifyCsv(paraCSV(exportacao));
  assert.equal(r.problem ?? null, null);
  assert.deepEqual(r.rows[0], { title: 'Creep', artist: 'Radiohead', album: 'Pablo Honey', durationMs: 238600, uri: null });
  assert.equal(r.rows[1].title, 'Line\nBreak, Song');
  // O Exportify separa os artistas por vírgulas, e o importador fica com o primeiro.
  assert.equal(r.rows[1].artist, 'A');
});

caso('o nome dos ficheiros', () => {
  assert.equal(nomeDoFicheiro(agora, 'json'), 'duotone-library-2026-11-16.json');
  assert.equal(nomeDoFicheiro(agora, 'csv'), 'duotone-library-2026-11-16.csv');
});

caso('a ligação: as duas Definições, a gravação de cada plataforma e o francês', () => {
  const ios = ler('src/screens/SettingsScreen.tsx');
  assert.match(ios, /rotulo=\{ROTULOS\.exportarBiblioteca\}/);
  assert.match(ios, /label: FRASES_DA_EXPORTACAO\.csv, onPress: \(\) => void exportarBiblioteca\('csv'\)/);
  assert.match(ios, /label: FRASES_DA_EXPORTACAO\.json, onPress: \(\) => void exportarBiblioteca\('json'\)/);
  const pc = ler('src/desktop/paginas/SettingsPage.web.tsx');
  assert.match(pc, /\{ROTULOS\.exportarBiblioteca\}/);
  assert.match(pc, /guardarExportacao\(nomeDoFicheiro\(agora, 'json'\)[\s\S]+guardarExportacao\(nomeDoFicheiro\(agora, 'csv'\)/, 'no PC saem os dois');
  assert.ok(existsSync('src/lib/guardarExportacao.ts') && existsSync('src/lib/guardarExportacao.web.ts'), 'um par com a mesma extensão');
  const fr = ler('src/i18n/fr.ts');
  for (const frase of [FRASES_DA_EXPORTACAO.rotulo, FRASES_DA_EXPORTACAO.descricao, FRASES_DA_EXPORTACAO.csv, FRASES_DA_EXPORTACAO.json,
    FRASES_DA_EXPORTACAO.aPreparar, FRASES_DA_EXPORTACAO.feito, FRASES_DA_EXPORTACAO.falhou]) {
    assert.ok(fr.includes(`\n  ${JSON.stringify(frase)}:`), `fr.ts: ${frase}`);
  }
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\ntest-exportar-biblioteca: tudo certo');
