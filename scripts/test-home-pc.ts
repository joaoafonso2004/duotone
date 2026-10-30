/**
 * A Home do PC (30/10, passo 6 de `docs/PLANO-ELEVAR-PC.md`): dois cartões de
 * entrada (continuar a ouvir, e a Daily mix), a pesquisa como barra de comando
 * (`Ctrl F`), o Discover daily a dois tons até lhe tocares, e as prateleiras
 * menos usadas atrás de um botão. A conta é pura (`lib/entradasDaHome.ts`); o
 * resto lê o código como TEXTO, como os outros testes do PC.
 *
 * Correr: node --experimental-strip-types scripts/test-home-pc.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entradaDoContinuar, resumoDaMistura, resumoDasOutras } from '../src/lib/entradasDaHome.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const PAGINA = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
const ENTRADAS = ler('src/desktop/EntradasDaHome.web.tsx');
const UI = ler('src/desktop/ui.web.tsx');
const home = PAGINA.slice(PAGINA.indexOf('export function SearchPage('), PAGINA.indexOf('export function SongsPage('));

console.log('\no que os cartões dizem');
caso('a que já toca leva ao leitor; parada, retoma', () => {
  assert.deepEqual(entradaDoContinuar(true), { etiqueta: 'Now playing', botao: 'Open', acao: 'abrir' });
  assert.deepEqual(entradaDoContinuar(false), { etiqueta: 'Continue listening', botao: 'Resume', acao: 'retomar' });
});
caso('a Daily mix diz quantas músicas', () => {
  assert.equal(resumoDaMistura(47), '47 songs · from what you listen to');
  assert.equal(resumoDaMistura(1), '1 song · from what you listen to');
});
caso('o botão das outras prateleiras: os quatro primeiros nomes com conteúdo e um +N', () => {
  const todas = [{ nome: 'Daily mix', quantas: 47 }, { nome: 'Radio', quantas: 3 }, { nome: 'Your genres', quantas: 5 }, { nome: 'Playlists', quantas: 2 },
    { nome: "Friends' favourites", quantas: 9 }, { nome: 'Heavy rotation', quantas: 20 }, { nome: 'Forgotten favourites', quantas: 12 }];
  assert.equal(resumoDasOutras(todas)!.texto, "Daily mix · Radio · Your genres · Playlists  +3");
  assert.equal(resumoDasOutras(todas)!.nomes.length, 7);
});
caso('as vazias não contam, e sem nenhuma com conteúdo não há botão', () => {
  assert.equal(resumoDasOutras([{ nome: 'Radio', quantas: 0 }, { nome: 'Heavy rotation', quantas: 8 }])!.texto, 'Heavy rotation');
  assert.equal(resumoDasOutras([{ nome: 'Radio', quantas: 0 }]), null);
  assert.equal(resumoDasOutras([]), null);
});

console.log('\nos cartões de entrada');
caso('vêm antes de tudo, antes do "Jump back in"', () => {
  const i = home.indexOf('<EntradasDaHome misturaDoDia={misturaDoDiaFaixas} />');
  assert.ok(i > 0 && i < home.indexOf('<VoltarAOuvir />'));
});
caso('o primeiro é a faixa do leitor (a sessão guardada): capa viva, origem, progresso, e abre ou retoma', () => {
  assert.match(ENTRADAS, /usePlayer\(\(s\) => s\.current\)/);
  assert.match(ENTRADAS, /<CapaDuotone uri=\{capaDaFaixa\(atual\)\} viva /);
  assert.match(ENTRADAS, /rotuloDaOrigem\(origem, \{ sugerida: sugeridas\.includes\(chave\), doRadio: doRadio\.includes\(chave\) \}\)/);
  assert.match(ENTRADAS, /if \(e\.acao === 'abrir'\) irPara\(\{ tipo: 'a-tocar' \}\); else void usePlayer\.getState\(\)\.togglePlay\(\);/);
});
caso('o progresso é um componente à parte, o único que lê a posição ao segundo', () => {
  assert.match(ENTRADAS, /function Progresso\(\{ duracaoS \}/);
  assert.match(ENTRADAS, /usePlayer\(\(s\) => s\.positionMs\)/);
  assert.equal((ENTRADAS.match(/s\.positionMs/g) ?? []).length, 1);
});
caso('o segundo é a Daily mix: quatro capas a dois tons, e toca a lista com a origem da prateleira', () => {
  assert.match(ENTRADAS, /faixas\.slice\(0, 4\)/);
  assert.match(ENTRADAS, /leitor\.tocarLista\(\[\.\.\.faixas\], leitor\.shuffle, leitor\.shuffleInteligente, \{ tipo: 'prateleira', nome: 'Daily mix' \}\)/);
  assert.match(ENTRADAS, /if \(faixas\.length < 1\) return null;/);
});
caso('sem faixa nem Daily mix, não há cartões; os dois levam o brilho e levantam-se com o rato', () => {
  assert.match(ENTRADAS, /if \(!temAtual && misturaDoDia\.length < 1\) return null;/);
  assert.equal((ENTRADAS.match(/marcar\('cartao', 'brilho'\)/g) ?? []).length, 2);
});

console.log('\na barra de comando');
caso('a pesquisa é uma pílula com o atalho que já existe (Ctrl+F), e não um atalho novo', () => {
  assert.match(home, /<Field ref=\{input\} pilula atalho="Ctrl F" icon="search"/);
  assert.match(home, /window\.addEventListener\('duotone:focus-search', focus\)/);
  assert.match(UI, /pilula\?: boolean; atalho\?: string;/);
  assert.match(UI, /fieldPilula: \{ height: 44, borderRadius: 22,/);
});
caso('o atalho só se escreve com o campo vazio, e o leitor de ecrã não o lê', () => {
  assert.match(UI, /\{atalho && !rest\.value \? <Text style=\{ui\.fieldAtalho\} accessibilityElementsHidden importantForAccessibility="no">\{atalho\}<\/Text> : null\}/);
});

console.log('\nas prateleiras');
caso('o Discover daily é a dois tons até lhe tocares (a guardada já vem a cores) e leva o brilho', () => {
  assert.match(home, /capa=\{\(t, lado\) => <CapaDuotone uri=\{capaDaFaixa\(t\)\} brilho viva=\{savedKeys\.has\(`\$\{t\.source\}:\$\{t\.sourceId\}`\)\}/);
});
caso('a prateleira desenha a capa como lhe disserem, sem importar o duotone (o duotone importa a ui)', () => {
  assert.match(UI, /capa\?: \(track: Track, lado: number\) => ReactNode;/);
  assert.match(UI, /\{capa \? capa\(t, lado\) : <Artwork track=\{t\} size=\{lado\} \/>\}/);
  assert.ok(!/from '\.\/duotone\.web'/.test(UI), 'ciclo de importações entre a ui e o duotone');
  assert.match(UI, /export function capaDaFaixa\(track: Track\): string \| null/);
});
caso('as sete menos usadas ficam atrás do botão, e as que ficam à vista são as de sempre', () => {
  for (const t of ['Daily mix', 'Radio', 'Your genres', 'Playlists', "Your friends' favourites", 'Heavy rotation', 'Forgotten favourites']) {
    assert.ok(new RegExp(`\\{outras \\? <(?:Shelf|PrateleiraDeMisturas) titulo="${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(home), `${t} devia estar atrás do botão`);
  }
  for (const t of ['Discover daily', 'Rare finds', 'Your styles', 'Decades', 'Listen again']) {
    assert.ok(!new RegExp(`\\{outras \\? <[A-Za-z]+ [^\\n]*titulo="${t}"`).test(home), `${t} devia continuar à vista`);
    assert.ok(home.includes(`titulo="${t}"`), t);
  }
  assert.match(home, /<ShelfDeLancamentos titulo="New releases"/);
});
caso('o botão diz o que há lá dentro, abre e fecha, e a escolha fica entre visitas à Home', () => {
  assert.match(home, /\{outrasPrateleiras \? <Pressable \{\.\.\.marcar\('premir'\)\} accessibilityRole="button" accessibilityState=\{\{ expanded: outras \}\}/);
  assert.match(home, /\{outras \? 'Show fewer shelves' : outrasPrateleiras\.texto\}/);
  assert.match(PAGINA, /let outrasPrateleirasAbertas = false;/);
  assert.match(home, /setOutras\(\(v\) => \{ outrasPrateleirasAbertas = !v; return !v; \}\)/);
});
caso('uma prateleira escondida não esconde uma que só chega mais tarde: o botão conta as que têm conteúdo', () => {
  assert.match(home, /\{ nome: 'Radio', quantas: radios\.length \}/);
  assert.match(home, /\{ nome: 'Daily mix', quantas: misturaDoDiaFaixas\.length \}/);
});
caso('nada de className nem de backdrop-filter', () => {
  assert.ok(!/className\s*[=:]/.test(ENTRADAS.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(!/backdrop-?[fF]ilter/.test(ENTRADAS));
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
