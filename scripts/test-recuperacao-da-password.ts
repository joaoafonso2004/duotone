/**
 * A recuperação da palavra-passe por código (22/11): o que se valida, as frases
 * dos erros do Supabase, e as ligações no PC, no iPhone e na loja da sessão.
 *
 * Correr: node --experimental-strip-types scripts/test-recuperacao-da-password.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  erroDaPassword, erroDoCodigo, erroDoEmail, limparCodigo, mensagemDaRecuperacao, normalizarEmail, PASSWORD_MINIMA,
} from '../src/lib/recuperacaoDaPassword.ts';

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

caso('o código: só algarismos, colado com espaços ou traços', () => {
  assert.equal(limparCodigo(' 123 456 '), '123456');
  assert.equal(limparCodigo('12-34-56'), '123456');
  assert.equal(limparCodigo('12345678901234'), '1234567890', 'no máximo 10');
  assert.equal(erroDoCodigo('12345'), 'Enter the code from the email.');
  assert.equal(erroDoCodigo('123 456'), null);
  assert.equal(erroDoCodigo('12345678'), null, 'os projetos com códigos de 8 também servem');
});

caso('o email', () => {
  assert.equal(normalizarEmail('  Joa.Vieitas2@Gmail.com '), 'joa.vieitas2@gmail.com');
  assert.ok(erroDoEmail(''));
  assert.ok(erroDoEmail('zyn'), 'um username não serve: o código vai para um email');
  assert.equal(erroDoEmail('a@b.pt'), null);
});

caso('a palavra-passe nova', () => {
  assert.equal(PASSWORD_MINIMA, 6);
  assert.ok(erroDaPassword('12345', '12345'));
  assert.ok(erroDaPassword('123456', '123457'));
  assert.equal(erroDaPassword('123456', '123456'), null);
});

caso('os erros do Supabase em frases que se percebem', () => {
  assert.equal(mensagemDaRecuperacao(null), null);
  assert.match(mensagemDaRecuperacao({ code: 'otp_expired', message: 'Token has expired or is invalid' })!, /wrong or has expired/);
  assert.match(mensagemDaRecuperacao({ message: 'Token has expired or is invalid' })!, /wrong or has expired/);
  assert.match(mensagemDaRecuperacao({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' })!, /Too many attempts/);
  assert.match(mensagemDaRecuperacao({ status: 429, message: 'x' })!, /Too many attempts/);
  assert.match(mensagemDaRecuperacao({ code: 'same_password', message: 'New password should be different from the old password.' })!, /different from the old one/);
  assert.match(mensagemDaRecuperacao({ code: 'weak_password', message: 'Password should be at least 6 characters.' })!, /too weak/);
  assert.equal(mensagemDaRecuperacao({ message: 'Algo novo' }), 'Algo novo');
});

caso('a loja da sessão: código, palavra-passe nova, e só depois entra', () => {
  const auth = ler('src/state/auth.ts');
  assert.match(auth, /resetPasswordForEmail\(email\)/, 'manda o código para o email escrito, não para a conta aberta');
  assert.match(auth, /verifyOtp\(\{ email, token: limparCodigo\(codigo\), type: 'recovery' \}\)/);
  assert.match(auth, /updateUser\(\{ password: nova \}\)/);
  // A sessão do código fica retida: a app abria antes de a palavra-passe mudar.
  assert.match(auth, /if\(session&&aRecuperar\)\{sessaoRetida=session;return;\}/);
  assert.match(auth, /refreshSession:async\(\)=>\{\n\s*if\(aRecuperar\)return;/, 'voltar à app também não a solta antes do tempo');
  const ordem = ['verifyOtp(', 'updateUser({ password: nova })', 'set({ session: sessao,'].map((t) => auth.indexOf(t));
  assert.ok(ordem.every((i, k) => i > 0 && (k === 0 || i > ordem[k - 1])), 'confirmar, mudar, e só depois soltar');
  assert.ok(!/resetPassword: async/.test(auth), 'o link sem destino (localhost:3000) saiu');
});

caso('o PC e o iPhone usam-na, no início de sessão e nas Definições', () => {
  const navegador = ler('src/navigation/RootNavigator.web.tsx');
  assert.match(navegador, /Forgot password\?/, 'o PC tem a porta no início de sessão');
  assert.match(navegador, /<RecuperarPassword /);
  assert.match(ler('src/desktop/paginas/SettingsPage.web.tsx'), /<RecuperarPassword /);
  const ecra = ler('src/screens/AuthScreen.tsx');
  assert.match(ecra, /setARecuperar\(true\)/, 'o "Forgot password?" do iPhone já faz alguma coisa');
  assert.match(ecra, /<RecuperarPassword /);
  assert.match(ler('src/screens/SettingsScreen.tsx'), /<RecuperarPassword /);
  for (const f of ['src/desktop/RecuperarPassword.web.tsx', 'src/components/RecuperarPassword.tsx']) {
    const t = ler(f);
    assert.match(t, /pedirCodigoDeRecuperacao/, f);
    assert.match(t, /mudarPasswordComCodigo/, f);
    assert.match(t, /cancelarRecuperacao/, f);
  }
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');
