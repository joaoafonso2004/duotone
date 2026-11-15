/**
 * A interface em francês (15/11): o motor, o dicionário, e as ligações que
 * fazem a tradução correr no iPhone e no PC -- src/i18n.
 *
 * Correr: node --experimental-strip-types scripts/test-idiomas.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarTradutor } from '../src/i18n/motor.ts';
import { FR } from '../src/i18n/fr.ts';
import { CHAVE_DO_IDIOMA, IDIOMA_DE_ORIGEM, IDIOMAS, lerIdioma } from '../src/i18n/idioma.ts';
import { eConteudo, marcarConteudo } from '../src/i18n/conteudo.ts';

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

console.log('\no motor');
const dic = {
  'Liked Songs': 'Titres likés',
  'Library': 'Bibliothèque',
  'Home': 'Accueil',
  'songs': 'titres',
  'Added {0} to {1}.': '{0} ajouté à {1}.',
  'Added {0} to Liked Songs.': '{0} ajouté aux Titres likés.',
  'Cleared {0} song{1}': '{0} titre{1} effacé(s)',
  '{0:n} of {1:n}': '{0} sur {1}',
  '{0} {1}': 'nunca',
  '{0} songs': '{0} titres',
};
const t = criarTradutor(dic, eConteudo);
caso('exato, e o que não conhece fica igual', () => {
  assert.equal(t('Liked Songs'), 'Titres likés');
  assert.equal(t('Something unknown'), 'Something unknown');
  assert.equal(t(''), '');
  assert.equal(t('42'), '42');
});
caso('os espaços à volta ficam, e os de dentro contam como um', () => {
  assert.equal(t('  Library '), '  Bibliothèque ');
  assert.equal(t('Liked\n   Songs'), 'Titres likés');
});
caso('em maiúsculas, se o texto vier em maiúsculas', () => {
  assert.equal(t('LIBRARY'), 'BIBLIOTHÈQUE');
});
caso('moldes, o mais específico primeiro', () => {
  assert.equal(t('Added Blinding Lights to Chill.'), 'Blinding Lights ajouté à Chill.');
  assert.equal(t('Added Blinding Lights to Liked Songs.'), 'Blinding Lights ajouté aux Titres likés.');
});
caso('um plural colado à palavra pode vir vazio', () => {
  assert.equal(t('Cleared 1 song'), '1 titre effacé(s)');
  assert.equal(t('Cleared 3 songs'), '3 titres effacé(s)');
});
caso('{0:n} só aceita números', () => {
  assert.equal(t('3 of 40'), '3 sur 40');
  assert.equal(t('Love of Mine'), 'Love of Mine');
});
caso('um molde só de variáveis nunca entra (apanhava tudo)', () => {
  assert.equal(t('Blinding Lights'), 'Blinding Lights');
});
caso('linhas compostas: cada pedaço entre " · "', () => {
  assert.equal(t('Liked Songs · 12 songs'), 'Titres likés · 12 titres');
  assert.equal(t('Unknown thing · Library'), 'Unknown thing · Bibliothèque');
});
caso('um título ou um artista marcado como conteúdo nunca se traduz', () => {
  marcarConteudo('Home');
  assert.equal(t('Home'), 'Home');
  assert.equal(t('Library · Home'), 'Bibliothèque · Home');
});

console.log('\no dicionário');
const ph = (s: string) => new Set([...s.matchAll(/\{(\d+)(?::n)?\}/g)].map((m) => m[1]));
caso('nenhuma tradução vazia nem igual ao inglês', () => {
  for (const [de, para] of Object.entries(FR)) {
    assert.ok(para && para.trim(), `vazia: ${de}`);
    assert.notEqual(para, de, `igual: ${de}`);
  }
});
caso('as variáveis da tradução existem na chave', () => {
  for (const [de, para] of Object.entries(FR)) {
    for (const v of ph(para)) assert.ok(ph(de).has(v), `${de} -> ${para}: ${v} não está na chave`);
  }
});
caso('as chaves são inglês (do código), sem português', () => {
  for (const de of Object.keys(FR)) assert.ok(!/[ãõçâêô]|\bnão\b|música/i.test(de), de);
});
caso('os nomes das línguas não se traduzem', () => {
  assert.ok(!('English' in FR) && !('Français' in FR));
  assert.deepEqual(IDIOMAS.map(([, n]) => n), ['English', 'Français']);
});
caso('os textos principais estão lá', () => {
  for (const de of ['Liked Songs', 'Settings', 'Home', 'Search', 'Library', 'Play next', 'Add to queue', 'Start Radio', 'Language', 'Download Liked Songs', 'Show what your PC is playing', 'Show what your iPhone is playing']) {
    assert.ok(FR[de], de);
  }
});
caso('com o dicionário a sério, um texto da app sai em francês', () => {
  const fr = criarTradutor(FR);
  assert.equal(fr('Add to queue'), "Ajouter à la file d'attente");
  assert.equal(fr('Waiting for Wi-Fi · 40 of 312 on this iPhone'), 'En attente du Wi-Fi · 40 sur 312 sur cet iPhone');
  assert.equal(fr('Downloading 3 of 40 · new likes download too'), 'Téléchargement de 3 sur 40 · les nouveaux likes aussi');
  assert.equal(fr('Album · 12 songs'), 'Album · 12 titres');
  assert.equal(fr('Blinding Lights'), 'Blinding Lights');
});

console.log('\na língua');
caso('inglês por omissão, e só o francês muda', () => {
  assert.equal(IDIOMA_DE_ORIGEM, 'en');
  assert.equal(lerIdioma(null), 'en');
  assert.equal(lerIdioma('xx'), 'en');
  assert.equal(lerIdioma('fr'), 'fr');
});
caso('do aparelho: a chave não é uma pref: (o prefsSync não a leva)', () => {
  assert.ok(!CHAVE_DO_IDIOMA.startsWith('pref:'));
});

console.log('\nligado');
caso('o Metro passa o JSX da app (só fora da web e do node_modules) pelo runtime que traduz', () => {
  const metro = ler('metro.config.js');
  assert.match(metro, /'react\/jsx-runtime': path\.join\(PASTA_I18N, 'jsx-runtime\.ts'\)/);
  assert.match(metro, /'react\/jsx-dev-runtime': path\.join\(PASTA_I18N, 'jsx-dev-runtime\.ts'\)/);
  assert.match(metro, /platform !== 'web'/);
  assert.match(metro, /node_modules/);
  assert.match(metro, /!origem\.startsWith\(PASTA_I18N\)/);
});
caso('a entrada instala a tradução e espera pela língua antes do primeiro desenho', () => {
  const entrada = ler('index.ts');
  assert.match(entrada, /instalarTraducao\(\);/);
  assert.match(entrada, /comIdioma\(require\('\.\/App'\)\.default\)/);
});
caso('em inglês, o runtime do iPhone devolve as props intactas', () => {
  assert.match(ler('src/i18n/jsx-runtime.ts'), /if \(idiomaAtual\(\) === 'en' \|\| !props/);
});
caso('o PC só observa o DOM em francês', () => {
  assert.match(ler('src/i18n/instalar.web.ts'), /idiomaAtual\(\) !== 'fr'\) return;/);
});
caso('títulos e artistas marcam-se como conteúdo ao sair do artistName', () => {
  const a = ler('src/lib/artistName.ts');
  assert.match(a, /__duotoneConteudo/);
});
caso('as Definições das duas plataformas têm a escolha', () => {
  assert.match(ler('src/screens/SettingsScreen.tsx'), /escolherIdioma\(/);
  assert.match(ler('src/desktop/paginas/SettingsPage.web.tsx'), /escolherIdioma\(/);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
