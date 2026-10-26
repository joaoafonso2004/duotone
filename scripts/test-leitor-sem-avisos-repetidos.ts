/** Executa a store real com os duplos de disco/rede: registar-duplos.mjs. */
import assert from 'node:assert/strict';
import { usePlayer } from '../src/state/player.ts';
import { derivados, transicao, type EstadoDeReproducao } from '../src/lib/playbackMachine.ts';

await new Promise<void>(resolve => setImmediate(resolve)); // hidratação local
const faixa = { source: 'youtube' as const, sourceId: 'ensaio', title: 'Ensaio', artist: 'Local', durationSeconds: 240 };
usePlayer.setState({ current: faixa, queue: [faixa], queueIndex: 0,
  maquina: { intencao: 'tocar', fase: 'pronto' }, isPlaying: true, buffering: false, playbackConfirmed: true });
const maquina = usePlayer.getState().maquina;
let avisos = 0, mudancasDaMaquina = 0, posicoes = 0;
const largar = usePlayer.subscribe((s, p) => {
  avisos++;
  // É este o seletor do PlayerRoot; uma referência nova invalida o leitor inteiro.
  if (s.maquina !== p.maquina) mudancasDaMaquina++;
  if (s.positionMs !== p.positionMs) posicoes++;
});

for (let i = 0; i < 1200; i++) usePlayer.getState()._setBuffering(false);
assert.equal(avisos, 0, 'confirmar pronto repetidamente não notifica nem muda a store');
assert.equal(usePlayer.getState().maquina, maquina);
assert.equal(usePlayer.getState().playbackConfirmed, true);

// Um minuto de eventos a 20 Hz, como durante uma passagem do AutoMix.
for (let i = 1; i <= 1200; i++) {
  usePlayer.getState()._setBuffering(false);
  usePlayer.getState()._setProgress(5000 + i * 50, 240000);
}
assert.equal(posicoes, 1200, 'a barra e as letras continuam a receber todas as posições');
assert.equal(mudancasDaMaquina, 0, 'a posição não invalida o leitor inteiro');
assert.equal(usePlayer.getState().positionMs, 65000);

usePlayer.getState()._setBuffering(true);
assert.equal(usePlayer.getState().buffering, true);
assert.equal(usePlayer.getState().playbackConfirmed, false, 'um enchimento real limpa a confirmação de som');
assert.equal(mudancasDaMaquina, 1);
const emBuffering = avisos;
usePlayer.getState()._setBuffering(true);
assert.equal(avisos, emBuffering, 'um enchimento repetido também não redesenha');
usePlayer.getState()._setBuffering(false);
assert.equal(usePlayer.getState().buffering, false);
assert.equal(usePlayer.getState().playbackConfirmed, false, 'pronto não inventa uma confirmação de som');
usePlayer.getState()._onYtStateChange('playing');
assert.equal(usePlayer.getState().playbackConfirmed, true, 'a confirmação real ainda chega mesmo com fase pronto');
assert.equal(mudancasDaMaquina, 2);

// Não basta comparar o booleano buffering: em pausa ele é sempre false, mas
// o motor pode ainda estar a resolver. A fase e a intenção têm de sobreviver.
usePlayer.setState({ maquina: { intencao: 'parar', fase: 'a-resolver' }, isPlaying: false, buffering: false });
usePlayer.getState()._setBuffering(false);
assert.equal(usePlayer.getState().maquina.fase, 'pronto');
assert.equal(usePlayer.getState().isPlaying, false);
usePlayer.getState()._onYtStateChange('playing');
assert.equal(usePlayer.getState().isPlaying, false, 'uma confirmação atrasada não desfaz a pausa');
usePlayer.setState({ maquina: { intencao: 'tocar', fase: 'a-carregar' }, isPlaying: true, buffering: true, playbackConfirmed: true });
usePlayer.getState()._setBuffering(true);
assert.equal(usePlayer.getState().playbackConfirmed, false, 'mesma fase ainda pode ter uma confirmação a limpar');
largar();

for (const intencao of ['tocar', 'parar'] as const) {
  const pronto: EstadoDeReproducao = { intencao, fase: 'pronto' };
  for (const tipo of ['motor-pronto', 'a-tocar', 'em-pausa'] as const) {
    assert.equal(transicao(pronto, { tipo }), pronto);
    assert.equal(derivados(pronto).isPlaying, intencao === 'tocar');
  }
}
console.log('Leitor: 1200 posições, zero invalidações da máquina; buffering e pausa preservados.');
