// Quem aparece na lateral do PC (lib/amigosNaLateral.ts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { amigosNaLateral } from '../src/lib/amigosNaLateral.ts';

const a = (friendId: string, name: string, over: Record<string, unknown> = {}) =>
  ({ friendId, name, username: name.toLowerCase(), status: 'accepted', online: true, currentlyPlaying: null, ...over });

const lista = [
  a('1', 'Zé'),
  a('2', 'Ana', { currentlyPlaying: { title: 'x' } }),
  a('3', 'Rui', { online: false, currentlyPlaying: { title: 'y' } }),
  a('4', 'Bia', { status: 'pending' }),
  a('5', 'Tiago', { currentlyPlaying: { title: 'z' } }),
  a('6', 'Inês'),
];
const r = amigosNaLateral(lista);
assert.deepEqual(r.visiveis.map((x) => x.name), ['Ana', 'Tiago', 'Inês', 'Zé'], 'a ouvir primeiro, depois por nome');
assert.equal(r.online, 4, 'offline e pedidos pendentes ficam de fora');
assert.equal(r.resto, 0);
const muitos = amigosNaLateral(Array.from({ length: 11 }, (_, i) => a(String(i), `A${String(i).padStart(2, '0')}`)));
assert.equal(muitos.visiveis.length, 8);
assert.equal(muitos.resto, 3, 'o resto vai para "+N more online"');
assert.deepEqual(amigosNaLateral([]).visiveis, []);
assert.equal(amigosNaLateral(Array.from({ length: 11 }, (_, i) => a(String(i), `A${i}`)), Infinity).visiveis.length, 11,
  'sem teto, para a fila do iPhone');

// A fila da Pesquisa do iPhone mostra TODOS os online, não só quem está a
// ouvir (1/10: um amigo online e parado não aparecia em lado nenhum).
const fila = readFileSync(new URL('../src/components/AmigosAOuvir.tsx', import.meta.url), 'utf8');
assert.match(fila, /amigosNaLateral\(amigos, Infinity\)/, 'a fila do iPhone usa a mesma escolha da lateral');
assert.doesNotMatch(fila, /!!a\.online && !!a\.currentlyPlaying/, 'a fila não volta a pedir música para mostrar um amigo');
console.log('Amigos na lateral: passou.');
