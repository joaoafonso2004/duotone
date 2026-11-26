/**
 * A letra palavra a palavra (26/11, item 23 do plano): SÓ quando a fonte traz o
 * tempo de cada palavra (LRC "enhanced", `<mm:ss.xx>`). Nas outras letras, tudo
 * exatamente como antes (o João: "só quando a música tiver suporte, senão manter o
 * estado atual").
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeLyricIndex, palavrasAcesas, palavrasDaLinha, parseLrc, proximaPalavraEm } from '../src/lib/lyricsParser.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

caso('uma letra sem tempos de palavra fica exatamente como era', () => {
  const lrc = '[ti:Song]\n[00:12.00]Hello  world\n[00:15.50] Second line \n[00:20.00][00:40.00]Chorus';
  const linhas = parseLrc(lrc);
  assert.deepEqual(linhas, [
    { timeMs: 12000, text: 'Hello  world' },
    { timeMs: 15500, text: 'Second line' },
    { timeMs: 20000, text: 'Chorus' },
    { timeMs: 40000, text: 'Chorus' },
  ]);
  assert.ok(linhas.every((l) => !('palavras' in l)));
  assert.equal(activeLyricIndex(linhas, 16000), 1);
});

caso('com tempos de palavra: as palavras, e o texto sem as marcas', () => {
  const [l] = parseLrc('[00:12.00]<00:12.00>Hello <00:12.40>big <00:12.90>world<00:13.80>');
  assert.equal(l.text, 'Hello big world');
  assert.deepEqual(l.palavras, [
    { timeMs: 12000, text: 'Hello ' }, { timeMs: 12400, text: 'big ' }, { timeMs: 12900, text: 'world' },
  ]);
  assert.equal(l.palavras!.map((p) => p.text).join(''), l.text, 'juntas são a linha');
});

caso('a primeira palavra sem marca começa com a linha; o offset conta', () => {
  const [l] = parseLrc('[offset:+100]\n[00:05.00]Take <00:05.60>me <00:06.10>home');
  assert.equal(l.timeMs, 5100);
  assert.deepEqual(l.palavras!.map((p) => p.timeMs), [5100, 5700, 6200]);
});

caso('marcas que não fazem sentido: a linha como sempre (sem palavras), mas sem as marcas no texto', () => {
  const fora = parseLrc('[00:10.00]<00:10.00>one <00:09.00>two')[0];
  assert.equal(fora.palavras, undefined); assert.equal(fora.text, 'one two');
  const repetida = parseLrc('[00:10.00][00:30.00]<00:10.00>la <00:10.50>la');
  assert.ok(repetida.every((l) => l.palavras === undefined && l.text === 'la la'), 'numa linha repetida os tempos só valiam para uma');
  assert.equal(palavrasDaLinha('<00:10.00>sozinha', 10000), undefined, 'uma palavra só não é palavra a palavra');
});

caso('as acesas e o prazo da seguinte', () => {
  const p = palavrasDaLinha('<00:01.00>a <00:01.50>b <00:02.00>c', 1000)!;
  assert.equal(palavrasAcesas(p, 900), 0);
  assert.equal(palavrasAcesas(p, 1000), 1);
  assert.equal(palavrasAcesas(p, 1700), 2);
  assert.equal(palavrasAcesas(p, 5000), 3);
  assert.equal(proximaPalavraEm(p, 1700), 300);
  assert.equal(proximaPalavraEm(p, 2000), null);
});

caso('no ecrã: só a cantada, e só com as palavras; o relógio é a faixa, sem setInterval', () => {
  const linha = ler('src/components/LinhaDaLetra.tsx');
  assert.match(linha, /active&&palavras&&palavras\.length>1\?<PalavrasDaLetra palavras=\{palavras\} \/>:\(text\|\|'♪'\)/);
  assert.match(ler('src/components/LyricsView.tsx'), /palavras=\{line\.palavras\}/);
  const palavras = ler('src/components/PalavrasDaLetra.tsx');
  assert.doesNotMatch(palavras, /setInterval\(/);
  assert.match(palavras, /s\.positionAt/);
  assert.match(palavras, /setTimeout\(/);
  // Acende inteira: a cor de cada palavra muda de uma vez (nada de luz a avançar dentro dela).
  assert.match(palavras, /style=\{i < acesas \? null : styles\.apagada\}/);
  // O PC mostra a linha como sempre.
  assert.doesNotMatch(ler('src/components/LinhaDaLetra.web.tsx'), /PalavrasDaLetra/);
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);
