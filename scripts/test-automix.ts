/**
 * O AutoMix -- src/lib/automix.ts (o plano da passagem) e as constantes que o
 * Swift tem de partilhar com o src/lib/ritmo.ts.
 *
 * node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-automix.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  deveAgendar, duracaoDaPassagem, planoDoAutomix, razaoDosAndamentos, SUAVE_POR_OMISSAO_S,
} from '../src/lib/automix.ts';
import { AMOSTRAS_POR_QUADRO, CHAO_DB, CORTE_DOS_GRAVES_HZ, type Ritmo } from '../src/lib/ritmo.ts';

function t(nome: string, f: () => void) {
  f();
  console.log(`  ok - ${nome}`);
}

/** Um ritmo com tempos fortes de `desde` a `ate`, de compasso em compasso. */
function ritmo(bpm: number, desde: number, ate: number, somS: number, confianca = 10): Ritmo {
  const periodoS = 60 / bpm;
  const temposFortesS: number[] = [];
  for (let x = desde; x <= ate; x += periodoS * 4) temposFortesS.push(x);
  return { bpm, periodoS, confianca, temposFortesS, somS };
}

// A que sai: 200 s, a música acaba aos 197 s; janela do fim desde os 155 s.
const sai140 = ritmo(140, 155.2, 197, 197);
const entra140 = ritmo(140, 0.35, 40, 0.3);
const base = { fimMusicalS: 197, duracaoSaiS: 200, suaveS: 6 };

t('andamentos iguais: na batida, 8 compassos, a que entra no primeiro tempo forte', () => {
  const p = planoDoAutomix({ sai: sai140, entra: entra140, ...base })!;
  assert.equal(p.tipo, 'batida');
  const compasso = (60 / 140) * 4;
  assert.ok(Math.abs(p.duracaoS - compasso * 8) < 1e-9);
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

t('andamentos que não batem: suave, com a duração do crossfade, a acabar no fim da música', () => {
  const p = planoDoAutomix({ sai: sai140, entra: ritmo(120, 0.35, 40, 0.3), ...base })!;
  assert.equal(p.tipo, 'suave');
  assert.equal(p.duracaoS, 6);
  // Começa no tempo forte logo antes de 197 - 6, e a que entra no primeiro som.
  assert.ok(p.inicioS <= 191 && p.inicioS > 191 - (60 / 140) * 4);
  assert.ok(sai140.temposFortesS.includes(p.inicioS));
  assert.equal(p.entraEmS, 0.3);
});

t('sem batida clara numa das duas: suave', () => {
  assert.equal(planoDoAutomix({ sai: sai140, entra: ritmo(140, 0.35, 40, 0.3, 2), ...base })!.tipo, 'suave');
  const p = planoDoAutomix({ sai: ritmo(140, 155.2, 197, 197, 2), entra: entra140, ...base })!;
  assert.equal(p.tipo, 'suave');
  // Sem batida na que sai, começa à conta certa, sem procurar tempo forte.
  assert.equal(p.inicioS, 191);
});

t('uma intro longa sem batida: suave, e a que entra não perde a intro', () => {
  const p = planoDoAutomix({ sai: sai140, entra: ritmo(140, 12.3, 50, 0.4), ...base })!;
  assert.equal(p.tipo, 'suave');
  assert.equal(p.entraEmS, 0.4);
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
  // Uma faixa de 8 s não tem onde fazer passagem nenhuma depois de meio.
  const curta = ritmo(140, 1, 7, 7);
  assert.equal(planoDoAutomix({ sai: curta, entra: entra140, fimMusicalS: 7, duracaoSaiS: 8, suaveS: 6 }), null);
  // Uma de 20 s ainda leva 2 compassos na batida, depois de meio.
  const p = planoDoAutomix({ sai: ritmo(140, 1, 18, 18), entra: entra140, fimMusicalS: 18, duracaoSaiS: 20, suaveS: 9 })!;
  assert.ok(p.inicioS >= 10 && p.inicioS + p.duracaoS <= 17.9);
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
  assert.match(v, /const aUmX = Math\.abs\(st\.playbackRate - 1\) < 0\.001/);
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
  assert.match(g, /quantoPoupar\(estadoDeEnergia\(\)\) === 'tudo'\) return null;/);
  assert.match(g, /AsyncStorage\.setItem\(CHAVE/);
});

console.log('O AutoMix: na batida, suave, sem plano, quando agendar e o que o Swift partilha passaram.');
