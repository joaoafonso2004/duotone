// As guardadas em memória (state/saved.ts) são de UMA conta.
//
// Nunca se limpavam ao mudar de conta (27/9). Além dos corações errados até uma
// página reler, o `loaded` e o número decidem o questionário da primeira vez:
// uma conta nova no mesmo aparelho, depois de uma com dez ou mais guardadas, era
// dada como "já usa a app" -- e o "feito" ficava gravado na conta nova.
//
// Correr com os duplos: node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-guardadas-por-conta.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { controlo } from './duplos/controlo.ts';
import { useSaved } from '../src/state/saved.ts';
import { decidirBoasVindas } from '../src/lib/boasVindas.ts';
import type { Track } from '../src/types.ts';

const faixa = (i: number): Track => ({
  source: 'youtube', sourceId: `v${i}`, title: `Música ${i}`, artist: 'Alguém',
  artworkUrl: null, durationSeconds: 200, album: null,
});

// A conta que sai tem doze guardadas.
controlo.biblioteca = Array.from({ length: 12 }, (_, i) => faixa(i));
await useSaved.getState().refresh();
assert.equal(useSaved.getState().loaded, true);
assert.equal(useSaved.getState().keys.size, 12);

const perguntar = () => decidirBoasVindas({
  feito: false, // a conta nova ainda não o fez
  bibliotecaLida: useSaved.getState().loaded,
  guardadas: useSaved.getState().keys.size,
  aberturaAFrente: false,
});
assert.equal(perguntar(), 'marcar-feito', 'o caso que existia: a conta nova herdava as guardadas da anterior');

// Muda-se de conta.
useSaved.getState().limpar();
assert.equal(useSaved.getState().keys.size, 0, 'os corações de quem saiu desaparecem');
assert.equal(useSaved.getState().loaded, false);
assert.equal(perguntar(), 'esperar', 'a conta nova espera pela SUA biblioteca antes de decidir');

// E quando a biblioteca da conta nova chega (vazia), o questionário aparece.
controlo.biblioteca = [];
await useSaved.getState().refresh();
assert.equal(perguntar(), 'mostrar');

// Quem limpa é a mudança de conta, no App.tsx.
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n'); // CRLF no Windows
assert.match(app, /useEffect\(\(\) => \(\) => \{[^}]*useSaved\.getState\(\)\.limpar\(\);[^}]*\}, \[userId\]\);/s,
  'o efeito da conta (cleanup com [userId]) tem de limpar as guardadas');

console.log('Guardadas por conta: passou.');
