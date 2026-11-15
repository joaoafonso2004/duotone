/**
 * A frase do registo fechado (15/11). Ver lib/mensagemDoRegisto.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-mensagem-do-registo.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mensagemDoRegisto, REGISTO_FECHADO } from '../src/lib/mensagemDoRegisto.ts';

// O que o servidor manda com o registo desligado no painel.
assert.equal(mensagemDoRegisto({ code: 'signup_disabled', message: 'Signups not allowed for this instance' }), REGISTO_FECHADO);
// Versões do servidor sem o código: só a frase.
assert.equal(mensagemDoRegisto({ message: 'Signups not allowed for this instance' }), REGISTO_FECHADO);
assert.equal(mensagemDoRegisto({ message: 'Sign-ups are not allowed' }), REGISTO_FECHADO);

// Os outros erros passam como vêm: já se percebem.
assert.equal(mensagemDoRegisto({ message: 'Password should be at least 6 characters.' }), 'Password should be at least 6 characters.');
assert.equal(mensagemDoRegisto({ code: 'email_address_invalid', message: 'Email address "x" is invalid' }), 'Email address "x" is invalid');
// Sem erro, sem frase; um erro sem texto não fica em branco.
assert.equal(mensagemDoRegisto(null), null);
assert.equal(mensagemDoRegisto({ message: '' }), "Couldn't create the account. Try again.");

// O registo das duas plataformas passa por aqui: o iPhone (AuthScreen) e o PC
// (RootNavigator.web) chamam o mesmo `signUp` da store.
const auth = readFileSync(new URL('../src/state/auth.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
assert.match(auth, /return mensagemDoRegisto\(error\);/, 'o signUp devolve a frase traduzida');

console.log('test-mensagem-do-registo: tudo certo');
