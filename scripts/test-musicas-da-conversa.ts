/**
 * As músicas de uma conversa (5/11): "Play all" e "Save as playlist" no chat,
 * com um amigo ou num grupo (`lib/musicasDaConversa.ts`,
 * `components/MusicasDaConversa.tsx`, `musicasDaConversa` em `api/social.ts`).
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-musicas-da-conversa.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAXIMO_DE_MUSICAS_DA_CONVERSA, MINIMO_PARA_A_BARRA, contarMusicasCarregadas, musicasUnicas,
  nomeDaPlaylistDaConversa, origemDaConversa, pelaOrdemDaConversa,
} from '../src/lib/musicasDaConversa.ts';
import { rotuloDaOrigem } from '../src/lib/origemDaFila.ts';
import { podeVoltar } from '../src/lib/recentes.ts';
import type { Track } from '../src/types.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const faixa = (id: string): Track => ({ source: 'youtube', sourceId: id, title: id, artist: 'A', album: null, artworkUrl: null, durationSeconds: 180 } as Track);

console.log('\nas músicas da conversa');
caso('pela ordem da conversa, cada uma uma vez, e sem as que não se leem', () => {
  const lista = musicasUnicas([faixa('a'), null, faixa('b'), faixa('a'), undefined, faixa('c'), faixa('b')]);
  assert.deepEqual(lista.map((t) => t.sourceId), ['a', 'b', 'c']);
});
caso('a mesma música noutra fonte é outra música', () => {
  const noutra = { ...faixa('a'), source: 'local' } as Track;
  assert.equal(musicasUnicas([faixa('a'), noutra]).length, 2);
});
caso('o pedido vem da mais nova para a mais antiga, e a fila toca da mais antiga', () => {
  assert.deepEqual(pelaOrdemDaConversa([3, 2, 1]), [1, 2, 3]);
});
caso('a barra só aparece com duas ou mais músicas na página', () => {
  assert.equal(MINIMO_PARA_A_BARRA, 2);
  assert.equal(contarMusicasCarregadas([{ trackData: faixa('a') }, { trackData: null }, { trackData: faixa('a') }]), 1, 'a mesma duas vezes conta uma');
  assert.equal(contarMusicasCarregadas([{ trackData: faixa('a') }, { trackData: faixa('b') }]), 2);
});
caso('no máximo mil, as mais recentes', () => {
  assert.equal(MAXIMO_DE_MUSICAS_DA_CONVERSA, 1000);
});

console.log('\nde onde vem a fila, e o nome da playlist');
caso('"From chat with Raton" no Now Playing, sem sítio para onde voltar', () => {
  const o = origemDaConversa({ tipo: 'amigo', nome: 'Raton' });
  assert.deepEqual(o, { tipo: 'conversa', nome: 'chat with Raton' });
  assert.deepEqual(rotuloDaOrigem(o, { sugerida: false, doRadio: false }), { antes: 'From', nome: 'chat with Raton', alvo: null });
});
caso('num grupo, o nome do grupo', () => {
  assert.equal(origemDaConversa({ tipo: 'grupo', nome: 'Os Brutos' }).nome, 'Os Brutos chat');
  assert.equal(nomeDaPlaylistDaConversa({ tipo: 'grupo', nome: 'Os Brutos' }), 'Os Brutos chat');
});
caso('a playlist sugere "Chat with Raton", e um nome vazio não fica vazio', () => {
  assert.equal(nomeDaPlaylistDaConversa({ tipo: 'amigo', nome: 'Raton' }), 'Chat with Raton');
  assert.equal(nomeDaPlaylistDaConversa({ tipo: 'amigo', nome: '  ' }), 'Chat with Friend');
});
caso('uma conversa não entra no "Jump back in" (não há página para reabrir)', () => {
  assert.equal(podeVoltar(origemDaConversa({ tipo: 'amigo', nome: 'Raton' })), false);
});

console.log('\nno código');
const API = ler('src/api/social.ts');
const COMPONENTE = ler('src/components/MusicasDaConversa.tsx');
const HUB = ler('src/components/SocialHub.tsx');
const bloco = API.slice(API.indexOf('export async function musicasDaConversa'), API.indexOf('export async function musicasDaConversa') + 900);
caso('o pedido lê só a coluna da música, só as músicas, com o filtro da conversa', () => {
  assert.match(bloco, /\.select\('track_data'\)\.eq\('item_type','track'\)/);
  assert.match(bloco, /base\.eq\('group_id',alvo\.id\)/, 'num grupo, as do grupo');
  assert.match(bloco, /base\.is\('group_id',null\)\.or\(`and\(sender_id\.eq\.\$\{uid\},recipient_id\.eq\.\$\{alvo\.id\}\),and\(sender_id\.eq\.\$\{alvo\.id\},recipient_id\.eq\.\$\{uid\}\)`\)/,
    'a dois, as dos dois lados e fora dos grupos (o filtro do get_social_messages)');
  assert.match(bloco, /\.order\('created_at',\{ascending:false\}\)\.order\('id',\{ascending:false\}\)\.limit\(MAXIMO_DE_MUSICAS_DA_CONVERSA\)/, 'as mais recentes');
  assert.match(bloco, /musicasUnicas\(pelaOrdemDaConversa\(/);
});
caso('o pedido só sai no toque: abrir a conversa não o faz', () => {
  assert.ok(!HUB.includes('musicasDaConversa('), 'o SocialHub não pede as músicas da conversa');
  assert.match(COMPONENTE, /const faixas = await musicasDaConversa\(alvo\);/);
  assert.match(COMPONENTE, /if \(carregadas < MINIMO_PARA_A_BARRA\) return null;/);
});
caso('Play all toca a lista com a origem; Save as playlist cria e enche uma playlist', () => {
  assert.match(COMPONENTE, /tocarLista\(faixas, false, false, origemDaConversa\(conversa\)\)/);
  assert.match(COMPONENTE, /const nova = await createPlaylist\(nome\);\s*await addTracksToPlaylist\(nova\.id, faixas\);/);
  assert.match(COMPONENTE, /initialValue=\{nomeDaPlaylistDaConversa\(conversa\)\}/);
});
caso('a barra está na conversa a dois e na de grupo, nas duas plataformas (o mesmo SocialHub)', () => {
  assert.match(HUB, /\{conversation&&<MusicasDaConversa alvo=\{conversation\} conversa=\{\{tipo:group\?'grupo':'amigo',nome:title\}\} carregadas=\{contarMusicasCarregadas\(messages\)\}\/>\}/);
});
caso('os erros dizem o que falhou, sem o erro cru', () => {
  assert.ok(!/e\.message|e\?\.message/.test(COMPONENTE));
  assert.match(COMPONENTE, /avisarErro\(mensagemDeErro\(e, "Couldn't load the songs from this chat\."\)\)/);
});

console.log(falhas === 0 ? '\nTudo bem.\n' : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
