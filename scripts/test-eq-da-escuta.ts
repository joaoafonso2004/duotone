import assert from 'node:assert/strict';
import { ganhosEmVigor, usePlayer } from '../src/state/player.ts';

const local = Array(10).fill(2), amigo = Array(10).fill(7), carro = Array(10).fill(-3);
const memoria = { 'youtube:guardada': { rate: 0.8, ganhos: local, visto: 100 } };
const aplicados: number[][] = [];
(globalThis as any).window = { duotoneDesktop: { aplicarEqualizador: async ({ ganhos }: { ganhos: number[] }) => {
  aplicados.push([...ganhos]); return { ok: true };
} } };
usePlayer.setState({ eqGanhos: local, padraoGanhos: local, ajustesPorFaixa: memoria,
  playbackRate: 1.2, eqDaEscuta: null, carro: { ganhos: carro } as any });
const ler = () => usePlayer.getState();
assert.deepEqual(ganhosEmVigor(ler()), carro);
ler()._aplicarEqDaEscuta(amigo);
assert.deepEqual(ganhosEmVigor(ler()), amigo, 'o som do amigo prevalece sobre o preset do carro');
assert.deepEqual(aplicados.at(-1), amigo, 'o PC recebe mesmo a curva remota');
assert.equal(ler().eqGanhos, local);
assert.equal(ler().ajustesPorFaixa, memoria, 'os ajustes remotos não são guardados na faixa');
assert.equal(ler().padraoGanhos, local);
assert.equal(ler().playbackRate, 1.2, 'a velocidade pessoal fica à espera, como antes');
const n = aplicados.length;
ler()._aplicarEqDaEscuta([...amigo]);
assert.equal(aplicados.length, n, 'o tique local não reaplica o mesmo EQ a cada segundo');
const guardado = usePlayer.persist.getOptions().partialize!(ler()) as any;
assert.ok(!('eqDaEscuta' in guardado), 'a curva da escuta não sobrevive como preferência pessoal');
ler()._aplicarEqDaEscuta(null);
assert.deepEqual(ganhosEmVigor(ler()), carro);
assert.deepEqual(aplicados.at(-1), carro, 'sair da escuta repõe o som pessoal em vigor');
usePlayer.setState({ carro: null });
assert.deepEqual(ganhosEmVigor(ler()), local);
delete (globalThis as any).window;
console.log('Listening with: EQ aplicado ao motor, prioridade, deduplicação e preferências pessoais preservadas.');
