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
// A coluna vem da definição exportada do Supabase, não do nome interno da tabela.
const dataReproducao = '2026-09-02T12:34:56.000Z';
let respostaHistorico = [{ source: 'youtube', source_id: 'faixa', title: 'Faixa', max_played_at: dataReproducao }];
const historico = ambiente(async () => {}, {
  'src/lib/supabase.ts': { supabase: { rpc: async (nome, parametros) => {
    assert.equal(nome, 'get_profile_recently_played');
    assert.equal(parametros.limit_val, 12);
    return { data: respostaHistorico, error: null };
  } } },
  'src/api/library.ts': {},
}).carregar('src/api/plays.ts');
assert.equal((await historico.getProfileRecentlyPlayed(12))[0].lastPlayed, Date.parse(dataReproducao));
respostaHistorico = [{ source: 'youtube', source_id: 'faixa', title: 'Faixa', max_played_at: null }];
assert.equal((await historico.getProfileRecentlyPlayed(12))[0].lastPlayed, undefined);
console.log('Pesquisa, cache, identificação automática e datas do histórico: todos os casos passaram.');

// Guardar no perfil usa uma RPC atómica. Erros de leitura não podem parecer
// "ainda não guardaste", nem updates de zero linhas podem acender o olho.
let erroPlaylist=null,linhasPlaylist=[],rpcPlaylist=null;
const pedidosPlaylist=[];
const playlistApi=ambiente(async()=>{}, {
  'src/api/library.ts':{},
  'src/lib/supabase.ts':{supabase:{
    auth:{getUser:async()=>({data:{user:{id:'eu'}},error:null})},
    rpc:async(nome,args)=>{pedidosPlaylist.push([nome,args]);return {data:rpcPlaylist,error:erroPlaylist};},
    from:(table)=>{
      let from=0,to=999,single=false;
      const query={
        select:()=>query,eq:()=>query,not:()=>query,update:()=>query,order:()=>query,
        range:(start,end)=>{from=start;to=end;return query;},
        maybeSingle:()=>{single=true;return query;},
        then:(resolve,reject)=>Promise.resolve({data:single?linhasPlaylist[0]??null:linhasPlaylist.slice(from,to+1),error:erroPlaylist}).then(resolve,reject),
      };
      return query;
    },
  }},
}).carregar('src/api/playlists.ts');
erroPlaylist=new Error('Falha de rede');
await assert.rejects(playlistApi.copiasGuardadas(),/Falha de rede/);
await assert.rejects(playlistApi.savePlaylistCopy('origem'),/Falha de rede/);
await assert.rejects(playlistApi.unsavePlaylistCopy('origem'),/Falha de rede/);
erroPlaylist=null;
await assert.rejects(playlistApi.setPlaylistVisibility('alheia',true),/no longer available/);
rpcPlaylist='copia';
assert.equal(await playlistApi.savePlaylistCopy('origem'),'copia');
assert.equal(pedidosPlaylist.at(-1)[0],'set_profile_playlist_copy');
assert.equal(pedidosPlaylist.at(-1)[1].p_save,true);
await playlistApi.unsavePlaylistCopy('origem');
assert.equal(pedidosPlaylist.at(-1)[1].p_save,false);
linhasPlaylist=Array.from({length:1006},(_,i)=>({position:i,tracks:{id:`t-${i}`,source:'youtube',source_id:`s-${i}`,title:`Faixa ${i}`}}));
const todas=await playlistApi.getPlaylistTracks('copia');
assert.equal(todas.length,1006);assert.equal(todas.at(-1).id,'t-1005');
console.log('Playlists: erros preservados, RPC de guardar/remover e leitura acima de 1000 faixas passaram.');
