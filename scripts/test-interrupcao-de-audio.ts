import assert from 'node:assert/strict';
import { deveRetomar, ehInterna, type Saida } from '../src/lib/interrupcaoDeAudio.ts';

// O caso que motivou tudo isto: estava a tocar, um vídeo do Instagram roubou o
// áudio, acabou, e o iOS devolve-o a pedir a retoma.
assert.equal(deveRetomar({ tocavaAntes: true, oSistemaPede: true }), true);

// Outra app de MÚSICA ficou com o áudio: o iOS não pede retoma nenhuma, e
// voltar a tocar punha-nos por cima dela.
assert.equal(deveRetomar({ tocavaAntes: true, oSistemaPede: false }), false);

// A interrupção apanhou a música já em pausa: não há nada para devolver, e
// arrancar som que ninguém pediu é pior do que não fazer nada.
assert.equal(deveRetomar({ tocavaAntes: false, oSistemaPede: true }), false);

// Nenhuma das duas.
assert.equal(deveRetomar({ tocavaAntes: false, oSistemaPede: false }), false);

const airpodsMusica: Saida = { tipo: 'BluetoothA2DPOutput', nome: 'AirPods Pro' };
const airpodsChamada: Saida = { tipo: 'BluetoothHFP', nome: 'AirPods Pro' };
const altifalante: Saida = { tipo: 'Speaker', nome: 'Speaker' };
const auscultador: Saida = { tipo: 'Receiver', nome: 'Receiver' };
const fios: Saida = { tipo: 'Headphones', nome: 'Headphones' };

// REGRESSÃO (16/9): chamada com AirPods. O iOS troca de perfil a meio e diz
// que a saída anterior desapareceu; a música não voltava no fim da chamada.
assert.equal(deveRetomar({
  tocavaAntes: true, oSistemaPede: true,
  saidaAntes: airpodsMusica, saidaDepois: airpodsChamada, saidaRemovidaAMeio: true,
}), true);
assert.equal(deveRetomar({
  tocavaAntes: true, oSistemaPede: true,
  saidaAntes: airpodsChamada, saidaDepois: airpodsMusica, saidaRemovidaAMeio: true,
}), true);

// Chamada no altifalante ou no auscultador do telefone: volta ao altifalante.
assert.equal(deveRetomar({
  tocavaAntes: true, oSistemaPede: true, saidaAntes: altifalante, saidaDepois: auscultador,
}), true);
assert.equal(deveRetomar({
  tocavaAntes: true, oSistemaPede: true, saidaAntes: auscultador, saidaDepois: altifalante,
}), true);

// Os auscultadores ficaram sem bateria ou foram tirados durante a chamada:
// a música não pode ir para o altifalante.
assert.equal(deveRetomar({
  tocavaAntes: true, oSistemaPede: true,
  saidaAntes: airpodsMusica, saidaDepois: altifalante, saidaRemovidaAMeio: true,
}), false);
assert.equal(deveRetomar({
  tocavaAntes: true, oSistemaPede: true, saidaAntes: fios, saidaDepois: altifalante,
}), false);

// Pôr auscultadores durante a chamada não é razão para ficar calado.
assert.equal(deveRetomar({
  tocavaAntes: true, oSistemaPede: true, saidaAntes: altifalante, saidaDepois: fios,
}), true);

// Um binário antigo não traz as saídas: o aviso a meio continua a proteger.
assert.equal(deveRetomar({ tocavaAntes: true, oSistemaPede: true, saidaRemovidaAMeio: true }), false);
assert.equal(deveRetomar({
  tocavaAntes: true, oSistemaPede: true, saidaAntes: airpodsMusica, saidaRemovidaAMeio: true,
}), false);

// As saídas também não tiram as outras duas regras.
assert.equal(deveRetomar({
  tocavaAntes: true, oSistemaPede: false, saidaAntes: altifalante, saidaDepois: altifalante,
}), false);
assert.equal(deveRetomar({
  tocavaAntes: false, oSistemaPede: true, saidaAntes: altifalante, saidaDepois: altifalante,
}), false);

assert.equal(ehInterna(altifalante), true);
assert.equal(ehInterna(airpodsChamada), false);
assert.equal(ehInterna(null), false);

console.log('Interrupção de áudio: só se retoma o que estava a tocar, o sistema devolve, e sem mandar os AirPods perdidos para o altifalante.');
