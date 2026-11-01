/**
 * A gravação da letra (C7, 1/11): no PC, a linha que se canta "grava-se"; no
 * iPhone (o verso da capa, 🔒) a linha fica como era.
 *
 * Lê o código como TEXTO. Correr: node --experimental-strip-types scripts/test-gravacao-da-letra.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

const pc = ler('src/components/LinhaDaLetra.web.tsx');
const iphone = ler('src/components/LinhaDaLetra.tsx');
const vista = ler('src/components/LyricsView.tsx');
const casca = ler('src/desktop/casca.web.tsx');

console.log('\nno PC');
caso('a cópia em metal claro descobre-se durante o tempo da linha, a contar com a velocidade', () => {
  assert.match(pc, /\{\.\.\.marcar\('gravacao'\)\}/);
  assert.match(pc, /luz:\{position:'absolute',left:0,top:0,right:0,color:COR\.metalClaro\}/);
  assert.match(pc, /animationDuration=`\$\{Math\.max\(200,\(fimMs-timeMs\)\/ritmo\)\}ms`/);
  assert.match(pc, /animationDelay=`\$\{-Math\.max\(0,\(p\.positionMs-timeMs\)\/ritmo\)\}ms`/, 'a entrar a meio, com o que já passou');
});
caso('a luz anda à medida do texto, e não da coluna (numa linha curta acabava cedo)', () => {
  assert.match(pc, /<View style=\{\{alignSelf:'flex-start'\}\}>/);
});
caso('a pausa da música pausa a luz; um seek ou uma velocidade nova voltam a acertá-la', () => {
  assert.match(pc, /if\(s\.isPlaying!==a\.isPlaying\)el\.style\.animationPlayState=s\.isPlaying\?'running':'paused';/);
  assert.match(pc, /if\(Math\.abs\(s\.positionMs-a\.positionMs\)>SALTO_MS\|\|s\.playbackRate!==a\.playbackRate\)acertar\(\);/);
});
caso('os tons da maquete: as passadas apagadas, a seguinte mais clara do que elas', () => {
  assert.match(pc, /passada:\{color:COR\.textoFraco,opacity:0\.55\}/);
  assert.match(pc, /ativa:\{color:COR\.metalClaro,opacity:0\.42\}/);
  assert.match(pc, /seguinte:\{color:COR\.metalClaro,opacity:0\.62\}/);
  assert.match(pc, /futura:\{color:COR\.textoFraco,opacity:1\}/);
});
caso('com menos movimento a linha acende inteira de uma vez', () => {
  assert.match(pc, /opacity:ativa&&reduced\?1:cor\.opacity/);
  assert.match(pc, /\{ativa&&!reduced\?<Text ref=\{luz\}/);
  assert.match(casca, /\[data-dt~="gravacao"\]\{ animation: none !important; clip-path: none !important; \}/);
});
caso('a casca tem a regra, sempre linear (a luz acompanha o tempo)', () => {
  assert.match(casca, /\[data-dt~="gravacao"\]\{ clip-path: inset\(0 100% 0 0\); animation-name: dt-gravar; animation-timing-function: linear; animation-fill-mode: both; \}/);
  assert.match(casca, /@keyframes dt-gravar\{ from\{ clip-path: inset\(0 100% 0 0\); \} to\{ clip-path: inset\(0 0 0 0\); \} \}/);
});
caso('a risca do refrão é a da barra, e só na linha onde ele começa', () => {
  assert.match(pc, /const inicioS=usePontoNaBarra\(track,true\);/);
  assert.match(pc, /\{refrao\?<View style=\{styles\.risca\} \/>:null\}/);
  assert.match(vista, /refrao=\{i===linhaDoRefrao\}/);
});

console.log('\nno iPhone e na vista');
caso('o iPhone fica como era: a ativa acende, e sem pedir o refrão', () => {
  assert.match(iphone, /toValue:active\?1:0\.4/);
  assert.ok(!/clip-path|gravacao|usePontoNaBarra|ensureLyrics/.test(iphone));
  assert.match(iphone, /export function useLinhaDoRefrao\(_track:Track,_tempos:readonly number\[\]\):number\{return -1;\}/);
});
caso('a vista dá a cada linha o estado e quando acaba, e a última dura um tempo razoável', () => {
  assert.match(vista, /const estadoDaLinha=\(i:number,ativa:number\):EstadoDaLinha=>i<ativa\?'passada':i===ativa\?'ativa':i===ativa\+1\?'seguinte':'futura';/);
  assert.match(vista, /fimMs=\{tempos\[i\+1\]\?\?line\.timeMs\+ULTIMA_LINHA_MS\}/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
