/**
 * O AutoMix -- src/lib/automix.ts (o plano da passagem) e as constantes que o
 * Swift tem de partilhar com o src/lib/ritmo.ts.
 *
 * node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-automix.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {
  CORTE_DB, descreverPlano, deveAgendar, duracaoDaPassagem, estadoDaPassagem, ganhosComPassagem, impedimentoDoAutomix,
  noInstante, planoDoAutomix, preparacaoDaCurva, razaoDosAndamentos, SUAVE_POR_OMISSAO_S, type PlanoDoAutomix,
} from '../src/lib/automix.ts';
import { AMOSTRAS_POR_QUADRO, CHAO_DB, CORTE_DOS_AGUDOS_HZ, CORTE_DOS_GRAVES_HZ, type Ritmo } from '../src/lib/ritmo.ts';
import { GANHO_MAXIMO } from '../src/lib/equalizer.ts';

function t(nome: string, f: () => void) {
  f();
  console.log(`  ok - ${nome}`);
}

/** Um ritmo com tempos fortes de `desde` a `ate`, de compasso em compasso. */
function ritmo(bpm: number, desde: number, ate: number, somS: number, confianca = 10, batidaS?: number): Ritmo {
  const periodoS = 60 / bpm;
  const temposFortesS: number[] = [];
  for (let x = desde; x <= ate; x += periodoS * 4) temposFortesS.push(x);
  return { bpm, periodoS, confianca, temposFortesS, somS, ...(batidaS != null ? { batidaS } : {}) };
}

// A que sai: 200 s, a música acaba aos 197 s; janela do fim desde os 155 s.
const sai140 = ritmo(140, 155.2, 197, 197);
const entra140 = ritmo(140, 0.35, 40, 0.3);
const base = { fimMusicalS: 197, duracaoSaiS: 200, suaveS: 6 };

t('andamentos iguais: na batida, 4 compassos (26/10: 8 soavam a crossfade), a que entra no primeiro tempo forte', () => {
  const p = planoDoAutomix({ sai: sai140, entra: entra140, ...base })!;
  assert.equal(p.tipo, 'batida');
  const compasso = (60 / 140) * 4;
  assert.ok(Math.abs(p.duracaoS - compasso * 4) < 1e-9);
  assert.equal(p.entraEmS, 0.35);
  // Começa num tempo forte da que sai, e acaba antes do fim da música.
  assert.ok(sai140.temposFortesS.includes(p.inicioS));
  assert.ok(p.inicioS + p.duracaoS <= 197 - 0.1);
  // E é o ÚLTIMO em que cabe: o seguinte já passava do fim.
  assert.ok(p.inicioS + compasso + p.duracaoS > 197 - 0.1);
});

t('um pouco de diferença: a passagem encurta para as batidas não se desencontrarem', () => {
  const p = planoDoAutomix({ sai: sai140, entra: ritmo(141.5, 0.35, 40, 0.3), ...base })!;
  assert.equal(p.tipo, 'batida');
  assert.ok(Math.abs(p.duracaoS - (60 / 140) * 4 * 2) < 1e-9, `${p.duracaoS}`);
});

t('o dobro e a metade contam como o mesmo andamento', () => {
  assert.ok(Math.abs(razaoDosAndamentos(140, 70) - 1) < 1e-9);
  assert.ok(Math.abs(razaoDosAndamentos(80, 160) - 1) < 1e-9);
  assert.equal(planoDoAutomix({ sai: sai140, entra: ritmo(70, 0.35, 40, 0.3), ...base })!.tipo, 'batida');
});

t('andamentos que não batem, as duas com batida até ao fim: corte no "um" (26/10)', () => {
  const p = planoDoAutomix({ sai: sai140, entra: ritmo(120, 0.35, 40, 0.3), ...base })!;
  assert.equal(p.tipo, 'corte');
  // No último tempo forte da que sai, e a que entra no primeiro tempo forte dela.
  assert.ok(sai140.temposFortesS.includes(p.inicioS));
  assert.ok(p.inicioS > 196.9 - (60 / 140) * 4 && p.inicioS <= 196.9, `${p.inicioS}`);
  assert.equal(p.entraEmS, 0.35);
  // Sai numa batida (0,3 a 0,6 s); a que sai perde os graves nos 2 s antes.
  assert.ok(p.duracaoS >= 0.3 && p.duracaoS <= 0.6);
  assert.equal(preparacaoDaCurva(p.curva), 2);
  assert.match(p.motivo, /different tempos: cut on the downbeat/);
});

t('sem batida clara numa das duas: suave', () => {
  assert.equal(planoDoAutomix({ sai: sai140, entra: ritmo(140, 0.35, 40, 0.3, 2), ...base })!.tipo, 'suave');
  const p = planoDoAutomix({ sai: ritmo(140, 155.2, 197, 197, 2), entra: entra140, ...base })!;
  assert.equal(p.tipo, 'suave');
  // Sem batida na que sai, começa à conta certa, sem procurar tempo forte, e
  // dura no máximo 3 s mesmo com o crossfade a 6 (26/10).
  assert.equal(p.duracaoS, 3);
  assert.equal(p.inicioS, 194);
});

t('uma intro longa sem batida: por cima, os últimos 8 s dela, e a batida dela cai na troca', () => {
  const p = planoDoAutomix({ sai: sai140, entra: ritmo(140, 12.3, 50, 0.4), ...base })!;
  assert.equal(p.tipo, 'por-cima');
  assert.ok(Math.abs(p.entraEmS - (12.3 - 8)) < 1e-9, `${p.entraEmS}`);
  // A batida da que entra (12,3 s nela) cai num tempo forte da que sai.
  const troca = p.inicioS + (12.3 - p.entraEmS);
  assert.ok(sai140.temposFortesS.some((x) => Math.abs(x - troca) < 1e-9), `${troca}`);
});

t('o fim da música vem da cauda quando acaba antes do que o ritmo viu', () => {
  const p = planoDoAutomix({ sai: sai140, entra: entra140, ...base, fimMusicalS: 190 })!;
  assert.ok(p.inicioS + p.duracaoS <= 190 - 0.1);
});

t('sem análise de uma das duas: sem plano (fica o crossfade de sempre)', () => {
  assert.equal(planoDoAutomix({ sai: null, entra: entra140, ...base }), null);
  assert.equal(planoDoAutomix({ sai: sai140, entra: null, ...base }), null);
});

t('nunca antes de meio da música', () => {
  // Uma faixa de 8 s não tem compassos para uma passagem na batida depois de
  // meio; fica um corte, e mesmo a preparação dele não começa antes de meio.
  const curta = ritmo(140, 1, 7, 7);
  const c = planoDoAutomix({ sai: curta, entra: entra140, fimMusicalS: 7, duracaoSaiS: 8, suaveS: 6 })!;
  assert.equal(c.tipo, 'corte');
  assert.ok(c.inicioS - preparacaoDaCurva(c.curva) >= 4);
  // Com 4 s não há nada que caiba.
  assert.equal(planoDoAutomix({ sai: ritmo(140, 0.2, 3.9, 3.9), entra: entra140, fimMusicalS: 3.9, duracaoSaiS: 4, suaveS: 6 }), null);
  // Uma de 20 s ainda leva 2 compassos na batida, depois de meio.
  const p = planoDoAutomix({ sai: ritmo(140, 1, 18, 18), entra: entra140, fimMusicalS: 18, duracaoSaiS: 20, suaveS: 9 })!;
  assert.ok(p.inicioS >= 10 && p.inicioS + p.duracaoS <= 17.9);
});

// ------------------------------------------------ as passagens de DJ (26/10)

/** A que sai com a batida a acabar em `batidaS` (o fim de um compasso) e o som aos 197 s. */
const saiCom = (bpm: number, batidaS: number) => {
  const r = ritmo(bpm, 155.2, 197, 197, 10);
  const fortes = r.temposFortesS;
  // O fim da batida é um tempo forte da grelha, como o `ritmo.ts` o devolve.
  const fim = fortes.reduce((m, x) => (Math.abs(x - batidaS) < Math.abs(m - batidaS) ? x : m), fortes[0]);
  return { ...r, batidaS: fim };
};

t('por cima: a intro da que entra (sem batida) soa por baixo, e a batida dela cai onde a da outra acaba', () => {
  const sai = saiCom(128, 196);
  const entra = ritmo(100, 14.2, 50, 0.2, 10, 14.2);
  const p = planoDoAutomix({ sai, entra, ...base })!;
  assert.equal(p.tipo, 'por-cima');
  assert.ok(Math.abs(p.inicioS + (14.2 - p.entraEmS) - sai.batidaS) < 1e-9, 'a batida da que entra cai na troca');
  assert.ok(Math.abs(p.entraEmS - (14.2 - 8)) < 1e-9, 'dos 14 s de intro, os últimos 8');
  assert.match(p.motivo, /next intro has no beat/);
});

t('na cauda: a batida da que entra começa onde a da outra acaba, e a cauda desvanece até 4 s', () => {
  const sai = saiCom(128, 185);
  const p = planoDoAutomix({ sai, entra: ritmo(100, 0.4, 40, 0.3, 10, 0.4), ...base })!;
  assert.equal(p.tipo, 'cauda');
  assert.equal(p.inicioS, sai.batidaS);
  assert.equal(p.entraEmS, 0.4);
  assert.equal(p.duracaoS, 4);
});

t('na batida, a passagem acaba onde a batida da que sai acaba (o fim da frase)', () => {
  const sai = saiCom(140, 190);
  const p = planoDoAutomix({ sai, entra: entra140, ...base })!;
  assert.equal(p.tipo, 'batida');
  assert.ok(Math.abs(p.inicioS + p.duracaoS - sai.batidaS) < 1e-9, `${p.inicioS + p.duracaoS} vs ${sai.batidaS}`);
});

/** Todas as passagens que o planeador sabe fazer, para as regras de DJ. */
const todas: PlanoDoAutomix[] = [
  planoDoAutomix({ sai: sai140, entra: entra140, ...base })!,
  planoDoAutomix({ sai: saiCom(128, 196), entra: ritmo(100, 14.2, 50, 0.2, 10, 14.2), ...base })!,
  planoDoAutomix({ sai: saiCom(128, 185), entra: ritmo(100, 0.4, 40, 0.3, 10, 0.4), ...base })!,
  planoDoAutomix({ sai: sai140, entra: ritmo(120, 0.35, 40, 0.3), ...base })!,
  planoDoAutomix({ sai: sai140, entra: ritmo(140, 0.35, 40, 0.3, 2), ...base })!,
];

t('há uma de cada tipo', () => {
  assert.deepEqual(todas.map((p) => p.tipo), ['batida', 'por-cima', 'cauda', 'corte', 'suave']);
});

t('nunca duas linhas de baixo cheias ao mesmo tempo, em passagem nenhuma', () => {
  for (const p of todas) {
    for (let t = -preparacaoDaCurva(p.curva); t <= p.duracaoS; t += 0.01) {
      const e = estadoDaPassagem(p.curva, t);
      const duas = e.volSai > 0.3 && e.volEntra > 0.3 && e.gravesSai > -6 && e.gravesEntra > -6;
      // Antes do instante marcado a que entra ainda não toca.
      assert.ok(t < 0 || !duas, `${p.tipo} aos ${t.toFixed(2)} s: ${JSON.stringify(e)}`);
    }
  }
});

t('sem buraco: a potência das duas juntas nunca cai abaixo de metade', () => {
  for (const p of todas) {
    for (let t = 0; t <= p.duracaoS; t += 0.01) {
      const e = estadoDaPassagem(p.curva, t);
      assert.ok(e.volSai ** 2 + e.volEntra ** 2 >= 0.5, `${p.tipo} aos ${t.toFixed(2)} s: ${e.volSai} + ${e.volEntra}`);
    }
  }
});

t('no fim de cada passagem: a que sai calada e sem graves, a que entra cheia e sem cortes', () => {
  for (const p of todas) {
    const e = estadoDaPassagem(p.curva, p.duracaoS);
    assert.equal(e.volSai, 0, p.tipo);
    assert.equal(e.volEntra, 1, p.tipo);
    assert.equal(e.gravesEntra, 0, p.tipo);
    assert.equal(e.mediosEntra, 0, p.tipo);
    assert.equal(e.agudosEntra, 0, p.tipo);
    assert.ok(e.gravesSai <= -14, `${p.tipo}: ${e.gravesSai}`);
  }
});

t('o filtro de DJ: a que sai fecha (graves e médios a sair) e a que entra abre, em todas (26/10)', () => {
  for (const p of todas) {
    // A que sai acaba mais fina do que começou, nos graves e nos médios.
    const fim = estadoDaPassagem(p.curva, p.duracaoS);
    assert.ok(fim.mediosSai <= -10, `${p.tipo}: médios da que sai ${fim.mediosSai}`);
    // A que entra, se começa a meio volume, começa abafada ou sem graves -- e
    // nunca fica com um corte no fim.
    const inicio = estadoDaPassagem(p.curva, 0);
    if (inicio.volEntra < 0.9) assert.ok(inicio.agudosEntra <= -10 || inicio.gravesEntra <= -14, p.tipo);
  }
  // Nenhuma dura o que durava um crossfade longo.
  for (const p of todas) assert.ok(p.duracaoS <= 12, `${p.tipo}: ${p.duracaoS} s`);
});

t('a curva entre os pontos, e fora deles o extremo', () => {
  const c = [[0, 0], [2, 1], [4, 1]] as const;
  assert.equal(noInstante(c, -1), 0);
  assert.equal(noInstante(c, 1), 0.5);
  assert.equal(noInstante(c, 3), 1);
  assert.equal(noInstante(c, 9), 1);
  assert.equal(noInstante([], 1), 0);
});

t('os graves, os médios e os agudos vão às bandas certas do equalizador, sem passar do limite', () => {
  assert.equal(CORTE_DB, -GANHO_MAXIMO);
  const g = ganhosComPassagem([3, 0, 0, 0, 0, 0, 0, 0, 0, 0], -20, -10, -12);
  assert.deepEqual(g, [-17, -10, -7, -10, -7, -3, -2.4, -4.8, -8.4, -12]);
  assert.ok(ganhosComPassagem(Array(10).fill(-15), -20, -20, -20).every((v) => v >= -20));
  assert.deepEqual(ganhosComPassagem([1, 2], 0, 0, 0), [1, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
});

t('agendar só nos três segundos antes, e nunca em cima da hora', () => {
  const p = planoDoAutomix({ sai: sai140, entra: entra140, ...base })!;
  assert.equal(deveAgendar(p, p.inicioS - 5), false);
  assert.equal(deveAgendar(p, p.inicioS - 2.5), true);
  assert.equal(deveAgendar(p, p.inicioS - 0.2), false);
  assert.equal(deveAgendar(p, p.inicioS + 1), false);
});

t('a duração da passagem: com AutoMix e o crossfade desligado, 6 s', () => {
  assert.equal(duracaoDaPassagem({ automix: false, crossfadeSegundos: 0 }), 0);
  assert.equal(duracaoDaPassagem({ automix: false, crossfadeSegundos: 9 }), 9);
  assert.equal(duracaoDaPassagem({ automix: true, crossfadeSegundos: 0 }), SUAVE_POR_OMISSAO_S);
  assert.equal(duracaoDaPassagem({ automix: true, crossfadeSegundos: 3 }), 3);
});

t('o Swift e o ritmo.ts usam as mesmas constantes', () => {
  const swift = readFileSync(new URL('../modules/duotone-audio/ios/DuotoneAudioModule.swift', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(swift, new RegExp(`amostrasPorQuadro = ${AMOSTRAS_POR_QUADRO}\\b`));
  assert.match(swift, new RegExp(`corteDosGravesHz = ${CORTE_DOS_GRAVES_HZ}\\.0\\b`));
  assert.match(swift, new RegExp(`chaoDb = ${CHAO_DB}\\.0\\b`));
  // Os agudos (26/10): o mesmo corte dos dois lados, e a mesma conta.
  assert.match(swift, new RegExp(`corteDosAgudosHz = ${CORTE_DOS_AGUDOS_HZ}\\.0\\b`));
  assert.match(swift, /baixo \+= b \* \(x - baixo\)\n\s+let alto = x - baixo\n\s+somaAgudos \+= alto \* alto/);
});

t('o Swift dos agudos e das notas: uma função nova, o formato que se diz, e a FFT só de 55 Hz a 2 kHz (26/10)', () => {
  const swift = readFileSync(new URL('../modules/duotone-audio/ios/DuotoneAudioModule.swift', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(swift, /^import Accelerate$/m);
  assert.match(swift, /AsyncFunction\("analisarRitmoComAgudos"\)[\s\S]{0,300}energiasDoRitmo\(url, desde: desde, segundos: segundos, comAgudos: true\)/);
  // A antiga continua lá, sem agudos, para o JS de um binário antigo.
  assert.match(swift, /AsyncFunction\("analisarRitmo"\) \{ \(uri: String, desde: Double, segundos: Double\) -> \[Double\] in\n\s+guard let url = URL\(string: uri\) else \{ return \[\] \}\n\s+do \{\n\s+return try DuotoneAudioModule\.energiasDoRitmo\(url, desde: desde, segundos: segundos\)\n/);
  assert.match(swift, /return \[3, saida\[0\], saida\[1\]\] \+ notas \+ Array\(saida\[2\.\.\.\]\)/);
  assert.match(swift, /private static let tamanho = 4096/);
  assert.match(swift, /guard f >= 55, f <= 2000 else \{ return -1 \}/);
  assert.match(swift, /deinit \{ vDSP_destroy_fftsetup\(setup\) \}/);
  const ponte = readFileSync(new URL('../modules/duotone-audio/index.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(ponte, /const plano = temRitmoComAgudos\n\s+\? await nativo\.analisarRitmoComAgudos\(uri, desde, segundos\)\n\s+: await nativo\.analisarRitmo\(uri, desde, segundos\);/);
});

t('a tonalidade no plano: as que chocam passam depressa, e a que sai dobra-se até 2 semitons na cauda e no suave', () => {
  const tom = (tonica: number, menor = false) => ({ tonica, menor, confianca: 0.9 });
  const com = (r: Ritmo, t: { tonica: number; menor: boolean; confianca: number }) => ({ ...r, tom: t });
  // Na batida: dó e dó casam -> 4 compassos; dó e ré chocam -> 2.
  const compasso = (60 / 140) * 4;
  assert.ok(Math.abs(planoDoAutomix({ sai: com(sai140, tom(0)), entra: com(entra140, tom(0)), ...base })!.duracaoS - compasso * 4) < 1e-9);
  const choque = planoDoAutomix({ sai: com(sai140, tom(0)), entra: com(entra140, tom(2)), ...base })!;
  assert.ok(Math.abs(choque.duracaoS - compasso * 2) < 1e-9, `${choque.duracaoS}`);
  assert.equal(choque.semitons, 0, 'na batida não se dobra: a batida desencontrava-se');
  assert.deepEqual([choque.tomSai, choque.tomEntra], ['8B', '10B']);
  assert.match(descreverPlano(choque), /key 8B -> 10B/);
  // Por cima: a intro por baixo fica em 4 s.
  const porCima = planoDoAutomix({ sai: com(saiCom(128, 196), tom(0)), entra: com(ritmo(100, 14.2, 50, 0.2, 10, 14.2), tom(2)), ...base })!;
  assert.equal(porCima.tipo, 'por-cima');
  assert.ok(porCima.duracaoS <= 4 + 4 + 1e-9);
  // Na cauda: até 2,5 s, e a que sai dobra-se +2 (dó para ré).
  const cauda = planoDoAutomix({ sai: com(saiCom(128, 185), tom(0)), entra: com(ritmo(100, 0.4, 40, 0.3, 10, 0.4), tom(2)), ...base })!;
  assert.deepEqual([cauda.tipo, cauda.duracaoS, cauda.semitons], ['cauda', 2.5, 2]);
  assert.match(descreverPlano(cauda), /outgoing bent \+2 st/);
  // Suave: 2 s, e dobra-se também.
  const suave = planoDoAutomix({ sai: com(sai140, tom(0)), entra: com(ritmo(140, 0.35, 40, 0.3, 2), tom(2)), ...base })!;
  assert.deepEqual([suave.tipo, suave.duracaoS, suave.semitons], ['suave', 2, 2]);
  // Uma tonalidade pouco clara não conta, e sem ela nada muda.
  const turva = planoDoAutomix({ sai: com(sai140, { ...tom(0), confianca: 0.3 }), entra: com(entra140, tom(2)), ...base })!;
  assert.deepEqual([turva.tomSai, turva.semitons], [null, 0]);
  assert.ok(Math.abs(turva.duracaoS - compasso * 4) < 1e-9);
});

t('andamentos quase iguais: a que entra acerta-se pela velocidade, e cabem 4 compassos (relatório da 5.4.3)', () => {
  // 140 e 137 (2,2 %): sem acerto nem 2 compassos cabiam, e ficava o corte.
  const quase = ritmo(137, 0.35, 40, 0.3);
  assert.equal(planoDoAutomix({ sai: sai140, entra: quase, ...base })!.tipo, 'corte');
  const p = planoDoAutomix({ sai: sai140, entra: quase, ...base, podeAcertar: true })!;
  assert.equal(p.tipo, 'batida');
  assert.ok(Math.abs(p.acertoEntra - 140 / 137) < 1e-9, `${p.acertoEntra}`);
  assert.ok(Math.abs(p.duracaoS - (60 / 140) * 4 * 4) < 1e-9);
  assert.match(descreverPlano(p), /next nudged \+2\.2%/);
  // Iguais, não se mexe; a mais de 4 %, também não (não é uma batida).
  assert.equal(planoDoAutomix({ sai: sai140, entra: entra140, ...base, podeAcertar: true })!.acertoEntra, 1);
  assert.equal(planoDoAutomix({ sai: sai140, entra: ritmo(130, 0.35, 40, 0.3), ...base, podeAcertar: true })!.acertoEntra, 1);
});

t('a zona cinzenta: confiança 2,6 com o andamento estável já não cai no suave', () => {
  const cinzenta = (r: Ritmo, estavel: boolean) => ({ ...r, confianca: 2.6, estavel });
  assert.equal(planoDoAutomix({ sai: cinzenta(sai140, true), entra: cinzenta(entra140, true), ...base })!.tipo, 'batida');
  const p = planoDoAutomix({ sai: cinzenta(sai140, false), entra: entra140, ...base })!;
  assert.equal(p.tipo, 'suave');
  assert.match(p.motivo, /without a steady tempo/);
});

t('o leitor: a dobra em três passos, só com ela no plano, e a que sai volta à velocidade dela', () => {
  const v = readFileSync(new URL('../src/components/YouTubePlayerView.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(v, /\.\.\.\(plano\.semitons \? \{ dobra: \{ semitons: plano\.semitons, taxa: st\.playbackRate, passos: 0 \} \} : \{\}\)/);
  assert.match(v, /if \(d && d\.passos < 3 && decorrido >= \(p\.duracaoDoFade \* \(d\.passos \+ 1\)\) \/ 4\) \{/);
  assert.match(v, /const taxa = d\.taxa \* Math\.pow\(2, \(d\.semitons \* d\.passos\) \/ 3 \/ 12\);/);
  // Um binário que não muda a velocidade sem cortes: não insiste.
  assert.match(v, /if \(!aplicarVelocidadeNativa\(player, taxa\)\) d\.passos = 3;/);
  // No fim e ao desfazer, volta.
  assert.match(v, /if \(p\.dobra && p\.dobra\.passos > 0\) aplicarVelocidadeNativa\(player, p\.dobra\.taxa\);/);
});

t('a entrada agendada no Swift: sem esperar pelo buffer ANTES do setRate, e com as guardas', () => {
  const swift = readFileSync(new URL('../modules/duotone-audio/ios/DuotoneAudioModule.swift', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const corpo = swift.slice(swift.indexOf('AsyncFunction("agendarEntrada")'));
  assert.ok(corpo.length > 0, 'falta o agendarEntrada');
  // O setRate(_:time:atHostTime:) LANÇA uma exceção (e a app cai) com a espera
  // do buffer ligada, ou sem o item pronto.
  const setRate = corpo.indexOf('entra.setRate(');
  const semEspera = corpo.indexOf('self.semEsperarAteParar(entra)');
  const confirma = corpo.indexOf('guard !entra.automaticallyWaitsToMinimizeStalling');
  assert.ok(setRate > 0, 'falta o setRate');
  assert.ok(semEspera > 0 && semEspera < setRate, 'a espera do buffer tem de sair antes do setRate');
  assert.ok(confirma > semEspera && confirma < setRate, 'e confirma-se que saiu, antes do setRate');
  assert.match(corpo.slice(0, setRate), /itemEntra\.status == \.readyToPlay/);
  assert.match(corpo.slice(0, setRate), /entra\.status == \.readyToPlay/);
  const funcao = swift.slice(swift.indexOf('private func semEsperarAteParar'));
  assert.match(funcao.slice(0, 600), /p\.automaticallyWaitsToMinimizeStalling = false/);
  // Só religa quando o leitor PARA: a vigia do `semEsperar` religava-a antes da hora marcada.
  assert.match(funcao.slice(0, 900), /timeControlStatus == \.paused/);
});

t('o leitor: o AutoMix decide antes do crossfade, e uma pausa desfaz a entrada marcada', () => {
  const v = readFileSync(new URL('../src/components/YouTubePlayerView.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const automix = v.indexOf('} else if (automixTrataDela(seguinte, currentTime)) {');
  const crossfade = v.indexOf('deveComecarCrossfade({', automix);
  assert.ok(automix > 0 && crossfade > automix, 'o AutoMix tem de decidir antes do crossfade');
  // Só com o binário novo, e a 1x nas duas.
  assert.match(v, /if \(!st\.automix \|\| !temAutomixNativo\) return false;/);
  assert.match(v, /impedimentoDoAutomix\(\{/);
  assert.match(v, /rateSai: st\.playbackRate, rateEntra: seguinteRef\.current\?\.rate/);
  // A pausa desfaz uma entrada do AutoMix (o instante marcado deixava de chegar a horas).
  assert.match(v, /if \(passagemRef\.current\?\.inicioS != null\) \{\n\s*abortarPassagem\(\);/);
  // Agendada depois de desfeita: cala-se, senão entrava sozinha.
  assert.match(v, /if \(ok\) \{\n\s*try \{\n\s*entra\.pause\(\);/);
  // A curva do AutoMix conta do instante marcado.
  assert.match(v, /\? posicaoSegundos - p\.inicioS/);
  // O ritmo analisa-se ao descarregar a seguinte, só com o AutoMix ligado.
  assert.match(v, /usePlayer\.getState\(\)\.automix && temAutomixNativo\) \{\n\s*void analisarRitmoDaFaixa/);
});

t('sem rede: o ritmo guarda-se no aparelho e não vai ao Supabase nem ao YouTube', () => {
  const g = readFileSync(new URL('../src/lib/ritmoGuardado.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codigo = g.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/supabase|fetch\(|yt_cache|registarEvento|app_events/.test(codigo), 'o ritmo é só do aparelho');
  assert.match(g, /quantoPoupar\(energia\) === 'tudo'/);
  assert.match(g, /AsyncStorage\.setItem\(CHAVE/);
});

t('o relatorio distingue cada impedimento, e pode mostrar varios juntos', () => {
  const c = { duracaoS: 200, rateSai: 1, rateEntra: 1, localSai: true, localEntra: true, hls: false };
  assert.equal(impedimentoDoAutomix(c), null);
  assert.equal(impedimentoDoAutomix({ ...c, duracaoS: null }), 'duration missing');
  assert.equal(impedimentoDoAutomix({ ...c, duracaoS: NaN }), 'duration missing');
  assert.match(impedimentoDoAutomix({ ...c, rateSai: 1.2 })!, /speed is not 1x/);
  assert.match(impedimentoDoAutomix({ ...c, rateEntra: 0.9 })!, /speed is not 1x/);
  assert.match(impedimentoDoAutomix({ ...c, localSai: false, hls: true })!, /HLS/);
  assert.equal(impedimentoDoAutomix({ ...c, localSai: false }), 'current local audio missing');
  assert.equal(impedimentoDoAutomix({ ...c, localEntra: false }), 'next local audio missing');
  assert.equal(impedimentoDoAutomix({ ...c, duracaoS: 0, localEntra: false }), 'duration missing; next local audio missing');
  // Com o binário que põe a que entra à velocidade dela (26/10), a velocidade deixa de impedir.
  assert.equal(impedimentoDoAutomix({ ...c, rateSai: 1.2, rateEntra: 0.9, comVelocidade: true }), null);
  assert.match(impedimentoDoAutomix({ ...c, rateSai: 3, comVelocidade: true })!, /speed out of range/);
});

// ------------------------------------------------ a velocidade e o EQ (26/10)

t('a velocidade conta: os andamentos comparam-se como se ouvem', () => {
  // 116,7 BPM a 1,2x soam a 140: batem com a que sai.
  const lenta = ritmo(116.67, 0.4, 40, 0.3);
  assert.equal(planoDoAutomix({ sai: sai140, entra: lenta, ...base }).tipo, 'corte', 'a 1x não batem');
  const p = planoDoAutomix({ sai: sai140, entra: lenta, ...base, taxaEntra: 1.2 })!;
  assert.equal(p.tipo, 'batida');
  assert.ok(Math.abs(p.bpmEntra! - 140) < 0.1, `${p.bpmEntra}`);
  // E ao contrário: 140 a 1,2x (168) já não batem com 140.
  assert.notEqual(planoDoAutomix({ sai: sai140, entra: entra140, ...base, taxaEntra: 1.2 })!.tipo, 'batida');
  // A que sai também conta: 140 a 0,9x soa a 126.
  assert.equal(planoDoAutomix({ sai: sai140, entra: ritmo(126, 0.4, 40, 0.3), ...base, taxaSai: 0.9 })!.tipo, 'batida');
});

t('por cima com velocidades diferentes: a batida da que entra cai na troca em tempo de relógio', () => {
  const sai = saiCom(128, 196);
  const entra = ritmo(100, 10.2, 50, 0.2, 10, 10.2);
  for (const [taxaSai, taxaEntra] of [[1, 1.25], [0.8, 1], [1.1, 0.9]]) {
    const p = planoDoAutomix({ sai, entra, ...base, taxaSai, taxaEntra })!;
    assert.equal(p.tipo, 'por-cima');
    const ateATrocaSai = (sai.batidaS! - p.inicioS) / taxaSai;
    const ateABatidaEntra = (10.2 - p.entraEmS) / taxaEntra;
    assert.ok(Math.abs(ateATrocaSai - ateABatidaEntra) < 1e-9, `${taxaSai}/${taxaEntra}: ${ateATrocaSai} vs ${ateABatidaEntra}`);
  }
});

t('o Swift: a que entra arranca à velocidade dela, e a que sai pode ir a qualquer uma', () => {
  const swift = readFileSync(new URL('../modules/duotone-audio/ios/DuotoneAudioModule.swift', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(swift, /AsyncFunction\("agendarEntradaComTaxa"\) \{\n.*taxa: Double, promise: Promise\) in\n\s+self\.agendarEntrada\(.*taxa: taxa, promise: promise\)/);
  // O de antes continua lá, a 1x, para o JS de um binário que só tem esse.
  assert.match(swift, /AsyncFunction\("agendarEntrada"\) \{\n.*promise: Promise\) in\n\s+self\.agendarEntrada\(.*taxa: 1, promise: promise\)/);
  const corpo = swift.slice(swift.indexOf('private func agendarEntrada('));
  assert.match(corpo, /taxa\.isFinite, taxa >= 0\.5, taxa <= 2,/);
  assert.doesNotMatch(corpo.slice(0, 2500), /abs\(sai\.rate - 1\)/, 'a que sai já não tem de ir a 1x');
  assert.match(corpo, /if entra\.defaultRate != ritmo \{ entra\.defaultRate = ritmo \}/);
  assert.match(corpo, /entra\.setRate\(ritmo, time: alvo, atHostTime: quando\)/);
  // A ponte: a função nova só se houver; senão, só a 1x.
  const ponte = readFileSync(new URL('../modules/duotone-audio/index.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(ponte, /if \(temAutomixComVelocidade\) \{\n\s+return \(await nativo\.agendarEntradaComTaxa\(sai, entra, quandoSai, ondeEntra, taxaEntra\)\) === true;/);
  assert.match(ponte, /if \(Math\.abs\(taxaEntra - 1\) > 0\.001\) return false;/);
});

t('o leitor: a velocidade de cada uma e o EQ de cada uma, por baixo dos cortes', () => {
  const v = readFileSync(new URL('../src/components/YouTubePlayerView.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // A velocidade: a da que toca e a que a seguinte vai ter, no plano e no agendamento.
  assert.match(v, /const taxaSai = st\.playbackRate;\n\s+const taxaEntra = seguinteRef\.current\?\.rate \?\? 1;/);
  assert.match(v, /comVelocidade: temAutomixComVelocidade,/);
  assert.match(v, /taxaSai,\n\s+taxaEntra,\n\s+podeAcertar: temAutomixComVelocidade,\n\s+\}\);/);
  // A que entra arranca à velocidade dela, acertada ao andamento da que sai (26/10).
  assert.match(v, /agendarEntradaNativa\(sai, entra, plano\.inicioS, plano\.entraEmS, \(seguinteRef\.current\?\.rate \?\? 1\) \* plano\.acertoEntra\)/);
  // O EQ: o em vigor da que sai (carro, o dela, o Recommended) e o perfil da que entra.
  assert.match(v, /const ganhosSai = \[\.\.\.eqGanhos\];/);
  assert.match(v, /seguinteRef\.current\.ganhos = \[\.\.\.ganhosDaSeguinte\];/);
  assert.match(v, /ganhosComPassagem\(p\.ganhosSai, e\.gravesSai, e\.mediosSai, e\.agudosSai\)/);
  assert.match(v, /ganhosComPassagem\(p\.ganhosEntra, e\.gravesEntra, e\.mediosEntra, e\.agudosEntra\)/);
  // Mudar o EQ a meio da passagem: fica por baixo dos cortes, e não os desfaz.
  assert.match(v, /if \(p\?\.curva\) \{\n\s+p\.ganhosSai = \[\.\.\.eqGanhos\];\n\s+if \(p\.eqAplicado\) p\.eqAplicado\.sai = '';\n\s+return;/);
  // O tap monta-se antes de a seguinte soar; só se mexe nos graves de quem o tem.
  assert.match(v, /aplicarEqualizadorNativo\(emEspera, ganhosDaSeguinte, comAutomix \? Math\.min\(margem, MARGEM_QUE_MONTA_O_TAP\) : margem\)/);
  assert.match(v, /const eqSai = comTapRef\.current\.get\(player\) === track\.sourceId \|\| !ePlano\(ganhosSai\);/);
  // No fim e ao desfazer, os dois perfis voltam sem os cortes.
  assert.match(v, /const abortarPassagem = \(\) => \{\n\s+const p = passagemRef\.current;\n\s+if \(!p\) return;\n\s+reporEqDaPassagem\(p\);/);
  assert.match(v, /reporEqDaPassagem\(p\);\n\s+passagemRef\.current = null;\n\s+reporIntervaloDeTempo\(\);\n\s+try \{\n\s+motorEmEspera\.volume = p\.tetoEntra;/);
  // A curva anda pelo tempo da que sai, e a que sai pode começar antes do instante (o corte).
  assert.match(v, /if \(p\.inicioS != null && decorrido < -\(p\.preparacaoS \?\? 0\)\) return;/);
  assert.match(v, /aPassarDepressa: !!passagemRef\.current\?\.curva,/);
});

t('sem duração no catálogo: o fim do som do ficheiro descodificado, e nunca o player.duration (relatório da 5.4.2)', () => {
  const v = readFileSync(new URL('../src/components/YouTubePlayerView.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const corpo = v.slice(v.indexOf('const duracaoDeConfianca = (): number | null => {'));
  const funcao = corpo.slice(0, corpo.indexOf('\n  };') + 5);
  assert.ok(funcao.length > 50, 'falta a duracaoDeConfianca');
  assert.match(funcao, /const conhecida = track\.durationSeconds \|\| streamRef\.current\?\.durationSeconds;/);
  // Só com o AutoMix, e da análise do fim (o áudio descodificado).
  assert.match(funcao, /if \(!usePlayer\.getState\(\)\.automix \|\| !temAutomixNativo\) return null;/);
  assert.match(funcao, /ritmoGuardado\(track\.sourceId\)\?\.fim\?\.somS/);
  assert.doesNotMatch(funcao, /player\.duration/, 'o player.duration pode ser o dobro');
  // Os três sítios que decidem a passagem usam-na: preparar, planear e o passo.
  assert.equal((v.match(/= duracaoDeConfianca\(\);/g) ?? []).length, 3);
});

t('o plano explica a passagem suave e mostra os BPM e ambas as confiancas', () => {
  const p = planoDoAutomix({ sai: sai140, entra: ritmo(140, 0.35, 40, 0.3, 2), ...base })!;
  assert.match(descreverPlano(p), /automix suave/);
  assert.match(descreverPlano(p), /140\.0 -> 140\.0 bpm, confidence 10\.0 -> 2\.0/);
  assert.match(descreverPlano(p), /low confidence/);
  assert.match(planoDoAutomix({ sai: sai140, entra: ritmo(120, 0.35, 40, 0.3), ...base })!.motivo, /different tempos/);
});

t('o Opus em MP4 e lido por AVFoundation, em janelas e so de ficheiros locais', () => {
  const swift = readFileSync(new URL('../modules/duotone-audio/ios/DuotoneAudioModule.swift', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const corpo = swift.slice(swift.indexOf('private static func energiasDoRitmo'), swift.indexOf('public func definition()'));
  assert.match(corpo, /guard url\.isFileURL/);
  assert.match(corpo, /AVAssetReader\(asset: asset\)/);
  assert.match(corpo, /leitor\.timeRange = CMTimeRange/);
  assert.match(corpo, /min\(segundos, 45\)/);
  assert.match(corpo, /leitor\.status == \.completed/);
  assert.doesNotMatch(corpo, /try AVAudioFile\(/);
  const v = readFileSync(new URL('../src/components/YouTubePlayerView.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(v, /for \(const faixa of \[track, seguinte\]\)/);
  assert.match(v, /if \(ficheiro\.exists\) await analisarRitmoDaFaixa/);
  assert.match(v, /automix without a plan: \$\{motivo\}/);
});

// Executa a cache real com disco, energia e descodificador de mentira. Nenhuma rede.
function cacheDeRitmo() {
  let energia: any = null;
  let agora = 1000;
  let emVoo = 0, maximoEmVoo = 0, chamadas = 0;
  let vazia = false;
  let gravado: string | null = null;
  const real = { exports: {} as any };
  const duplicados: Record<string, any> = {
    '@react-native-async-storage/async-storage': {
      getItem: async () => gravado,
      setItem: async (_: string, valor: string) => { gravado = valor; },
    },
    '../../modules/duotone-audio': {
      temAutomixNativo: true,
      analisarRitmoNativo: async (_: string, desde: number) => {
        chamadas++; emVoo++; maximoEmVoo = Math.max(maximoEmVoo, emVoo);
        await Promise.resolve(); emVoo--;
        return vazia ? [] : [desde];
      },
    },
    '../../modules/duotone-diagnostico': { estadoDeEnergia: () => energia },
    './adiantarFaixas': { quantoPoupar: (e: any) => e?.poupanca || ['serious', 'critical'].includes(e?.termico) ? 'tudo' : 'nada' },
    './ritmo': {
      energiasDoNativo: (e: number[]) => e.length ? e : null,
      ritmoDaJanela: (_: unknown, janela: string) => janela === 'inicio' ? entra140 : sai140,
      compactar: (r: unknown) => r, descompactar: (r: unknown) => r,
    },
  };
  const codigo = ts.transpileModule(readFileSync(new URL('../src/lib/ritmoGuardado.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(codigo, { module: real, exports: real.exports, Date: { now: () => agora },
    require: (nome: string) => { assert.ok(nome in duplicados, `import inesperado ${nome}`); return duplicados[nome]; },
  });
  return { analisar: real.exports.analisarRitmoComDiagnostico,
    poupar: (e: any) => { energia = e; }, falhar: (v: boolean) => { vazia = v; },
    avancar: () => { agora += 61_000; },
    medidas: () => ({ chamadas, maximoEmVoo, gravado }),
  };
}

{
  const c = cacheDeRitmo();
  const [a, b] = await Promise.all([c.analisar('a', 'file:///a'), c.analisar('a', 'file:///a')]);
  assert.equal(a, b, 'duas chamadas partilham a analise');
  assert.equal(c.medidas().chamadas, 2, 'so duas janelas');
  c.poupar({ termico: 'critical', poupanca: true });
  assert.ok((await c.analisar('a', 'file:///a')).ritmo, 'a cache continua a servir em poupanca');
  assert.match((await c.analisar('b', 'file:///b')).motivo, /thermal critical, low power on/);
  assert.equal(c.medidas().chamadas, 2, 'quente nao descodifica');
  c.poupar(null);
  await Promise.all([c.analisar('b', 'file:///b'), c.analisar('c', 'file:///c')]);
  assert.equal(c.medidas().maximoEmVoo, 1, 'as faixas leem-se uma a uma');
  console.log('  ok - cache, analises partilhadas, energia e leitura em serie');
}
{
  const c = cacheDeRitmo();
  c.falhar(true);
  assert.match((await c.analisar('a', 'file:///a')).motivo, /native audio unreadable \(start and end\)/);
  assert.equal(c.medidas().gravado, null, 'a falha nativa nao fica em disco');
  await c.analisar('a', 'file:///a');
  assert.equal(c.medidas().chamadas, 2, 'sem repeticoes imediatas');
  c.falhar(false); c.avancar();
  assert.ok((await c.analisar('a', 'file:///a')).ritmo.inicio, 'recupera depois de uma falha transitoria');
  assert.equal(c.medidas().chamadas, 4);
  console.log('  ok - motivo da falha nativa, sem cache permanente nem repeticoes em rajada');
}

console.log('O AutoMix: na batida, suave, sem plano, quando agendar e o que o Swift partilha passaram.');
