/**
 * O equalizador de cada plataforma (15/11, src/lib/eqDaPlataforma.ts): o EQ e
 * a velocidade de cada música do iPhone e do PC na mesma tabela, sem se verem.
 * O que passa entre as duas são os presets (o João: "a única coisa que deve
 * passar entre plataformas são os presets do equalizador") e a velocidade padrão.
 *
 * Correr: node --experimental-strip-types scripts/test-eq-da-plataforma.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { idDaPlataforma, idNoServidor, PREFIXO_DO_PC } from '../src/lib/eqDaPlataforma.ts';
import { DE_FORA } from '../src/lib/prefsFusao.ts';

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

console.log('\nos ids');
caso('o iPhone fica com as linhas de sempre; o PC escreve com o prefixo', () => {
  assert.equal(idNoServidor('dQw4w9WgXcQ', false), 'dQw4w9WgXcQ');
  assert.equal(idNoServidor('dQw4w9WgXcQ', true), `${PREFIXO_DO_PC}dQw4w9WgXcQ`);
});
caso('cada um lê só as suas', () => {
  assert.equal(idDaPlataforma('dQw4w9WgXcQ', false), 'dQw4w9WgXcQ');
  assert.equal(idDaPlataforma('pc~dQw4w9WgXcQ', false), null, 'o iPhone não vê as do PC');
  assert.equal(idDaPlataforma('pc~dQw4w9WgXcQ', true), 'dQw4w9WgXcQ');
  assert.equal(idDaPlataforma('dQw4w9WgXcQ', true), null, 'o PC não vê as do iPhone');
});
caso('ida e volta nas duas plataformas', () => {
  for (const noPc of [false, true]) {
    for (const id of ['abc', 'dQw4w9WgXcQ', 'x:y']) assert.equal(idDaPlataforma(idNoServidor(id, noPc), noPc), id);
  }
});

console.log('\nligado');
const AJUSTES = ler('src/api/ajustes.ts');
caso('os ajustes por faixa: lidos e escritos por plataforma, e a linha do padrão é uma só', () => {
  assert.match(AJUSTES, /const id=eDoPadrao\(row\.source\)\?row\.source_id:idDaPlataforma\(row\.source_id\);/);
  assert.match(AJUSTES, /source_id:eDoPadrao\(source\)\?id:idNoServidor\(id\)/);
});
caso('o aviso do Realtime de uma linha da outra plataforma não relê nada', () => {
  assert.match(ler('src/state/trackAdjustments.ts'), /if\(payload\.eventType!=='DELETE'&&eDaOutraPlataforma\(payload\.new as any\)\)return;/);
});
caso('os presets passam entre as plataformas (são os mesmos no iPhone e no PC)', () => {
  for (const f of ['src/api/presets.ts', 'src/state/presets.ts']) {
    assert.ok(!/eqDaPlataforma|idDaPlataforma|idNoServidor/.test(ler(f)), `${f} não separa por plataforma`);
  }
  assert.match(ler('src/desktop/GestorDePresets.web.tsx'), /They sync with your phone\./);
});
caso('o padrão de antes e o Recommended não viajam na conta', () => {
  for (const k of ['pref:eqPadrao', 'pref:eqRecomendado', 'pref:eqModelosDasSaidas']) assert.ok(DE_FORA.has(k), k);
  assert.ok(!DE_FORA.has('pref:eqPadrao:ios') && !DE_FORA.has('pref:eqPadrao:windows'),
    'o de cada plataforma continua na conta: reinstalar a mesma plataforma recupera-o');
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
