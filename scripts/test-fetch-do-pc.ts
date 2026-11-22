/**
 * O `fetch` trocável do resolvedor e as regras do motor só de áudio do PC (F4 do
 * plano do Tauri, "testes puros": o adaptador do fetch e a escolha do motor).
 *
 * - `src/api/ytstream.ts` a sério, com o `fetch` falso: por omissão vai o global
 *   resolvido EM CADA chamada (os duplos dos testes do iPhone continuam a
 *   apanhá-lo); `definirFetchDoYouTube(f)` troca-o; `null` repõe o de sempre.
 * - `src/desktop/motorDeAudio.web.tsx` lido como TEXTO (é um .tsx): só o
 *   InnerTube do resolvedor vai pela ponte, só a sonda de 2 bytes vai pelo
 *   `sondarAudio`, o resto vai pelo `fetch`; e o motor só liga numa casca com
 *   `registarAudio`, com o `duotone:motor = iframe` a desligá-lo.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-fetch-do-pc.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aquecerResolvedor, clearVisitorData, definirFetchDoYouTube } from '../src/api/ytstream.ts';

let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

const visitante = () => new Response(JSON.stringify({ responseContext: { visitorData: 'vd-teste' } }), { status: 200 });
let doGlobal: string[] = [];
const fetchGlobal = async (url: string) => { doGlobal.push(String(url)); return visitante(); };

console.log('\no fetch do resolvedor (src/api/ytstream.ts)');

await caso('por omissão vai o fetch global, lido na hora da chamada', async () => {
  // Trocado DEPOIS de o módulo carregar: se o ytstream o guardasse ao carregar, falhava.
  (globalThis as any).fetch = fetchGlobal;
  doGlobal = [];
  await clearVisitorData();
  await aquecerResolvedor();
  assert.equal(doGlobal.length, 1, `pedidos: ${doGlobal.join(', ')}`);
  assert.match(doGlobal[0], /^https:\/\/www\.youtube\.com\/youtubei\/v1\/visitor_id\?/);
});

await caso('definirFetchDoYouTube troca-o (o que a casca do PC faz), e o global fica de fora', async () => {
  const trocados: { url: string; metodo?: string }[] = [];
  definirFetchDoYouTube(async (url, init) => { trocados.push({ url, metodo: init?.method }); return visitante(); });
  doGlobal = [];
  await clearVisitorData();
  await aquecerResolvedor();
  assert.equal(trocados.length, 1);
  assert.match(trocados[0].url, /youtubei\/v1\/visitor_id/);
  assert.equal(trocados[0].metodo, 'POST');
  assert.equal(doGlobal.length, 0, 'o global não é chamado');
});

await caso('null repõe o de sempre', async () => {
  definirFetchDoYouTube(null);
  doGlobal = [];
  await clearVisitorData();
  await aquecerResolvedor();
  assert.equal(doGlobal.length, 1);
});

console.log('\no motor só de áudio do PC (src/desktop/motorDeAudio.web.tsx, como texto)');
const MOTOR = ler('src/desktop/motorDeAudio.web.tsx');
const REDE = ler('desktop/src/rede.rs');

/** A expressão regular de uma linha do adaptador, tirada do código e posta a correr. */
function regraDe(perto: string): RegExp {
  const linha = MOTOR.split('\n').find((l) => l.includes(perto) && l.includes('.test(u)'));
  assert.ok(linha, `a linha do adaptador com "${perto}"`);
  const m = /\/(\^[^\n]*?)\/\.test\(u\)/.exec(linha!);
  assert.ok(m, `a expressão na linha: ${linha}`);
  return new RegExp(m![1]);
}

await caso('só o player e o visitor_id do InnerTube vão pelo pedirAoInnerTube', () => {
  const r = regraDe('pedirAoInnerTube');
  assert.ok(r.test('https://www.youtube.com/youtubei/v1/player?key=x'));
  assert.ok(r.test('https://www.youtube.com/youtubei/v1/visitor_id?key=x&prettyPrint=false'));
  assert.ok(!r.test('https://www.youtube.com/youtubei/v1/next'), 'o next não');
  assert.ok(!r.test('https://www.youtube.com/youtubei/v1/player_x'), 'nem um nome que só começa igual');
  assert.ok(!r.test('https://music.youtube.com/youtubei/v1/player'), 'nem outro anfitrião');
  assert.ok(!r.test('https://www.youtube.com.example.org/youtubei/v1/player'));
  // O Rust tem a mesma lista fechada (rede::innertube_pedir, com testes em cargo test).
  assert.ok(REDE.includes('youtubei/v1/player') && REDE.includes('youtubei/v1/visitor_id'), 'o rede.rs aceita os dois');
});

await caso('só a sonda de 2 bytes ao googlevideo vai pelo sondarAudio', () => {
  const r = regraDe('sondarAudio');
  assert.ok(r.test('https://rr3---sn-apo3qjvh-v2vs.googlevideo.com/videoplayback?id=1'));
  assert.ok(!r.test('https://googlevideo.com.example.org/videoplayback'));
  assert.ok(!r.test('http://rr3---sn.googlevideo.com/videoplayback'), 'só https');
  assert.match(MOTOR, /cabecalhos\.get\('Range'\) === 'bytes=0-1'/, 'e só com o Range dos 2 bytes');
});

await caso('o resto do resolvedor vai pelo fetch normal (o HLS falha e a faixa cai no IFrame)', () => {
  const adaptador = MOTOR.slice(MOTOR.indexOf('definirFetchDoYouTube(async'), MOTOR.indexOf('\n  });', MOTOR.indexOf('definirFetchDoYouTube(async')));
  assert.match(adaptador, /return fetch\(url, init\);\s*$/, 'a última saída é o fetch de sempre');
  assert.match(MOTOR, /definirSondaDaCascata\(false\)/, 'sem a sonda na cascata (o <audio> dá erro sozinho)');
});

await caso('o motor só liga numa casca com registarAudio, e o duotone:motor = iframe desliga-o', () => {
  assert.match(MOTOR, /localStorage\.getItem\('duotone:motor'\) === 'iframe'/);
  assert.match(MOTOR, /return !!ponte\(\)\?\.registarAudio && !desligado;/);
  assert.match(MOTOR, /export const MotorDoPc[^\n]*= haMotorSoDeAudio\(\) \? MotorDoPcTauri : YouTubePlayerView;/,
    'no Electron (sem registarAudio) o MotorDoPc é o YouTubePlayerView de sempre');
  // O interruptor só se lê ao carregar o módulo: mudá-lo pede um recarregar.
  assert.match(MOTOR, /\} catch \{ \/\* sem armazenamento: fica ligado \*\/ \}/, 'sem localStorage fica ligado');
});

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nfetch do PC: ok');
