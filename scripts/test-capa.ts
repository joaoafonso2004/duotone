import assert from 'node:assert/strict';
import { urlsDaCapa } from '../src/lib/capaDoEcraBloqueado.ts';

// Thumbnail do YouTube: sobe de resolução e mantém o original como rede.
const hq = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
assert.deepEqual(urlsDaCapa(hq), [
  'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
  'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg',
  hq,
]);

// Já em maxres: não pode aparecer duas vezes na lista.
const max = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg';
assert.deepEqual(urlsDaCapa(max), [
  max,
  'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg',
]);

// Capa que não é do YouTube (Spotify, upload próprio) fica como está.
const outra = 'https://exemplo.pt/capas/album.png';
assert.deepEqual(urlsDaCapa(outra), [outra]);

// Sem capa não se inventa nada.
assert.deepEqual(urlsDaCapa(null), []);
assert.deepEqual(urlsDaCapa(undefined), []);
assert.deepEqual(urlsDaCapa(''), []);

// Um host parecido não pode passar por i.ytimg.com.
const falso = 'https://i.ytimg.com.mau.pt/vi/dQw4w9WgXcQ/hqdefault.jpg';
assert.deepEqual(urlsDaCapa(falso), [falso]);

console.log('Capa do Lock Screen: subida de resolução, deduplicação, fontes externas e host falso passaram.');
