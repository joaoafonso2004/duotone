/**
 * Seguir um amigo ("Listen along") -- src/lib/seguirAmigo.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-seguir-amigo.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decidir, chaveDaFaixa, posicaoProjetada, proximasParaAPresenca,
  AFINACOES_POR_FAIXA, DESISTIR_SEM_FAIXA_MS, DESVIO_GRANDE_MS, DESVIO_MAXIMO_MS, ENTRE_ACERTOS_MS, ESPERA_SEM_FAIXA_MS,
  PROJECAO_MAXIMA_MS, PROXIMAS_NA_PRESENCA,
  type Olhar,
} from '../src/lib/seguirAmigo.ts';

const faixa = (id: string) => ({
  source: 'youtube' as const, sourceId: id, title: id, artist: 'X', artworkUrl: null, durationSeconds: 200,
});
const AGORA = 1_000_000;
const base: Olhar = {
  dele: faixa('a'),
  ondeEle: 60_000,
  semFaixaDesde: null,
  agora: AGORA,
  minha: { chave: 'youtube:a', posicaoMs: 60_500, aTocar: true, pronta: true },
  pausadoPorMim: false,
  ultimoAcerto: 0,
  afinacoes: 0,
};

let falhas = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

caso('a par dele, não se faz nada', () => {
  assert.deepEqual(decidir(base), { tipo: 'nada' });
});

caso('ele mudou de música: toca-se a dele', () => {
  const r = decidir({ ...base, dele: faixa('b') });
  assert.equal(r.tipo, 'tocar');
  assert.equal(r.tipo === 'tocar' && r.faixa.sourceId, 'b');
});

caso('desviado demais, salta-se para onde ele está -- mas não sem parar', () => {
  const longe = { ...base, minha: { ...base.minha, posicaoMs: 60_000 - DESVIO_MAXIMO_MS - 1 } };
  assert.deepEqual(decidir(longe), { tipo: 'acertar', posicaoMs: 60_000, afinacao: true });
  assert.deepEqual(decidir({ ...longe, ultimoAcerto: AGORA - ENTRE_ACERTOS_MS + 1 }), { tipo: 'nada' },
    'saltar de dois em dois segundos é pior do que ir uns segundos atrás');
  assert.deepEqual(decidir({ ...longe, minha: { ...longe.minha, pronta: false } }), { tipo: 'nada' },
    'a carregar, o salto perdia-se: espera-se que soe');
  assert.deepEqual(decidir({ ...longe, ondeEle: null }), { tipo: 'nada' }, 'sem saber onde ele vai, não se salta');
});

caso('a faixa dele sumiu: espera antes de pausar, e muito mais antes de desistir', () => {
  const sem = (ms: number) => ({ ...base, dele: null, ondeEle: null, semFaixaDesde: AGORA - ms });
  assert.deepEqual(decidir(sem(ESPERA_SEM_FAIXA_MS - 1)), { tipo: 'nada' }, 'pode estar a carregar a seguinte');
  assert.deepEqual(decidir(sem(ESPERA_SEM_FAIXA_MS)), { tipo: 'pausar' }, 'ele pausou');
  assert.deepEqual(decidir({ ...sem(ESPERA_SEM_FAIXA_MS), minha: { ...base.minha, aTocar: false } }), { tipo: 'nada' },
    'já parado, não se pausa outra vez');
  assert.deepEqual(decidir(sem(DESISTIR_SEM_FAIXA_MS)), { tipo: 'sair' }, 'fechou a app ou saiu');
});

caso('ele voltou a tocar a mesma: retoma-se', () => {
  assert.deepEqual(decidir({ ...base, minha: { ...base.minha, aTocar: false } }), { tipo: 'retomar' });
});

caso('quem segue pausou à mão: nada se mexe, nem se ele mudar de música', () => {
  const pausado = { ...base, pausadoPorMim: true, minha: { ...base.minha, aTocar: false } };
  assert.deepEqual(decidir(pausado), { tipo: 'nada' });
  assert.deepEqual(decidir({ ...pausado, dele: faixa('b') }), { tipo: 'nada' }, 'uma chamada não pode ser interrompida');
  assert.deepEqual(decidir({ ...pausado, dele: null, semFaixaDesde: AGORA - ESPERA_SEM_FAIXA_MS }), { tipo: 'nada' });
});

caso('a chave é a da fila: fonte e id', () => {
  assert.equal(chaveDaFaixa(faixa('a')), 'youtube:a');
  assert.equal(chaveDaFaixa(null), null);
});

caso('as próximas na presença: poucas, e só o que se desenha', () => {
  const muitas = Array.from({ length: 12 }, (_, i) => ({ ...faixa(`f${i}`), album: 'x', extra: 'nao' }));
  const fora = proximasParaAPresenca(muitas);
  assert.equal(fora.length, PROXIMAS_NA_PRESENCA);
  assert.deepEqual(Object.keys(fora[0]).sort(), ['artist', 'artworkUrl', 'durationSeconds', 'source', 'sourceId', 'title']);
  assert.equal(proximasParaAPresenca([{ source: 'local', sourceId: 'x', title: 'y' }]).length, 0, 'só fontes que se tocam');
});

caso('a ligação: a store não avança nem chama o rádio a seguir alguém', () => {
  const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const tem = (f: string, trecho: string, porque: string) => assert.ok(ler(f).includes(trecho), `${f}: ${porque}`);
  tem('src/state/player.ts', "if (s === 'ended' && seguindoAmigo()) return;", 'o fim de uma música não avança a fila pessoal');
  tem('src/state/player.ts', 'if (ouvirJuntos() || seguindoAmigo()) return false;', 'nem o rádio a estende');
  tem('src/state/ouvirComAmigo.ts', 'useSeguirAmigo.getState().iniciar(', 'sem Jam aberto, segue-se');
  tem('src/components/YouTubePlayerView.tsx', 'ritmoDeQuemSigo() ?? velocidadeNaSessao(', 'anda-se à velocidade dele');
  tem('src/components/YouTubePlayerView.web.tsx', 'ritmoDeQuemSigo() ?? velocidadeNaSessao(', 'anda-se à velocidade dele');
  tem('src/lib/presenceSync.ts', 'aSeguir: proximasParaAPresenca(', 'quem ouve publica as próximas');
  tem('src/components/QueueSheet.tsx', 'if (foraDoTelemovel || seguido) return;', 'o Up next dele é só para ler');
});

// ---- 1/10: o atraso de uns 5 s que não havia no Jam.
caso('um atraso de 2 a 4 s já se corrige (eram 4 s de tolerância, e ficava)', () => {
  const atras = (ms: number) => ({ ...base, minha: { ...base.minha, posicaoMs: 60_000 - ms } });
  assert.deepEqual(decidir(atras(DESVIO_MAXIMO_MS)), { tipo: 'nada' }, 'até 1 s não se mexe');
  assert.deepEqual(decidir(atras(2_500)), { tipo: 'acertar', posicaoMs: 60_000, afinacao: true });
  assert.deepEqual(decidir(atras(DESVIO_GRANDE_MS + 1)), { tipo: 'acertar', posicaoMs: 60_000, afinacao: false });
});

caso('afinações têm teto por música; um salto dele segue-se sempre', () => {
  const gasto = { ...base, afinacoes: AFINACOES_POR_FAIXA };
  assert.deepEqual(decidir({ ...gasto, minha: { ...base.minha, posicaoMs: 58_000 } }), { tipo: 'nada' },
    'uma presença sempre um bocado atrasada não obriga a saltar a música inteira');
  assert.deepEqual(decidir({ ...gasto, ondeEle: 120_000 }), { tipo: 'acertar', posicaoMs: 120_000, afinacao: false },
    'ele arrastou a barra');
});

caso('a posição projeta-se para agora, só a soar e com teto', () => {
  const p = { positionMs: 10_000, positionAt: AGORA - 800, aSoar: true, ritmo: 1 };
  assert.equal(posicaoProjetada(p, AGORA), 10_800);
  assert.equal(posicaoProjetada({ ...p, ritmo: 0.8 }, AGORA), 10_640, 'à velocidade dele');
  assert.equal(posicaoProjetada({ ...p, aSoar: false }, AGORA), 10_000, 'parado não anda');
  assert.equal(posicaoProjetada({ ...p, positionAt: AGORA - 60_000 }, AGORA), 10_000 + PROJECAO_MAXIMA_MS, 'motor calado não anda um minuto');
  assert.equal(posicaoProjetada({ ...p, positionAt: AGORA + 500 }, AGORA), 10_000, 'um relógio para trás não recua');
});

caso('simulado: o primeiro salto chega 2,5 s tarde (PC), e o segundo acerta', () => {
  // Ele vai a 60 s. Um salto custa 2,5 s a soar se o sítio não está carregado
  // e 0,2 s se está (perto de onde já se ia). Tique de 1 s.
  const correr = (desvioMaximo: number) => {
    let agora = AGORA, dele = 60_000, minha = 0, pronta = true, ultimoAcerto = 0, afinacoes = 0, esperaAte = 0;
    for (let t = 0; t < 40; t++) {
      agora += 1_000; dele += 1_000;
      if (pronta) minha += 1_000; else if (agora >= esperaAte) pronta = true;
      const r = decidir({ ...base, agora, ondeEle: dele, ultimoAcerto, afinacoes,
        minha: { ...base.minha, posicaoMs: minha, pronta } });
      if (r.tipo === 'acertar' && Math.abs(minha - dele) > desvioMaximo) {
        const perto = Math.abs(r.posicaoMs - minha) < 10_000;
        minha = r.posicaoMs; pronta = false; esperaAte = agora + (perto ? 200 : 2_500);
        ultimoAcerto = agora; if (r.afinacao) afinacoes++;
      }
    }
    return Math.abs(dele - minha);
  };
  assert.ok(correr(DESVIO_MAXIMO_MS) <= DESVIO_MAXIMO_MS, `fica a menos de 1 s (ficou ${correr(DESVIO_MAXIMO_MS)} ms)`);
});

caso('a ligação: o relógio do Jam e as duas posições projetadas', () => {
  const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(ler('src/state/seguirAmigo.ts'), /posicaoDoAmigo\(dele, horaDoServidor\(\)\)/);
  assert.match(ler('src/state/seguirAmigo.ts'), /posicaoMs: posicaoProjetada\(/);
  assert.match(ler('src/lib/presenceSync.ts'), /positionMs: Math\.round\(posicaoAgoraParaAPresenca\(\)\)/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam`); process.exit(1); }
console.log('\nSeguir um amigo: todos os casos passaram.');
