// O Mix de um artista (10/10): mais dele, e não sempre igual.
// Correr: node --experimental-strip-types scripts/test-mix-do-artista.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DELE_POR_PARECIDA, ESCOLHER_O_COMECO_ENTRE, montarMixDoArtista, TAMANHO_DO_MIX } from '../src/lib/montarMixDoArtista.ts';

type F = { id: string; artista: string; musica?: string };
const f = (id: string, artista: string, musica = id): F => ({ id, artista, musica });
const eDela = (t: F) => t.artista === 'Sia';
const identidade = (t: F) => [t.id, `m:${t.musica}`];
const sorteioFixo = (valores: number[]) => { let i = 0; return () => valores[i++ % valores.length]; };

// Como o rádio do YouTube Music é (medido a 10/10): começa sempre pela mesma,
// que nem é dela, e só um quinto é da Sia.
const doCanal = Array.from({ length: 30 }, (_, i) => f(`sia${i}`, 'Sia'));
const doRadio = Array.from({ length: 50 }, (_, i) => (i % 5 === 1 ? f(`rsia${i}`, 'Sia') : f(`outro${i}`, `Outro ${i}`)));
doRadio[0] = f('waterfall', 'Stargate');

const mix = montarMixDoArtista(doCanal, doRadio, eDela, identidade, Math.random);
assert.equal(mix.length, TAMANHO_DO_MIX);
const dela = mix.filter(eDela).length;
assert.ok(dela >= 32, `sobretudo dela: ${dela} em 50 (o rádio sozinho dava 10)`);
assert.ok(mix.length - dela >= 15, 'mas com parecidas');
// Duas dela, uma parecida.
for (let i = 0; i + 2 < 45; i += DELE_POR_PARECIDA + 1) {
  assert.ok(eDela(mix[i]) && eDela(mix[i + 1]) && !eDela(mix[i + 2]), `o ritmo 2:1 na posição ${i}`);
}
assert.ok(eDela(mix[0]), 'começa por uma dela');
assert.notEqual(mix[0].id, 'waterfall', 'e não pela do botão do canal');
// As parecidas pela ordem do rádio (que já vem por parecença).
const parecidas = mix.filter((t) => !eDela(t)).map((t) => t.id);
assert.deepEqual(parecidas, doRadio.filter((t) => !eDela(t)).map((t) => t.id).slice(0, parecidas.length));

// O começo é um dos êxitos (as primeiras do canal), e não sempre o mesmo.
const comecos = new Set<string>();
for (let k = 0; k < 200; k++) comecos.add(montarMixDoArtista(doCanal, doRadio, eDela, identidade, Math.random)[0].id);
assert.ok([...comecos].every((id) => Number(id.replace('sia', '')) < ESCOLHER_O_COMECO_ENTRE), 'sempre um dos cinco primeiros do canal');
assert.ok(comecos.size >= 3, `varia: ${comecos.size} começos diferentes em 200`);
// E a ordem muda de uma vez para a outra.
const a = montarMixDoArtista(doCanal, doRadio, eDela, identidade, sorteioFixo([0.1, 0.7, 0.3]));
const b = montarMixDoArtista(doCanal, doRadio, eDela, identidade, sorteioFixo([0.9, 0.2, 0.5]));
assert.notDeepEqual(a.map((t) => t.id), b.map((t) => t.id));

// Sem repetidas: a mesma música noutro upload (do canal e do rádio) entra uma vez.
const repetida = montarMixDoArtista([f('c1', 'Sia', 'Chandelier')], [f('r1', 'Sia', 'Chandelier'), f('o1', 'Outro')], eDela, identidade, Math.random);
assert.deepEqual(repetida.map((t) => t.id), ['c1', 'o1']);

// Sem a lista do canal: as dela do rádio, e as parecidas.
const soRadio = montarMixDoArtista([], doRadio, eDela, identidade, Math.random);
assert.ok(soRadio.length > 0 && eDela(soRadio[0]), 'começa por uma dela na mesma');
// Sem nada dela: só as parecidas, pela ordem.
assert.deepEqual(montarMixDoArtista([], [f('o1', 'A'), f('o2', 'B')], eDela, identidade, Math.random).map((t) => t.id), ['o1', 'o2']);
assert.deepEqual(montarMixDoArtista([], [], eDela, identidade, Math.random), []);
// Sem parecidas: só dela.
assert.equal(montarMixDoArtista(doCanal, [], eDela, identidade, Math.random).length, 30);

// Ligado: a pesquisa (pelo canal) e as páginas do artista (com as músicas da página).
const estado = readFileSync(new URL('../src/state/mixDoArtista.ts', import.meta.url), 'utf8');
assert.match(estado, /montarMixDoArtista\(musicas, radio, dele, chavesDaMusica, Math\.random\)/);
assert.doesNotMatch(estado, /sort\(\(\) => Math\.random/, 'Fisher-Yates, nunca o sort ao acaso');
assert.match(readFileSync(new URL('../src/desktop/paginas/BibliotecaPages.web.tsx', import.meta.url), 'utf8'), /musicas: pagina\.musicas/);
assert.match(readFileSync(new URL('../src/screens/LibraryGroupScreen.tsx', import.meta.url), 'utf8'), /musicas: pagina\?\.musicas/);
console.log('Mix do artista: sobretudo dele, 2:1 com parecidas, começo à sorte entre os êxitos, sem repetidas.');
