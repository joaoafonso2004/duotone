/**
 * As linhas da letra sincronizada. No PC, a que se canta acende inteira: a gravação do
 * C7, em que a linha acendia da esquerda para a direita durante o tempo dela, saiu a
 * 1/11 (o João não gostou), e este teste não a deixa voltar. No iPhone (o verso da capa,
 * 🔒) a linha fica como era.
 *
 * Lê o código como TEXTO. Correr: node --experimental-strip-types scripts/test-linhas-da-letra.ts
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
caso('a linha que se canta acende inteira, de uma vez', () => {
  assert.match(pc, /ativa:\{color:COR\.metalClaro,opacity:1\}/);
  const codigo = pc.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/clip-path|gravacao|animationDuration|animationDelay|animationPlayState|usePlayer|fimMs/.test(codigo), 'sem a luz a avançar');
});
caso('a casca já não tem a gravação, e a troca entre linhas é suave', () => {
  assert.ok(!/gravacao|dt-gravar/.test(casca));
  assert.match(casca, /\[data-dt~="linha-da-letra"\]\{ transition: color 220ms var\(--dt-curva\), opacity 220ms var\(--dt-curva\); \}/);
  assert.match(casca, /\[data-dt~="linha-da-letra"\]\{ transition: none !important; \}/);
});
caso('as passadas apagadas, a seguinte mais clara do que elas', () => {
  assert.match(pc, /passada:\{color:COR\.textoFraco,opacity:0\.55\}/);
  assert.match(pc, /seguinte:\{color:COR\.metalClaro,opacity:0\.62\}/);
  assert.match(pc, /futura:\{color:COR\.textoFraco,opacity:1\}/);
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
caso('a vista dá a cada linha o estado, e já não diz quando ela acaba', () => {
  assert.match(vista, /const estadoDaLinha=\(i:number,ativa:number\):EstadoDaLinha=>i<ativa\?'passada':i===ativa\?'ativa':i===ativa\+1\?'seguinte':'futura';/);
  assert.ok(!/fimMs|ULTIMA_LINHA_MS/.test(vista));
  assert.ok(!/fimMs/.test(iphone));
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
