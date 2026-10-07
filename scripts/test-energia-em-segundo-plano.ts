/**
 * O gasto com a app em segundo plano -- src/lib/energiaEmSegundoPlano.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-energia-em-segundo-plano.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  compararRetratos, dadosDoEvento, grupoDaThread, guardarPeriodo, lerRetrato,
  normalizarNome, textoDaEnergia, MINUTOS_MINIMOS, MINUTOS_MINIMOS_A_FRENTE, PERIODOS_GUARDADOS,
} from '../src/lib/energiaEmSegundoPlano.ts';

let falhas = 0;
function caso(nome: string, f: () => void) {
  try { f(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

const extra = (em: number, bateria: number | null = 0.8) => ({ em, bateria, aCarregar: false, aTocar: true });

caso('os nomes perdem números e endereços, e juntam-se', () => {
  assert.equal(normalizarNome('com.apple.coremedia.player.async.0x1c2a'), 'com.apple.coremedia.player.async.#');
  assert.equal(normalizarNome('AQClient 12'), 'AQClient #');
  const r = lerRetrato({ totalMs: 10, threads: [{ nome: 'q.0x1', ms: 2 }, { nome: 'q.0x2', ms: 3 }] }, extra(0));
  assert.deepEqual(r?.threads, { 'q.#': 5 });
});

caso('cada thread vai para o seu grupo', () => {
  assert.equal(grupoDaThread('com.facebook.react.runtime.JavaScript'), 'javascript');
  assert.equal(grupoDaThread('com.facebook.react.JavaScript'), 'javascript');
  assert.equal(grupoDaThread('hermes-gc'), 'javascript');
  assert.equal(grupoDaThread('com.apple.coremedia.player.async.#'), 'audio');
  // O relatório da 4.4.1: o tap do EQ e o recolhedor do Hermes caíam em "outros".
  assert.equal(grupoDaThread('AQProcessingTapManager'), 'audio');
  assert.equal(grupoDaThread('hades'), 'javascript');
  assert.equal(grupoDaThread('AQClient'), 'audio');
  assert.equal(grupoDaThread('caulk.messenger.shared:high'), 'audio');
  assert.equal(grupoDaThread('com.apple.NSURLConnectionLoader'), 'rede');
  assert.equal(grupoDaThread('com.apple.CFNetwork.CustomProtocols'), 'rede');
  assert.equal(grupoDaThread('com.hackemist.SDWebImageDownloaderOperation'), 'imagens');
  assert.equal(grupoDaThread(''), 'sem-nome');
  assert.equal(grupoDaThread('com.apple.uikit.eventfetch-thread'), 'outros');
});

caso('lixo do módulo nativo não é um retrato', () => {
  assert.equal(lerRetrato(null, extra(0)), null);
  assert.equal(lerRetrato({}, extra(0)), null);
  assert.equal(lerRetrato({ totalMs: -1 }, extra(0)), null);
  assert.equal(lerRetrato({ totalMs: 5, threads: 'x' }, extra(0))?.totalMs, 5);
  assert.equal(lerRetrato({ totalMs: 5 }, extra(0, 1.5))?.bateria, null, 'bateria fora de 0..1 não se sabe');
  assert.equal(lerRetrato({ totalMs: 5 }, extra(0, -1))?.bateria, null);
});

caso('o período: CPU por grupo, e o das threads que morreram vai para outros', () => {
  const a = lerRetrato({ totalMs: 1000, termico: 'nominal', threads: [
    { nome: 'com.facebook.react.runtime.JavaScript', ms: 400 },
    { nome: 'AQClient', ms: 100 },
    { nome: 'morre', ms: 50 },
  ] }, extra(0, 0.9))!;
  // 10 min depois: o JS gastou 600 ms, o áudio 1200, nasceu uma de rede com 300,
  // e o total subiu 2400 -- 300 de threads que já não existem.
  const b = lerRetrato({ totalMs: 3400, termico: 'fair', threads: [
    { nome: 'com.facebook.react.runtime.JavaScript', ms: 1000 },
    { nome: 'AQClient', ms: 1300 },
    { nome: 'com.apple.NSURLConnectionLoader', ms: 300 },
  ] }, extra(600_000, 0.86))!;
  const p = compararRetratos(a, b)!;
  assert.equal(p.minutos, 10);
  assert.equal(p.cpuMs, 2400);
  assert.equal(p.cpuPct, 0.4);
  assert.equal(p.porGrupo.javascript, 600);
  assert.equal(p.porGrupo.audio, 1200);
  assert.equal(p.porGrupo.rede, 300);
  assert.equal(p.porGrupo.outros, 300);
  assert.equal(p.topo[0].nome, 'AQClient');
  assert.equal(p.termicoFim, 'fair');
  const d = dadosDoEvento(p);
  assert.deepEqual(d, {
    min: 10, cpu_pct: 0.4, js_pct: 0.1, audio_pct: 0.2, rede_pct: 0.05, outros_pct: 0.05,
    a_tocar: true, a_carregar: false, bateria_pp: 4, termico: 'fair',
  });
  const texto = textoDaEnergia([p], 600_000 + 120_000);
  assert.match(texto, /2 min ago, 10\.0 min, playing at interval start: CPU 0\.40%/);
  assert.match(texto, /battery 90% -> 86%/);
  assert.match(texto, /javascript 0\.10%, audio 0\.20%, rede 0\.05%/);
});

caso('períodos curtos não contam, e guardam-se só os últimos', () => {
  const a = lerRetrato({ totalMs: 0 }, extra(0))!;
  const curto = compararRetratos(a, lerRetrato({ totalMs: 10 }, extra(MINUTOS_MINIMOS * 60_000 - 1))!);
  assert.equal(guardarPeriodo([], curto).length, 0);
  // À frente conta a partir de 15 s (6/10): o minuto que aqueceu teve 59 s.
  const minutoCurto = compararRetratos(a, lerRetrato({ totalMs: 10 }, extra(59_000))!);
  assert.equal(guardarPeriodo([], minutoCurto, MINUTOS_MINIMOS_A_FRENTE).length, 1, 'à frente, 59 s contam');
  assert.equal(guardarPeriodo([], minutoCurto).length, 0, 'em segundo plano, não');
  assert.equal(compararRetratos(a, a), null, 'sem tempo não há período');
  let lista = guardarPeriodo([], null);
  for (let i = 1; i <= PERIODOS_GUARDADOS + 2; i++) {
    lista = guardarPeriodo(lista, compararRetratos(a, lerRetrato({ totalMs: i }, extra(i * 120_000))!));
  }
  assert.equal(lista.length, PERIODOS_GUARDADOS);
  assert.equal(lista[lista.length - 1].cpuMs, PERIODOS_GUARDADOS + 2);
  assert.match(textoDaEnergia([], 0), /no background period/);
});

caso('a ligação: só no iPhone, nas mudanças de estado, e no relatório', () => {
  const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(ler('App.tsx'), /if \(Platform\.OS !== 'web'\) iniciarEnergiaEmSegundoPlano\(\);/);
  assert.match(ler('src/lib/relatorioDeReproducao.ts'), /\$\{textoDaEnergiaAgora\(\)\}/);
  const estado = ler('src/state/energiaEmSegundoPlano.ts');
  // Em segundo plano não acorda nada: o único relógio (a medição com a app à
  // frente, 3/10) desliga-se ao sair de 'active'.
  assert.doesNotMatch(estado, /setTimeout/, 'o medidor não acorda o iPhone');
  assert.equal((estado.match(/setInterval\(/g) ?? []).length, 1);
  assert.match(estado, /if \(estado === 'active'\) ligarRelogio\(\); else desligarRelogio\(\);/);
  assert.match(ler('modules/duotone-diagnostico/ios/DuotoneDiagnosticoModule.swift'), /Function\("cpuDoProcesso"\)/);
});

caso('ecrã bloqueado ou outra app à frente (7/10)', () => {
  const a = lerRetrato({ totalMs: 0, bloqueadoMs: 60_000 }, extra(0))!;
  const b = lerRetrato({ totalMs: 1000, bloqueadoMs: 60_000 + 8 * 60_000 }, extra(10 * 60_000))!;
  const p = compararRetratos(a, b)!;
  assert.equal(p.bloqueadoMin, 8);
  assert.match(textoDaEnergia([p], 10 * 60_000), /screen locked 8\.0 of 10\.0 min · another app on screen 2\.0 min/);
  assert.equal(dadosDoEvento(p).bloqueado_pct, 80);
  // Nunca bloqueou: outra app à frente (ou sem código no iPhone).
  const nunca = compararRetratos(a, lerRetrato({ totalMs: 1000, bloqueadoMs: 60_000 }, extra(10 * 60_000))!)!;
  assert.match(textoDaEnergia([nunca], 10 * 60_000), /screen never locked: another app was on screen/);
  // Sem o contador no binário: não se diz nada, e o evento fica como era.
  const semContador = compararRetratos(lerRetrato({ totalMs: 0 }, extra(0))!, lerRetrato({ totalMs: 10 }, extra(60_000))!)!;
  assert.equal(semContador.bloqueadoMin, null);
  assert.doesNotMatch(textoDaEnergia([semContador], 60_000), /screen/);
  assert.equal('bloqueado_pct' in dadosDoEvento(semContador), false);
  // Um contador que anda para trás (a app reabriu) não dá minutos negativos, nem mais do que o período.
  assert.equal(compararRetratos(b, lerRetrato({ totalMs: 2000, bloqueadoMs: 0 }, extra(20 * 60_000))!)!.bloqueadoMin, 0);
  assert.equal(compararRetratos(a, lerRetrato({ totalMs: 1, bloqueadoMs: 10 ** 9 }, extra(60_000))!)!.bloqueadoMin, 1);
  // Com a app à frente não se escreve a linha.
  assert.doesNotMatch(textoDaEnergia([p], 10 * 60_000, true), /screen/);
  const swift = readFileSync(new URL('../modules/duotone-diagnostico/ios/DuotoneDiagnosticoModule.swift', import.meta.url), 'utf8');
  assert.match(swift, /protectedDataWillBecomeUnavailableNotification/);
  assert.match(swift, /"bloqueadoMs": DuotoneEcraBloqueado\.shared\.bloqueadoMs\(\)/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam`); process.exit(1); }
console.log('\nEnergia em segundo plano: todos os casos passaram.');
