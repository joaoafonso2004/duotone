// A ponte da casca Tauri (desktop/src/ponte.js) contra a do Electron
// (electron/preload.cjs), e cada comando que ela chama contra as três listas que
// o Tauri exige. Sem isto, um comando que falte numa delas é recusado em silêncio
// ("not allowed by ACL") e a página lê a falha como "não há".
//
// Lê código como texto: normaliza os finais de linha (o CI do Windows faz
// checkout com CRLF).
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const preload = ler('electron/preload.cjs');
const ponte = ler('desktop/src/ponte.js');
const build = ler('desktop/build.rs');
const capacidade = JSON.parse(ler('desktop/capabilities/default.json'));
const main = ler('desktop/src/main.rs');

// As chaves de cada objeto exposto (a indentação é a de cada ficheiro).
const objeto = preload.slice(preload.indexOf("exposeInMainWorld('duotoneDesktop'"), preload.indexOf("exposeInMainWorld('duotoneDesktop'") + 20000);
const doElectron = new Set([...objeto.slice(0, objeto.indexOf('\n}));')).matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
const bloco = ponte.slice(ponte.indexOf('const ponte = {'), ponte.indexOf('\n  };', ponte.indexOf('const ponte = {')));
const doTauri = [...bloco.matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]);

assert.ok(doElectron.size > 40, `o preload tem ${doElectron.size} chaves: a leitura falhou`);
assert.ok(doTauri.length > 5, 'a ponte do Tauri tem de ter chaves');
// As que só existem no Tauri: o motor só de áudio (decidido a 21/11: não entra no Electron).
const SO_DO_TAURI = new Set(['pedirAoInnerTube', 'sondarAudio', 'registarAudio', 'audioNaCache']);
for (const chave of doTauri) assert.ok(doElectron.has(chave) || SO_DO_TAURI.has(chave), `"${chave}" não existe no preload do Electron (erro de nome?)`);
assert.equal(new Set(doTauri).size, doTauri.length, 'chave repetida na ponte');

// Só no frame principal e na origem da app: a ponte corre em todos os frames.
assert.match(ponte, /if \(window\.top !== window \|\| location\.origin !== '__ORIGEM__'/);

// Cada comando chamado: declarado no build.rs, autorizado na capability, registado no main.rs.
const comandos = [...new Set([...ponte.matchAll(/(?:invoke|pedir)\('([a-z_]+)'/g)].map((m) => m[1]))];
assert.ok(comandos.length > 0);
const declarados = new Set([...build.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
const permissoes = new Set(capacidade.permissions);
for (const c of comandos) {
  assert.ok(declarados.has(c), `"${c}" não está no AppManifest do desktop/build.rs`);
  assert.ok(permissoes.has(`allow-${c.replace(/_/g, '-')}`), `"allow-${c.replace(/_/g, '-')}" não está na capability`);
  assert.match(main, new RegExp(`(?:ponte|rede|audio)::${c}\\b`), `"${c}" não está no generate_handler do main.rs`);
}
// A capability nunca aceita curingas na origem (a ponte existe no frame do YouTube).
for (const url of capacidade.remote.urls) assert.match(url, /^http:\/\/localhost:\d+(\/\*)?$/, `origem larga demais: ${url}`);

const faltam = [...doElectron].filter((k) => !doTauri.includes(k));
console.log(`Ponte Tauri: ${doTauri.filter((k) => doElectron.has(k)).length} de ${doElectron.size} chaves do preload (mais ${doTauri.filter((k) => SO_DO_TAURI.has(k)).length} só do Tauri), ${comandos.length} comandos declarados, autorizados e registados. Por fazer: ${faltam.length}.`);
