// Quando o questionário da primeira vez aparece (lib/boasVindas.ts).
import assert from 'node:assert/strict';
import { decidirBoasVindas } from '../src/lib/boasVindas.ts';

const base = { feito: false, bibliotecaLida: true, guardadas: 0, aberturaAFrente: false };
assert.equal(decidirBoasVindas(base), 'mostrar', 'conta nova vê-o');
assert.equal(decidirBoasVindas({ ...base, feito: true }), 'nada', 'uma vez por conta');
assert.equal(decidirBoasVindas({ ...base, feito: null }), 'esperar', 'antes de ler a preferência não se decide');
assert.equal(decidirBoasVindas({ ...base, bibliotecaLida: false }), 'esperar', 'nem antes de ler a biblioteca');
assert.equal(decidirBoasVindas({ ...base, aberturaAFrente: true }), 'esperar', 'nada por cima da abertura');
assert.equal(decidirBoasVindas({ ...base, guardadas: 9 }), 'mostrar');
assert.equal(decidirBoasVindas({ ...base, guardadas: 10 }), 'marcar-feito', 'quem já usa a app não o vê numa atualização');
console.log('Boas-vindas: passou.');
