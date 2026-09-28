/**
 * A interface não diz de onde vem o som (27/9, João: "não quero que haja
 * rastros de que é usado o YouTube"). Prende as frases que o diziam, nas duas
 * plataformas: separadores, pesquisa, avisos, Definições, Library check.
 *
 * Fica de fora, de propósito, o que é sobre o utilizador trazer as PLAYLISTS
 * dele (importar de um link do YouTube ou do YouTube Music), e o relatório de
 * reprodução, que é para quem mantém a app.
 *
 * Correr: node scripts/test-sem-youtube-na-interface.mjs
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const ficheiros = [];
(function andar(dir) {
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) andar(p);
    else if (/\.(tsx?|jsx?)$/.test(nome)) ficheiros.push(p);
  }
})(raiz);

const PROIBIDAS = [
  'On YouTube',
  'Find tracks on YouTube',
  'Search YouTube',
  'YouTube is blocking',
  'YouTube is throttling',
  'YouTube refused',
  'throttled by YouTube',
  'YouTube picks',
  'bitrate YouTube offers',
  "YouTube’s reference",
  'then Flow, then YouTube',
  'YouTube Recommendation',
  'tracks on YouTube',
  'YouTube search is not responding',
  'found on YouTube',
  'on this artist on YouTube',
  'for this artist on YouTube',
  'made private on YouTube',
  'outside YouTube',
  'Age-restricted on YouTube',
  'Downloaded YouTube audio',
  "|| 'YouTube'",
  'Listen on YouTube',
];

const achadas = [];
for (const f of ficheiros) {
  const texto = readFileSync(f, 'utf8');
  for (const frase of PROIBIDAS) {
    if (texto.includes(frase)) achadas.push(`${path.relative(raiz, f)}: "${frase}"`);
  }
}
assert.deepEqual(achadas, [], `a interface voltou a dizer que usa o YouTube:\n${achadas.join('\n')}`);
console.log('Sem YouTube na interface: nenhuma das frases voltou.');
