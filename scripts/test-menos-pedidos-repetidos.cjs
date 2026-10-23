/**
 * Menos pedidos repetidos ao Supabase (23/10, os logs: 1,59 GB num ciclo de 1).
 *
 * - Os perfis públicos ficam 30 min em memória (`api/profiles.ts`): cada
 *   atualização do Social pedia outra vez o nome e a fotografia das mesmas
 *   pessoas. Uma mudança num perfil (Realtime) e sair da conta esquecem-nos.
 * - O catálogo das faixas pergunta à tabela partilhada UMA vez por faixa em
 *   cada sessão (`state/catalogoDeFaixas.ts`): as que ficavam por resolver
 *   voltavam todas à tabela a cada leitura da biblioteca.
 *
 * Correr: node scripts/test-menos-pedidos-repetidos.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const { createStore } = require('zustand/vanilla');

let agora = 1_000_000;
const DataFalsa = class extends Date { static now() { return agora; } };
const carregar = (nome, mocks) => {
  const modulo = { exports: {} };
  const ficheiro = path.resolve(__dirname, '..', nome);
  const codigo = ts.transpileModule(fs.readFileSync(ficheiro, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports, Date: DataFalsa, console, Promise, Map, Set,
    require: (n) => { if (!(n in mocks)) throw Error(`${nome}: ${n}`); return mocks[n]; } }, { filename: ficheiro });
  return modulo.exports;
};

async function main() {
  // --- os perfis ---
  const pedidos = [];
  const perfis = carregar('src/api/profiles.ts', {
    '../lib/supabase': { supabase: { rpc: async (nome, args) => {
      pedidos.push([nome, [...args.p_ids]]);
      return { data: args.p_ids.filter((id) => id !== 'apagado').map((id) => ({ id, name: id, username: id, avatar_url: null })), error: null };
    } } },
  });
  const ids = (lista) => lista.map((p) => p.id).join(',');

  assert.equal(ids(await perfis.getPublicProfiles(['a', 'b', 'a', ''])), 'a,b', 'sem repetidos nem vazios');
  assert.equal(JSON.stringify(pedidos), JSON.stringify([['get_public_profiles', ['a', 'b']]]));
  assert.equal(ids(await perfis.getPublicProfiles(['b', 'c', 'a'])), 'b,c,a', 'pela ordem pedida');
  assert.equal(JSON.stringify(pedidos[1]), JSON.stringify(['get_public_profiles', ['c']]), 'só o que faltava');
  await perfis.getPublicProfiles(['a', 'b', 'c']);
  assert.equal(pedidos.length, 2, 'tudo em memória: nenhum pedido');

  agora += 30 * 60_000;
  await perfis.getPublicProfiles(['a']);
  assert.equal(JSON.stringify(pedidos[2]), JSON.stringify(['get_public_profiles', ['a']]), 'passados 30 min, relê');

  perfis.esquecerPerfisPublicos();
  await perfis.getPublicProfiles(['b']);
  assert.equal(JSON.stringify(pedidos[3]), JSON.stringify(['get_public_profiles', ['b']]), 'depois de esquecer, relê');

  assert.equal(ids(await perfis.getPublicProfiles(['apagado', 'b'])), 'b', 'quem não existe não vem');
  assert.equal(JSON.stringify(pedidos[4]), JSON.stringify(['get_public_profiles', ['apagado']]));
  assert.equal((await perfis.getPublicProfiles([])).length, 0);
  assert.equal(pedidos.length, 5, 'uma lista vazia não pede');

  // E quem os esquece: o Realtime dos perfis e sair da conta.
  const ler = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
  assert.match(ler('src/state/social.ts'), /table: 'profiles' \}, \(\)=>\{esquecerPerfisPublicos\(\);/);
  assert.match(ler('src/state/auth.ts'), /esquecerPerfisPublicos\(\);\n\s+await supabase\.auth\.signOut/);

  // --- o catálogo ---
  const lidas = [];
  const catalogo = carregar('src/state/catalogoDeFaixas.ts', {
    zustand: { create: (f) => createStore(f) },
    '../api/catalogo': { resolverFaixa: async () => null },
    '../api/catalogoDeFaixas': {
      chaveDoCatalogo: (s, id) => `${s}:${id}`,
      lerCatalogoDeFaixas: async (faixas) => { lidas.push(faixas.map((f) => f.sourceId)); return new Map(); },
      guardarNoCatalogo: async () => {}, marcarSemEdicao: async () => {},
    },
    '../lib/artistName': {
      displayArtist: (t) => t.artist, chaveDeArtista: (n) => String(n).toLowerCase(),
      nomesDeConfianca: () => new Set(), tituloDaFaixa: (t) => t.title,
    },
  });
  const faixa = (id) => ({ source: 'youtube', sourceId: id, title: id, artist: 'X', durationSeconds: 200 });
  const biblioteca = Array.from({ length: 30 }, (_, i) => faixa(`f${i}`));
  await catalogo.garantirCatalogo(biblioteca);
  assert.equal(lidas.length, 1);
  assert.equal(lidas[0].length, 30, 'a primeira leitura pergunta pelas 30');
  await catalogo.garantirCatalogo(biblioteca);
  assert.equal(lidas.length, 1, 'a segunda não volta à tabela (eram 18 por resolver, perguntadas outra vez)');
  await catalogo.garantirCatalogo([...biblioteca, faixa('nova')]);
  assert.equal(JSON.stringify(lidas[1]), JSON.stringify(['nova']), 'uma faixa nova pergunta-se, só ela');

  console.log('Menos pedidos repetidos: os perfis em memória 30 min e o catálogo uma vez por faixa passaram.');
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
