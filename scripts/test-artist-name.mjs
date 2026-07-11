// Testes do artistName (extração do artista real) — corre com `npm test`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ts = readFileSync(path.join(projectRoot, 'src', 'lib', 'artistName.ts'), 'utf8');
const js = ts
  .replace(/export function/g, 'function')
  .replace(/: string \| null/g, '')
  .replace(/: string/g, '')
  .replace(/: \{[^}]*\}/g, '')
  .replace(/\?: string/g, '');
const { extractArtist, displayArtist } = new Function(
  js + '\nreturn { extractArtist, displayArtist };'
)();

let failures = 0;
function eq(label, actual, expected) {
  try {
    assert.equal(actual, expected);
    console.log(`  ok - ${label}`);
  } catch {
    failures++;
    console.error(`  FALHOU - ${label}: esperado "${expected}", veio "${actual}"`);
  }
}

console.log('extractArtist:');
// Canais "- Topic" (auto-gerados) — a fonte mais fiável, ganha ao título
eq('canal Topic', extractArtist('Blinding Lights', 'The Weeknd - Topic'), 'The Weeknd');
eq('canal Topic ganha ao título', extractArtist('Mix Qualquer - Compilação', 'Drake - Topic'), 'Drake');

// Convenção "Artista - Título"
eq('título com hífen', extractArtist('The Weeknd - Blinding Lights (Official Video)', 'RandomChannel'), 'The Weeknd');
eq('en dash', extractArtist('Arctic Monkeys – Do I Wanna Know?', 'canal'), 'Arctic Monkeys');
eq('feat cortado do artista', extractArtist('Calvin Harris feat. Rihanna - This Is What You Came For', 'canal'), 'Calvin Harris');
eq('multi-artista mantido', extractArtist('Tainy, Bad Bunny - Callaíta', 'canal'), 'Tainy, Bad Bunny');
eq('nome com dígitos ok', extractArtist('24kGoldn - Mood', 'canal'), '24kGoldn');
eq('hífen sem espaços não parte', extractArtist('Jay-Z Interview', 'Some Channel'), 'Some Channel');

// VEVO
eq('canal VEVO camel', extractArtist('Song Title No Dash', 'TheWeekndVEVO'), 'The Weeknd');

// Fallbacks de canal
eq('canal Official limpo', extractArtist('Nome Da Música', 'Bispo Official'), 'Bispo');
eq('canal cru como último recurso', extractArtist('Vlog de verão', 'PewDiePie'), 'PewDiePie');
eq('sem nada -> null', extractArtist(null, null), null);

console.log('displayArtist:');
eq('spotify não é tocado', displayArtist({ source: 'spotify', title: 'A - B', artist: 'Artista Real' }), 'Artista Real');
eq('youtube extrai', displayArtist({ source: 'youtube', title: 'SZA - Kill Bill', artist: 'Canal Random' }), 'SZA');
eq('sem artista -> Unknown', displayArtist({ source: 'youtube', title: 'sem dash', artist: null }), 'Unknown artist');

if (failures > 0) {
  console.error(`\n${failures} teste(s) falharam`);
  process.exit(1);
}
console.log('\nTodos os testes passaram.');
