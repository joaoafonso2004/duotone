/**
 * Os ficheiros do ensaio do Opus (assets/ensaio-opus/) são o que dizem ser.
 *
 * O ensaio só prova alguma coisa se os ficheiros estiverem certos: um "Opus"
 * que afinal é AAC, ou um fMP4 com a duração no moov (o "2x" do ecrã
 * bloqueado), dava um resultado no iPhone que não queria dizer nada.
 * Regenerá-los mal parte isto.
 *
 * E o ecrã (src/lib/ensaioOpus.ts): a duração conta como certa só perto dos
 * 30 s, e o texto partilhado diz o que falta em vez de o dar por passado.
 *
 * Correr: node --experimental-strip-types scripts/test-ensaio-opus.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { caixas, duracoes, formatoCaf } from './ensaio-opus-caixas.mjs';
import {
  duracaoCerta, FICHEIROS_DO_ENSAIO, proximaResposta, textoDoResultado,
} from '../src/lib/ensaioOpus.ts';

const pasta = new URL('../assets/ensaio-opus/', import.meta.url);
const ler = (nome) => new Uint8Array(fs.readFileSync(new URL(nome, pasta)));
const caminhos = (b) => new Set(caixas(b).map((c) => c.caminho));

let falhas = 0;
function caso(nome, fn) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.message}`); }
}

const ENTRADA = 'moov/trak/mdia/minf/stbl/stsd';

console.log('\nos ficheiros do ensaio do Opus');
caso('opus-fmp4.m4a: Opus com dOps, fragmentado, e a duração só nos fragmentos', () => {
  const b = ler('opus-fmp4.m4a');
  const c = caminhos(b);
  assert.ok(c.has(`${ENTRADA}/Opus/dOps`), 'sem entrada Opus + dOps');
  assert.ok(c.has('moov/mvex/trex') && c.has('moof/traf/trun'), 'não é fragmentado');
  assert.deepEqual(duracoes(b), { mvhd: 0, tkhd: 0, mdhd: 0 }, 'a duração no moov dá o 2x do ecrã bloqueado');
  assert.ok(!c.has('moov/mvex/mehd'), 'mehd também declara a duração');
});
caso('opus-mp4.m4a: Opus convencional, com a duração no moov (a referência)', () => {
  const b = ler('opus-mp4.m4a');
  const c = caminhos(b);
  assert.ok(c.has(`${ENTRADA}/Opus/dOps`));
  assert.ok(!c.has('moof'), 'este não pode ser fragmentado');
  assert.equal(duracoes(b).mvhd, 30_000, 'mvhd em ms: 30 s');
});
caso('aac-fmp4.m4a: o controlo é AAC, pelo mesmo fixer da app', () => {
  const b = ler('aac-fmp4.m4a');
  const c = caminhos(b);
  assert.ok(c.has(`${ENTRADA}/mp4a/esds`), 'o controlo tem de ser AAC');
  assert.ok(!c.has(`${ENTRADA}/Opus`));
  assert.deepEqual(duracoes(b), { mvhd: 0, tkhd: 0, mdhd: 0 });
});
caso('o CAF é do afconvert ou é um marcador, e o origem.json di-lo', () => {
  const origem = JSON.parse(fs.readFileSync(new URL('origem.json', pasta), 'utf8'));
  const b = ler('opus.caf');
  if (origem.caf === 'afconvert') assert.equal(formatoCaf(b), 'opus');
  else {
    assert.equal(origem.caf, 'ausente');
    assert.match(Buffer.from(b).toString('utf8'), /^marcador/, 'um CAF a sério tem de vir marcado como tal');
  }
});
caso('os três ficheiros de áudio cabem num bundle (menos de 1 MB cada)', () => {
  for (const f of ['opus-fmp4.m4a', 'opus-mp4.m4a', 'aac-fmp4.m4a']) {
    assert.ok(ler(f).length < 1_000_000, f);
  }
});

console.log('\no ecrã do ensaio');
caso('o ecrã pede ao Metro exatamente os ficheiros que existem', () => {
  const ecra = fs.readFileSync(new URL('../src/screens/EnsaioOpusScreen.tsx', import.meta.url), 'utf8');
  const pedidos = [...ecra.matchAll(/require\('\.\.\/\.\.\/assets\/ensaio-opus\/([^']+)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(pedidos, ['aac-fmp4.m4a', 'opus-fmp4.m4a', 'opus-mp4.m4a', 'opus.caf', 'origem.json']);
  for (const p of pedidos) assert.ok(fs.existsSync(new URL(p, pasta)), p);
  assert.equal(FICHEIROS_DO_ENSAIO.length, 4);
});
caso('a duração só está certa perto dos 30 s: o 2x do fMP4 dá 60 e reprova', () => {
  assert.equal(duracaoCerta(30), true);
  assert.equal(duracaoCerta(30.0065), true, 'o pre-skip do Opus soma 6,5 ms');
  assert.equal(duracaoCerta(60.013), false);
  assert.equal(duracaoCerta(null), null);
  assert.equal(duracaoCerta(Number.NaN), null);
});
caso('cada verificação anda sem resposta → sim → não → sem resposta', () => {
  assert.equal(proximaResposta(undefined), 'sim');
  assert.equal(proximaResposta('sim'), 'nao');
  assert.equal(proximaResposta('nao'), null);
});
caso('o texto partilhado não dá por passado o que não se tocou', () => {
  const t = textoDoResultado({
    ios: '27.0', build: 'abc123', versao: '3.7.6', cafDoAfconvert: false,
    resultados: {
      'opus-fmp4': {
        medicao: { estado: 'readyToPlay', erro: null, duracao: 60, msAtePronto: 120, fimEm: 30 },
        respostas: { inicio: 'sim', ecra: 'nao' },
      },
    },
  });
  assert.match(t, /iOS 27\.0 · build abc123/);
  assert.match(t, /duration read: 60\.000 s \(WRONG\)/);
  assert.match(t, /yes · Heard the short high beep/);
  assert.match(t, /NO · Lock screen shows 0:30/);
  assert.match(t, /— · Heard all three beeps/);
  assert.match(t, /## Opus · plain MP4\nnot played/);
  assert.match(t, /## Opus · CAF\nnot in this build/);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
