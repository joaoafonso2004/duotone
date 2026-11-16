// As fotos do artista para o Poster do leitor do iPhone (16/11).
// Correr: node --experimental-strip-types scripts/test-fotos-do-poster.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  aindaValem, CAMPOS_DAS_FOTOS, fotoDaMusica, fotoPequena, fotosDoAudioDb, MAXIMO_DE_MUSICAS, renovarFotos,
  VALIDADE_COM_FOTOS, VALIDADE_SEM_FOTOS, type FotosDoArtista,
} from '../src/lib/fotosDoPoster.ts';

const chave = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\$/g, 's').replace(/[^a-z0-9]+/g, ' ').trim();
const U = (n: string) => `https://www.theaudiodb.com/images/media/artist/fanart/${n}.jpg`;

// Da resposta do TheAudioDB: as quatro fanart e a miniatura, por esta ordem; a wide (traz o
// nome escrito), o cutout e o clearart (PNG sem fundo) não.
const resposta = { artists: [{
  strArtist: 'Travis Scott', strArtistThumb: U('t'), strArtistFanart: U('f1'), strArtistFanart2: U('f2'), strArtistFanart3: null,
  strArtistFanart4: U('f4'), strArtistWideThumb: U('w'), strArtistCutout: U('c'), strArtistClearart: U('cl'),
}] };
assert.deepEqual(fotosDoAudioDb(resposta, chave('Travis Scott'), chave), [U('f1'), U('f2'), U('f4'), U('t')]);
assert.deepEqual([...CAMPOS_DAS_FOTOS].at(-1), 'strArtistThumb', 'a miniatura em último: é a que mais se parece com a da página do artista');
assert.deepEqual(fotosDoAudioDb(resposta, chave('Travi$ Scott'), chave), [U('f1'), U('f2'), U('f4'), U('t')], 'a chave do catálogo ($ = s)');
assert.deepEqual(fotosDoAudioDb(resposta, chave('Plutonio'), chave), [], 'outro artista na resposta: nada (a cara errada no leitor era pior do que a capa)');
assert.deepEqual(fotosDoAudioDb({ artists: [{ strArtist: 'X', strArtistAlternate: 'Plutónio, Pluto', strArtistFanart: U('p') }] }, chave('Plutonio'), chave), [U('p')], 'pelos nomes alternativos');
assert.deepEqual(fotosDoAudioDb({ artists: null }, chave('Dillaz'), chave), [], 'o artista não está lá');
assert.deepEqual(fotosDoAudioDb('lixo', chave('Dillaz'), chave), []);
assert.deepEqual(fotosDoAudioDb({ artists: [{ strArtist: 'A', strArtistFanart: 'http://x/a.jpg', strArtistFanart2: U('a'), strArtistFanart3: U('a') }] }, 'a', chave), [U('a')], 'só https, sem repetidas');

// Uma foto por música, sempre a mesma; músicas diferentes, fotos diferentes enquanto as houver.
let f: FotosDoArtista = { fotos: [U('1'), U('2'), U('3')], em: 0, musicas: {} };
const vistas: string[] = [];
for (const m of ['youtube:a', 'youtube:b', 'youtube:c']) {
  const r = fotoDaMusica(f, m);
  f = r.fotos;
  vistas.push(r.foto!);
}
assert.deepEqual(vistas, [U('1'), U('2'), U('3')], 'três músicas, três fotos');
assert.equal(fotoDaMusica(f, 'youtube:b').foto, U('2'), 'a mesma música volta à mesma foto');
assert.equal(fotoDaMusica(f, 'youtube:b').fotos, f, 'sem nada novo para guardar');
const quarta = fotoDaMusica(f, 'youtube:d');
assert.equal(quarta.foto, U('1'), 'com mais músicas do que fotos, a menos usada');
f = quarta.fotos;
assert.equal(fotoDaMusica(f, 'youtube:e').foto, U('2'), 'e repete-se o menos possível');
assert.equal(fotoDaMusica({ fotos: [], em: 0, musicas: {} }, 'youtube:a').foto, null, 'sem fotos, a capa');
assert.equal(fotoDaMusica({ fotos: [U('1')], em: 0, musicas: { 'youtube:a': 7 } }, 'youtube:a').foto, U('1'), 'um índice que já não existe escolhe outra vez');
let muitas: FotosDoArtista = { fotos: [U('1'), U('2')], em: 0, musicas: {} };
for (let i = 0; i < MAXIMO_DE_MUSICAS + 50; i++) muitas = fotoDaMusica(muitas, `m${i}`).fotos;
assert.equal(Object.keys(muitas.musicas).length, MAXIMO_DE_MUSICAS, 'a memória tem teto');
assert.ok(!(`m0` in muitas.musicas) && `m${MAXIMO_DE_MUSICAS + 49}` in muitas.musicas, 'saem as mais antigas');

// Validade: 30 dias com fotos, 7 sem; renovar mantém a foto de cada música se ela ainda lá estiver.
assert.ok(aindaValem({ fotos: [U('1')], em: 0, musicas: {} }, VALIDADE_COM_FOTOS - 1));
assert.ok(!aindaValem({ fotos: [U('1')], em: 0, musicas: {} }, VALIDADE_COM_FOTOS));
assert.ok(!aindaValem({ fotos: [], em: 0, musicas: {} }, VALIDADE_SEM_FOTOS));
assert.ok(!aindaValem(undefined, 0));
const renovada = renovarFotos({ fotos: [U('1'), U('2')], em: 0, musicas: { a: 0, b: 1 } }, [U('2'), U('3')], 99);
assert.deepEqual(renovada, { fotos: [U('2'), U('3')], em: 99, musicas: { b: 0 } }, 'a foto que saiu solta a música');

// A cor lê-se da versão pequena.
assert.equal(fotoPequena(U('1')), `${U('1')}/small`);
assert.equal(fotoPequena(`${U('1')}/small`), `${U('1')}/small`);
assert.equal(fotoPequena('https://i.ytimg.com/vi/x/maxresdefault.jpg'), 'https://i.ytimg.com/vi/x/maxresdefault.jpg', 'as capas ficam como estão');

// Quem pede: um pedido por artista, guardado no aparelho, nada no Supabase.
const api = readFileSync(new URL('../src/api/fotosDoPoster.ts', import.meta.url), 'utf8');
assert.doesNotMatch(api, /from '[^']*supabase|supabase.(from|rpc)/, 'não passa pelo Supabase');
assert.match(api, /aCaminho\.get\(chave\)/, 'um pedido por artista, mesmo com várias músicas a pedir ao mesmo tempo');
assert.match(api, /if \(!r\.ok\) return null;/, 'sem resposta não se guarda "sem fotos"');
assert.match(api, /artistaPrincipal\(displayArtist\(faixa\)\)/, 'o artista principal, como o leitor o mostra');
const gancho = readFileSync(new URL('../src/hooks/useFotoDoPoster.ts', import.meta.url), 'utf8');
assert.match(gancho, /if \(ja !== undefined\) return ja;/, 'com o artista conhecido, a foto sai no mesmo desenho');
console.log('Fotos do Poster: uma por música, sem repetir enquanto as houver, do artista certo, e guardadas no aparelho.');
