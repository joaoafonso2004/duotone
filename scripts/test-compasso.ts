/**
 * O relógio musical (S3 da auditoria de 31/10): as barrinhas no andamento da música.
 * As contas são puras (`lib/compasso.ts`), e geram-se ataques a fingir com o erro
 * real do detetor do PC (30 fotogramas por segundo, batidas que falham, ataques a
 * mais). A ligação lê-se como TEXTO.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-compasso.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  andamentoDosAtaques, BATIDAS_DAS_BARRAS, COERENCIA_MINIMA, compassoDoRitmo, duracoesDasBarras, MINIMO_DE_ATAQUES, msDoCompasso,
} from '../src/lib/compasso.ts';
import type { Ritmo } from '../src/lib/ritmo.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/** Um gerador com semente: o teste dá sempre o mesmo. */
function sorte(semente: number): () => number {
  let x = semente;
  return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
}
/** Como o detetor os dá: arredondados aos fotogramas de 30 por segundo. */
const noFotograma = (t: number) => Math.ceil(t / (1000 / 30)) * (1000 / 30);

function ataques(bpm: number, { n = 64, falham = 0.15, aMais = 0.1, cadaTempos = 1, semente = 7 } = {}): number[] {
  const s = sorte(semente);
  const periodo = (60_000 / bpm) * cadaTempos;
  const lista: number[] = [];
  for (let i = 0; lista.length < n; i++) {
    if (s() >= falham) lista.push(noFotograma(1000 + i * periodo));
    if (s() < aMais) lista.push(noFotograma(1000 + (i + s()) * periodo));
  }
  return lista.sort((a, b) => a - b);
}

console.log('\nas barrinhas');
caso('um, dois e um tempos', () => {
  assert.deepEqual([...BATIDAS_DAS_BARRAS], [1, 2, 1]);
  assert.deepEqual(duracoesDasBarras(120), [500, 1000, 500]);
  assert.deepEqual(duracoesDasBarras(82), [732, 1463, 732]);
});
caso('sem andamento fica o ciclo de sempre', () => {
  assert.equal(duracoesDasBarras(null), null);
  assert.equal(duracoesDasBarras(undefined), null);
  assert.equal(duracoesDasBarras(0), null);
});
caso('um compasso são quatro tempos', () => {
  assert.equal(msDoCompasso(120), 2000);
  assert.equal(msDoCompasso(124), 1935);
});

console.log('\no andamento do iPhone: a análise do AutoMix');
const ritmo = (bpm: number, confianca: number, estavel?: boolean) => ({ bpm, confianca, estavel }) as unknown as Ritmo;
caso('a janela mais segura das duas, com a velocidade de reprodução', () => {
  assert.deepEqual(compassoDoRitmo({ inicio: ritmo(120, 3.5), fim: ritmo(121, 4) }), { bpm: 121, confianca: 4, fonte: 'analise' });
  assert.equal(compassoDoRitmo({ inicio: ritmo(120, 3.5), fim: null }, 1.5)!.bpm, 180);
});
caso('a mesma porta do AutoMix: sem confiança não há andamento', () => {
  assert.equal(compassoDoRitmo({ inicio: ritmo(120, 1.5), fim: ritmo(90, 2) }), null);
  assert.equal(compassoDoRitmo({ inicio: ritmo(120, 2.5, false), fim: null }), null);
  assert.equal(compassoDoRitmo({ inicio: ritmo(120, 2.5, true), fim: null })!.bpm, 120);
});
caso('uma faixa por analisar não tem andamento', () => {
  assert.equal(compassoDoRitmo(null), null);
  assert.equal(compassoDoRitmo({ inicio: null, fim: null }), null);
});

console.log('\no andamento do PC: as batidas da captura');
caso('acerta com o erro do detetor, batidas que falham e ataques a mais', () => {
  for (const bpm of [78, 92, 104, 124, 128, 140, 174]) {
    for (const semente of [1, 2, 3]) {
      const r = andamentoDosAtaques(ataques(bpm, { semente }));
      assert.ok(r, `${bpm} BPM não deu nada (semente ${semente})`);
      assert.ok(Math.abs(r!.bpm - bpm) <= 1, `${bpm} BPM deu ${r!.bpm}`);
      assert.ok(r!.confianca >= COERENCIA_MINIMA, String(r!.confianca));
    }
  }
});
caso('um ataque em cada dois tempos dá o andamento, mesmo abaixo do mínimo', () => {
  // A 130 BPM, ataques de dois em dois tempos são 65 BPM: fora da grelha, fica o dobro.
  const r = andamentoDosAtaques(ataques(130, { cadaTempos: 2 }));
  assert.ok(r && Math.abs(r.bpm - 130) <= 1, String(r?.bpm));
});
caso('um divisor não ganha ao próprio: 90 fica 90, e não 180', () => {
  const r = andamentoDosAtaques(ataques(90));
  assert.ok(r && Math.abs(r.bpm - 90) <= 1, String(r?.bpm));
});
caso('o dobro a sério também não vira metade: 160 fica 160', () => {
  const r = andamentoDosAtaques(ataques(160));
  assert.ok(r && Math.abs(r.bpm - 160) <= 1, String(r?.bpm));
});
caso('sem grelha não inventa: ataques ao calhas dão null', () => {
  for (const semente of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const s = sorte(semente);
    let t = 0;
    const lista = Array.from({ length: 64 }, () => (t += 150 + s() * 800));
    assert.equal(andamentoDosAtaques(lista), null, `semente ${semente}`);
  }
});
caso('poucos ataques não chegam', () => {
  assert.equal(andamentoDosAtaques(ataques(120, { n: MINIMO_DE_ATAQUES - 1, falham: 0, aMais: 0 })), null);
  assert.ok(andamentoDosAtaques(ataques(120, { n: MINIMO_DE_ATAQUES, falham: 0, aMais: 0 })));
});

console.log('\no iPhone');
const barras = ler('src/components/BarrasDaFaixa.tsx');
caso('as barrinhas leem a duração do andamento, e recomeçam quando ele muda', () => {
  assert.match(barras, /const duracoes = useMemo\(\(\) => duracoesDasBarras\(bpm\) \?\? BARRAS\.map\(\(b\) => b\.duracaoMs\), \[bpm\]\);/);
  assert.match(barras, /duration: duracoes\[i\], easing: Easing\.linear, useNativeDriver: true,/);
  assert.match(barras, /\}, \[anda, reduzido, fases, duracoes\]\);/);
});
caso('continuam a só andar à vista, e paradas com menos movimento', () => {
  assert.match(barras, /const anda = onda && aVista && !reduzido;/);
  assert.match(barras, /if \(reduzido\) \{ fases\.forEach\(\(f, i\) => f\.setValue\(FASES_PARADAS\[i\]\)\); return; \}/);
});
caso('não há análise nova: só se lê o que o AutoMix já analisou', () => {
  const gancho = ler('src/hooks/useCompasso.ts');
  assert.match(gancho, /compassoDoRitmo\(ritmoGuardado\(id\), velocidade\)/);
  assert.ok(!/analisarRitmo/.test(gancho));
});
caso('um ritmo novo chega a quem ouve, e o que está guardado lê-se uma vez', () => {
  const guardado = ler('src/lib/ritmoGuardado.ts');
  assert.match(guardado, /gravar\(g\);\n\s+avisar\(\);/);
  assert.match(guardado, /if \(!memoria\) setTimeout\(\(\) => \{ void ler\(\)\.then\(avisar\); \}, 1500\);/);
});

console.log('\no PC');
const casca = ler('src/desktop/casca.web.tsx');
caso('as barrinhas das listas leem as variáveis, e sem elas são os 900 ms de sempre', () => {
  assert.match(casca, /\[data-dt~="barra"\]\{ animation: dt-pular var\(--dt-barra-1, 900ms\) ease-in-out infinite; \}/);
  assert.match(casca, /:nth-child\(2\)\{ animation-duration: var\(--dt-barra-2, 900ms\); animation-delay: calc\(var\(--dt-barra-2, 900ms\) \/ 6\); \}/);
  assert.match(casca, /:nth-child\(3\)\{ animation-duration: var\(--dt-barra-3, 900ms\); animation-delay: calc\(var\(--dt-barra-3, 900ms\) \/ 3\); \}/);
});
caso('a cor do Now Playing troca num compasso, e sem ele nos 700 ms de sempre', () => {
  assert.match(casca, /\[data-dt~="np-fundo"\]\{ animation: dt-np-fundo var\(--dt-compasso, 700ms\) var\(--dt-curva\) both; \}/);
  const fundo = ler('src/desktop/FundoDaCapa.web.tsx');
  assert.match(fundo, /const trocaMs = bpm \? msDoCompasso\(bpm\) : 700;/);
  assert.match(fundo, /setCamadas\(\(c\) => c\.slice\(-1\)\), trocaMs \+ 200\);/);
});
caso('uma peça só escreve as variáveis, e tira-as sem andamento', () => {
  const peca = ler('src/desktop/CompassoNoCss.web.tsx');
  assert.match(peca, /raiz\.removeProperty\(nome\)/);
  assert.match(peca, /raiz\.removeProperty\('--dt-compasso'\)/);
  assert.match(ler('src/navigation/RootNavigator.web.tsx'), /<CompassoNoCss\/>/);
});
caso('o andamento sai dos ataques do detetor, sem mexer nos limiares nem noutra análise', () => {
  const beat = ler('src/desktop/glitch/beat.web.ts');
  assert.match(beat, /ataques\.push\(agoraMs\);/);
  assert.match(beat, /andamento: \(\) => andamentoDosAtaques\(ataques\),/);
  assert.match(beat, /const limiar = media \+ 1\.6 \* desvio \+ 2e-4;/);
  assert.match(ler('src/desktop/glitch/GlitchArtwork.web.tsx'), /if \(agora - ultimoAndamento > MEDIR_ANDAMENTO_CADA_MS\) \{/);
});
caso('guarda-se por música no aparelho, à velocidade normal, e uma medida só troca outra se for melhor', () => {
  const estado = ler('src/state/compasso.web.ts');
  assert.match(estado, /AsyncStorage\.setItem\(CHAVE, /);
  assert.ok(!/supabase/i.test(estado), 'nem um pedido');
  assert.match(estado, /medida\.bpm \/ \(playbackRate \|\| 1\)/);
  assert.match(estado, /if \(ja && medida\.confianca < ja\.c \+ MARGEM\) return;/);
});
caso('nenhuma linha de tabela ouve a música que toca por causa disto', () => {
  const ui = ler('src/desktop/ui.web.tsx');
  assert.ok(!/useCompasso/.test(ui));
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
