/**
 * O teclado e as legendas do PC (src/lib/acessibilidadeDoPc.ts, 20/10, revisão
 * de qualidade Q3 a Q5): os diálogos em camadas, o Tab preso, as teclas dos
 * sliders, a posição das legendas -- e os sítios que os usam.
 *
 * Correr: node --experimental-strip-types scripts/test-acessibilidade-do-pc.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  criarPilhaDeCamadas, dentesDaTecla, focoAoTab, MARGEM_DA_DICA, posicaoDaDica, textoDaDica, valorDaProcura,
} from '../src/lib/acessibilidadeDoPc.ts';
import { acaoDaJanela, type AcaoDaJanela } from '../src/lib/atalhosDaJanela.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

console.log('\nos diálogos em camadas');
caso('só a camada de cima responde, e a de baixo volta a responder quando a de cima sai', () => {
  const p = criarPilhaDeCamadas();
  const album = p.abrir();
  const playlist = p.abrir();
  assert.equal(p.noTopo(playlist), true);
  assert.equal(p.noTopo(album), false, 'um Escape não fecha as duas');
  p.fechar(playlist);
  assert.equal(p.noTopo(album), true);
  p.fechar(album);
  assert.equal(p.quantas, 0);
  assert.equal(p.noTopo(album), false);
});
caso('fechar fora de ordem não estraga a pilha', () => {
  const p = criarPilhaDeCamadas();
  const a = p.abrir(); const b = p.abrir(); const c = p.abrir();
  p.fechar(b);
  assert.equal(p.noTopo(c), true);
  p.fechar(c);
  assert.equal(p.noTopo(a), true);
  p.fechar(b); // outra vez: não faz nada
  assert.equal(p.quantas, 1);
});
caso('o Tab dá a volta nas pontas e traz para dentro o foco que está fora', () => {
  assert.equal(focoAoTab(2, 3, false), 0, 'do último para o primeiro');
  assert.equal(focoAoTab(0, 3, true), 2, 'do primeiro para o último (Shift+Tab)');
  assert.equal(focoAoTab(1, 3, false), null, 'no meio, o browser anda sozinho');
  assert.equal(focoAoTab(-1, 3, false), 0);
  assert.equal(focoAoTab(-1, 3, true), 2);
  assert.equal(focoAoTab(0, 1, false), 0, 'sozinho, fica onde está');
  assert.equal(focoAoTab(-1, 0, false), null);
});

console.log('\nos sliders');
caso('as setas são um dente, com Shift dois, Page de seis, e as pontas', () => {
  assert.equal(dentesDaTecla('ArrowRight', false), 1);
  assert.equal(dentesDaTecla('ArrowUp', false), 1);
  assert.equal(dentesDaTecla('ArrowLeft', false), -1);
  assert.equal(dentesDaTecla('ArrowDown', true), -2);
  assert.equal(dentesDaTecla('PageUp', false), 6);
  assert.equal(dentesDaTecla('PageDown', false), -6);
  assert.equal(dentesDaTecla('Home', false), 'inicio');
  assert.equal(dentesDaTecla('End', false), 'fim');
  assert.equal(dentesDaTecla(' ', false), null, 'o Espaço continua a pausar');
  assert.equal(dentesDaTecla('Tab', false), null);
});
caso('o leitor de ecrã ouve "1:23 of 3:45"', () => {
  assert.equal(valorDaProcura(83.9, 225), '1:23 of 3:45');
  assert.equal(valorDaProcura(-1, 0), '0:00 of 0:00');
});

console.log('\nas legendas');
caso('por cima do botão, ao centro', () => {
  const r = posicaoDaDica({ x: 500, y: 700, largura: 34, altura: 34 }, { largura: 80, altura: 26 }, { largura: 1400, altura: 900 });
  assert.equal(r.lado, 'cima');
  assert.equal(r.x, 500 + 17 - 40);
  assert.equal(r.y, 700 - 6 - 26);
});
caso('por baixo quando não cabe em cima (a barra do título)', () => {
  const r = posicaoDaDica({ x: 500, y: 4, largura: 34, altura: 30 }, { largura: 80, altura: 26 }, { largura: 1400, altura: 900 });
  assert.equal(r.lado, 'baixo');
  assert.equal(r.y, 4 + 30 + 6);
});
caso('nunca sai da janela pelos lados', () => {
  const direita = posicaoDaDica({ x: 1380, y: 700, largura: 34, altura: 34 }, { largura: 120, altura: 26 }, { largura: 1400, altura: 900 });
  assert.equal(direita.x, 1400 - 120 - MARGEM_DA_DICA);
  const esquerda = posicaoDaDica({ x: 0, y: 700, largura: 34, altura: 34 }, { largura: 120, altura: 26 }, { largura: 1400, altura: 900 });
  assert.equal(esquerda.x, MARGEM_DA_DICA);
});
caso('o texto é o nome do botão e o atalho, quando há', () => {
  assert.deepEqual(textoDaDica(' Next ', 'Ctrl+→'), { rotulo: 'Next', atalho: 'Ctrl+→' });
  assert.deepEqual(textoDaDica('Close player'), { rotulo: 'Close player', atalho: null });
});

console.log('\nos atalhos das legendas são os que a janela usa');
// Uma legenda que promete um atalho que não existe é pior do que nenhuma.
const TECLAS: Record<string, { key: string; ctrl?: boolean }> = {
  Space: { key: ' ' }, 'Ctrl+→': { key: 'ArrowRight', ctrl: true }, 'Ctrl+←': { key: 'ArrowLeft', ctrl: true },
  'Ctrl+L': { key: 'l', ctrl: true },
};
const PROMETIDOS: [string, AcaoDaJanela][] = [['Space', 'tocar-pausa'], ['Ctrl+→', 'seguinte'], ['Ctrl+←', 'anterior'], ['Ctrl+L', 'gostar']];
caso('cada atalho escrito na barra faz o que o botão faz', () => {
  for (const [atalho, acao] of PROMETIDOS) {
    const t = TECLAS[atalho]!;
    assert.equal(acaoDaJanela({ key: t.key, ctrl: !!t.ctrl, alt: false, shift: false, meta: false, repetida: false, editavel: false, deslizador: false }), acao, atalho);
  }
});
const casca = ler('src/desktop/casca.web.tsx');
caso('a barra do leitor escreve esses atalhos, e só esses', () => {
  assert.match(casca, /label="Previous" atalho="Ctrl\+←"/);
  assert.match(casca, /label="Next" atalho="Ctrl\+→"/);
  assert.match(casca, /comDica\(p\.isPlaying \? 'Pause' : 'Play', 'Space'\)/);
  assert.match(casca, /atalho="Ctrl\+L"/);
  const escritos = [...casca.matchAll(/atalho="([^"]+)"|comDica\([^,]+,\s*'([^']+)'\)/g)].map((m) => m[1] ?? m[2]);
  for (const a of escritos) assert.ok(a in TECLAS, `atalho sem correspondência: ${a}`);
});

console.log('\nligado');
const ui = ler('src/desktop/ui.web.tsx');
caso('o Dialog anuncia-se, prende o Tab, fecha só por cima e devolve o foco', () => {
  const dialogo = ui.slice(ui.indexOf('export function Dialog('), ui.indexOf('export function Toast('));
  assert.match(dialogo, /role="dialog" aria-modal aria-label=\{title\}/);
  assert.match(dialogo, /if \(!camadas\.noTopo\(camada\)\) return;/);
  assert.match(dialogo, /if \(e\.defaultPrevented \|\| document\.querySelector\('\[role="menu"\]'\)\) return;/, 'o Escape de um menu por cima não fecha o diálogo');
  assert.match(dialogo, /window\.addEventListener\('keydown', tecla, true\);/, 'na captura: o TextInput do RNW pára as teclas na bolha');
  assert.match(dialogo, /focoAoTab\(/);
  assert.match(dialogo, /antes\.focus\(\)/);
  assert.match(dialogo, /\}, \[open\]\);/, 'a camada não pode sair e voltar a cada render');
});
caso('os botões do PC são botões, e os de ícone têm legenda', () => {
  assert.match(ui, /<P \{\.\.\.comDica\(label, atalho, 'premir'\)\} accessibilityRole="button" accessibilityLabel=\{label\}/);
  assert.match(ui, /<P \{\.\.\.marcar\('premir'\)\} accessibilityRole="button" disabled=\{disabled\}/);
  assert.match(ler('src/navigation/RootNavigator.web.tsx'), /useDicas\(\);/);
  assert.match(casca, /#duotone-dica\{ position: fixed;/);
  assert.match(casca, /#duotone-dica\{ transition: none !important; transform: none !important; \}/, 'menos movimento');
});
caso('o volume e as barras de progresso são sliders com valor e teclado', () => {
  const limpo = ler('src/desktop/ModoLimpo.web.tsx');
  assert.match(casca, /role="slider" aria-label="Volume" aria-valuemin=\{0\} aria-valuemax=\{100\} aria-valuenow=\{volume\}/);
  assert.equal((casca.match(/role="slider" aria-label="Seek"/g) ?? []).length, 1);
  assert.equal((limpo.match(/role="slider" aria-label="Seek"/g) ?? []).length, 1);
  for (const s of [casca, limpo]) assert.match(s, /onKeyDown=\{teclar\}/);
  assert.match(ui, /const teclar = \(evento: any\) =>/);
  assert.match(casca, /\[role="slider"\]:focus-visible\{ outline:/, 'o foco vê-se');
});
caso('a barra do leitor já não redesenha com o volume', () => {
  const sel = casca.slice(casca.indexOf('const p = usePlayer(useShallow((s) => ({'), casca.indexOf('const jam = useOuvirJuntos'));
  assert.doesNotMatch(sel, /volume/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');
