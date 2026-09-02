import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carrega os módulos reais com rede/cache substituídas; não copia a lógica testada.
function ambiente(fetch, substituicoes = {}) {
  const cache = new Map();
  const modulos = new Map();
  const stubs = {
    'src/api/cache.ts': {
      DIA_MS: 86400000,
      cacheGet: async (chave) => cache.get(chave) ?? null,
      cacheSet: async (chave, valor) => cache.set(chave, valor),
    },
    ...substituicoes,
  };
  function carregar(relativo) {
    const nome = relativo.replaceAll('\\', '/');
    if (stubs[nome]) return stubs[nome];
    if (modulos.has(nome)) return modulos.get(nome).exports;
    const ficheiro = path.join(raiz, nome);
    const codigo = ts.transpileModule(fs.readFileSync(ficheiro, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    modulos.set(nome, module);
    const contexto = vm.createContext({
      module, exports: module.exports, fetch, console, setTimeout, clearTimeout, AbortController,
      require: (pedido) => {
        if (!pedido.startsWith('.')) return require(pedido);
        const destino = path.relative(raiz, path.resolve(path.dirname(ficheiro), pedido));
        return carregar(destino.endsWith('.ts') ? destino : `${destino}.ts`);
      },
    });
    vm.runInContext(codigo, contexto, { filename: ficheiro });
    return module.exports;
  }
  return { carregar, cache };
}
const resposta = (corpo) => ({ ok: true, json: async () => corpo });

let livres = 0, pagas = 0, falhar = false;
const pesquisa = ambiente(async () => {}, {
  'src/api/ytSearchFree.ts': { searchYouTubeFree: async () => { livres++; if (falhar) throw Error('Falha'); return []; } },
  'src/api/youtube.ts': { searchYouTube: async () => { pagas++; return ['alternativa']; } },
}).carregar('src/api/search.ts');
assert.equal((await pesquisa.pesquisarMusica('sem resultados')).length, 0);
assert.equal(pagas, 0, 'Uma pesquisa livre vazia não gasta quota');
falhar = true;
assert.equal((await pesquisa.pesquisarMusica('falha de rede'))[0], 'alternativa');
assert.equal(livres, 2);
assert.equal(pagas, 1, 'A alternativa só entra quando a livre falha');
const cancelada = new AbortController();
cancelada.abort();
await pesquisa.pesquisarMusica('texto apagado', cancelada.signal);
assert.equal(livres, 2, 'Um pedido já cancelado nem começa');
assert.equal(pagas, 1, 'Um pedido cancelado não gasta quota');

let pedidos = 0, offline = true;
const rede = ambiente(async () => { pedidos++; if (offline) throw Error('Sem rede'); return resposta({ data: [] }); });
const catalogo = rede.carregar('src/api/catalogo.ts');
await assert.rejects(catalogo.vizinhancaDe('Artista ausente'));
assert.equal(rede.cache.size, 0, 'Uma falha de rede não fica como ausência durante 30 dias');
offline = false;
await Promise.all([catalogo.vizinhancaDe('Artista ausente'), catalogo.vizinhancaDe('Artista ausente')]);
assert.equal(pedidos, 2, 'Consultas simultâneas partilham o mesmo pedido');
await catalogo.vizinhancaDe('Artista ausente');
assert.equal(pedidos, 2, 'O resultado negativo vem da cache');

let idasAoCatalogo = 0;
const completo = ambiente(async (endereco) => {
  idasAoCatalogo++;
  const url = new URL(endereco);
  if (url.pathname === '/search/artist') {
    const nome = url.searchParams.get('q');
    return resposta({ data: ['Zhollis', '2hollis'].includes(nome) ? [{ id: 2, name: '2hollis', nb_fan: 1000 }] : [] });
  }
  if (url.pathname === '/search') return resposta({ data: [{ title: 'poster boy', artist: { id: 2, name: '2hollis' } }] });
  if (url.pathname === '/artist/2/related') return resposta({ data: [{ id: 3, name: 'Outro Artista' }] });
  throw Error(`Pedido inesperado: ${endereco}`);
});
const biblioteca = completo.carregar('src/api/artistNames.ts');
const nomes = completo.carregar('src/lib/artistName.ts');
const faixas = ['Slowed', 'Lyrics', 'Looped'].map((versao) => ({ source: 'youtube', title: `poster boy - Zhollis (${versao})`, artist: 'Uploads' }));
await biblioteca.confirmarArtistas(faixas);
assert.equal(nomes.displayArtist(faixas[0]), '2hollis', 'Corrige a grafia e a ordem com a faixa exata do catálogo');
assert.equal(nomes.agruparPorArtista(faixas)[0].nome, '2hollis');
assert.equal(nomes.nomesDeConfianca(faixas).has('poster boy'), false);
assert.equal(nomes.nomesDeConfianca(faixas.slice(0, 1)).has('2hollis'), true, 'Uma só faixa confirmada basta, mesmo com a grafia corrigida');
const anteriores = idasAoCatalogo;
await biblioteca.confirmarArtistas(faixas);
assert.equal(idasAoCatalogo, anteriores, 'Reler a biblioteca não repete a descoberta dos nomes');
console.log('Pesquisa, cache e identificação automática: todos os casos passaram.');
