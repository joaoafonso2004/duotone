/**
 * O ecrã ambiente do PC (25/11) -- src/lib/ecraAmbiente.ts, e as peças à volta:
 * a casca que põe o ecrã inteiro sem roubar o foco e o modo limpo que entra e sai.
 *
 * Correr: node --experimental-strip-types scripts/test-ecra-ambiente.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AMBIENTE, passouPorCima, podeEntrar, valePerguntar, type EstadoDaApp, type EstadoDaJanela } from '../src/lib/ecraAmbiente.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const janela = (j: Partial<EstadoDaJanela> = {}): EstadoDaJanela => ({
  visivel: true, minimizada: false, emPrimeiroPlano: false, outroMonitor: true, tapada: false, segundosSemUso: 0, ...j,
});
const app = (a: Partial<EstadoDaApp> = {}): EstadoDaApp => ({
  aTocar: true, segundosSemMexer: AMBIENTE.esperaS, modoLimpoAberto: false, ocupada: false, ...a,
});

console.log('\nquando entra');
caso('noutro monitor, a tocar e sem lhe mexerem há um minuto', () => {
  assert.equal(podeEntrar(janela(), app()), true);
});
caso('com a app à frente, só com o computador parado (um monitor só)', () => {
  assert.equal(podeEntrar(janela({ emPrimeiroPlano: true, outroMonitor: false, segundosSemUso: 10 }), app()), false);
  assert.equal(podeEntrar(janela({ emPrimeiroPlano: true, outroMonitor: false, segundosSemUso: AMBIENTE.esperaS }), app()), true);
});
caso('nunca atrás de outra janela no mesmo monitor: taparia o que se está a ver', () => {
  assert.equal(podeEntrar(janela({ outroMonitor: false }), app()), false);
  assert.equal(podeEntrar(janela({ outroMonitor: false, segundosSemUso: 999 }), app()), false);
});
caso('nunca tapada, minimizada, escondida no tabuleiro ou sem medida', () => {
  assert.equal(podeEntrar(janela({ tapada: true }), app()), false);
  assert.equal(podeEntrar(janela({ minimizada: true }), app()), false);
  assert.equal(podeEntrar(janela({ visivel: false }), app()), false);
  assert.equal(podeEntrar(null, app()), false);
});
caso('nunca em pausa, com o modo limpo já aberto, ou a meio de algo', () => {
  assert.equal(podeEntrar(janela(), app({ aTocar: false })), false);
  assert.equal(podeEntrar(janela(), app({ modoLimpoAberto: true })), false);
  assert.equal(podeEntrar(janela(), app({ ocupada: true })), false);
  assert.equal(podeEntrar(janela(), app({ segundosSemMexer: AMBIENTE.esperaS - 1 })), false);
});
caso('só se pergunta à casca depois da espera e a tocar', () => {
  assert.equal(valePerguntar(app({ segundosSemMexer: 5 })), false);
  assert.equal(valePerguntar(app({ aTocar: false })), false);
  assert.equal(valePerguntar(app()), true);
});

console.log('\nquando sai');
caso('o rato tem de andar: a janela a crescer debaixo dele parado não conta', () => {
  assert.equal(passouPorCima(null, { x: 500, y: 500 }), false);
  assert.equal(passouPorCima({ x: 500, y: 500 }, { x: 500, y: 500 }), false);
  assert.equal(passouPorCima({ x: 500, y: 500 }, { x: 503, y: 504 }), false);
  assert.equal(passouPorCima({ x: 500, y: 500 }, { x: 500 + AMBIENTE.distanciaPx, y: 500 }), true);
});

console.log('\na casca');
const rust = ler('desktop/src/ambiente.rs');
caso('o ecrã inteiro nunca rouba o foco e fica por cima da barra de tarefas', () => {
  assert.match(rust, /janela\.set_fullscreen\(true\)/);
  assert.match(rust, /SWP_NOMOVE \| SWP_NOSIZE \| SWP_NOACTIVATE \| SWP_NOOWNERZORDER/);
  assert.match(rust, /let por_cima = if ligado \{ HWND_TOPMOST \} else \{ HWND_NOTOPMOST \};/);
  assert.match(rust, /devolver_a_frente\(nossa, antes\);/, 'se o Windows lhe der a frente, devolve-a');
  assert.match(rust, /if GetForegroundWindow\(\)\.0 as isize == n \{\n\s*let _ = SetForegroundWindow\(HWND\(a as \*mut _\)\);/);
});
caso('tirar só faz alguma coisa depois de pôr (a página tira-o ao arrancar)', () => {
  assert.match(rust, /if !ligado && !POSTO\.load\(Ordering::SeqCst\) \{\n\s*return Ok\(\(\)\);/);
  assert.match(ler('src/desktop/ModoLimpo.web.tsx'), /\/\/ Uma recarga a meio não deixa a janela presa em ecrã inteiro \(só tira se estava\)\.\n\s*void ponte\.ecraAmbiente\(false\)/);
});
caso('o outro monitor é o da janela da frente, e as janelas da app não a tapam', () => {
  assert.match(rust, /MonitorFromWindow\(frente, MONITOR_DEFAULTTONEAREST\)\.0 != MonitorFromWindow\(nossa, MONITOR_DEFAULTTONEAREST\)\.0/);
  assert.match(rust, /if processo_de\(h\) == pid \|\| !a_vista\(h\) \{\n\s*continue;/);
  assert.match(rust, /DWMWA_CLOAKED/, 'as janelas "escondidas" pelo DWM não tapam');
  assert.match(rust, /WS_EX_TRANSPARENT/, 'nem as camadas transparentes aos cliques');
});
caso('os dois comandos entram no build, nas capabilities e no registo', () => {
  for (const c of ['ambiente_ler', 'ambiente_ecra']) {
    assert.match(ler('desktop/build.rs'), new RegExp(`"${c}"`));
    assert.match(ler('desktop/src/main.rs'), new RegExp(`ambiente::${c}`));
    for (const cap of ['preview', 'producao']) assert.match(ler(`desktop/capabilities/${cap}/default.json`), new RegExp(`"allow-${c.replace('_', '-')}"`));
  }
});

console.log('\no modo limpo');
const ml = ler('src/desktop/ModoLimpo.web.tsx');
caso('entra primeiro na janela, apaga o conteúdo à volta da mudança de tamanho, e volta', () => {
  const entrar = ml.slice(ml.indexOf('async function entrarNoAmbiente'), ml.indexOf('async function sairDoAmbiente'));
  const ordem = ["aberto: true, automatico: true", 'esperar(AMBIENTE.apagarMs)', 'aMudar: true', 'ponte.ecraAmbiente(true)', 'aMudar: false'];
  let antes = -1;
  for (const passo of ordem) {
    const i = entrar.indexOf(passo, antes + 1);
    assert.ok(i > antes, `fora de ordem: ${passo}`);
    antes = i;
  }
});
caso('sai a encolher a janela com o modo limpo ainda por cima, e só depois o apaga', () => {
  const sair = ml.slice(ml.indexOf('async function sairDoAmbiente'), ml.indexOf('function appOcupada'));
  assert.ok(sair.indexOf('ecraAmbiente?.(false)') < sair.indexOf('aberto: false, automatico: false'));
});
caso('o F11 e o Esc também saem do ecrã ambiente, pela casca', () => {
  assert.match(ml, /if \(s\.automatico\) \{ void sairDoAmbiente\(\); return; \}/);
});
caso('sozinho não puxa o foco nem tira o mini da frente', () => {
  assert.match(ml, /if \(useModoLimpo\.getState\(\)\.automatico\) return;\n\s*window\.focus\?\.\(\);/);
  assert.match(ler('src/desktop/usePonteDoLeitor.web.ts'), /const tapaOMini = \(s: \{ aberto: boolean; automatico: boolean \}\) => s\.aberto && !s\.automatico;/);
});
caso('passar o rato sai, mas não na graça a seguir a cada mudança de tamanho', () => {
  assert.match(ml, /if \(Date\.now\(\) - quieto < AMBIENTE\.gracaMs \|\| useModoLimpo\.getState\(\)\.aMudar\) \{ desde = agora; return; \}/);
  assert.match(ml, /window\.addEventListener\('resize', cresceu\);/);
  assert.match(ml, /if \(passouPorCima\(desde, agora\)\) void sairDoAmbiente\(\);/);
});
caso('só se pergunta à casca quando vale a pena, e a decisão é a da lib', () => {
  assert.match(ml, /valePerguntar\(comoEsta\(\)\)\) \{\n\s*const janela = await ponte\.estadoDoAmbiente\(\)/);
  assert.match(ml, /if \(vivo && podeEntrar\(janela, comoEsta\(\)\)\) void entrarNoAmbiente\(\);/);
  assert.doesNotMatch(ml, /setInterval/);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
