// A presenca do Discord, em Node puro.
import assert from 'node:assert/strict';
import {
  presencaDaFaixa, presencaMudou, segredoDiscordDaSessao, sessaoDoSegredoDiscord,
} from '../src/lib/presencaDoDiscord.ts';
import type { Track } from '../src/types.ts';

const f = (extra: Partial<Track> = {}): Track => ({
  source: 'youtube', sourceId: 'abc123', title: 'Poster boy', artist: '2hollis',
  album: null, artworkUrl: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg',
  durationSeconds: 180, ...extra,
});
const titulo = (t: Track) => t.title;
const artista = (t: Track) => t.artist ?? 'Unknown artist';
const aTocar = { aTocar: true, posicaoMs: 30_000, duracaoMs: 180_000, agora: 1_000_000 };
const sessao = '123e4567-e89b-42d3-a456-426614174000';

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('sem faixa nao ha presenca -- e isso e uma resposta', () => {
  assert.equal(presencaDaFaixa(null, aTocar, titulo, artista), null);
});

verificar('o essencial: tipo "a ouvir", titulo e artista', () => {
  const p = presencaDaFaixa(f(), aTocar, titulo, artista)!;
  assert.equal(p.type, 2);
  assert.equal(p.details, 'Poster boy');
  assert.equal(p.state, '2hollis');
});

verificar('a capa entra pelo URL, sem carregar nada no portal', () => {
  const p = presencaDaFaixa(f(), aTocar, titulo, artista)!;
  assert.equal(p.assets?.large_image, 'https://i.ytimg.com/vi/abc123/mqdefault.jpg');
});

verificar('capa http ou gigante nao entra, para nao deitar a presenca abaixo', () => {
  assert.equal(presencaDaFaixa(f({ artworkUrl: 'http://inseguro/x.jpg' }), aTocar, titulo, artista)!.assets, undefined);
  assert.equal(presencaDaFaixa(f({ artworkUrl: 'https://x/' + 'a'.repeat(320) }), aTocar, titulo, artista)!.assets, undefined);
});

verificar('a tocar leva barra; em pausa NAO leva', () => {
  const tocando = presencaDaFaixa(f(), aTocar, titulo, artista)!;
  assert.equal(tocando.timestamps?.start, 970, 'o inicio vai para o Discord em segundos Unix');
  assert.equal(tocando.timestamps?.end, 1_150, 'o fim vai para o Discord em segundos Unix');
  const parado = presencaDaFaixa(f(), { ...aTocar, aTocar: false }, titulo, artista)!;
  assert.equal(parado.timestamps, undefined, 'uma barra a andar com a musica parada e mentira');
});

verificar('Date.now nao pode virar uma data absurda no Discord', () => {
  const agoraRealista = Date.UTC(2026, 8, 10, 16, 0, 0);
  const p = presencaDaFaixa(f(), { ...aTocar, agora: agoraRealista }, titulo, artista)!;
  assert.ok((p.timestamps?.start ?? Infinity) < 10_000_000_000, 'timestamp tem de estar em segundos, nao ms');
});

verificar('sem duracao conhecida tambem nao ha barra', () => {
  const p = presencaDaFaixa(f(), { ...aTocar, duracaoMs: null }, titulo, artista)!;
  assert.equal(p.timestamps, undefined);
});

verificar('o botao aponta para a faixa', () => {
  const p = presencaDaFaixa(f(), aTocar, titulo, artista)!;
  assert.deepEqual(p.buttons, [{ label: 'Listen on YouTube', url: 'https://www.youtube.com/watch?v=abc123' }]);
});

verificar('um Jam publica party e segredo para o botao nativo Juntar-se', () => {
  const p = presencaDaFaixa(f(), aTocar, titulo, artista, { sessao, membros: 3 })!;
  assert.equal(p.type, 0, 'o Discord so cria convites para uma actividade jogavel');
  assert.deepEqual(p.party, { id: sessao, size: [3, 8] });
  assert.deepEqual(p.secrets, { join: `duotone-jam:${sessao}` });
  assert.equal(p.instance, true);
});

verificar('o segredo de Join e reversivel mas so aceita UUIDs da Duotone', () => {
  const segredo = segredoDiscordDaSessao(sessao)!;
  assert.equal(sessaoDoSegredoDiscord(segredo), sessao);
  assert.equal(segredoDiscordDaSessao('nao-e-uma-sessao'), null);
  assert.equal(sessaoDoSegredoDiscord('outra-app:' + sessao), null);
});

verificar('"Unknown artist" nao se mostra a ninguem', () => {
  const p = presencaDaFaixa(f({ artist: null }), aTocar, titulo, artista)!;
  assert.equal(p.state, undefined);
});

verificar('um titulo curto demais recusa a presenca em vez de a partir', () => {
  // O Discord exige dois caracteres no `details` e recusa a presenca inteira
  // se nao os tiver.
  assert.equal(presencaDaFaixa(f({ title: '7' }), aTocar, titulo, artista), null);
});

verificar('um titulo enorme e cortado a 128', () => {
  const p = presencaDaFaixa(f({ title: 'x'.repeat(400) }), aTocar, titulo, artista)!;
  assert.equal(p.details.length, 128);
});

verificar('a posicao sozinha NAO justifica reenviar', () => {
  const a = presencaDaFaixa(f(), aTocar, titulo, artista);
  // Um segundo depois, com a barra a andar: o fim e o mesmo.
  const b = presencaDaFaixa(f(), { ...aTocar, posicaoMs: 31_000, agora: 1_001_000 }, titulo, artista);
  assert.equal(presencaMudou(a, b), false, 'a barra anda sozinha do lado do Discord');
});

verificar('mudar de faixa justifica reenviar', () => {
  const a = presencaDaFaixa(f(), aTocar, titulo, artista);
  const b = presencaDaFaixa(f({ title: 'Outra', sourceId: 'zzz' }), aTocar, titulo, artista);
  assert.equal(presencaMudou(a, b), true);
});

verificar('passar a pausa justifica reenviar, para a barra desaparecer', () => {
  const a = presencaDaFaixa(f(), aTocar, titulo, artista);
  const b = presencaDaFaixa(f(), { ...aTocar, aTocar: false }, titulo, artista);
  assert.equal(presencaMudou(a, b), true);
});

verificar('parar a musica justifica limpar', () => {
  assert.equal(presencaMudou(presencaDaFaixa(f(), aTocar, titulo, artista), null), true);
  assert.equal(presencaMudou(null, null), false);
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
