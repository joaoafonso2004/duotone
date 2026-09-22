// Quando é que o iPhone toca enquanto descarrega, e quando desiste disso.
import assert from 'node:assert/strict';
import {
  DESLIGADO_POR_MS, FALHAS_PARA_DESLIGAR, PRIMEIRA_NOTA_MAX_MS, SAUDE_INICIAL,
  LIGADO, depoisDeTransmitir, descreverSaude, lerSaude, podeTransmitir, primeiraNota,
} from '../src/lib/tocarEnquantoDescarrega.ts';

const agora = 1_800_000_000_000;

assert.equal(podeTransmitir(SAUDE_INICIAL, agora), true);
assert.equal(FALHAS_PARA_DESLIGAR, 2, 'uma falha isolada não desliga nada');

// Uma falha não desliga; a segunda seguida desliga por três dias.
let s = depoisDeTransmitir(SAUDE_INICIAL, 'falhou', agora);
assert.deepEqual(s, { falhasSeguidas: 1, desligadoAte: 0 });
assert.equal(podeTransmitir(s, agora), true);
s = depoisDeTransmitir(s, 'falhou', agora + 1000);
assert.equal(podeTransmitir(s, agora + 1000), false);
assert.equal(podeTransmitir(s, agora + 1000 + DESLIGADO_POR_MS - 1), false);
assert.equal(podeTransmitir(s, agora + 1000 + DESLIGADO_POR_MS), true, 'volta a tentar ao fim do prazo');
assert.equal(s.falhasSeguidas, 0, 'e volta a tentar com a contagem limpa');

// Uma faixa que toca entre duas falhas zera a contagem.
s = depoisDeTransmitir(depoisDeTransmitir(SAUDE_INICIAL, 'falhou', agora), 'tocou', agora);
assert.deepEqual(s, SAUDE_INICIAL);
s = depoisDeTransmitir(s, 'falhou', agora);
assert.equal(podeTransmitir(s, agora), true);

// Um prazo impossível (relógio que andou para trás) não prende para sempre.
assert.equal(podeTransmitir({ falhasSeguidas: 0, desligadoAte: agora + 10 * DESLIGADO_POR_MS }, agora), true);

// O que está guardado pode ser lixo.
assert.deepEqual(lerSaude(null), SAUDE_INICIAL);
assert.deepEqual(lerSaude('{'), SAUDE_INICIAL);
assert.deepEqual(lerSaude('[]'), SAUDE_INICIAL);
assert.deepEqual(lerSaude('{"falhasSeguidas":"x","desligadoAte":-5}'), SAUDE_INICIAL);
assert.deepEqual(lerSaude('{"falhasSeguidas":1.5,"desligadoAte":null}'), SAUDE_INICIAL);
assert.deepEqual(lerSaude('{"falhasSeguidas":9,"desligadoAte":123}'), { falhasSeguidas: 2, desligadoAte: 123 });
const guardada = depoisDeTransmitir(depoisDeTransmitir(SAUDE_INICIAL, 'falhou', agora), 'falhou', agora);
assert.deepEqual(lerSaude(JSON.stringify(guardada)), guardada, 'ida e volta');

// A linha do relatório. O interruptor entra por parâmetro: assim as duas
// posições ficam presas, independentemente de como o `LIGADO` está hoje.
assert.equal(descreverSaude(SAUDE_INICIAL, agora, true, false), 'off (turned off in this build)');
assert.equal(descreverSaude(SAUDE_INICIAL, agora, false, true), 'off (this build has no streaming module)');
assert.equal(descreverSaude(SAUDE_INICIAL, agora, true, true), 'on');
assert.match(descreverSaude({ falhasSeguidas: 1, desligadoAte: 0 }, agora, true, true), /^on \(1 recent/);
assert.match(descreverSaude(guardada, agora, true, true), /^off after repeated player failures, back on 20\d\d-/);
// O que a app usa hoje: desligado à mão (22/9).
assert.equal(LIGADO, false, 'o stream está desligado nesta build');

// A primeira nota.
assert.deepEqual(primeiraNota(agora, agora + 1234.4, 'stream'), { origem: 'stream', ms: 1234 });
assert.deepEqual(primeiraNota(agora, agora, 'cache'), { origem: 'cache', ms: 0 });
assert.equal(primeiraNota(agora, agora - 1, 'cache'), null, 'relógio que recuou');
assert.equal(primeiraNota(agora, agora + PRIMEIRA_NOTA_MAX_MS + 1, 'ficheiro'), null, 'a app esteve suspensa');
assert.equal(primeiraNota(Number.NaN, agora, 'hls'), null);

console.log('Tocar enquanto descarrega: desliga-se depois de duas falhas do motor seguidas, volta ao fim de três dias, e mede a primeira nota.');
