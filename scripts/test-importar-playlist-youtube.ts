// A importação de uma playlist do YouTube lê até 5000 vídeos (28/9): eram 200,
// e o resto ficava de fora sem aviso. As duas leituras usam o mesmo teto, e a
// cache mudou de chave para uma playlist lida com o teto antigo não vir cortada.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yt = readFileSync(new URL('../src/api/youtube.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

assert.match(yt, /const PAGINAS_DE_PLAYLIST = 100;/, 'o teto são 100 páginas de 50');
assert.equal((yt.match(/for \(let page = 0; page < PAGINAS_DE_PLAYLIST; page\+\+\)/g) ?? []).length, 2,
  'as duas leituras (link e id) usam o mesmo teto');
assert.ok(!/page < 4;/.test(yt), 'voltou o teto das 200');
assert.ok(!yt.includes('`playlist:v1:'), 'a cache antiga (cortada nas 200) voltaria a servir');

console.log('Importar playlist do YouTube: passou.');
