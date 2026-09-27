/**
 * Um skip não redesenha as listas inteiras (27/9).
 *
 * As listas do iPhone liam o `current` da store para acender a linha que toca,
 * e davam a cada linha funções novas a cada render -- o que desfazia o
 * `React.memo` do TrackRow. Com as abas todas montadas (`lazy: false`), cada
 * skip redesenhava todas as linhas montadas de todos esses ecrãs, no mesmo
 * instante em que o motor troca de faixa e a capa recua. Agora cada linha sabe
 * se é a que toca (`acompanharATocar`), e as listas grandes passam funções
 * estáveis que recebem a faixa.
 *
 * Sem renderizador de React Native em Node: prende-se o código.
 * Correr: node scripts/test-linhas-da-lista.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const linha = ler('src/components/TrackRow.tsx');
assert.match(linha, /acompanharATocar/, 'a linha tem o modo de se acender sozinha');
assert.match(linha, /usePlayer\(\(s\) =>\s*acompanharATocar && !!s\.current/,
  'e lê a faixa que toca com um seletor que só muda para ELA');
assert.match(linha, /onPress\(track\)/, 'o toque entrega a faixa: a lista pode passar uma função estável');
assert.match(linha, /onAction\(track\)/g);
assert.match(linha, /export const TrackRow = React\.memo\(/, 'e continua memorizada');

for (const ecra of [
  'src/screens/SongsScreen.tsx',
  'src/screens/PlaylistDetailScreen.tsx',
  'src/screens/SearchScreen.tsx',
  'src/screens/LibraryGroupScreen.tsx',
]) {
  const codigo = ler(ecra);
  assert.doesNotMatch(codigo, /usePlayer\(\(s\) => s\.current\)/,
    `${ecra} voltou a ler o current: cada skip redesenha o ecrã e as linhas`);
  assert.match(codigo, /acompanharATocar/, `${ecra} acende a que toca pela própria linha`);
}

const songs = ler('src/screens/SongsScreen.tsx');
assert.match(songs, /renderItem=\{desenharLinha\}/, 'as Liked Songs desenham as linhas com uma função estável');
assert.match(songs, /onPress=\{aoTocarNaLinha\}/);
assert.match(songs, /onAction=\{setActionTrack\}/);

const playlist = ler('src/screens/PlaylistDetailScreen.tsx');
assert.match(playlist, /onPress=\{aoTocarNaLinha\}/, 'a playlist passa o toque estável');
assert.match(playlist, /onAction=\{setActionTrack\}/);

console.log('Linhas da lista: um skip só mexe nas linhas que mudam.');
