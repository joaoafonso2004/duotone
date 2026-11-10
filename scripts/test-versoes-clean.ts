/**
 * As versões clean fora dos resultados (9/11): `lib/versoesClean.ts` (as regras)
 * e `state/versoesClean.ts` (o que o aparelho lembra e quando pergunta).
 *
 * O pedido ao YouTube Music é um `fetch` falso que devolve a resposta real
 * recortada (`fixtures/ytmusic-cancoes.json`) e CONTA as chamadas: nada sai
 * para a rede, e o que se prova é sobretudo quando NÃO se pergunta.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-versoes-clean.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerCancoes } from '../src/lib/cancoesDoYtMusic.ts';
import {
  aplicarTrocas, chaveDoGrupo, gruposDeGemeas, juntarTrocas, paresDoYtMusic, perguntaDoGrupo,
} from '../src/lib/versoesClean.ts';
import { esquecerEmMemoria, semClean, semCleanNosResultados, trocarClean, verGemeas } from '../src/state/versoesClean.ts';
import { controlo, reporControlo } from './duplos/controlo.ts';
import { guardado as armazenamento } from './duplos/async-storage.ts';
import type { Track } from '../src/types.ts';

let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const RESPOSTA = ler('scripts/fixtures/ytmusic-cancoes.json');
// Na resposta real: a explícita e a clean do "Laugh Now Cry Later", as duas com 4:22.
const EXPLICITA = 'YZLJ_GWJ5Ag', CLEAN = 'zbWpjizpJfI', SEM_PAR = 'oBkhrm2s1-Y';

const faixa = (id: string, titulo: string, canal: string, seg: number | null): Track =>
  ({ source: 'youtube', sourceId: id, title: titulo, artist: canal, album: null, artworkUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, durationSeconds: seg }) as Track;
const candidato = (id: string, titulo: string, canal: string, seg: number | null) => ({ id, titulo, canal, duracaoSec: seg });
const LNCL = 'Laugh Now Cry Later (feat. Lil Durk)';

console.log('\nas regras');
await caso('duas iguais: o mesmo título, o mesmo canal e a mesma duração', () => {
  const g = gruposDeGemeas([
    candidato('a', LNCL, 'Drake - Topic', 262), candidato('x', 'Outra', 'Drake', 200),
    candidato('b', 'LAUGH NOW, CRY LATER (feat. Lil Durk)', 'Drake', 261),
  ]);
  assert.deepEqual(g.map((x) => x.map((c) => c.id)), [['a', 'b']]);
  assert.equal(chaveDoGrupo(g[0]!), chaveDoGrupo([...g[0]!].reverse()), 'a chave não depende da ordem');
  assert.equal(perguntaDoGrupo(g[0]!), `Drake ${LNCL}`, 'pergunta-se pelo artista, sem o "- Topic"');
});
await caso('não são iguais: outra duração (ao vivo), outro canal, ou sem duração', () => {
  assert.deepEqual(gruposDeGemeas([candidato('a', LNCL, 'Drake', 262), candidato('b', LNCL, 'Drake', 301)]), []);
  assert.deepEqual(gruposDeGemeas([candidato('a', LNCL, 'Drake', 262), candidato('b', LNCL, 'Lyrics Channel', 262)]), []);
  assert.deepEqual(gruposDeGemeas([candidato('a', LNCL, 'Drake', null), candidato('b', LNCL, 'Drake', null)]), []);
  assert.deepEqual(gruposDeGemeas([candidato('a', LNCL, 'Drake', 262), candidato('a', LNCL, 'Drake', 262)]), [], 'o mesmo vídeo duas vezes não é um par');
});
await caso('a resposta real do YouTube Music: a clean é a que não tem a marca ao lado da explícita', () => {
  const cancoes = lerCancoes(JSON.parse(RESPOSTA));
  assert.deepEqual(paresDoYtMusic(cancoes), { [CLEAN]: EXPLICITA });
});
await caso('uma música sem marca e SEM par não é clean: fica como está', () => {
  const so = [{ videoId: 'q', titulo: 'Hotline Bling', artista: 'Drake', duracaoSec: 267, explicita: false }];
  assert.deepEqual(paresDoYtMusic(so), {});
  const outraDuracao = [
    { videoId: 'e', titulo: 'X', artista: 'A', duracaoSec: 200, explicita: true },
    { videoId: 'c', titulo: 'X', artista: 'A', duracaoSec: 240, explicita: false },
  ];
  assert.deepEqual(paresDoYtMusic(outraDuracao), {}, 'outra duração é outra versão, não a clean');
  assert.deepEqual(paresDoYtMusic([{ ...outraDuracao[0]! }, { ...outraDuracao[0]!, videoId: 'e2' }]), {}, 'duas explícitas iguais ficam as duas');
});
await caso('a troca é no mesmo lugar; se a explícita já lá está, a clean só sai', () => {
  const id = (f: { id: string }) => f.id, com = (f: { id: string }, novo: string) => ({ ...f, id: novo });
  const lista = [{ id: 'x' }, { id: 'c' }, { id: 'y' }];
  assert.deepEqual(aplicarTrocas(lista, { c: 'e' }, id, com).map(id), ['x', 'e', 'y']);
  assert.deepEqual(aplicarTrocas([{ id: 'c' }, { id: 'x' }, { id: 'e' }], { c: 'e' }, id, com).map(id), ['x', 'e']);
  assert.deepEqual(aplicarTrocas([{ id: 'e' }, { id: 'c' }], { c: 'e' }, id, com).map(id), ['e']);
  assert.equal(aplicarTrocas(lista, { z: 'e' }, id, com), lista, 'sem nada para trocar devolve a MESMA lista');
});
await caso('as trocas lembradas têm teto, e ficam as mais recentes', () => {
  assert.deepEqual(juntarTrocas({ a: '1', b: '2' }, { c: '3' }, 2), { b: '2', c: '3' });
  assert.deepEqual(Object.keys(juntarTrocas({ a: '1', b: '2' }, { a: '9' }, 5)), ['b', 'a'], 'uma que volta passa a ser a mais recente');
});

console.log('\no aparelho: quando pergunta, e quando não');
let pedidos = 0, falhar = false, semCancoes = false;
(globalThis as any).fetch = async () => {
  pedidos++;
  if (falhar) throw new Error('sem rede');
  const corpo = semCancoes ? '{"contents":{}}' : RESPOSTA;
  return { ok: true, status: 200, json: async () => JSON.parse(corpo), text: async () => corpo };
};
const comPar = [faixa(CLEAN, LNCL, 'Drake', 262), faixa('qq', 'Toosie Slide', 'Drake', 247), faixa(EXPLICITA, LNCL, 'Drake', 262)];
const semPar = [faixa(SEM_PAR, 'Girls Want Girls (feat. Lil Baby)', 'Drake', 222), faixa('qq', 'Toosie Slide', 'Drake', 247)];
const novo = () => { armazenamento.clear(); esquecerEmMemoria(); reporControlo(); pedidos = 0; falhar = false; semCancoes = false; };

await caso('sem duas iguais nos resultados, NÃO há pedido', async () => {
  novo();
  assert.equal(await verGemeas(semPar), null);
  assert.equal(pedidos, 0);
});
await caso('com duas iguais, UM pedido; a clean sai e a explícita fica', async () => {
  novo();
  const trocas = await verGemeas(comPar);
  assert.equal(pedidos, 1);
  assert.deepEqual(trocas, { [CLEAN]: EXPLICITA });
  assert.deepEqual(trocarClean(comPar, trocas!).map((f) => f.sourceId), ['qq', EXPLICITA]);
});
await caso('o mesmo par nunca se pergunta duas vezes, nem depois de reabrir a app', async () => {
  assert.equal(await verGemeas(comPar), null);
  esquecerEmMemoria(); // reabrir: fica só o que foi para o armazenamento
  assert.equal(await verGemeas(comPar), null);
  assert.equal(pedidos, 1);
  assert.deepEqual((await semClean(comPar)).map((f) => f.sourceId), ['qq', EXPLICITA], 'e a troca lembrada aplica-se sem pedido');
});
await caso('só a clean nos resultados: a explícita entra no lugar dela, com a capa dela e sem o id da outra', async () => {
  const [f] = await semClean([{ ...faixa(CLEAN, LNCL, 'Drake', 262), id: 'linha-da-clean' } as Track]);
  assert.equal(f!.sourceId, EXPLICITA);
  assert.equal(f!.artworkUrl, `https://i.ytimg.com/vi/${EXPLICITA}/hqdefault.jpg`);
  assert.equal((f as any).id, undefined);
  assert.equal(f!.title, LNCL);
  const [r] = await semCleanNosResultados([{ track: faixa(CLEAN, LNCL, 'Drake', 262), channel: 'Drake' }]);
  assert.equal(r!.track.sourceId, EXPLICITA, 'a importação escolhe já entre as certas');
  assert.equal(r!.channel, 'Drake');
});
await caso('um par que não deu nada (as duas iguais para o YouTube Music) também não se volta a perguntar', async () => {
  novo();
  semCancoes = true;
  const outras = [faixa('m1', 'Sem Marca', 'Alguém', 180), faixa('m2', 'Sem Marca', 'Alguém', 180)];
  assert.equal(await verGemeas(outras), null);
  assert.equal(pedidos, 1);
  esquecerEmMemoria();
  assert.equal(await verGemeas(outras), null);
  assert.equal(pedidos, 1);
});
await caso('escrever depressa não vira rajada: no máximo uma pergunta de 4 em 4 segundos', async () => {
  novo();
  const outras = [faixa('m1', 'Sem Marca', 'Alguém', 180), faixa('m2', 'Sem Marca', 'Alguém', 180)];
  await verGemeas(outras);
  assert.equal(await verGemeas(comPar), null, 'a segunda, logo a seguir, espera');
  assert.equal(pedidos, 1);
});
await caso('sem rede não pergunta; e um pedido que falha não fica como perguntado', async () => {
  novo();
  controlo.offline = true;
  assert.equal(await verGemeas(comPar), null);
  assert.equal(pedidos, 0);
  novo();
  falhar = true;
  assert.equal(await verGemeas(comPar), null);
  assert.equal(pedidos, 1);
  falhar = false;
  esquecerEmMemoria();
  assert.deepEqual(await verGemeas(comPar), { [CLEAN]: EXPLICITA }, 'tenta-se outra vez noutra altura');
});

console.log('\na app');
await caso('só a caixa de pesquisa pergunta; o resto usa o que já se sabe', () => {
  const hook = ler('src/hooks/useMusicSearch.ts');
  assert.match(hook, /void verGemeas\(found\.faixas, controller\.signal\)\.then\(\(trocas\) => \{\n\s+if \(atual && trocas\) setResults\(\(antes\) => trocarClean\(antes, trocas\)\);/);
  const chamadores = ['src/api/search.ts', 'src/api/playlistPorLink.ts', 'src/api/radio.ts', 'src/api/descoberta.ts'];
  for (const f of chamadores) assert.doesNotMatch(ler(f), /verGemeas/, `${f} não pergunta`);
  const pesquisa = ler('src/api/search.ts');
  assert.equal((pesquisa.match(/await semClean\(/g) ?? []).length, 3, 'a primeira página, a Data API e a página seguinte');
  assert.match(ler('src/api/playlistPorLink.ts'), /search: async \(q\) => semCleanNosResultados\(await searchYouTubeFreeWithChannel\(q, sinal\)\),/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');
