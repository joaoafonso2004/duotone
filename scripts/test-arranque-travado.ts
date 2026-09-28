// A rede que desprende o convidado dos 0:00.
//
// O que se prova aqui é sobretudo quando é que ela NÃO deve disparar: um
// watchdog que salta de mais é pior do que não haver nenhum, porque passa a
// dar seeks numa música que estava a tocar bem.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  paradoDesdeAgora, precisaDeEmpurrao, PARADO_DEMAIS_MS, EMPURROES_POR_FAIXA, MOTOR_PARADO_MS,
} from '../src/lib/arranqueTravado.ts';

const base = {
  autorizadoATocar: true,
  querTocar: true,
  pronta: true,
  posicaoMs: 0,
  paradoMs: PARADO_DEMAIS_MS,
  empurroesDados: 0,
};

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('o caso que existe para apanhar', () => {
  assert.equal(precisaDeEmpurrao(base), true);
});

verificar('não se empurra antes de tempo', () => {
  assert.equal(precisaDeEmpurrao({ ...base, paradoMs: PARADO_DEMAIS_MS - 1 }), false);
});

verificar('uma faixa que ARRANCOU não se empurra', () => {
  // Parou a meio? Isso é fim de faixa ou buffer vazio, e tem dono noutro
  // sítio. Dois watchdogs sobre o mesmo sintoma dão seeks a discutir.
  assert.equal(precisaDeEmpurrao({ ...base, posicaoMs: 45_000 }), false);
  assert.equal(precisaDeEmpurrao({ ...base, posicaoMs: 1001 }), false);
  assert.equal(precisaDeEmpurrao({ ...base, posicaoMs: 999 }), true, 'ainda no arranque');
});

verificar('se o MOTOR já passou do primeiro segundo, não se volta ao 0', () => {
  // 26/9: a store ficava nos 0:00 com a música a tocar no motor, e a rede
  // mandava-a para o início três vezes ("chega aos dois segundos e recomeça").
  assert.equal(precisaDeEmpurrao({ ...base, posicaoDoMotorMs: 2000 }), false);
  assert.equal(precisaDeEmpurrao({ ...base, posicaoDoMotorMs: 500 }), true, 'o motor também está no arranque');
  assert.equal(precisaDeEmpurrao({ ...base, posicaoDoMotorMs: null }), true, 'sem leitura do motor fica como era');
});

verificar('em pausa não se empurra nada', () => {
  assert.equal(precisaDeEmpurrao({ ...base, autorizadoATocar: false }), false,
    'quem manda diz pausa: parado é o que se espera');
  assert.equal(precisaDeEmpurrao({ ...base, querTocar: false }), false,
    'o utilizador pausou: parado é o que ele pediu');
});

verificar('sem o ficheiro cá não há nada a empurrar', () => {
  assert.equal(precisaDeEmpurrao({ ...base, pronta: false }), false);
});

verificar('desiste ao fim de três, e não fica a saltar para sempre', () => {
  for (let n = 0; n < EMPURROES_POR_FAIXA; n++) {
    assert.equal(precisaDeEmpurrao({ ...base, empurroesDados: n }), true, `tentativa ${n}`);
  }
  assert.equal(precisaDeEmpurrao({ ...base, empurroesDados: EMPURROES_POR_FAIXA }), false);
  assert.equal(precisaDeEmpurrao({ ...base, empurroesDados: 99 }), false);
});

// ------------------------------------------ o download nao conta (13/9) --
//
// "Acaba o download, toca um segundo e recomeca": o cronometro corria o
// download inteiro, e mal a faixa ficava pronta ja estava "parada" ha 10 s.
verificar('o download inteiro nao conta como tempo parado', () => {
  let desde = 0;
  // Dez segundos a descarregar: nos 0:00 e ainda nao pronta.
  for (let t = 1000; t <= 10_000; t += 1000) {
    desde = paradoDesdeAgora({ pronta: false, mexeu: false, paradoDesde: desde, agora: t });
  }
  // Fica pronta aos 10 s: nao pode estar ja parada ha 10 s.
  desde = paradoDesdeAgora({ pronta: true, mexeu: false, paradoDesde: desde, agora: 10_000 });
  assert.equal(precisaDeEmpurrao({ ...base, paradoMs: 10_000 - desde }), false);
});

verificar('pronta e parada a serio continua a ser apanhada', () => {
  let desde = paradoDesdeAgora({ pronta: false, mexeu: false, paradoDesde: 0, agora: 10_000 });
  desde = paradoDesdeAgora({ pronta: true, mexeu: false, paradoDesde: desde, agora: 11_000 });
  desde = paradoDesdeAgora({ pronta: true, mexeu: false, paradoDesde: desde, agora: 14_000 });
  assert.equal(precisaDeEmpurrao({ ...base, paradoMs: 14_000 - desde }), true,
    '4 s pronta e sem mexer ainda e o encravamento que isto existe para apanhar');
});

verificar('mexer recomeca a contagem', () => {
  assert.equal(paradoDesdeAgora({ pronta: true, mexeu: true, paradoDesde: 0, agora: 9000 }), 9000);
});

verificar('com o MOTOR parado de certeza, empurra-se ao fim de um segundo', () => {
  // 27/9: a seguinte já no telemóvel, depois de uma faixa acabar sozinha. O
  // motor aceitou o play e ficou parado (pronto, sem esperar por dados), e a
  // rede só o apanhava aos 2,5 s -- 3 s nos 0:00 com o intervalo de 1 s.
  assert.equal(precisaDeEmpurrao({ ...base, motorParado: true, paradoMs: MOTOR_PARADO_MS }), true);
  assert.equal(precisaDeEmpurrao({ ...base, motorParado: true, paradoMs: MOTOR_PARADO_MS - 1 }), false);
  assert.equal(precisaDeEmpurrao({ ...base, motorParado: false, paradoMs: MOTOR_PARADO_MS }), false,
    'à espera de dados continua a ter os 2,5 s de um soluço de rede');
  assert.equal(precisaDeEmpurrao({ ...base, motorParado: true, querTocar: false, paradoMs: 10_000 }), false,
    'em pausa de propósito ninguém empurra');
  assert.equal(precisaDeEmpurrao({ ...base, motorParado: true, posicaoDoMotorMs: 2000 }), false,
    'parado a meio da música não é um arranque');
});

verificar('depois de uma faixa acabar sozinha, a seguinte leva um seek antes do play', () => {
  const motor = readFileSync(new URL('../src/components/YouTubePlayerView.tsx', import.meta.url), 'utf8');
  assert.match(motor, /if \(\(vemDeUmFim \|\| vinhaViva\) && !\(resumeMs && resumeMs > 1500\)\) \{\s*try \{\s*motorActivo\(\)\.currentTime = 0;/,
    'o remédio do encravamento aplica-se já, sem esperar pela rede');
  // E antes da ordem de tocar, que é o que o remédio à mão faz: seek, depois play.
  const seek = motor.indexOf('motorActivo().currentTime = 0;');
  const play = motor.indexOf('tocarNaVelocidade(motorActivo(),', seek);
  assert.ok(seek > 0 && play > seek, 'o seek vem antes do play do arranque');
  // O motor diz quando está parado de certeza, e a rede usa-o.
  assert.match(motor, /motorParado: \(\) => \{/);
  const rede = readFileSync(new URL('../src/hooks/useArranqueTravado.ts', import.meta.url), 'utf8');
  assert.match(rede, /motorParado,\s*\}\)\) return;/);
});

verificar('na troca, a que sai fica a tocar calada até a nova estar pronta', () => {
  // 27/9: com o ecrã bloqueado a meio do download, o download acabava e a
  // música não começava -- o iOS só deixa começar quem já está a tocar.
  const motor = readFileSync(new URL('../src/components/YouTubePlayerView.tsx', import.meta.url), 'utf8');
  assert.match(motor, /silenciarParaTrocar: \(\) => \{\s*if \(manterVivoCalado\(player\)\)/, 'o motor do iPhone sabe calar em vez de pausar');
  assert.match(motor, /if \(!manterVivoCalado\(player\)\) \{\s*try \{\s*player\.pause\(\);/, 'o efeito da faixa nova também');
  assert.match(motor, /const vinhaViva = !!mantidoVivoRef\.current;\s*mantidoVivoRef\.current = null;/, 'o arranque da nova consome-o');
  assert.match(motor, /pause: \(\) => \{\s*wantsPlayRef\.current = false;\s*mantidoVivoRef\.current = null;/, 'uma pausa a sério acaba com ele');
  assert.match(motor, /if \(backend !== 'native'\) \{\s*try \{ motorActivo\(\)\.pause\(\);/, 'caído no embed, a calada pára');
  assert.match(motor, /const MANTER_VIVO_MS = 90_000;/, 'e tem prazo');
  const vida = readFileSync(new URL('../src/lib/playerLifecycle.ts', import.meta.url), 'utf8');
  assert.match(vida, /if \(controls\.silenciarParaTrocar\) controls\.silenciarParaTrocar\(\);\s*else controls\.pause\(\);/);
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nArranque travado: a rede apanha o caso e não salta em cima dos outros.');
