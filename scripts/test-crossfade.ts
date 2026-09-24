import assert from 'node:assert/strict';
import { podeCrossfade, deveComecarCrossfade, volumesDoCrossfade, acaoAoInterromper, fimEfectivo, intervaloDaPosicao, devePrepararSeguinte, decorridoDaPassagem, ANTECEDENCIA_DO_PC_S } from '../src/lib/crossfade.ts';

const base = {
  duracaoDoFade: 6,
  duracaoSegundos: 200,
  posicaoSegundos: 100,
  temFaixaSeguinte: true,
  repeatUma: false,
  backendNativo: true,
  seguinteCarregada: true,
  aDecorrer: false,
};

// --- pode? ---
assert.equal(podeCrossfade(base), true);
assert.equal(podeCrossfade({ ...base, duracaoDoFade: 0 }), false, 'desligado nas definições');
assert.equal(podeCrossfade({ ...base, backendNativo: false }), false, 'o embed não tem dois motores');
assert.equal(podeCrossfade({ ...base, repeatUma: true }), false, 'repetir a mesma não é passagem');
assert.equal(podeCrossfade({ ...base, temFaixaSeguinte: false }), false);
// A duração do YouTube mente: sem ela não se sabe onde é o fim.
assert.equal(podeCrossfade({ ...base, duracaoSegundos: null }), false);
assert.equal(podeCrossfade({ ...base, duracaoSegundos: 0 }), false);
assert.equal(podeCrossfade({ ...base, duracaoSegundos: NaN }), false);
// Faixa curta de mais: cruzar 6s numa de 8s é quase só fade.
assert.equal(podeCrossfade({ ...base, duracaoSegundos: 8 }), false);
assert.equal(podeCrossfade({ ...base, duracaoSegundos: 12 }), true, 'o dobro do fade já chega');

// --- é agora? ---
assert.equal(deveComecarCrossfade({ ...base, posicaoSegundos: 100 }), false, 'ainda falta muito');
assert.equal(deveComecarCrossfade({ ...base, posicaoSegundos: 194 }), true, 'faltam exactamente 6s');
assert.equal(deveComecarCrossfade({ ...base, posicaoSegundos: 197 }), true);
assert.equal(deveComecarCrossfade({ ...base, posicaoSegundos: 193.9 }), false);
// Uma vez só: quem já está a passar não recomeça a cada tique.
assert.equal(deveComecarCrossfade({ ...base, posicaoSegundos: 197, aDecorrer: true }), false);
// Sem a seguinte pronta não se começa, senão entrava silêncio.
assert.equal(deveComecarCrossfade({ ...base, posicaoSegundos: 197, seguinteCarregada: false }), false);
// Numa faixa curta, o instante zero já cairia dentro da janela.
assert.equal(
  deveComecarCrossfade({ ...base, duracaoSegundos: 12, posicaoSegundos: 0 }), false,
  'a posição tem de ter andado',
);

// --- os volumes ---
const t = (x: number) => volumesDoCrossfade(x, 6, 1, 1);
assert.ok(Math.abs(t(0).sai - 1) < 1e-9 && Math.abs(t(0).entra) < 1e-9, 'começa com a antiga inteira');
assert.ok(Math.abs(t(6).sai) < 1e-9 && Math.abs(t(6).entra - 1) < 1e-9, 'acaba com a nova inteira');
// A prova da curva: a POTÊNCIA somada é constante. Com uma passagem linear,
// isto daria 0,5 a meio e ouvia-se o buraco.
for (const x of [0, 1.5, 3, 4.5, 6]) {
  const v = t(x);
  assert.ok(Math.abs(v.sai ** 2 + v.entra ** 2 - 1) < 1e-9, `potência constante em ${x}s`);
}
// Fora do intervalo não se estraga: nada de volumes negativos nem acima do teto.
assert.deepEqual(t(-5), t(0));
assert.deepEqual(t(99), t(6));
// Cada faixa respeita o SEU teto de loudness.
const comTetos = volumesDoCrossfade(3, 6, 0.8, 0.5);
assert.ok(comTetos.sai <= 0.8 && comTetos.entra <= 0.5);
assert.ok(Math.abs(comTetos.sai - 0.8 * Math.SQRT1_2) < 1e-9);
// Duração inválida não divide por zero: entrega a nova já no seu teto.
assert.deepEqual(volumesDoCrossfade(1, 0, 1, 0.9), { sai: 0, entra: 0.9 });

// --- interrupções ---
assert.equal(acaoAoInterromper('pausa'), 'suspender', 'quem pausa quer voltar');
assert.equal(acaoAoInterromper('pausa', true), 'suspender', 'a pausa não olha ao resto');

// Quem carrega em seguinte pediu a faixa que já estava a entrar: ela fica.
assert.equal(acaoAoInterromper('salto', true), 'cortar');
assert.equal(acaoAoInterromper('faixa-nova', true), 'cortar');

// O caso que interessa mesmo: saltar para OUTRA faixa. Deixar a que estava a
// entrar a tocar punha duas músicas ao mesmo tempo.
for (const motivo of ['salto', 'anterior', 'faixa-nova', 'fechar', 'seek'] as const) {
  assert.equal(acaoAoInterromper(motivo), 'abortar', motivo);
  assert.equal(acaoAoInterromper(motivo, false), 'abortar', motivo);
}

// Um seek tira a posição do fim: a razão da passagem desaparece, e a faixa
// atual continua -- mesmo que a seguinte já estivesse a soar.
assert.equal(acaoAoInterromper('seek', false), 'abortar');

console.log('Crossfade: condições, momento, curva de igual potência e interrupções passaram.');

// ---- a passagem conta a partir do fim da MUSICA, nao do ficheiro ----------
//
// Numa faixa que acaba com silencio gravado, contar do fim do ficheiro cruzava
// a seguinte com o nada -- ouvia-se um buraco onde devia haver passagem.
{
  const base = {
    duracaoDoFade: 6, duracaoSegundos: 200, posicaoSegundos: 0,
    temFaixaSeguinte: true, repeatUma: false, backendNativo: true,
    seguinteCarregada: true, aDecorrer: false,
  };
  // Sem analise, o fim e o do ficheiro: nada muda.
  assert.equal(fimEfectivo(base), 200);
  assert.equal(fimEfectivo({ ...base, fimMusicalSegundos: null }), 200);
  // Com 8 s de silencio no fim, a passagem passa a comecar 8 s mais cedo.
  assert.equal(fimEfectivo({ ...base, fimMusicalSegundos: 192 }), 192);
  assert.equal(deveComecarCrossfade({ ...base, posicaoSegundos: 187, fimMusicalSegundos: 192 }), true,
    'nao comecou a tempo do fim da musica');
  assert.equal(deveComecarCrossfade({ ...base, posicaoSegundos: 187 }), false,
    'sem analise comecou cedo demais');
  // Uma analise absurda nunca pode empurrar a passagem para depois do ficheiro.
  assert.equal(fimEfectivo({ ...base, fimMusicalSegundos: 9999 }), 200);
  console.log('Crossfade: a passagem conta do fim da musica quando ele e conhecido.');
}

// --- o ritmo da posição ---
{
  const ritmo = {
    aPassar: false, seguintePronta: true, ativa: false,
    posicaoSegundos: 60 as number | null, duracaoSegundos: 200 as number | null, fimMusicalSegundos: null as number | null, duracaoDoFade: 6,
  };
  assert.equal(intervaloDaPosicao({ ...ritmo, aPassar: true }), 0.25, 'durante a passagem, a curva não se pode ouvir aos degraus');
  assert.equal(intervaloDaPosicao({ ...ritmo, ativa: true }), 0.5, 'com a app à frente e a seguinte pronta, fica como estava');
  assert.equal(intervaloDaPosicao({ ...ritmo, seguintePronta: false, ativa: true }), 1);
  assert.equal(intervaloDaPosicao({ ...ritmo, seguintePronta: false }), 2);
  assert.equal(intervaloDaPosicao(ritmo), 2, 'com o ecrã bloqueado e longe do fim, de 2 em 2 s mesmo com a seguinte pronta');
  assert.equal(intervaloDaPosicao({ ...ritmo, posicaoSegundos: 185 }), 2, 'faltam 15 s: ainda não');
  assert.equal(intervaloDaPosicao({ ...ritmo, posicaoSegundos: 186 }), 0.5, 'faltam 14 s, o fade mais a antecedência: acelera');
  assert.equal(intervaloDaPosicao({ ...ritmo, posicaoSegundos: 180, fimMusicalSegundos: 192 }), 0.5, 'conta do fim da música, não do ficheiro');
  assert.equal(intervaloDaPosicao({ ...ritmo, duracaoSegundos: null }), 0.5, 'sem duração, o ritmo rápido de sempre');
  assert.equal(intervaloDaPosicao({ ...ritmo, posicaoSegundos: null }), 0.5, 'sem posição, também');

  // Simula o motor com o ecrã bloqueado: a posição chega ao ritmo que a função
  // pede, e a passagem tem de começar no máximo uma leitura rápida depois do
  // instante certo -- a mesma precisão de quando o ritmo era sempre 0,5 s.
  for (const velocidade of [0.5, 1, 1.5, 2]) {
    for (let inicio = 100; inicio < 104; inicio += 0.37) {
      let t = inicio;
      let faltava: number | null = null;
      while (t < 200) {
        if (deveComecarCrossfade({ ...base, posicaoSegundos: t })) { faltava = 200 - t; break; }
        t += intervaloDaPosicao({ ...ritmo, posicaoSegundos: t }) * velocidade;
      }
      assert.ok(faltava !== null && faltava > 6 - 0.5 * velocidade - 1e-9,
        `a ${velocidade}× a passagem começa a tempo (faltavam ${faltava?.toFixed(2)} s)`);
    }
  }
  console.log('Ritmo da posição: 2 s com o ecrã bloqueado, rápido perto do fim, e a passagem começa a tempo.');
}

// --- o PC: preparar a seguinte no segundo IFrame, e o decorrido pela posição ---
{
  const pc = { ...base, seguinteCarregada: false };
  assert.equal(devePrepararSeguinte({ ...pc, posicaoSegundos: 100 }, ANTECEDENCIA_DO_PC_S), false, 'longe do fim não se carrega nada');
  assert.equal(devePrepararSeguinte({ ...pc, posicaoSegundos: 200 - 6 - 15 }, ANTECEDENCIA_DO_PC_S), true, 'fade + antecedência antes do fim');
  assert.equal(devePrepararSeguinte({ ...pc, posicaoSegundos: 190, seguinteCarregada: true }, ANTECEDENCIA_DO_PC_S), false, 'uma vez só');
  assert.equal(devePrepararSeguinte({ ...pc, posicaoSegundos: 190, duracaoDoFade: 0 }, ANTECEDENCIA_DO_PC_S), false, 'desligado não gasta um segundo player');
  assert.equal(devePrepararSeguinte({ ...pc, posicaoSegundos: 190, repeatUma: true }, ANTECEDENCIA_DO_PC_S), false);
  assert.equal(devePrepararSeguinte({ ...pc, posicaoSegundos: 190, temFaixaSeguinte: false }, ANTECEDENCIA_DO_PC_S), false);
  assert.equal(devePrepararSeguinte({ ...pc, posicaoSegundos: 190, aDecorrer: true }, ANTECEDENCIA_DO_PC_S), false);
  assert.equal(devePrepararSeguinte({ ...pc, posicaoSegundos: 0, duracaoSegundos: 14 }, ANTECEDENCIA_DO_PC_S), false, 'no instante zero não');
  assert.equal(decorridoDaPassagem({ ...base, posicaoSegundos: 194 }), 0, 'começa a 6 s do fim');
  assert.equal(decorridoDaPassagem({ ...base, posicaoSegundos: 197 }), 3);
  assert.equal(decorridoDaPassagem({ ...base, posicaoSegundos: 200 }), 6);
  assert.ok(decorridoDaPassagem({ ...base, posicaoSegundos: 120 }) < 0, 'um seek para trás sai da janela');
  assert.equal(decorridoDaPassagem({ ...base, posicaoSegundos: 190, fimMusicalSegundos: 196 }), 0, 'conta do fim da música quando é conhecido');
  console.log('Crossfade no PC: preparar a seguinte a tempo e o decorrido pela posição passaram.');
}
