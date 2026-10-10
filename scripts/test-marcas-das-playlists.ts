// As marcas ✓ da folha "Add to playlist" (10/10): nunca as de outra música.
// Correr: node --experimental-strip-types scripts/test-marcas-das-playlists.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarMarcasDasPlaylists } from '../src/lib/marcasDasPlaylists.ts';

type Pedido = { faixa: string; resolver: (v: { ids: Set<string>; idDaFaixa: string | null }) => void; rejeitar: (e: Error) => void };
const pedidos: Pedido[] = [];
let ecra = { ids: new Set<string>(), idDaFaixa: null as string | null };
const marcas = criarMarcasDasPlaylists<string>(
  (faixa) => new Promise((resolver, rejeitar) => pedidos.push({ faixa, resolver, rejeitar })),
  (ids, idDaFaixa) => { ecra = { ids, idDaFaixa }; },
);
const ultimo = () => pedidos[pedidos.length - 1];
const lista = () => [...ecra.ids].sort();

// A música A está na playlist X.
let a = marcas.abrir('A');
ultimo().resolver({ ids: new Set(['X']), idDaFaixa: 'tA' });
await a;
assert.deepEqual(lista(), ['X']);
assert.equal(ecra.idDaFaixa, 'tA');

// O bug: abrir para uma música que ninguém tinha guardado (nada no catálogo)
// ficava com o ✓ da A. Agora começa sem marcas, logo no toque.
const b = marcas.abrir('B');
assert.deepEqual(lista(), [], 'cada abertura começa sem marcas');
assert.equal(ecra.idDaFaixa, null);
ultimo().resolver({ ids: new Set(), idDaFaixa: null });
await b;
assert.deepEqual(lista(), []);

// A leitura falha: sem marcas, e não as da anterior.
a = marcas.abrir('A');
ultimo().resolver({ ids: new Set(['X']), idDaFaixa: 'tA' });
await a;
const c = marcas.abrir('C');
ultimo().rejeitar(new Error('JSON object requested, multiple (or no) rows returned'));
await c;
assert.deepEqual(lista(), [], 'um erro não deixa os ✓ de outra música');

// Uma resposta atrasada da música anterior não toma o lugar da nova.
const lenta = marcas.abrir('A');
const pedidoDaA = ultimo();
const rapida = marcas.abrir('D');
ultimo().resolver({ ids: new Set(['Y']), idDaFaixa: 'tD' });
await rapida;
pedidoDaA.resolver({ ids: new Set(['X']), idDaFaixa: 'tA' });
await lenta;
assert.deepEqual(lista(), ['Y'], 'conta a abertura mais recente');
assert.equal(ecra.idDaFaixa, 'tD');

// A folha fechou: o que ainda vinha a caminho não conta.
const aFechar = marcas.abrir('E');
const pedidoDaE = ultimo();
marcas.esquecer();
pedidoDaE.resolver({ ids: new Set(['Z']), idDaFaixa: 'tE' });
await aFechar;
assert.deepEqual(lista(), []);

// Sem música (várias de uma vez): sem marcas e sem pedido.
const antes = pedidos.length;
await marcas.abrir(null);
assert.equal(pedidos.length, antes);
assert.deepEqual(lista(), []);

// A ligação.
const folha = readFileSync(new URL('../src/components/AddToPlaylistSheet.tsx', import.meta.url), 'utf8');
assert.match(folha, /criarMarcasDasPlaylists<Track>\(playlistsComAFaixa/);
assert.match(folha, /else marcas\.esquecer\(\)/);
const api = readFileSync(new URL('../src/api/playlists.ts', import.meta.url), 'utf8');
const leitura = api.slice(api.indexOf('export async function playlistsComAFaixa'), api.indexOf('export async function removeTrackFromPlaylist'));
assert.doesNotMatch(leitura, /maybeSingle/, 'um duplicado no catálogo não parte a leitura');
assert.match(leitura, /\.in\('track_id', idsDaFaixa\)/);
console.log('Marcas da folha "Add to playlist": começam vazias, sem respostas atrasadas, erros nem duplicados.');
