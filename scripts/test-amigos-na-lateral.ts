// Quem aparece na lateral do PC (lib/amigosNaLateral.ts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { amigosNaLateral, musicaDoAmigo } from '../src/lib/amigosNaLateral.ts';

const a = (friendId: string, name: string, over: Record<string, unknown> = {}) =>
  ({ friendId, name, username: name.toLowerCase(), status: 'accepted', online: true, currentlyPlaying: null, musicActivity: null, ...over });

// Como o `state/social.ts` as monta: o `currentlyPlaying` só vem com ele online;
// a música de quem ouve com a app em segundo plano vem no `musicActivity`.
const lista = [
  a('1', 'Zé'),
  a('2', 'Ana', { currentlyPlaying: { title: 'x' } }),
  a('3', 'Rui', { online: false }),
  a('4', 'Bia', { status: 'pending' }),
  a('5', 'Tiago', { currentlyPlaying: { title: 'z' } }),
  a('6', 'Inês'),
  // 8/11: o calito a ouvir com o iPhone no bolso. O Social punha-o em "Listening
  // now" e a lateral deixava-o de fora, por não estar online.
  a('7', 'calito', { online: false, musicActivity: { listening: true, track: { title: 'Careless Whisper' } } }),
  // Ouviu há pouco e parou: é o "Recently played" do Social, não está a ouvir.
  a('8', 'Duda', { online: false, musicActivity: { listening: false, track: { title: 'w' } } }),
];
const r = amigosNaLateral(lista);
assert.deepEqual(r.visiveis.map((x) => x.name), ['Ana', 'calito', 'Tiago', 'Inês', 'Zé'], 'a ouvir primeiro (também no bolso), depois por nome');
assert.equal(r.online, 5, '"N ONLINE" conta quem está na lista (a ouvir com o ecrã bloqueado também); offline parado e pendentes não');
assert.equal(r.resto, 0);
// A música de cada um, de onde vier.
assert.equal(musicaDoAmigo(lista[1])?.title, 'x', 'com a app à frente, o currentlyPlaying');
assert.equal((musicaDoAmigo(lista[6]) as { title: string } | null)?.title, 'Careless Whisper', 'no bolso, a do musicActivity');
assert.equal(musicaDoAmigo(lista[7]), null, 'parado não é a ouvir');
assert.equal(musicaDoAmigo(lista[0]), null);
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
// 8/11: a música de quem ouve com o ecrã bloqueado chega às duas listas, ao menu e ao "ouvir com".
assert.match(fila, /const faixa = musicaDoAmigo\(amigo\);/, 'a fila do iPhone');
const lateral = readFileSync(new URL('../src/desktop/AmigosNaLateral.web.tsx', import.meta.url), 'utf8');
assert.equal((lateral.match(/const faixa = musicaDoAmigo\(a\);/g) ?? []).length, 2, 'a lateral, larga e na régua');
assert.doesNotMatch(lateral, /const faixa = a\.currentlyPlaying/);
assert.match(readFileSync(new URL('../src/desktop/MenuDoAmigo.web.tsx', import.meta.url), 'utf8'), /faixaDoAmigo\(musicaDoAmigo\(amigo\)\)/, 'o menu do amigo');
assert.match(readFileSync(new URL('../src/state/ouvirComAmigo.ts', import.meta.url), 'utf8'), /if \(!musicaDoAmigo\(amigo\)\) return;/, 'o "ouvir com" segue quem ouve no bolso');
console.log('Amigos na lateral: passou.');
