/**
 * As capas das playlists à escolha (26/11, src/lib/capasDasPlaylists.ts): que
 * caminhos valem, quais se assinam, e a playlist com e sem a capa à vista.
 *
 * Correr: node --experimental-strip-types scripts/test-capas-das-playlists.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  caminhoDaCapa, caminhoValido, capaEscolhida, comCapa, faltaACapa, quaisAssinar, RENOVAR_A_CAPA_ANTES_MS, semCapa,
} from '../src/lib/capasDasPlaylists.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const EU = '00000000-0000-0000-0000-000000000001';
const OUTRO = '00000000-0000-0000-0000-000000000002';
const F = '30000000-0000-0000-0000-000000000001';

caso('o caminho é o do SQL: <dono>/<uuid>.jpg', () => {
  assert.equal(caminhoDaCapa(EU, F), `${EU}/${F}.jpg`);
  assert.ok(caminhoValido(caminhoDaCapa(EU, F)));
  assert.ok(caminhoValido(caminhoDaCapa(EU, F), EU));
  assert.ok(!caminhoValido(caminhoDaCapa(EU, F), OUTRO), 'de outra pessoa');
  for (const torto of [`${EU}/../x.jpg`, `${EU}/${F}.png`, `${F}.jpg`, '', null, 3]) assert.ok(!caminhoValido(torto), String(torto));
  // O mesmo padrão que o check do SQL.
  const sql = readFileSync(new URL('../supabase/capas-das-playlists.sql', import.meta.url), 'utf8');
  assert.match(sql, /capa ~ '\^\[0-9a-f-\]\{36\}\/\[0-9a-f-\]\{36\}\\\.jpg\$'/);
});

caso('assinam-se as que não têm link ou o têm a menos de um dia de caducar, uma vez cada', () => {
  const agora = 1_000_000_000_000;
  const a = caminhoDaCapa(EU, F), b = caminhoDaCapa(EU, F.replace(/1$/, '2')), c = caminhoDaCapa(EU, F.replace(/1$/, '3'));
  const links = new Map([
    [a, { url: 'https://a', ate: agora + RENOVAR_A_CAPA_ANTES_MS + 1 }],
    [b, { url: 'https://b', ate: agora + RENOVAR_A_CAPA_ANTES_MS - 1 }],
  ]);
  assert.deepEqual(quaisAssinar([a, b, c, c, null, 'torto'], links, agora), [b, c]);
});

caso('com o link, a capa é a única imagem; sem ele, fica o mosaico', () => {
  const p = { artworks: ['m1', 'm2', 'm3', 'm4'], capa: caminhoDaCapa(EU, F) };
  const com = comCapa(p, 'https://capa');
  assert.deepEqual(com.artworks, ['https://capa']);
  assert.deepEqual(com.capasDasFaixas, ['m1', 'm2', 'm3', 'm4']);
  assert.equal(capaEscolhida(com), 'https://capa');
  assert.deepEqual(comCapa(p, null).artworks, ['m1', 'm2', 'm3', 'm4'], 'o link não veio');
  assert.equal(capaEscolhida(comCapa(p, null)), null);
  // Assinar outra vez (a lista relida com a capa já à vista) não perde o mosaico.
  const outraVez = comCapa(com, 'https://capa2');
  assert.deepEqual(outraVez.capasDasFaixas, ['m1', 'm2', 'm3', 'm4']);
  assert.deepEqual(outraVez.artworks, ['https://capa2']);
});

caso('tirar a capa volta ao mosaico das músicas', () => {
  const com = comCapa({ artworks: ['m1'], capa: caminhoDaCapa(EU, F) }, 'https://capa');
  const sem = semCapa(com);
  assert.equal(sem.capa, null);
  assert.deepEqual(sem.artworks, ['m1']);
  assert.equal(sem.capasDasFaixas, undefined);
  assert.equal(capaEscolhida(sem), null);
});

caso('uma playlist sem capa fica como estava', () => {
  const p = { artworks: ['m1', 'm2'], capa: null };
  assert.deepEqual(comCapa(p, 'https://x').artworks, ['m1', 'm2']);
  assert.equal(capaEscolhida(p), null);
});

caso('a coluna em falta reconhece-se; outros erros não', () => {
  assert.ok(faltaACapa({ code: '42703', message: 'column playlists.capa does not exist' }));
  assert.ok(faltaACapa({ code: 'PGRST204', message: "Could not find the 'capa' column of 'playlists' in the schema cache" }));
  assert.ok(!faltaACapa({ code: '42703', message: 'column playlists.pasta does not exist' }));
  assert.ok(!faltaACapa({ code: 'PGRST200', message: "Could not find a relationship for 'capas'" }));
  assert.ok(!faltaACapa(null));
});

if (falhas) { console.log(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\n  Todos os casos passaram.');
