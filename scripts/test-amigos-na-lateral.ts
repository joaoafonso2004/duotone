// Quem aparece na lateral do PC (lib/amigosNaLateral.ts).
import assert from 'node:assert/strict';
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
console.log('Amigos na lateral: passou.');
