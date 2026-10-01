/**
 * Quando é que um amigo aparece "Online now" -- src/lib/presencaAtiva.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-presenca-ativa.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INATIVO_NO_COMPUTADOR_S, contaComoAtivo, estaAoComputador } from '../src/lib/presencaAtiva.ts';

const base = { visivel: false, computador: true, inativoS: 30 };

// A app à frente conta sempre, nas duas plataformas.
assert.equal(contaComoAtivo({ ...base, visivel: true, inativoS: null }), true);
assert.equal(contaComoAtivo({ ...base, visivel: true, computador: false, inativoS: null }), true);

// As queixas de 18/9 e 1/10: no PC, com a janela tapada ou minimizada, quem
// está a usar o computador continua online -- a tocar ou não (a regra já não
// recebe se há música).
assert.equal(contaComoAtivo(base), true, 'PC minimizado, pessoa ao PC: online');
assert.equal(contaComoAtivo({ ...base, inativoS: INATIVO_NO_COMPUTADOR_S - 1 }), true);

// Quem deixou a música a tocar e saiu do PC deixa de estar online.
assert.equal(contaComoAtivo({ ...base, inativoS: INATIVO_NO_COMPUTADOR_S }), false,
  'dez minutos sem rato nem teclado: já não está lá');
assert.equal(contaComoAtivo({ ...base, inativoS: 8 * 3600 }), false, 'a app aberta a noite toda não é estar online');

// No iPhone, música no bolso continua a NÃO contar (presenca-online-so-em-primeiro-plano.sql).
assert.equal(contaComoAtivo({ ...base, computador: false }), false, 'iPhone em segundo plano não conta');

// Sem saber a inatividade (browser sem ponte do Electron), fica-se do lado seguro.
assert.equal(contaComoAtivo({ ...base, inativoS: null }), false);
assert.equal(contaComoAtivo({ ...base, inativoS: Number.NaN }), false);
assert.equal(contaComoAtivo({ ...base, inativoS: -5 }), false);
assert.equal(estaAoComputador(0), true);
assert.equal(estaAoComputador(null), false);
assert.equal(estaAoComputador(Number.POSITIVE_INFINITY), false);

// A regra só serve se o publicador a usar -- e se perguntar a inatividade no
// PC com a janela escondida, haja música ou não.
const publicador = readFileSync(new URL('../src/lib/presenceSync.ts', import.meta.url), 'utf8');
assert.match(publicador, /contaComoAtivo\(/, 'o presenceSync decide pelo contaComoAtivo');
assert.match(publicador, /inativoS: !visivel && Platform\.OS === 'web' \? await segundosSemInteracao\(\)/,
  'a inatividade pergunta-se no PC escondido, sem depender da música');
// E só serve se ALGUÉM publicar com o PC escondido e parado: o batimento de
// sempre só corre à vista ou a tocar, e sem outro a pessoa caducava em 120 s.
assert.match(publicador, /const vigiaDoPc = Platform\.OS === 'web' \? setInterval\(/,
  'há um batimento para o PC escondido sem música');
assert.match(publicador, /estaAoComputador\(s\)\) void publicar\(\)/,
  'o batimento do PC escondido só publica com a pessoa ao computador');
assert.match(publicador, /clearInterval\(vigiaDoPc\)/, 'e pára ao terminar a presença');
// Escondido e sem som, o Chromium acorda os temporizadores de minuto a minuto:
// o intervalo tem de ficar abaixo dos 60 s para correr a cada 60, longe dos
// 120 s de validade do servidor.
const escondido = Number(/BATIMENTO_ESCONDIDO_NO_PC_MS=(\d[\d_]*)/.exec(publicador)?.[1].replace(/_/g, ''));
assert.ok(escondido > 0 && escondido <= 60_000, `batimento do PC escondido: ${escondido} ms`);
assert.doesNotMatch(publicador, /const ativo = appEstaVisivel\(\)/, 'o online não volta a ser só a janela à vista');
const principal = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
assert.match(principal, /'sistema:segundos-sem-interacao'[\s\S]{0,160}daJanelaPrincipal\(event\)/,
  'só a janela principal pergunta pela inatividade');
const ponte = readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
assert.match(ponte, /segundosSemInteracao: \(\) => ipcRenderer\.invoke\('sistema:segundos-sem-interacao'\)/);

console.log('Presença ativa: PC minimizado com a pessoa lá conta, ausente/iPhone/sem ponte não.');
