/**
 * A linha de baixo de uma conversa no Social -- src/lib/previaDaConversa.ts.
 * Correr: node --experimental-strip-types scripts/test-previa-da-conversa.ts
 */
import assert from 'node:assert/strict';
import { previaDaConversa, TEXTO_DO_CONVITE_PARA_PLAYLIST } from '../src/lib/previaDaConversa.ts';
import { MENSAGEM_DO_CONVITE } from '../src/lib/playlistColaborativa.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const EU = 'eu', ELE = 'nuno';
const base = { message: null, trackTitle: null, trackArtist: null };
const limpar = { titulo: (t: { title: string }) => t.title.replace(/^.* - /, '').replace(/ \(Official Audio\)$/, ''), artista: (t: { artist: string | null }) => t.artist ?? '' };

console.log('\na frase de cada lado (9/10: "You: Invited you to a Jam")');
caso('uma Jam minha diz quem convidei', () => {
  assert.equal(previaDaConversa({ ...base, senderId: EU, itemType: 'sessao' }, EU, { outro: 'nuno' }).texto, 'You invited nuno to a Jam');
});
caso('uma Jam dele diz que me convidou', () => {
  assert.equal(previaDaConversa({ ...base, senderId: ELE, itemType: 'sessao' }, EU, { outro: 'nuno' }).texto, 'Invited you to a Jam');
});
caso('nenhuma frase minha começa por "You: Invited" nem "You: Added you"', () => {
  for (const itemType of ['sessao', 'playlist']) {
    for (const message of [null, MENSAGEM_DO_CONVITE]) {
      const t = previaDaConversa({ ...base, senderId: EU, itemType, message }, EU, { outro: 'nuno' }).texto;
      assert.ok(!/^You: (Invited|Added) you/.test(t), t);
    }
  }
});
caso('o convite para uma playlist colaborativa, dos dois lados', () => {
  assert.equal(TEXTO_DO_CONVITE_PARA_PLAYLIST, MENSAGEM_DO_CONVITE, 'o texto do convite mudou num sítio e não no outro');
  assert.equal(previaDaConversa({ ...base, senderId: EU, itemType: 'playlist', message: MENSAGEM_DO_CONVITE }, EU, { outro: 'nuno' }).texto, 'You added nuno to a playlist');
  assert.equal(previaDaConversa({ ...base, senderId: ELE, itemType: 'playlist', message: MENSAGEM_DO_CONVITE }, EU).texto, 'Added you to a playlist');
});
caso('uma playlist sem texto', () => {
  assert.equal(previaDaConversa({ ...base, senderId: EU, itemType: 'playlist' }, EU).texto, 'You shared a playlist');
  assert.equal(previaDaConversa({ ...base, senderId: ELE, itemType: 'playlist' }, EU).texto, 'Shared a playlist');
});

console.log('\nmúsicas');
const musica = { ...base, itemType: 'track', trackTitle: 'DDG - Elon Musk (Official Audio)', trackArtist: 'DDG', trackArtwork: 'capa.jpg' };
caso('recebida: o título limpo e o artista, com a capa', () => {
  const p = previaDaConversa({ ...musica, senderId: ELE }, EU, limpar);
  assert.equal(p.texto, 'Elon Musk · DDG');
  assert.equal(p.musica, true);
  assert.equal(p.capa, 'capa.jpg');
});
caso('mandada por mim', () => {
  assert.equal(previaDaConversa({ ...musica, senderId: EU }, EU, limpar).texto, 'You sent Elon Musk');
});
caso('com uma reação, a reação à frente', () => {
  assert.equal(previaDaConversa({ ...musica, senderId: ELE, message: '🔥' }, EU, limpar).texto, '🔥 · Elon Musk');
  assert.equal(previaDaConversa({ ...musica, senderId: EU, message: '🔥' }, EU, limpar).texto, 'You: 🔥 · Elon Musk');
});
caso('texto simples', () => {
  assert.equal(previaDaConversa({ ...base, senderId: ELE, itemType: 'track', message: 'tá insano' }, EU).texto, 'tá insano');
  assert.equal(previaDaConversa({ ...base, senderId: EU, itemType: 'track', message: 'já vou' }, EU).texto, 'You: já vou');
});

console.log('\ngrupos');
caso('num grupo diz quem falou', () => {
  const nomeDe = (id: string) => (id === 'ines' ? 'inês' : null);
  assert.equal(previaDaConversa({ ...base, senderId: 'ines', itemType: 'track', message: 'hoje há jam' }, EU, { nomeDe }).texto, 'inês: hoje há jam');
  assert.equal(previaDaConversa({ ...base, senderId: 'ines', itemType: 'sessao' }, EU, { nomeDe }).texto, 'inês started a Jam');
  assert.equal(previaDaConversa({ ...base, senderId: EU, itemType: 'sessao' }, EU, { nomeDe }).texto, 'You started a Jam');
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');
