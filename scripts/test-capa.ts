import assert from 'node:assert/strict';
import { urlsDaCapa, capaParaLista } from '../src/lib/capaDoEcraBloqueado.ts';

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

// ---- capa das listas: sem as barras pretas do 4:3 -----------------------
//
// O hqdefault é 480x360 e mete a imagem 16:9 dentro de um 4:3, com preto em
// cima e em baixo. Recortado num quadrado, esse preto ia junto -- era o que se
// via em metade das linhas da biblioteca.
{
  const listaOk = (u: string | null | undefined, esperado: string | null) => {
    const r = capaParaLista(u);
    assert.equal(r, esperado, `capaParaLista(${u}) deu ${r}`);
  };
  listaOk(
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
  );
  // Já sem moldura: continua a ser o mesmo pedido, sem trabalho a mais.
  listaOk(
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
  );
  // O que não é do YouTube fica exactamente como está.
  listaOk('https://exemplo.pt/capa.png', 'https://exemplo.pt/capa.png');
  listaOk(null, null);
  listaOk(undefined, null);
  console.log('Capa das listas: sem barras, e o que não é do YouTube fica igual.');
}
