/**
 * Sair da conta: as duas plataformas têm a porta, e sair leva a música.
 *
 * O PC ficou três semanas sem "Sign out" (3/9 a 27/9): o botão vivia na página
 * de perfil antiga, e quando ela passou a ser o SocialProfileView partilhado
 * sumiu -- sem erro nenhum, porque ninguém o chamava. E "apagar conta" saía sem
 * fechar o leitor, nas duas plataformas: quem entrasse a seguir encontrava a
 * música e a fila de outra pessoa. Só o "Sign out" do iPhone fechava, à mão.
 *
 * Correr: node scripts/test-sair-da-conta.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Sem os \r: no Windows (e no runner da build de Windows) o checkout vem em CRLF.
const ler = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ECRAS = {
  iPhone: 'src/screens/SettingsScreen.tsx',
  PC: 'src/desktop/paginas/SettingsPage.web.tsx',
};

let falhas = 0;
function verificar(nome, fn) {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}: ${e.message}`); }
}

verificar('o signOut fecha o leitor ANTES de a sessão ir', () => {
  const auth = ler('src/state/auth.ts');
  const corpo = auth.slice(auth.indexOf('signOut: async'));
  const fecha = corpo.indexOf('await antesDeSair()');
  const sai = corpo.indexOf('supabase.auth.signOut(');
  assert.ok(fecha > 0, 'o signOut não chama o que tem de parar antes de sair');
  assert.ok(sai > fecha, 'o leitor tem de fechar antes do supabase.auth.signOut');
  // Sem o leitor importado: a test-personalization-offline carrega esta loja sozinha.
  assert.doesNotMatch(auth, /from '\.\/player'/);
  // E quem o liga é o App.tsx, fora de qualquer ecrã.
  assert.match(ler('App.tsx'), /^registarAntesDeSair\(\(\) => usePlayer\.getState\(\)\.close\(\)\);/m);
});

for (const [plataforma, ficheiro] of Object.entries(ECRAS)) {
  const ecra = ler(ficheiro);
  verificar(`${plataforma}: as Definições têm Sign out e Reset password`, () => {
    assert.match(ecra, /label="Sign out"/);
    assert.match(ecra, /Reset password/);
    assert.match(ecra, /\.signOut\(\)|signOut\(\);/);
  });
  verificar(`${plataforma}: o ecrã não fecha o leitor por conta própria (é o signOut que o faz)`, () => {
    assert.doesNotMatch(ecra, /usePlayer\.getState\(\)\.close\(\)/);
  });
}

verificar('PC: sair pede confirmação, como no iPhone', () => {
  const pc = ler(ECRAS.PC);
  assert.match(pc, /<Dialog open=\{signOutConfirm\} title="Sign out\?"/);
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
