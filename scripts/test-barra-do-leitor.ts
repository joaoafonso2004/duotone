/**
 * A barra do leitor do PC (30/10, passo 8 de `docs/PLANO-ELEVAR-PC.md`): o
 * coração passa de ao lado do título para o grupo da direita (a escolha A do
 * João), e os botões que mudam de estado ganham uma animação cada: shuffle,
 * repeat, play/pause (o giro), volume e Jam. O olho já tinha a sua. A conta é
 * pura (`lib/estadoDosIcones.ts`); o resto lê o código como TEXTO.
 *
 * Correr: node --experimental-strip-types scripts/test-barra-do-leitor.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estadoDoShuffle, nivelDoVolume } from '../src/lib/estadoDosIcones.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const CASCA = ler('src/desktop/casca.web.tsx');
const ICONES = ler('src/desktop/IconesDeEstado.web.tsx');
const CORACAO = ler('src/components/CoracaoAnimado.web.tsx');
const ESTILOS = ler('src/desktop/estilos.web.ts');
const barra = CASCA.slice(CASCA.indexOf('export function PlayerBar('));

console.log('\nos estados que os ícones mostram');
caso('o shuffle: desligado, ligado, ou inteligente', () => {
  assert.equal(estadoDoShuffle(false, false), 'off');
  assert.equal(estadoDoShuffle(false, true), 'off', 'o inteligente sem o shuffle ligado é desligado');
  assert.equal(estadoDoShuffle(true, false), 'on');
  assert.equal(estadoDoShuffle(true, true), 'smart');
});
caso('o volume: mudo, um arco, ou os dois', () => {
  assert.equal(nivelDoVolume(0), 'mudo');
  assert.equal(nivelDoVolume(1), 'baixo');
  assert.equal(nivelDoVolume(49), 'baixo');
  assert.equal(nivelDoVolume(50), 'alto');
  assert.equal(nivelDoVolume(100), 'alto');
});
caso('um volume que não é número vale mudo', () => {
  assert.equal(nivelDoVolume(NaN), 'mudo');
  assert.equal(nivelDoVolume(-5), 'mudo');
});

console.log('\no coração fora de ao lado do título');
caso('já não está na faixa do título, e a faixa do título ocupa o espaço todo', () => {
  assert.ok(!barra.includes('styles.playerSave'), 'sobrou a caixa do coração ao lado do título');
  assert.match(ESTILOS, /playerTrackLink: \{ maxWidth: '100%',/);
});
caso('é o primeiro dos ícones da direita: depois do "With X ×" e antes do olho', () => {
  const direita = barra.slice(barra.indexOf('<View style={styles.playerRight}>'));
  const seguir = direita.indexOf('<SeguirNaBarra />');
  const coracao = direita.indexOf('label={coracao.mostrada ?');
  const olho = direita.indexOf('<IndicadorDeVisibilidade');
  const jam = direita.indexOf("label={jam ? 'Manage Jam'");
  assert.ok(seguir >= 0 && coracao > seguir && olho > coracao && jam > olho, `${seguir} ${coracao} ${olho} ${jam}`);
});
caso('continua a ser o mesmo coração: Ctrl+L, o toque que anima e as Faíscas', () => {
  assert.match(barra, /atalho="Ctrl\+L"/);
  assert.match(barra, /onPressIn=\{coracao\.onPressIn\}/);
  assert.match(barra, /<CoracaoAnimado guardada=\{coracao\.mostrada\} pulso=\{coracao\.pulso\}/);
});
caso('o coração enche de baixo para cima e abre um anel (o Encolher e as Faíscas ficam)', () => {
  assert.match(CORACAO, /@keyframes ca-enche\{0%\{opacity:1;clip-path:inset\(100% 0 0 0\)\}100%\{opacity:1;clip-path:inset\(0 0 0 0\)\}\}/);
  assert.match(CORACAO, /\.ca-por \.ca-anel\{animation:ca-anel 620ms/);
  assert.match(CORACAO, /\.ca-tirar \.ca-cheio\{animation:ca-encolhe/);
  assert.match(CORACAO, /\.ca-por \.ca-ponto\{animation:ca-faisca/);
  assert.match(CORACAO, /\.ca \.ca-anel,?[^{]*\{animation:none !important\}|\.ca \.ca-ponto,\.ca \.ca-anel\{animation:none !important\}/, 'e com menos movimento fica sem o anel');
});

console.log('\nos ícones animados na barra');
caso('o shuffle desenha as setas, e leva a estrela dourada do inteligente que já tinha', () => {
  assert.match(barra, /desenho=\{\(cor\) => <IconeShuffle estado=\{estadoDoShuffle\(p\.shuffle, p\.shuffleInteligente\)\} cor=\{cor\} \/>\}/);
  assert.match(barra, /estrela=\{p\.shuffleInteligente\}/);
});
caso('o repeat gira, e o "1" vai dentro do laço (já não é um selo no canto)', () => {
  assert.match(barra, /desenho=\{\(cor\) => <IconeRepeat modo=\{p\.repeatMode\} cor=\{cor\} \/>\}/);
  assert.ok(!/marca=\{p\.repeatMode === 'one'/.test(barra));
  assert.match(ICONES, /voltas\.current \+= 1/);
  assert.match(ICONES, /rotate\(\$\{voltas\.current \* 360\}deg\)/);
});
caso('o play/pause é o giro, e a espera continua a ser a ampulheta', () => {
  assert.match(barra, /\{p\.buffering \? <Ionicons name="hourglass-outline" size=\{19\} color="#111117" \/> : <IconePlayPause tocando=\{p\.isPlaying\} \/>\}/);
  assert.match(ICONES, /cor = '#111117'/, 'o símbolo é escuro sobre o metal claro, como o botão sempre foi');
  assert.match(CASCA, /\[data-dt~="ie-play"\]\[data-s="playing"\] \[data-dt~="ie-i1"\]\{ opacity: 0; transform: rotate\(-90deg\) scale\(\.35\); \}/);
  assert.match(CASCA, /\[data-dt~="ie-play"\]\[data-s="paused"\] \[data-dt~="ie-i2"\]\{ opacity: 0; transform: rotate\(90deg\) scale\(\.35\); \}/);
});
caso('o volume desenha os arcos, o Jam abre ondas', () => {
  assert.match(CASCA, /desenho=\{\(cor\) => <IconeVolume volume=\{volume\} cor=\{cor\} \/>\}/);
  assert.match(barra, /desenho=\{\(cor\) => <IconeJam ligada=\{!!jam\} cor=\{cor\} \/>\}/);
  assert.match(CASCA, /\[data-dt~="ie-jam"\]\[data-s="on"\]::after\{ animation: dt-ie-onda 2400ms ease-out 1200ms infinite; \}/);
});
caso('o olho não mudou: já tinha a pálpebra a descer', () => {
  assert.match(barra, /<IndicadorDeVisibilidade discordLigado=\{discordLigado\} onJam=\{onJam\} onAviso=\{onAviso\} \/>/);
});
caso('o primeiro desenho não anima, só as mudanças; o shuffle recomeça o traço a cada estado', () => {
  assert.match(ICONES, /if \(!Object\.is\(inicial\.current, valor\)\) mudou\.current = true;/);
  assert.match(ICONES, /\{\.\.\.\(anima \? \{ 'data-anima': '' \} : \{\}\)\}/);
  assert.match(ICONES, /<svg key=\{estado\} viewBox="0 0 24 24"/);
});

console.log('\no CSS');
caso('só transform, opacidade e traços que se desenham', () => {
  const css = CASCA.slice(CASCA.indexOf('Os ícones da barra do leitor que mudam de estado'), CASCA.indexOf('@keyframes dt-ie-onda'));
  assert.match(css, /--dt-mola: cubic-bezier\(\.34, 1\.56, \.64, 1\)/);
  assert.match(css, /@keyframes dt-ie-desenha\{ from\{ stroke-dashoffset: 1; \} to\{ stroke-dashoffset: 0; \} \}/);
  assert.ok(!/(?<![-\w])(?:left|top|width|height|margin)\s*:[^;]*;[^}]*transition/.test(css.replace(/\{[^}]*position: absolute[^}]*\}/g, '')), 'nenhuma transição de posição ou tamanho');
});
caso('com "menos movimento" ficam os estados, sem o caminho', () => {
  const bloco = CASCA.slice(CASCA.lastIndexOf('prefers-reduced-motion'));
  for (const parte of ['[data-dt~="ie-shuffle"][data-anima] [data-dt~="ie-linha"]', '[data-dt~="ie-jam"]::before', '[data-dt~="ie-jam"]::after',
    '[data-dt~="ie-repeat"] svg', '[data-dt~="ie-um"]', '[data-dt~="ie-i1"]', '[data-dt~="ie-i2"]', '[data-dt~="ie-arco"]', '[data-dt~="ie-corte"]']) {
    assert.ok(bloco.includes(parte), `falta ${parte}`);
  }
});
caso('nada de className nem de backdrop-filter', () => {
  assert.ok(!/className\s*[=:]/.test(ICONES.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(!/backdrop-?[fF]ilter/.test(ICONES));
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
