/**
 * Quando é que uma música conta como ouvida -- src/lib/contagemDeEscuta.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-contagem-de-escuta.ts
 */
import assert from 'node:assert/strict';
import {
  avancarEscuta, LIMIAR_SEM_DURACAO_MS, limiarDaEscuta, novaEscuta, TETO_DO_LIMIAR_MS,
  type Escuta,
} from '../src/lib/contagemDeEscuta.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const MIN = 60_000;

/**
 * Toca de `de` até `ate` em passos de `passo` ms, com o relógio a andar ao
 * mesmo ritmo. Devolve a escuta e quantas vezes disse "conta agora".
 */
function tocar(e: Escuta, de: number, ate: number, opcoes: {
  passo?: number; ritmo?: number; relogio?: { t: number }; aTocar?: boolean;
} = {}): { escuta: Escuta; contagens: number } {
  const passo = opcoes.passo ?? 1000;
  const ritmo = opcoes.ritmo ?? 1;
  const relogio = opcoes.relogio ?? { t: 1_000_000 };
  let contagens = 0;
  for (let p = de; p <= ate; p += passo) {
    const r = avancarEscuta(e, { posicaoMs: p, instante: relogio.t, ritmo, aTocar: opcoes.aTocar ?? true });
    e = r.escuta;
    if (r.contar) contagens++;
    relogio.t += passo / ritmo;
  }
  return { escuta: e, contagens };
}

console.log('\nlimiar');
caso('metade de uma música normal', () => {
  assert.equal(limiarDaEscuta(200_000), 100_000);
});
caso('quatro minutos numa faixa longa, e não metade', () => {
  assert.equal(limiarDaEscuta(20 * MIN), TETO_DO_LIMIAR_MS);
});
caso('sem duração conta ao fim de meio minuto', () => {
  assert.equal(limiarDaEscuta(null), LIMIAR_SEM_DURACAO_MS);
  assert.equal(limiarDaEscuta(0), LIMIAR_SEM_DURACAO_MS);
  assert.equal(limiarDaEscuta(Number.NaN), LIMIAR_SEM_DURACAO_MS);
});

console.log('\nouvir');
caso('um skip aos três segundos não conta', () => {
  const { contagens } = tocar(novaEscuta('yt:a', 200_000), 0, 3_000);
  assert.equal(contagens, 0);
});
caso('a meio de uma de 3:20 conta, uma vez', () => {
  const r = tocar(novaEscuta('yt:a', 200_000), 0, 99_000);
  assert.equal(r.contagens, 0, 'aos 99 s ainda não');
  const r2 = tocar(r.escuta, 100_000, 200_000, { relogio: { t: 2_000_000 } });
  assert.equal(r2.contagens, 1, 'passa a contar e não volta a contar até ao fim');
});
caso('um mix de 20 minutos conta aos quatro', () => {
  const { contagens, escuta } = tocar(novaEscuta('yt:mix', 20 * MIN), 0, 4 * MIN);
  assert.equal(contagens, 1);
  assert.ok(escuta.contada);
});
caso('arrastar a barra até ao fim não é ouvir', () => {
  let e = tocar(novaEscuta('yt:a', 200_000), 0, 5_000).escuta;
  // Um salto de 5 s para 190 s em meio segundo de relógio.
  const r = avancarEscuta(e, { posicaoMs: 190_000, instante: (e.instante ?? 0) + 500, ritmo: 1, aTocar: true });
  assert.equal(r.contar, false);
  assert.ok(r.escuta.ouvidoMs < 10_000, `ouvido ${r.escuta.ouvidoMs}`);
  e = r.escuta;
  // E os 10 s até ao fim também não chegam.
  assert.equal(tocar(e, 191_000, 200_000, { relogio: { t: (e.instante ?? 0) + 1000 } }).contagens, 0);
});
caso('em pausa a posição não conta', () => {
  const { contagens, escuta } = tocar(novaEscuta('yt:a', 200_000), 0, 150_000, { aTocar: false });
  assert.equal(contagens, 0);
  assert.equal(escuta.ouvidoMs, 0);
});
caso('a 2x conta pelo que se ouviu da música, não pelo relógio', () => {
  const { contagens } = tocar(novaEscuta('yt:a', 200_000), 0, 110_000, { ritmo: 2 });
  assert.equal(contagens, 1, 'os 100 s da faixa passam em 50 s de relógio e contam');
});
caso('com a janela escondida as leituras espaçam, e contam na mesma', () => {
  // O Chromium estrangula os temporizadores: uma leitura por minuto.
  const { contagens } = tocar(novaEscuta('yt:a', 200_000), 0, 180_000, { passo: MIN });
  assert.equal(contagens, 1);
});
caso('a primeira leitura só serve de ponto de partida', () => {
  // Uma leitura atrasada do motor anterior, a meio da faixa velha.
  const r = avancarEscuta(novaEscuta('yt:b', 200_000), { posicaoMs: 170_000, instante: 5_000, ritmo: 1, aTocar: true });
  assert.equal(r.escuta.ouvidoMs, 0);
  assert.equal(r.contar, false);
});

console.log('\nescutas que não se viram começar');
caso('o handoff a 60% já vem contado e não conta outra vez', () => {
  const e = novaEscuta('yt:a', 200_000, 120_000);
  assert.ok(e.contada);
  assert.equal(tocar(e, 120_000, 200_000).contagens, 0);
});
caso('o handoff a 30% conta quando chega a metade', () => {
  const { contagens } = tocar(novaEscuta('yt:a', 200_000, 60_000), 60_000, 100_000);
  assert.equal(contagens, 1);
});
caso('a duração que chega depois refaz o limiar', () => {
  let e = novaEscuta('yt:a', null);
  // Com o motor a dizer 10 min, o limiar passa de 30 s para 4 min.
  const r = avancarEscuta(e, { posicaoMs: 0, instante: 0, ritmo: 1, aTocar: true, duracaoMs: 10 * MIN });
  e = r.escuta;
  assert.equal(e.duracaoMs, 10 * MIN);
  assert.equal(tocar(e, 1000, 60_000, { relogio: { t: 1000 } }).contagens, 0, 'aos 60 s ainda não');
});

console.log('\nouvir outra vez');
caso('o repeat de uma faixa conta cada volta', () => {
  const relogio = { t: 0 };
  let r = tocar(novaEscuta('yt:a', 200_000), 0, 200_000, { relogio });
  assert.equal(r.contagens, 1);
  // seek(0) do repeat: a posição cai para o início.
  const r2 = tocar(r.escuta, 0, 200_000, { relogio });
  assert.equal(r2.contagens, 1, 'a segunda volta conta');
});
caso('voltar ao início antes de contar não apaga o que se ouviu', () => {
  const relogio = { t: 0 };
  const r = tocar(novaEscuta('yt:a', 200_000), 0, 80_000, { relogio });
  const r2 = tocar(r.escuta, 0, 25_000, { relogio });
  assert.equal(r2.contagens, 1, '80 s + 25 s passam dos 100');
});
caso('recuar a meio depois de contar não é ouvir outra vez', () => {
  const relogio = { t: 0 };
  const r = tocar(novaEscuta('yt:a', 200_000), 0, 150_000, { relogio });
  assert.equal(r.contagens, 1);
  const r2 = tocar(r.escuta, 60_000, 200_000, { relogio });
  assert.equal(r2.contagens, 0);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
