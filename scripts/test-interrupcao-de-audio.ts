import assert from 'node:assert/strict';
import { deveRetomar } from '../src/lib/interrupcaoDeAudio.ts';

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

console.log('Interrupção de áudio: só se retoma o que estava a tocar e o sistema devolve.');
