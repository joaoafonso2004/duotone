/**
 * Quando é que um amigo aparece "Online now" -- src/lib/presencaAtiva.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-presenca-ativa.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INATIVO_NO_COMPUTADOR_S, contaComoAtivo } from '../src/lib/presencaAtiva.ts';

const base = { visivel: false, aTocar: true, computador: true, inativoS: 30 };

// A app à frente conta sempre, nas duas plataformas, a tocar ou não.
assert.equal(contaComoAtivo({ ...base, visivel: true, aTocar: false, inativoS: null }), true);
assert.equal(contaComoAtivo({ ...base, visivel: true, computador: false, inativoS: null }), true);

// A queixa de 18/9: no PC, com outra app à frente e música a tocar, quem está
// a usar o computador continua online.
assert.equal(contaComoAtivo(base), true, 'PC tapado, música a tocar, pessoa ao PC: online');
assert.equal(contaComoAtivo({ ...base, inativoS: INATIVO_NO_COMPUTADOR_S - 1 }), true);

// Quem deixou a música a tocar e saiu do PC deixa de estar online.
assert.equal(contaComoAtivo({ ...base, inativoS: INATIVO_NO_COMPUTADOR_S }), false,
  'dez minutos sem rato nem teclado: já não está lá');
assert.equal(contaComoAtivo({ ...base, inativoS: 8 * 3600 }), false, 'a rádio a tocar a noite toda não é estar online');

// Sem música, a janela tapada é ausência, como antes.
assert.equal(contaComoAtivo({ ...base, aTocar: false }), false);

// No iPhone, música no bolso continua a NÃO contar (presenca-online-so-em-primeiro-plano.sql).
assert.equal(contaComoAtivo({ ...base, computador: false }), false, 'iPhone em segundo plano não conta');

// Sem saber a inatividade (browser sem ponte do Electron), fica-se do lado seguro.
assert.equal(contaComoAtivo({ ...base, inativoS: null }), false);
assert.equal(contaComoAtivo({ ...base, inativoS: Number.NaN }), false);
assert.equal(contaComoAtivo({ ...base, inativoS: -5 }), false);

// A regra só serve se o publicador a usar -- e se só perguntar a inatividade
// no PC, com a janela escondida e música a tocar.
const publicador = readFileSync(new URL('../src/lib/presenceSync.ts', import.meta.url), 'utf8');
assert.match(publicador, /contaComoAtivo\(/, 'o presenceSync decide pelo contaComoAtivo');
assert.doesNotMatch(publicador, /const ativo = appEstaVisivel\(\)/, 'o online não volta a ser só a janela à vista');
const principal = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
assert.match(principal, /'sistema:segundos-sem-interacao'[\s\S]{0,160}daJanelaPrincipal\(event\)/,
  'só a janela principal pergunta pela inatividade');
const ponte = readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
assert.match(ponte, /segundosSemInteracao: \(\) => ipcRenderer\.invoke\('sistema:segundos-sem-interacao'\)/);

console.log('Presença ativa: PC tapado a tocar conta, ausente/iPhone/sem ponte não.');
