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
    'src/api/playlistSnapshot.ts': { lerFaixasDasPlaylists: async () => [], esquecerFaixasDasPlaylists: () => {}, playlistPropriaEmCache: async () => null },
    'src/lib/cacheExternaLocal.ts': { lerCacheExternaLocal: async () => null, guardarCacheExternaLocal: async () => {} },
    'src/api/cache.ts': {
      DIA_MS: 86400000,
      cacheGet: async (chave) => cache.get(chave) ?? null,
      cacheSet: async (chave, valor) => cache.set(chave, valor),
    },
    ...substituicoes,
  };
  // Os duplos do catálogo só escrevem a `vizinhancaDe`. A descoberta chama a
  // `vizinhancaConfirmada` (confirma o artista pelas músicas dele); num duplo
  // o artista devolvido já é "o certo", por isso ela é a mesma coisa.
  const duploDoCatalogo = stubs['src/api/catalogo.ts'];
  if (duploDoCatalogo?.vizinhancaDe) {
    duploDoCatalogo.vizinhancaConfirmada ??= (nome) => duploDoCatalogo.vizinhancaDe(nome);
    duploDoCatalogo.vizinhancaJaDecidida ??= () => undefined;
  }
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
      module, exports: module.exports, fetch, console, setTimeout, clearTimeout, setInterval, clearInterval, AbortController, URL,
      require: (pedido) => {
        if (stubs[pedido]) return stubs[pedido];
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

// A rádio não pode confundir o rapper Isak com o futebolista Alexander Isak.
// Executa a cascata real e a escolha do canal, com respostas guardadas do
// YouTube Music; a rede e o perfil são os únicos duplos.
{
  const fixture = (nome) => JSON.parse(fs.readFileSync(path.join(raiz, 'scripts/fixtures', nome), 'utf8'));
  const faixa = (sourceId, title, artist = 'Isak - Topic', durationSeconds = 180) => ({
    source: 'youtube', sourceId, title, artist, durationSeconds, album: null, artworkUrl: null,
  });
  const semente = faixa('k8u8sHjyVnE', 'Telescópio');
  const futebol = faixa('futebol', 'Best of Alexander Isak (2025/2026)', 'Football videos', 255);
  const vizinha = faixa('vizinha', 'Tema de outro artista', 'Holly Hood - Topic');
  const longaGuardada = faixa('longa', 'Tema de vinte minutos', 'Outra Banda - Topic', 1200);
  for (const semCanal of [false, true]) {
    let offline = false, pesquisasGerais = 0, fluxos = 0;
    const procuradas = [], canais = [];
    const mundo = ambiente(() => { throw Error('Este teste não usa rede'); }, {
      'src/state/connectivity.ts': { useConnectivity: { getState: () => ({ offline }) } },
      'src/state/recommendationFeedback.ts': { feedbackReady: async () => {}, filterSuggestions: (faixas) => faixas },
      'src/api/library.ts': { getLibrary: async () => [semente, longaGuardada] },
      'src/lib/cacheDaBiblioteca.ts': { lerFaixas: (ler) => ler() },
      'src/api/descoberta.ts': { candidatasParaDescoberta: async () => [] },
      'src/api/perfilDeRecomendacoes.ts': { lerPerfilDeRecomendacoes: async () => null },
      'src/api/plays.ts': { getFlowMix: async () => { fluxos++; return [futebol, vizinha, longaGuardada]; } },
      'src/api/search.ts': { pesquisarFaixas: async () => { pesquisasGerais++; return [futebol]; } },
      'src/api/ytMusic.ts': {
        pesquisarCancoesCru: async (query) => { procuradas.push(query); return semCanal ? null : fixture('ytmusic-isak-telescopio.json'); },
        lerNoYtMusic: async (id) => { canais.push(id); return id.startsWith('UC') ? fixture('ytmusic-artista-isak.json') : null; },
      },
    });
    const nomes = mundo.carregar('src/lib/artistName.ts');
    nomes.aprenderComABiblioteca([semente]);
    assert.equal(nomes.displayArtist(futebol), 'Isak', 'o título explica a etiqueta errada: contém o artista aprendido');
    const radio = mundo.carregar('src/api/radio.ts');
    const estrito = await radio.fetchRadioTracks([semente], [semente], 12, undefined, 'session');
    assert.equal(fluxos, 0, 'o modo de sessão nunca consulta o Flow global para completar a fila');
    assert.ok(!estrito.some(t => t.sourceId === vizinha.sourceId || t.sourceId === longaGuardada.sourceId), 'não inclui as alternativas fora do contexto trazidas só pelo Flow');
    if (semCanal) assert.equal(estrito.length, 0, 'sem provas de parentesco devolve vazio em vez de inventar um género');
    const lote = await radio.fetchRadioTracks([semente], [semente]);
    assert.ok(!lote.some(t => t.sourceId === futebol.sourceId), 'o vídeo de futebol não entra, mesmo vindo do Flow');
    assert.ok(!lote.some(t => t.sourceId === semente.sourceId), 'não repete a faixa atual');
    assert.ok(lote.some(t => t.sourceId === vizinha.sourceId), 'mantém as músicas de artistas semelhantes');
    assert.ok(lote.some(t => t.sourceId === longaGuardada.sourceId), 'mantém a música longa que foi guardada');
    assert.equal(pesquisasGerais, 0, 'a rádio não pesquisa vídeos pelo nome de um artista');
    assert.ok(procuradas.includes('Isak Telescópio'), 'a música da biblioteca é a prova para escolher o canal');
    if (semCanal) {
      assert.equal(canais.length, 0, 'sem provas não se abre um canal por palpite');
      assert.equal(lote.length, 2, 'sem canal continua com as músicas válidas, sem recorrer a vídeos genéricos');
    } else {
      assert.ok(canais.includes('UCX24KmsuxFB4jacvMSd3G2Q'), 'consulta o canal do rapper confirmado pela música');
      // Com TODOS os artistas, o principal primeiro (11/10): "Isak & Zigarro & Armando Teles".
      assert.ok(lote.some(t => (t.artist ?? '').split(' & ')[0] === 'Isak'), 'aceita as músicas reais do canal');
      const pedidos = procuradas.length + canais.length;
      await radio.fetchRadioTracks([semente], [semente]);
      assert.equal(procuradas.length + canais.length, pedidos, 'a página musical é partilhada em cache entre lotes');
    }
    offline = true;
    const pedidos = procuradas.length + canais.length + fluxos;
    assert.equal((await radio.fetchRadioTracks([semente], [semente])).length, 0);
    assert.equal(procuradas.length + canais.length + fluxos, pedidos, 'offline não faz pedidos');
  }
  console.log('Rádio: canal musical confirmado, sem futebol, cache partilhada e alternativa segura quando o canal falha.');
}

// O Radio de "Eloy Ft.Randy - Fuera Del Planeta" não arrancava (10/10): o
// catálogo não conhece o artista e o canal não se confirma. Fica o rádio da
// PRÓPRIA música no YouTube Music, que é música parecida com esta.
{
  const faixa = (sourceId, title, artist, durationSeconds = 220) => ({
    source: 'youtube', sourceId, title, artist, durationSeconds, album: null, artworkUrl: null,
  });
  const semente = faixa('sOevdW_9DHk', 'Fuera Del Planeta', 'Eloy Ft.Randy');
  const parecidas = ['Fantasma', 'Shorty', 'Bajaera', 'Vamonos', 'Alocate', 'Sola', 'Ella Me Levanto', 'Mayor Que Yo', 'Rakata', 'Gasolina', 'Noche De Sexo', 'Pa Que La Pases Bien', 'Dale Don Dale']
    .map((t, i) => faixa(`reggaeton${String(i).padStart(2, '0')}`, t, `Artista ${i}`));
  const futebol = faixa('futebolxxxx', 'Best of Alexander Isak (2025/2026)', 'Football videos', 255);
  let fluxos = 0;
  const radios = [];
  const mundo = ambiente(() => { throw Error('Este teste não usa rede'); }, {
    'src/state/connectivity.ts': { useConnectivity: { getState: () => ({ offline: false }) } },
    'src/state/recommendationFeedback.ts': { feedbackReady: async () => {}, filterSuggestions: (faixas) => faixas },
    'src/api/library.ts': { getLibrary: async () => [semente] },
    'src/lib/cacheDaBiblioteca.ts': { lerFaixas: (ler) => ler() },
    'src/api/descoberta.ts': { candidatasParaDescoberta: async () => [] },
    'src/api/perfilDeRecomendacoes.ts': { lerPerfilDeRecomendacoes: async () => null },
    'src/api/plays.ts': { getFlowMix: async () => { fluxos++; return []; } },
    'src/api/search.ts': { pesquisarFaixas: async () => [] },
    'src/api/ytMusic.ts': {
      pesquisarCancoesCru: async () => null,
      lerNoYtMusic: async () => null,
      lerRadioPeloYtMusic: async (mix) => { radios.push(mix); return [semente, futebol, ...parecidas]; },
    },
  });
  const nomes = mundo.carregar('src/lib/artistName.ts');
  assert.equal(nomes.displayArtist(semente), 'Eloy', 'o "Ft." colado também se corta');
  const radio = mundo.carregar('src/api/radio.ts');
  const lote = await radio.fetchRadioTracks([semente], [semente], 12, undefined, 'session');
  assert.equal(JSON.stringify(radios[0]), JSON.stringify({ playlistId: 'RDAMVMsOevdW_9DHk', videoId: 'sOevdW_9DHk', params: null }), 'o rádio da própria música');
  assert.equal(lote.length, 12, 'o Radio arranca com um lote inteiro');
  assert.ok(!lote.some(t => t.sourceId === semente.sourceId), 'sem a música que já toca');
  assert.ok(!lote.some(t => t.sourceId === futebol.sourceId), 'e o que não é música continua de fora');
  assert.equal(fluxos, 0, 'a sessão continua sem o Flow geral');
  console.log('Rádio: sem catálogo nem canal, arranca pelo rádio da própria música.');
}

let livres = 0, pagas = 0, falhar = false;
const pesquisa = ambiente(async () => {}, {
  'src/api/ytSearchFree.ts': {
    pesquisarPaginaFree: async () => { livres++; if (falhar) throw Error('Falha'); return { resultados: [], continuacao: null }; },
    continuarPesquisaFree: async () => ({ resultados: [], continuacao: null }),
  },
  'src/api/youtube.ts': { searchYouTube: async () => { pagas++; return ['alternativa']; } },
}).carregar('src/api/search.ts');
assert.equal((await pesquisa.pesquisarMusica('sem resultados')).faixas.length, 0);
assert.equal(pagas, 0, 'Uma pesquisa livre vazia não gasta quota');
falhar = true;
assert.equal((await pesquisa.pesquisarMusica('falha de rede')).faixas[0], 'alternativa');
assert.equal(livres, 2);
assert.equal(pagas, 1, 'A alternativa só entra quando a livre falha');
const cancelada = new AbortController();
cancelada.abort();
await pesquisa.pesquisarMusica('texto apagado', cancelada.signal);
assert.equal(livres, 2, 'Um pedido já cancelado nem começa');
assert.equal(pagas, 1, 'Um pedido cancelado não gasta quota');
falhar = false;
assert.deepEqual(await pesquisa.pesquisarFaixas('rádio'), [], 'A rádio e o PC pesquisam pela livre');
assert.equal(pagas, 1, 'e sem gastar quota quando ela responde');
falhar = true;
assert.deepEqual(await pesquisa.pesquisarFaixas('rádio sem livre'), ['alternativa'], 'A Data API só quando a livre falha');
falhar = false;

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

// QUEM é o artista: entre homónimos, só serve o que tem no catálogo uma das
// músicas da biblioteca (`vizinhancaConfirmada`). Os números são os do Deezer a
// 25/9: a banda Cold tem 27 747 fãs, o rapper 16; o Juice WRLD 2,5 milhões e o
// homónimo 22.
{
  const pedidosAoDeezer = [];
  const deezer = ambiente(async (endereco) => {
    const url = new URL(endereco);
    pedidosAoDeezer.push(url.pathname + url.search);
    const q = url.searchParams.get('q') ?? '';
    if (url.pathname === '/search/artist') {
      const porNome = {
        Cold: [{ id: 10, name: 'Cold', nb_fan: 27747 }, { id: 11, name: 'Cold', nb_fan: 16 }],
        Ryan: [{ id: 20, name: 'Ryan', nb_fan: 3026 }, { id: 21, name: 'Ryan', nb_fan: 4 }],
        'Juice WRLD': [{ id: 30, name: 'Juice WRLD', nb_fan: 2505035 }, { id: 31, name: 'Juice WRLD', nb_fan: 22 }],
      };
      return resposta({ data: porNome[q] ?? [] });
    }
    if (url.pathname === '/search') {
      // O rapper Cold tem "Frozen Heart"; ninguém chamado Ryan tem "DESACATO";
      // os leaks do Juice WRLD não estão no catálogo.
      if (q === 'Cold Frozen Heart') return resposta({ data: [{ title: 'Frozen Heart', artist: { id: 11, name: 'Cold' } }] });
      if (q === 'Ryan DESACATO') return resposta({ data: [{ title: 'DESACATO', artist: { id: 99, name: 'Luuky' } }] });
      return resposta({ data: [] });
    }
    const rel = url.pathname.match(/^\/artist\/(\d+)\/related$/);
    if (rel) return resposta({ data: [{ id: 1000 + Number(rel[1]), name: `Vizinho de ${rel[1]}` }] });
    throw Error(`Pedido inesperado: ${endereco}`);
  });
  const cat = deezer.carregar('src/api/catalogo.ts');

  const cold = await cat.vizinhancaConfirmada('Cold', ['Cold Hearted', 'Frozen Heart']);
  assert.equal(cold?.artista.id, 11, 'o Cold certo é o que tem a música, não o de mais fãs');
  assert.equal(cold?.semelhantes[0].nome, 'Vizinho de 11');
  assert.equal(cat.vizinhancaJaDecidida('Cold')?.artista.id, 11, 'e a decisão fica para as misturas');

  assert.equal(await cat.vizinhancaConfirmada('Ryan', ['DESACATO']), null,
    'um canal cujo homónimo não tem a música não é âncora de nada');
  assert.equal(cat.vizinhancaJaDecidida('Ryan'), null);
  const antes = pedidosAoDeezer.length;
  assert.equal(await cat.vizinhancaConfirmada('Ryan', ['DESACATO']), null);
  assert.equal(pedidosAoDeezer.length, antes, 'a negativa vem da cache');

  const juice = await cat.vizinhancaConfirmada('Juice WRLD', ['Porridge', 'Cuffed']);
  assert.equal(juice?.artista.id, 30, 'sem prova, um nome inequívoco (2,5 milhões contra 22) passa');

  assert.equal(cat.vizinhancaJaDecidida('Nunca Pedido'), undefined);
  assert.equal((await cat.vizinhancaConfirmada('Cold', []))?.artista.id, 10,
    'sem provas (Spotify, sementes) é a resolução de sempre');

  const puro = deezer.carregar('src/lib/catalogo.ts');
  assert.equal(puro.tituloProva('NOSTYLIST', 'nostylist'), true);
  assert.equal(puro.tituloProva('Frozen Heart (Remastered)', 'Frozen Heart'), true);
  assert.equal(puro.tituloProva('Skyfall', 'Sky'), true, 'três letras já contam como contidas');
  assert.equal(puro.tituloProva('Up', 'Upside'), false, 'menos de três só conta igual');
  assert.equal(puro.candidatoInequivoco([{ id: 1, nome: 'Cold', fas: 27747 }, { id: 2, nome: 'Cold', fas: 16 }]), null);
  console.log('Quem é o artista: o homónimo só serve com a música dele no catálogo; um nome enorme e inequívoco passa sem prova.');
}

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
    auth:{getUser:async()=>({data:{user:{id:'eu'}},error:null}), getSession: async () => ({ data: { session: { user: { id: 'eu' } } } })},
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

// Regressão 14/9: as chaves das guardadas liam uma página só. Com 2694, as
// últimas 1694 não contavam para "esta já a tens" (Discover, Smart Shuffle).
const linhasGuardadas=Array.from({length:2694},(_,i)=>({tracks:{source:'youtube',source_id:`g-${i}`}}));
const bibliotecaApi=ambiente(async()=>{}, {
  'src/lib/likedSongsCache.ts':{cacheLikedSongs:async()=>{},changeCachedLikes:async()=>{},likedCacheRevision:()=>0},
  'src/api/artistNames.ts':{confirmarArtistasEmSegundoPlano:()=>{}},
  'src/lib/supabase.ts':{supabase:{
    auth:{getUser:async()=>({data:{user:{id:'eu'}},error:null}), getSession: async () => ({ data: { session: { user: { id: 'eu' } } } })},
    from:()=>{
      let from=0,to=999;
      const query={
        select:()=>query,eq:()=>query,order:()=>query,
        range:(start,end)=>{from=start;to=end;return query;},
        then:(resolve,reject)=>Promise.resolve({data:linhasGuardadas.slice(from,to+1),error:null}).then(resolve,reject),
      };
      return query;
    },
  }},
}).carregar('src/api/library.ts');
const chavesGuardadas=await bibliotecaApi.getLibraryKeys();
assert.equal(chavesGuardadas.size,2694,'As guardadas acima das 1000 também contam');
assert.ok(chavesGuardadas.has('youtube:g-2693'));
console.log('Biblioteca: as chaves das guardadas passam as 1000 linhas.');

// Regressão 1.5.9: uma coluna social em falta escondia toda a biblioteca.
let playlistError={code:'42703',message:'column playlists.visible_on_profile does not exist'};
let playlistReads=[];
const profileEnv=ambiente(async()=>{}, {
  'src/api/library.ts':{},
  'src/lib/supabase.ts':{supabase:{auth:{getUser:async()=>({data:{user:{id:'owner'}}}), getSession: async () => ({ data: { session: { user: { id: 'owner' } } } })},from:(tabela)=>{
    if(tabela==='playlist_colaboradores'){const vazia={select:()=>vazia,limit:()=>vazia,then:fn=>Promise.resolve(fn({data:[],error:null}))};return vazia;}
    let fields='';const query={select:s=>{fields=s;return query;},eq:(key,value)=>{assert.equal(key,'owner_id');assert.equal(value,'owner');return query;},order:()=>query,limit:()=>query,
      then:fn=>{playlistReads.push(fields);return Promise.resolve(fn(fields.includes('visible_on_profile')&&playlistError?{error:playlistError}:{data:[{id:'original',name:'A minha playlist',playlist_tracks:[{position:0,tracks:{artwork_url:'cover'}}],visible_on_profile:true,copied_from:null}]}));}};
    return query;
  }}},
});
const profilePlaylists=profileEnv.carregar('src/api/playlists.ts');
const restored=await profilePlaylists.listPlaylists();
assert.equal(restored[0].id,'original');assert.equal(restored[0].trackCount,1);
assert.equal(restored[0].visibleOnProfile,undefined,'sem coluna não inventa um estado de partilha');
assert.equal(playlistReads.length,2);
playlistReads=[];playlistError={code:'PGRST204',message:"Could not find the 'copied_from' column of 'playlists' in the schema cache"};
assert.equal((await profilePlaylists.listPlaylists()).length,1);assert.equal(playlistReads.length,2);
for(const failure of [{code:'42501',message:'permission denied'},{code:'503',message:'offline'},{code:'42703',message:'column title does not exist'}]){
  playlistReads=[];playlistError=failure;await assert.rejects(profilePlaylists.listPlaylists());assert.equal(playlistReads.length,1,'falhas de rede/RLS não ativam a alternativa');
}
playlistError=null;playlistReads=[];
assert.equal((await profilePlaylists.listPlaylists())[0].visibleOnProfile,true);assert.equal(playlistReads.length,1,'reconhece a migração no próximo pedido sem reiniciar');

// Uma relação embutida vem cortada a 1000, mas o cartão do perfil tem de
// mostrar a contagem exata que a playlist aberta já consegue paginar.
let pedidosDeContagem=0;
const countEnv=ambiente(async()=>{}, {
  'src/api/library.ts':{},
  'src/lib/supabase.ts':{supabase:{from:(table)=>{
    let head=false;
    const query={
      select:(_fields,options)=>{head=!!options?.head;return query;},
      eq:()=>query,
      order:()=>query,
      limit:()=>query,
      then:fn=>Promise.resolve(fn(table==='playlist_tracks'&&head
        ?{data:null,error:null,count:(pedidosDeContagem++,2000)}
        :{data:[{id:'grande',name:'Grande',created_at:'2026-01-01',visible_on_profile:true,
          playlist_tracks:Array.from({length:1000},(_,position)=>({position,tracks:{artwork_url:null}}))}],error:null})),
    };
    return query;
  }}},
});
const countPlaylists=countEnv.carregar('src/api/playlists.ts');
const [grande]=await countPlaylists.listProfilePlaylists('amigo');
assert.equal(grande.trackCount,2000);assert.equal(pedidosDeContagem,1);

// 30/9 (egress): a lista das playlists pede a contagem e oito capas, e não as
// faixas todas. Com a contagem do servidor não há pedido de confirmação; se o
// PostgREST recusar a forma leve, vai a de sempre, e sem rede não repete.
{
  let lidas=[],contagens=0,recusa=null;
  const leveEnv=ambiente(async()=>{}, {
    'src/api/library.ts':{},
    'src/lib/supabase.ts':{supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'eu'}}}})},from:(table)=>{
      if(table==='playlist_colaboradores'){const vazia={select:()=>vazia,limit:()=>vazia,then:fn=>Promise.resolve(fn({data:[],error:null}))};return vazia;}
      let fields='',head=false;const limites=[],ordens=[];
      const query={
        select:(f,o)=>{fields=f;head=!!o?.head;return query;},
        eq:()=>query,
        order:(col,o)=>{ordens.push([col,o?.referencedTable??null]);return query;},
        limit:(n,o)=>{limites.push([n,o?.referencedTable??null]);return query;},
        then:(fn)=>{
          if(table==='playlist_tracks'&&head){contagens++;return Promise.resolve(fn({data:null,error:null,count:5000}));}
          lidas.push({fields,limites,ordens});
          const leve=fields.includes('total:playlist_tracks(count)');
          if(leve&&recusa)return Promise.resolve(fn({data:null,error:recusa}));
          return Promise.resolve(fn(leve
            ?{data:[{id:'importada',name:'Importada',created_at:'2026-09-01',visible_on_profile:false,copied_from:null,
              total:[{count:5000}],capas:[{position:2,tracks:{artwork_url:'c'}},{position:0,tracks:{artwork_url:'a'}},{position:1,tracks:null}]}],error:null}
            :{data:[{id:'importada',name:'Importada',created_at:'2026-09-01',visible_on_profile:false,copied_from:null,
              playlist_tracks:[{position:0,tracks:{artwork_url:'a'}}]}],error:null}));
        },
      };
      return query;
    }}},
  });
  const api=leveEnv.carregar('src/api/playlists.ts');
  const [p]=await api.listPlaylists();
  assert.equal(p.trackCount,5000,'a contagem vem do servidor');
  assert.equal(p.artworks.join(','),'a,c','as capas pela ordem da playlist, sem as que faltam');
  assert.equal(contagens,0,'com a contagem do servidor não se confirma nada');
  assert.equal(lidas.length,1);
  assert.ok(!/playlist_tracks \(position/.test(lidas[0].fields),'não embute as faixas todas');
  assert.deepEqual(lidas[0].limites,[[8,'capas']],'oito capas por playlist, não mais');
  assert.ok(lidas[0].ordens.some(([c,t])=>c==='position'&&t==='capas'),'as capas pela posição');

  lidas=[];recusa={code:'PGRST100',message:'failed to parse select parameter'};
  const [antiga]=await api.listPlaylists();
  assert.equal(lidas.length,2,'forma recusada: vai a de sempre');
  assert.equal(antiga.trackCount,1);

  for(const falha of [{code:'503',message:'offline'},{code:'42501',message:'permission denied'},{message:'Failed to fetch'}]){
    lidas=[];recusa=falha;
    await assert.rejects(api.listPlaylists());
    assert.equal(lidas.length,1,'sem rede ou sem permissão não se repete o pedido');
  }
  console.log('Playlists: a lista pede a contagem e oito capas, e só cai na antiga se a forma for recusada.');
}

// 7/10, playlists colaborativas: as de quem me convidou entram na lista, e a
// leitura dos colaboradores nunca esconde as minhas -- nem a falhar, nem sem a
// migração (aí não se volta a perguntar).
{
  let colaboradores={data:[{playlist_id:'deles',user_id:'eu'},{playlist_id:'minha',user_id:'amigo'}],error:null};
  let leiturasDosColaboradores=0;const pedidas=[];
  const env=ambiente(async()=>{}, {
    'src/api/library.ts':{},
    'src/lib/supabase.ts':{supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'eu'}}}})},from:(table)=>{
      if(table==='playlist_colaboradores'){
        const q={select:()=>q,limit:()=>q,then:fn=>{leiturasDosColaboradores++;return Promise.resolve(fn(colaboradores));}};
        return q;
      }
      let filtro=null;
      const q={select:()=>q,order:()=>q,limit:()=>q,
        eq:(c,v)=>{filtro=['eq',c,v];return q;},in:(c,v)=>{filtro=['in',c,v];return q;},
        then:fn=>{
          pedidas.push(filtro);
          const linhas=filtro?.[0]==='in'
            ?[{id:'deles',name:'Do grupo',created_at:'2026-10-02',owner_id:'outro',visible_on_profile:false,copied_from:null,total:[{count:3}],capas:[]}]
            :[{id:'minha',name:'Minha',created_at:'2026-10-01',owner_id:'eu',visible_on_profile:true,copied_from:null,total:[{count:1}],capas:[]}];
          return Promise.resolve(fn({data:linhas,error:null}));
        }};
      return q;
    }}},
  });
  const api=env.carregar('src/api/playlists.ts');
  const lista=await api.listPlaylists();
  assert.deepEqual(Array.from(lista,(p)=>p.id),['deles','minha'],'as de fora entram, pela data');
  assert.equal(lista[0].souColaborador,true);assert.equal(lista[0].ownerId,'outro');
  assert.equal(lista[1].souColaborador,false);
  assert.equal(lista[1].colaborativa,true,'a minha com um amigo lá dentro é colaborativa');
  assert.equal(JSON.stringify(pedidas.find((f)=>f[0]==='in')),JSON.stringify(['in','id',['deles']]),'só pede as de fora que me pertencem por colaboração');

  colaboradores={data:null,error:{code:'503',message:'offline'}};pedidas.length=0;
  assert.deepEqual(Array.from(await api.listPlaylists(),(p)=>p.id),['minha'],'a falhar, ficam as minhas');
  assert.equal(pedidas.length,1);

  colaboradores={data:null,error:{code:'42P01',message:'relation "public.playlist_colaboradores" does not exist'}};
  await api.listPlaylists();
  const antes=leiturasDosColaboradores;
  assert.deepEqual(Array.from(await api.listPlaylists(),(p)=>p.id),['minha']);
  assert.equal(leiturasDosColaboradores,antes,'sem a migração não se volta a perguntar');
  console.log('Playlists colaborativas: entram na lista, e a leitura delas nunca esconde as minhas.');
}

let reads=0,failedSection='highlights';
const sections=ambiente(async()=>{}, {
  'src/api/profiles.ts':{
    getSocialProfileTracks:async(_id,recent)=>{reads++;if(failedSection==='recent'&&recent)throw Error('network');return [{id:recent?'recent':'most'}];},
    getProfileHighlights:async()=>{reads++;if(failedSection==='highlights')throw {code:'42703',message:'column p.visible_on_profile does not exist'};return {playlistIds:[],moment:null};},
  },
  'src/api/playlists.ts':{listPlaylists:async()=>{reads++;return [{id:'original'}];},listProfilePlaylists:async()=>{reads++;return [{id:'publica'}];},copiasGuardadas:async()=>{reads++;return new Set();}},
}).carregar('src/api/profileSections.ts');
let parts=await sections.loadProfileSections('owner',true,true);
assert.equal(parts.highlights.status,'rejected');assert.equal(parts.most.value[0].id,'most');assert.equal(parts.recent.value[0].id,'recent');assert.equal(parts.playlists.value[0].id,'original');
failedSection='recent';parts=await sections.loadProfileSections('owner',true,true);
assert.equal(parts.recent.status,'rejected');assert.equal(parts.highlights.status,'fulfilled');assert.equal(parts.most.status,'fulfilled');
parts=await sections.loadProfileSections('friend',false,true);
assert.equal(parts.playlists.value[0].id,'publica','um perfil de amigo lê apenas as playlists públicas dele');
const beforePrivate=reads;await sections.loadProfileSections('stranger',false,false);assert.equal(reads,beforePrivate,'não consulta secções de perfis privados');

const saves=[];let savingFailure=null;
const editApi=ambiente(async()=>{}, {'src/lib/supabase.ts':{supabase:{rpc:async(name,body)=>{saves.push({name,body});return {error:savingFailure};}}}}).carregar('src/api/profiles.ts');
await editApi.saveProfileEdits({version:3},'João','joao',null);
assert.equal(saves[0].name,'save_profile_appearance');assert.equal('p_playlists' in saves[0].body,false,'editar com destaques desconhecidos não os apaga');
await editApi.saveProfileEdits({version:4},'João','joao',{playlistIds:['p'],moment:null});assert.equal(saves[1].name,'save_profile_customization');
savingFailure={message:'network'};await assert.rejects(editApi.saveProfileEdits({version:5},'João','joao',{playlistIds:[],moment:null}));
assert.equal(saves.length,3,'não repete uma gravação ambígua por outra RPC');
console.log('Perfil: biblioteca anterior à migração, falhas independentes e edição sem apagar destaques passaram.');


// Letras: correspondência real, formatos LRC e distinção entre erro e ausência.
{
  const load=ambiente(async()=>{}).carregar;
  const {lyricsIdentity,rankLyrics,lyricKey}=load('src/lib/lyricsMatch.ts');
  const identity=lyricsIdentity({title:'Juice WRLD - So What (Official Audio)',artist:'Juice WRLD - Topic',source:'youtube'});
  assert.equal(identity.title,'So What');assert.equal(identity.artist,'Juice WRLD');
  assert.equal(lyricsIdentity({title:'Future - Mask Off (Official Music Video)',artist:'FutureVEVO',source:'youtube'}).title,'Mask Off');
  assert.ok(lyricKey('Мелодия').length>0,'não perde títulos fora do alfabeto latino');
  assert.equal(rankLyrics({trackName:'Song (Live)',artistName:'Artist',plainLyrics:'Exemplo'},'Song','Artist',100),-1);
  assert.equal(rankLyrics({trackName:'Song',artistName:'Someone Else',plainLyrics:'Exemplo'},'Song','Artist',100),-1);
  const {parseLrc,activeLyricIndex}=load('src/lib/lyricsParser.ts');
  const lines=parseLrc('[ar:Artista]\n[offset:-100]\n[00:02.50][00:10.125]Linha de exemplo\n[00:01]Começo\n[00:99]Ignorar');
  assert.deepEqual(Array.from(lines,x=>x.timeMs),[900,2400,10025]);
  assert.equal(activeLyricIndex(lines,899),-1);assert.equal(activeLyricIndex(lines,2400),1);assert.equal(activeLyricIndex(lines,10000),1);assert.equal(activeLyricIndex(lines,999999),2);
  const urls=[];
  const candidate={id:1,trackName:'Song',artistName:'Artist',duration:100,syncedLyrics:'[00:01]Linha de exemplo'};
  const lookup=ambiente(async raw=>{const u=new URL(raw);urls.push(u);return u.pathname.endsWith('/get')?{ok:false,status:404}:resposta([{...candidate,artistName:'Wrong Artist'},candidate]);}).carregar('src/api/lyrics.ts');
  const found=await lookup.fetchLyrics('Song (Official Audio)','Artist - Topic',100);
  assert.equal(found.id,1);assert.equal(found.artistName,'Artist');assert.equal(found.timingAvailable,true);
  assert.equal(urls[0].searchParams.get('track_name'),'Song');assert.equal(urls[0].searchParams.get('artist_name'),'Artist');
  const mismatch=await lookup.fetchLyrics('Song','Artist',135);assert.equal(mismatch.timingAvailable,false);assert.ok(mismatch.plainLyrics);
  const failing=ambiente(async()=>{throw Error('Sem rede');}).carregar('src/api/lyrics.ts');
  await assert.rejects(failing.fetchLyrics('Song','Artist'),/Sem rede/);
  let busyRequests=0;
  const busy=ambiente(async()=>{busyRequests++;return {ok:false,status:429,headers:{get:()=> '30'}};}).carregar('src/api/lyrics.ts');
  await assert.rejects(busy.fetchLyrics('Song','Artist'),/busy/);await assert.rejects(busy.fetchLyrics('Song','Artist'),/busy/);assert.equal(busyRequests,1,'Retry-After evita martelar o serviço');
  const plain=ambiente(async raw=>new URL(raw).pathname.endsWith('/get')?resposta({...candidate,syncedLyrics:null,plainLyrics:'Texto de exemplo'}):Promise.reject(Error('Sem rede'))).carregar('src/api/lyrics.ts');
  assert.equal((await plain.fetchLyrics('Song','Artist',100)).plainLyrics,'Texto de exemplo','preserva texto válido quando a pesquisa de sincronização falha');

  const persisted=new Map();let count=0,fail=true,offline=false;
  const lyricsEnv=()=>ambiente(async()=>{count++;if(fail)throw Error('Sem rede');return resposta(candidate);},{
    '@react-native-async-storage/async-storage':{getItem:async k=>persisted.get(k)??null,setItem:async(k,v)=>persisted.set(k,v)},
    'src/state/connectivity.ts':{useConnectivity:{getState:()=>({offline})}},
  }).carregar('src/state/lyrics.ts');
  let cache=lyricsEnv();const track={source:'youtube',sourceId:'sample',title:'Artist - Song',artist:'Artist - Topic',durationSeconds:100};
  const key=cache.lyricsCacheKey(track);
  await cache.ensureLyrics(track);assert.equal(cache.useLyrics.getState().entries[key].status,'error');
  fail=false;await Promise.all([cache.ensureLyrics(track),cache.ensureLyrics(track)]);assert.equal(count,2,'o erro não é cache negativo e pedidos simultâneos partilham trabalho');
  await cache.ensureLyrics(track);assert.equal(count,2,'abrir a face das letras reutiliza o pré-carregamento');
  await new Promise(r=>setTimeout(r,0));offline=true;cache=lyricsEnv();await cache.ensureLyrics(track);
  assert.equal(cache.useLyrics.getState().entries[key].status,'ready');assert.equal(count,2,'reiniciar offline recupera as letras persistidas');
  console.log('Letras: identificação, seleção, tempos, erros, pré-carregamento e cache offline passaram.');
}

// A segunda fonte (10/10): o YouTube Music quando o lrclib não tem tempos.
{
  const sincronizada={sincronizada:true,texto:'Linha um. Linha dois',linhas:[{timeMs:1000,text:'Linha um'},{timeMs:4000,text:'Linha dois'}]};
  const soTexto={sincronizada:false,texto:'Só texto',linhas:[]};
  const comLrclib=(lrclib,yt)=>{const pedidos=[];const m=ambiente(async raw=>{const u=new URL(raw);if(u.pathname.endsWith('/get'))return lrclib==='erro'?{ok:false,status:429,headers:{get:()=>'30'}}:lrclib?resposta(lrclib):{ok:false,status:404};return resposta([]);},
    {'src/api/ytMusic.ts':{letraDoYtMusic:async id=>{pedidos.push(id);if(yt==='erro')throw Error('Sem rede');return yt;}}}).carregar('src/api/lyrics.ts');return {m,pedidos};};
  const lrcSinc={id:7,trackName:'Song',artistName:'Artist',duration:100,syncedLyrics:'[00:01]Do lrclib'};
  const lrcTexto={id:8,trackName:'Song',artistName:'Artist',duration:100,syncedLyrics:null,plainLyrics:'Texto do lrclib'};
  let {m,pedidos}=comLrclib(lrcSinc,sincronizada);
  let r=await m.fetchLyrics('Song','Artist',100,'abcdefghijk');
  assert.equal(r.fonte,'lrclib');assert.equal(pedidos.length,0,'com tempos no lrclib não se pergunta ao YouTube Music');
  ({m,pedidos}=comLrclib(lrcTexto,sincronizada));r=await m.fetchLyrics('Song','Artist',100,'abcdefghijk');
  assert.equal(r.fonte,'ytmusic');assert.equal(r.timingAvailable,true);assert.deepEqual(Array.from(r.parsedLines,l=>l.timeMs),[1000,4000],'a sincronizada ganha ao texto do lrclib');
  ({m}=comLrclib(lrcTexto,soTexto));r=await m.fetchLyrics('Song','Artist',100,'abcdefghijk');
  assert.equal(r.plainLyrics,'Texto do lrclib','texto contra texto, fica o do lrclib');
  ({m}=comLrclib(null,soTexto));r=await m.fetchLyrics('Song','Artist',100,'abcdefghijk');
  assert.equal(r.fonte,'ytmusic');assert.equal(r.timingAvailable,false);assert.equal(r.plainLyrics,'Só texto','sem nada no lrclib, o texto do YouTube Music');
  ({m}=comLrclib(null,null));assert.equal(await m.fetchLyrics('Song','Artist',100,'abcdefghijk'),null);
  ({m}=comLrclib('erro',sincronizada));r=await m.fetchLyrics('Song','Artist',100,'abcdefghijk');
  assert.equal(r.fonte,'ytmusic','o lrclib ocupado não deixa sem letra');
  ({m}=comLrclib('erro',null));await assert.rejects(m.fetchLyrics('Song','Artist',100,'abcdefghijk'),/busy/,'sem nenhuma, o erro continua a ser erro (não fica como "não há")');
  ({m}=comLrclib(lrcTexto,'erro'));r=await m.fetchLyrics('Song','Artist',100,'abcdefghijk');assert.equal(r.fonte,'lrclib','o YouTube Music sem rede não estraga o que havia');
  ({m,pedidos}=comLrclib(null,sincronizada));assert.equal(await m.fetchLyrics('Song','Artist',100),null);assert.equal(pedidos.length,0,'sem vídeo, só o lrclib');
  console.log('Letras: o YouTube Music como segunda fonte, sincronizada primeiro, sem esconder erros.');
}

// Sincronização: dois aparelhos, reset explícito, outbox e respostas atrasadas.
{
  const {AdjustmentSync}=ambiente(async()=>{}).carregar('src/lib/adjustmentSync.ts');
  const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
  const value=(rate,visto)=>({rate,visto,ganhos:Array(10).fill(0)});
  let remote={},fail=false,gate=null,writes=0;
  const make=(disk={values:{},pending:{}})=>{
    const state={disk,applied:{},status:null};
    state.engine=new AdjustmentSync({readLocal:async()=>state.disk,writeLocal:async snapshot=>{state.disk=structuredClone(snapshot);},
      readRemote:async()=>{if(fail)throw Error('Sem rede');return structuredClone(remote);},
      writeRemote:async(key,v)=>{writes++;if(gate){const wait=gate;gate=null;await wait.promise;}if(fail)throw Error('Sem rede');if((remote[key]?.visto??0)<v.visto)remote[key]=v;},
      apply:v=>{state.applied=v;},status:s=>{state.status=s;}});return state;
  };
  const a=make(),b=make();await a.engine.sync();await b.engine.sync();
  a.engine.edit('youtube:one',value(0.8,10));await a.engine.sync();await b.engine.sync();assert.equal(b.applied['youtube:one'].rate,0.8);
  b.engine.edit('youtube:one',value(1,20));await b.engine.sync();await a.engine.sync();assert.equal(a.applied['youtube:one'].rate,1,'Flat/1× sincroniza como escolha explícita');
  fail=true;a.engine.edit('youtube:one',value(1.2,30));await a.engine.sync();assert.equal(a.status,'error');assert.equal(a.disk.pending['youtube:one'].rate,1.2);
  a.engine.stop();const restarted=make(a.disk);fail=false;await restarted.engine.sync();assert.equal(remote['youtube:one'].rate,1.2);assert.equal(Object.keys(restarted.disk.pending).length,0);
  gate=deferred();const release=gate;restarted.engine.edit('youtube:one',value(0.9,40));const syncing=restarted.engine.sync();
  while(gate)await new Promise(r=>setTimeout(r,0));
  restarted.engine.edit('youtube:one',value(1.4,50));release.resolve();await syncing;
  assert.equal(remote['youtube:one'].rate,1.4,'confirmar uma escrita antiga não perde a edição feita entretanto');
  const stale=make({values:{'youtube:one':value(0.7,5)},pending:{'youtube:one':value(0.7,5)}});const before=writes;await stale.engine.sync();assert.equal(writes,before);assert.equal(stale.applied['youtube:one'].rate,1.4,'um aparelho antigo não ressuscita o preset anterior');
  const delayed=deferred();let applied=0;
  const stopped=new AdjustmentSync({readLocal:()=>delayed.promise,writeLocal:async()=>{},readRemote:async()=>remote,writeRemote:async()=>{},apply:()=>applied++,status:()=>{}});
  stopped.stop();delayed.resolve({values:remote,pending:{}});await stopped.sync();assert.equal(applied,0,'logout ignora a hidratação da conta anterior');
  const read=deferred();let latest;
  const early=new AdjustmentSync({readLocal:()=>read.promise,writeLocal:async()=>{},readRemote:async()=>({}),writeRemote:async()=>{},apply:v=>latest=v,status:()=>{}});
  early.edit('youtube:one',value(1.3,10));read.resolve({values:{'youtube:one':value(0.8,100)},pending:{}});await early.sync();assert.equal(latest['youtube:one'].rate,1.3,'editar antes de a cache abrir conserva a intenção mais recente');
  for(const state of [a,b,restarted,stale])state.engine.stop();early.stop();
  console.log('Ajustes: dois aparelhos, reset, offline/reinício, edição concorrente e logout passaram.');
}

// 30/9 (egress): o eco da própria escrita não relê a tabela, e com o Realtime
// ligado a leitura de recuperação espera pela janela.
{
  const {AdjustmentSync,precisaDeRecuperar}=ambiente(async()=>{}).carregar('src/lib/adjustmentSync.ts');
  const value=(rate,visto)=>({rate,visto,ganhos:Array(10).fill(0)});
  const remote={'youtube:outra':value(0.9,500)};
  const engine=new AdjustmentSync({readLocal:async()=>({values:{},pending:{}}),writeLocal:async()=>{},
    readRemote:async()=>structuredClone(remote),writeRemote:async(k,v)=>{remote[k]=v;},apply:()=>{},status:()=>{}});
  engine.edit('youtube:minha',value(1.2,1000));await engine.sync();
  assert.equal(engine.jaSabe('youtube:minha',1000),true,'o eco da própria escrita já é sabido');
  assert.equal(engine.jaSabe('youtube:minha',2000),false,'uma mais recente, de outro aparelho, relê');
  assert.equal(engine.jaSabe('youtube:outra',500),true,'o que veio numa leitura também é sabido');
  assert.equal(engine.jaSabe('youtube:nova',1),false,'uma linha nunca vista relê');
  assert.equal(engine.jaSabe('youtube:minha',Number.NaN),false,'uma data ilegível relê');
  engine.stop();
  assert.equal(precisaDeRecuperar(false,1000,1001,600000),true,'sem Realtime relê sempre');
  assert.equal(precisaDeRecuperar(true,1000,1000+599999,600000),false,'com Realtime espera pela janela');
  assert.equal(precisaDeRecuperar(true,1000,1000+600000,600000),true);
  assert.equal(precisaDeRecuperar(true,0,1800000000000,300000),true,'sem leitura nenhuma ainda, relê');
  console.log('Sincronização: o eco não relê, e com Realtime a recuperação espera pela janela.');
}

{
  const {acceptsCubeSwipe,cubeDirection,cubeProgress,cubeDestination}=ambiente(async()=>{}).carregar('src/lib/lyricsCubeGesture.ts');
  assert.equal(acceptsCubeSwipe(4,0),false);assert.equal(acceptsCubeSwipe(30,60),false);assert.equal(acceptsCubeSwipe(60,10),true);
  for(const open of [false,true])for(const sign of [-1,1]){
    const dir=cubeDirection(open,sign*30),start=open?1:0;
    assert.equal(cubeDestination(start,sign*200,sign*0.1,320,dir),!open,'ambos os sentidos alternam a face');
    assert.equal(cubeDestination(start,sign*20,sign*0.1,320,dir),open,'gesto curto cancela');
    assert.equal(cubeDestination(start,sign*20,sign*0.6,320,dir),!open,'gesto rápido alterna');
    assert.equal(cubeProgress(start,sign*160,320,dir),0.5);
  }
  console.log('Cubo: gesto horizontal, ambos os sentidos, cancelamento e velocidade passaram.');
}

// Entradas sociais malformadas nunca chegam aos componentes como uma Track.
{
  const rpc=[];
  const social=ambiente(async()=>{}, {
    'src/api/profiles.ts':{getPublicProfiles:async()=>[],searchPublicProfiles:async()=>[]},
    'src/lib/supabase.ts':{supabase:{rpc:async(name,args)=>{rpc.push([name,args]);return {data:true,error:null};}}},
  }).carregar('src/api/social.ts');
  assert.equal(social.sharedTrack(null),null);
  assert.equal(social.sharedTrack({source:'youtube',sourceId:'x',title:7}),null);
  assert.equal(social.sharedTrack({source:'file',sourceId:'x',title:'Faixa'}),null);
  assert.equal(social.sharedTrack({source:'youtube',sourceId:'x',title:' Faixa ',durationSeconds:180}).title,'Faixa');
  await social.archiveInboxItem('mensagem-1');
  assert.equal(rpc[0][0],'set_shared_item_archived');
  assert.equal(rpc[0][1].p_item,'mensagem-1');assert.equal(rpc[0][1].p_archived,true);
  console.log('Social: conteúdo não fiável é filtrado e o arquivo usa a RPC limitada ao destinatário.');
}

// O catálogo global só é escrito através da função validada no servidor.
{
  const calls=[];
  const library=ambiente(async()=>{}, {
    'src/lib/supabase.ts':{supabase:{rpc:async(name,args)=>{
      calls.push([name,args]);
      return {data:args.entries.map((entry,i)=>({id:`id-${calls.length}-${i}`,source:entry.source,source_id:entry.sourceId})),error:null};
    }}},
  }).carregar('src/api/library.ts');
  const track={source:'youtube',sourceId:'abc',title:'Faixa',artist:'Artista'};
  assert.equal(await library.upsertTrack(track),'id-1-0');
  const ids=await library.upsertTracks(Array.from({length:3},(_,i)=>({...track,sourceId:`s-${i}`})),2);
  assert.equal(calls.length,3); // uma chamada individual + dois lotes
  assert.equal(calls.every(([name])=>name==='upsert_catalog_tracks'),true);
  assert.equal(ids.size,3);
  console.log('Catálogo: escrita individual e em lote passam exclusivamente pela RPC validada.');
}

// Uma resposta perdida não duplica reproduções e a leitura passa o limite de 1000 linhas.
{
  const disk=new Map([['playCounts:migrated:v2:user-1','1'],['playCounts:lastUser:v2','user-1']]);
  const storage={
    getItem:async key=>disk.get(key)??null,
    setItem:async(key,value)=>{disk.set(key,value);},
    removeItem:async key=>{disk.delete(key);},
    multiSet:async pairs=>{for(const [key,value] of pairs)disk.set(key,value);},
  };
  const remote=new Map();const cursor=new Map();let loseReply=true, pulls=0;
  const row=(entry,count)=>({source:entry.source,source_id:entry.sourceId,title:entry.title,artist:entry.artist,
    artwork_url:entry.artworkUrl,duration_seconds:entry.durationSeconds,play_count:count,last_played:new Date(entry.lastPlayed).toISOString()});
  const supabase={
    auth:{getSession:async()=>({data:{session:{user:{id:'user-1'}}}})},
    rpc:async(_name,args)=>{
      if (_name==='get_play_count_changes') return {error:{code:'PGRST202'}};
      const {entries}=args;
      for(const entry of entries){const previous=cursor.get(entry.operationDevice)??0;if(entry.operationSequence<=previous)continue;
        cursor.set(entry.operationDevice,entry.operationSequence);const old=remote.get(`${entry.source}:${entry.sourceId}`);
        remote.set(`${entry.source}:${entry.sourceId}`,row(entry,(old?.play_count??0)+entry.count));}
      if(loseReply){loseReply=false;return {error:{message:'resposta perdida'}};}return {error:null};
    },
    from:()=>{const query={select:()=>query,eq:()=>query,order:()=>query,
      range:async(start,end)=>{pulls++;return {data:[...remote.values()].sort((a,b)=>`${a.source}:${a.source_id}`.localeCompare(`${b.source}:${b.source_id}`)).slice(start,end+1),error:null};},
      delete:()=>query};return query;},
  };
  const counts=ambiente(async()=>{}, {
    '@react-native-async-storage/async-storage':{default:storage,...storage},
    'src/lib/supabase.ts':{supabase},
  }).carregar('src/lib/playCounts.ts');
  const track={source:'youtube',sourceId:'one',title:'One',artist:'Artist'};
  await counts.incrementPlayCount(track);
  await counts.synchronizePlayCounts();
  assert.equal(remote.get('youtube:one').play_count,1,'repetir a mesma operação não volta a somar');
  const antesDosIncrementos = pulls;
  for (let i=0;i<10;i++) await counts.incrementPlayCount(track);
  assert.equal(remote.get('youtube:one').play_count,11,'os incrementos continuam a chegar imediatamente');
  assert.equal(pulls,antesDosIncrementos,'ouvir dez músicas não relê o histórico inteiro dez vezes');
  assert.equal((await counts.getMostPlayed())[0].count,11,'a cache local inclui os novos incrementos');
  for(let i=0;i<1004;i++)remote.set(`youtube:bulk-${String(i).padStart(4,'0')}`,{
    source:'youtube',source_id:`bulk-${String(i).padStart(4,'0')}`,title:`Faixa ${i}`,artist:null,artwork_url:null,
    duration_seconds:null,play_count:1,last_played:new Date(0).toISOString(),
  });
  await counts.synchronizePlayCounts();
  assert.equal((await counts.getMostPlayed(2000)).length,1005,'uma sincronização explícita traz todas as páginas, incluindo outro aparelho');
  console.log('Contagens: retry idempotente e paginação acima de 1000 linhas passaram.');
}

// O downloader nativo rejeita alocações excessivas e respeita cancelamento.
{
  class File {constructor(_dir,name){this.name=name;this.uri=`file://${name}`;this.exists=false;}create(){}write(){}}
  const storage={getItem:async()=>null,setItem:async()=>{}};
  const stubs={
    'react-native':{Platform:{OS:'ios'}},
    '@react-native-async-storage/async-storage':{default:storage,...storage},
    'expo-file-system':{File,Paths:{document:{list:()=>[]},cache:{list:()=>[]}}},
    'src/lib/mp4Fixer.ts':{fixMp4Duration:()=>{}},
  };
  const excessive=ambiente(async()=>{throw Error('não devia pedir rede');},stubs).carregar('src/lib/youtubeCache.ts');
  await assert.rejects(excessive.downloadProgressiveAudio('x','https://audio.test',300*1024*1024,null),/too large/);
  await assert.rejects(excessive.downloadProgressiveAudio('x','https://audio.test',10,null,{shouldAbort:()=>true}),/download aborted/);
  const discovered=ambiente(async()=>({headers:{get:name=>name==='content-range'?'bytes 0-1/999999999':null}}),stubs).carregar('src/lib/youtubeCache.ts');
  await assert.rejects(discovered.discoverContentLength('https://audio.test'),/too large/);
  // Quem muda aquilo de que o cancelamento depende avisa, e o pedido à espera da
  // rede pára no instante -- sem esperar pela verificação periódica de 1 s.
  let parar=false;
  const pendurado=ambiente((_url,{signal})=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('aborted')));}),stubs).carregar('src/lib/youtubeCache.ts');
  const inicio=Date.now();
  const aDescarregar=assert.rejects(pendurado.downloadProgressiveAudio('y','https://audio.test',10,null,{shouldAbort:()=>parar}),/download aborted/);
  await new Promise((r)=>setTimeout(r,30));
  parar=true;
  pendurado.verificarCancelamentos();
  await aDescarregar;
  assert.ok(Date.now()-inicio<500,'o aviso cancela o pedido logo, sem esperar pelo relógio');
  // O registo dos downloads (para a capa se montar e para o relatório de preso):
  // quem tem a vaga descarrega, quem chega depois fica na fila, e sai ao acabar.
  let pararTodos=false;
  const fila=ambiente((_url,{signal})=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('aborted')));}),stubs).carregar('src/lib/youtubeCache.ts');
  const primeiro=assert.rejects(fila.downloadProgressiveAudio('a','https://audio.test',10,null,{prioridade:'adiantar',shouldAbort:()=>pararTodos}),/download aborted/);
  const segundo=assert.rejects(fila.downloadProgressiveAudio('b','https://audio.test',10,null,{prioridade:'reproducao',shouldAbort:()=>pararTodos}),/download aborted/);
  await new Promise((r)=>setTimeout(r,30));
  assert.equal(fila.estadoDoDownload('a')?.fase,'a-descarregar','quem tem a vaga descarrega');
  assert.equal(fila.estadoDoDownload('a')?.prioridade,'adiantar');
  assert.equal(fila.estadoDoDownload('a')?.ultimoHttp,null,'o pedido ainda não respondeu');
  assert.equal(fila.estadoDoDownload('b')?.fase,'na-fila','quem chega depois fica na fila, e o registo diz');
  assert.equal(fila.downloadsEmCurso().length,2);
  pararTodos=true;
  fila.verificarCancelamentos();
  await primeiro;
  await segundo;
  assert.equal(fila.downloadsEmCurso().length,0,'acabado, sai do registo');
  console.log('Downloads: tamanho máximo, descoberta remota e cancelamento foram limitados.');
}

// "Continuar aqui" com e sem a migração handoff-ao-vivo.sql. Sem ela não há as
// colunas novas nem a função de leitura, e um pedido com uma coluna que não
// existe é recusado INTEIRO: o handoff tem de continuar a funcionar como antes.
{
  let migrada = false, falhaPassageira = false;
  const upserts = [], leituras = [];
  const linha = (extra = {}) => ({
    device_id: 'iphone', device_name: 'iPhone', device_kind: 'ios',
    track: { source: 'youtube', sourceId: 'a', title: 'A', durationSeconds: 200 },
    queue: [], queue_index: 0, position_ms: 0, is_playing: true,
    updated_at: new Date(Date.now() + 171_000).toISOString(), ...extra,
  });
  const consulta = () => {
    const q = {
      upsert: async (valores) => {
        upserts.push('idade_da_amostra_ms' in valores ? 'com-idade' : 'sem-idade');
        return !migrada && 'idade_da_amostra_ms' in valores
          ? { error: { code: 'PGRST204', message: "Could not find the 'idade_da_amostra_ms' column" } }
          : { error: null };
      },
      select: () => q, eq: () => q, neq: () => q, order: () => q,
      limit: async () => { leituras.push('tabela'); return { data: [linha()], error: null }; },
    };
    return q;
  };
  const supabaseFalso = {
    auth: { getUser: async () => ({ data: { user: { id: 'eu' } }, error: null }), getSession: async () => ({ data: { session: { user: { id: 'eu' } } } }) },
    from: () => consulta(),
    rpc: async (nome) => {
      leituras.push(nome);
      if (falhaPassageira) return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
      return migrada
        ? { data: [linha({ idade_ms: 53_000, ritmo: 0.8 })], error: null }
        : { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    },
  };
  const sessoes = () => ambiente(async () => {}, {
    'src/lib/supabase.ts': { supabase: supabaseFalso },
    'src/lib/deviceIdentity.ts': { getDeviceId: async () => 'pc', getDeviceName: async () => 'PC', deviceKind: () => 'desktop' },
  }).carregar('src/api/playerSessions.ts');
  const instantaneo = { track: linha().track, queue: [], queueIndex: 0, positionMs: 1000, positionAt: Date.now() - 800, isPlaying: true, ritmo: 1 };

  const antiga = sessoes();
  await antiga.writeSession(instantaneo);
  assert.deepEqual(upserts, ['com-idade', 'sem-idade'], 'sem as colunas novas, volta a escrever como antes');
  await antiga.writeSession(instantaneo);
  assert.deepEqual(upserts.slice(2), ['sem-idade'], 'e lembra-se: não repete o pedido que vai falhar');
  const lidas = await antiga.fetchOtherSessions();
  assert.equal(lidas.length, 1, 'sem a função de leitura, lê a tabela');
  assert.equal(lidas[0].idadeMs, null, 'e sem idade do servidor');
  assert.deepEqual(leituras, ['sessoes_dos_outros_dispositivos', 'tabela']);
  await antiga.fetchOtherSessions();
  assert.deepEqual(leituras.slice(2), ['tabela'], 'não volta a perguntar pela função que não existe');

  migrada = true; upserts.length = 0; leituras.length = 0;
  const nova = sessoes();
  await nova.writeSession(instantaneo);
  assert.deepEqual(upserts, ['com-idade'], 'com a migração, um pedido só');
  const [s] = await nova.fetchOtherSessions();
  assert.equal(s.idadeMs, 53_000, 'a idade vem do servidor');
  assert.equal(s.ritmo, 0.8, 'e a velocidade também');
  assert.deepEqual(leituras, ['sessoes_dos_outros_dispositivos']);

  falhaPassageira = true; leituras.length = 0;
  await nova.fetchOtherSessions();
  falhaPassageira = false;
  await nova.fetchOtherSessions();
  assert.deepEqual(leituras, ['sessoes_dos_outros_dispositivos', 'tabela', 'sessoes_dos_outros_dispositivos'],
    'uma falha passageira não desliga a função para sempre');
  console.log('Continuar aqui: com e sem a migração, a escrita e a leitura funcionam.');
}

// A leitura LEVE do handoff (27/9, supabase/handoff-leve.sql): o banner e a
// lista de aparelhos leem sem a fila, e quem adota lê-a nesse momento. Sem a
// migração é a leitura de sempre, e não se volta a perguntar pela função.
{
  let leve = true;
  const rpcs = [];
  const fila = [{ sourceId: 'a' }, { sourceId: 'b' }, { sourceId: 'c' }];
  const base = {
    device_id: 'iphone', device_name: 'iPhone', device_kind: 'ios',
    track: { source: 'youtube', sourceId: 'a', title: 'A' }, queue_index: 0,
    position_ms: 1000, is_playing: true, updated_at: new Date().toISOString(), ritmo: 1, idade_ms: 500,
  };
  const supabaseFalso = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'eu' } } } }) },
    from: () => { throw new Error('não devia ler a tabela'); },
    rpc: async (nome) => {
      rpcs.push(nome);
      if (nome === 'sessoes_dos_outros_dispositivos_leves') {
        return leve
          ? { data: [{ ...base, proxima: { sourceId: 'b' }, depois: 1 }], error: null }
          : { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
      }
      return { data: [{ ...base, queue: fila }], error: null };
    },
  };
  const api = () => ambiente(async () => {}, {
    'src/lib/supabase.ts': { supabase: supabaseFalso },
    'src/lib/deviceIdentity.ts': { getDeviceId: async () => 'pc', getDeviceName: async () => 'PC', deviceKind: () => 'desktop' },
  }).carregar('src/api/playerSessions.ts');

  const nova = api();
  const [s] = await nova.fetchOtherSessionsLeves();
  // Objetos do módulo vêm de outro contexto do vm: compara-se pelo conteúdo.
  assert.equal(s.queue.length, 0, 'a leitura leve não traz a fila');
  assert.equal(s.filaPorLer, true);
  assert.equal(JSON.stringify(s.resumo), JSON.stringify({ proxima: { sourceId: 'b' }, depois: 1 }), 'traz o que o banner mostra dela');
  assert.equal(nova.temAvisosLeves(), true, 'e diz que os avisos são os pequenos');
  const completa = await nova.completarSessao(s);
  assert.deepEqual(completa.queue, fila, 'quem adota lê a fila nesse momento');
  assert.deepEqual(rpcs, ['sessoes_dos_outros_dispositivos_leves', 'sessoes_dos_outros_dispositivos']);
  rpcs.length = 0;
  assert.equal(await nova.completarSessao(completa), completa, 'uma sessão com fila não se volta a ler');
  assert.deepEqual(rpcs, []);

  leve = false;
  const antiga = api();
  const [t] = await antiga.fetchOtherSessionsLeves();
  assert.deepEqual(t.queue, fila, 'sem a migração, a leitura de sempre');
  assert.equal(t.filaPorLer, undefined);
  assert.equal(antiga.temAvisosLeves(), false, 'e os avisos continuam a ser os da tabela');
  rpcs.length = 0;
  await antiga.fetchOtherSessionsLeves();
  assert.deepEqual(rpcs, ['sessoes_dos_outros_dispositivos'], 'não volta a perguntar pela função que não existe');
  console.log('Continuar aqui, leve: sem a fila no banner, com ela ao adotar, e sem a migração como antes.');
}

// Perfil pessoal de ponta a ponta: plays + Spotify/sementes -> crivo real de
// confiança -> âncoras consultadas no catálogo. A rede é o único duplo aqui.
{
  let historico = [
    { artist: 'Juice WRLD', play_count: 10 },
    { artist: '999', play_count: 90 }, // Contagem não prova um nome extraído.
  ];
  let consultas = [];
  const mundo = ambiente(() => { throw Error('Este teste não usa rede'); }, {
    'src/lib/supabase.ts': { supabase: { rpc: async (nome) => {
      assert.equal(nome, 'get_top_artists');
      return { data: historico, error: null };
    } } },
    'src/lib/prefs.ts': {
      getGostoDoSpotify: async () => ({ artistas: [{ name: 'Horizonte Novo', plays: 20 }], lidoEm: Date.now() }),
      getArtistasSemente: async () => ['Aurora Inicial'],
    },
    'src/state/connectivity.ts': { useConnectivity: { getState: () => ({ offline: false }) } },
    'src/state/recommendationFeedback.ts': {
      artistasPreferidos: () => [], artistWeight: () => 1, feedbackReady: async () => {},
      filterSuggestions: (faixas) => [...faixas], trackIsSuppressed: () => false,
    },
    'src/api/library.ts': { getLibraryKeys: async () => new Set() },
    'src/api/afinidade.ts': { paresDeArtistaEPlaylist: async () => ({ pares: [], faixas: [] }) },
    'src/api/catalogo.ts': {
      vizinhancaDe: async (nome) => {
        consultas.push(nome);
        return {
          artista: { id: `proprio-${nome}`, nome, fas: 100 },
          semelhantes: [{ id: nome, nome: `Vizinho de ${nome}`, fas: 100 }],
        };
      },
      topDoArtista: async (id) => [{ titulo: 'Luz do Dia', artista: `Vizinho de ${id}`, duracaoS: 180 }],
    },
    'src/api/ytSearchFree.ts': { searchYouTubeFreeWithChannel: async (query) => {
      const artista = query.slice(0, -' Luz do Dia'.length);
      return [{ channel: `${artista} - Topic`, track: {
        source: 'youtube', sourceId: `video-${artista}`, title: 'Luz do Dia', artist: artista,
        durationSeconds: 180, album: null, artworkUrl: null,
      } }];
    } },
    'src/api/youtube.ts': {},
  });
  const descoberta = mundo.carregar('src/api/descoberta.ts');
  const contexto = [{ source: 'youtube', sourceId: 'atual', title: 'Lucid Dreams',
    artist: 'Juice WRLD - Topic', durationSeconds: 180, album: null, artworkUrl: null }];
  const validarAncoras = (rotulo) => {
    assert.ok(consultas.includes('Horizonte Novo'), `${rotulo}: Spotify preserva o nome e passa o crivo`);
    assert.ok(consultas.includes('Aurora Inicial'), `${rotulo}: escolha inicial passa o crivo`);
    assert.ok(!consultas.includes('999'), `${rotulo}: histórico não ganha confiança externa`);
  };
  const weekly = await descoberta.descobrirNovas(30, contexto);
  validarAncoras('Weekly');
  assert.ok(weekly.some(t => t.artist === 'Vizinho de Horizonte Novo'));
  consultas = [];
  const mixes = await descoberta.descobertasPorAncora(
    contexto, ['999', 'Juice WRLD', 'Horizonte Novo', 'Aurora Inicial'],
  );
  validarAncoras('Misturas');
  assert.deepEqual(consultas, ['Juice WRLD', 'Horizonte Novo', 'Aurora Inicial'],
    'Misturas: só as âncoras pedidas pela página, pela ordem dela, sem o nome suspeito');
  assert.deepEqual([...mixes.ancoras], ['Juice WRLD', 'Horizonte Novo', 'Aurora Inicial'],
    'Misturas: o remendo do YouTube só recebe as âncoras que passaram o crivo');
  assert.ok(mixes.vizinhas.get('horizonte novo')?.length, 'Misturas: o mapa contém música da âncora do Spotify');
  assert.ok(mixes.vizinhas.get('aurora inicial')?.length, 'Misturas: o mapa contém música da escolha inicial');
  consultas = [];
  const soDuas = await descoberta.descobertasPorAncora(
    contexto, ['Juice WRLD', 'Horizonte Novo', 'Aurora Inicial'], 2,
  );
  assert.deepEqual(consultas, ['Juice WRLD', 'Horizonte Novo'], 'Misturas: não passa do número de misturas pedido');
  assert.deepEqual([...soDuas.ancoras], ['Juice WRLD', 'Horizonte Novo']);

  // Conta nova: sem biblioteca nem plays, só o perfil importado e as sementes.
  historico = []; consultas = [];
  const coldStart = await descoberta.descobertasPorAncora([], ['Horizonte Novo', 'Aurora Inicial']);
  validarAncoras('Conta nova');
  assert.ok(coldStart.vizinhas.get('horizonte novo')?.length);
  assert.ok(coldStart.vizinhas.get('aurora inicial')?.length);
  console.log('Perfil de recomendações: Weekly e misturas preservam Spotify/sementes, inclusive numa conta nova, sem confiar em nomes suspeitos.');
}

// Novidade é da faixa, não obrigatoriamente do artista. O mesmo artista que
// serve de âncora pode ter música que a pessoa ainda não guardou nem ouviu.
{
  const procuradas = [];
  const faixaDoCatalogo = (titulo, artista) => ({ titulo, artista, duracaoS: 180 });
  const ids = new Map([
    ['Aurora Azul Faixa Atual', 'actual'],
    ['Aurora Azul Faixa Guardada', 'guardada'],
    ['Aurora Azul Faixa Já Sugerida', 'sugerida'],
    ['Aurora Azul Faixa Nova', 'nova-da-aurora'],
    ['Banda Próxima Faixa Vizinha', 'nova-vizinha'],
  ]);
  const mundo = ambiente(() => { throw Error('Este teste não usa rede'); }, {
    'src/state/connectivity.ts': { useConnectivity: { getState: () => ({ offline: false }) } },
    'src/state/recommendationFeedback.ts': {
      artistasPreferidos: () => [], artistWeight: () => 1, feedbackReady: async () => {},
      filterSuggestions: (faixas) => [...faixas], trackIsSuppressed: () => false,
    },
    'src/api/library.ts': { getLibraryKeys: async () => new Set(['youtube:guardada']) },
    'src/api/plays.ts': { getHeavyRotation: async () => [] },
    'src/api/perfilDeRecomendacoes.ts': {
      lerPerfilDeRecomendacoes: async () => ({ escutas: new Map(), externos: new Map() }),
    },
    'src/api/afinidade.ts': { paresDeArtistaEPlaylist: async () => ({ pares: [], faixas: [] }) },
    'src/api/catalogo.ts': {
      vizinhancaDe: async (nome) => nome === 'Aurora Azul' ? {
        artista: { id: 1, nome: 'Aurora Azul', fas: 1000 },
        semelhantes: [{ id: 2, nome: 'Banda Próxima', fas: 500 }],
      } : null,
      topDoArtista: async (id) => {
        procuradas.push(id);
        return id === 1 ? [
          faixaDoCatalogo('Faixa Atual', 'Aurora Azul'),
          faixaDoCatalogo('Faixa Guardada', 'Aurora Azul'),
          faixaDoCatalogo('Faixa Já Sugerida', 'Aurora Azul'),
          faixaDoCatalogo('Faixa Nova', 'Aurora Azul'),
        ] : [faixaDoCatalogo('Faixa Vizinha', 'Banda Próxima')];
      },
    },
    'src/api/ytSearchFree.ts': { searchYouTubeFreeWithChannel: async (query) => {
      const id = ids.get(query);
      return id ? [{ channel: `${query.split(' Faixa')[0]} - Topic`, track: {
        source: 'youtube', sourceId: id, title: query.slice(query.indexOf('Faixa')),
        artist: query.split(' Faixa')[0], durationSeconds: 180, album: null, artworkUrl: null,
      } }] : [];
    } },
    'src/api/youtube.ts': {},
  });
  const descoberta = mundo.carregar('src/api/descoberta.ts');
  const contexto = [{ source: 'youtube', sourceId: 'actual', title: 'Faixa Atual',
    artist: 'Aurora Azul - Topic', durationSeconds: 180, album: null, artworkUrl: null }];
  const candidatas = await descoberta.candidatasParaDescoberta(
    contexto, new Set(['youtube:actual']), new Set(['youtube:sugerida']), 10, 1,
    new Map([['aurora azul', 100]]),
  );
  assert.ok(procuradas.includes(1), 'consulta também o catálogo do artista conhecido');
  assert.ok(candidatas.some((t) => t.sourceId === 'nova-da-aurora'),
    'uma faixa nova do artista conhecido pode ser recomendada');
  assert.ok(candidatas.some((t) => t.sourceId === 'nova-vizinha'),
    'os artistas relacionados continuam presentes');
  assert.ok(!candidatas.some((t) => ['actual', 'guardada', 'sugerida'].includes(t.sourceId)),
    'fila, biblioteca e histórico de sugestões continuam excluídos por faixa');
  console.log('Descoberta por faixa: aceita música nova de um artista conhecido sem repetir fila, biblioteca ou sugestões anteriores.');
}

// Numa sessão, o que está a tocar escolhe as âncoras. O perfil global continua
// a ajudar a ordenar os semelhantes do catálogo, sem mudar o ambiente atual.
{
  const ancorasConsultadas = [];
  const topsConsultados = [];
  const mundo = ambiente(() => { throw Error('Este teste não usa rede'); }, {
    'src/state/connectivity.ts': { useConnectivity: { getState: () => ({ offline: false }) } },
    'src/state/recommendationFeedback.ts': {
      artistasPreferidos: () => [], artistWeight: () => 1, feedbackReady: async () => {},
      filterSuggestions: (faixas) => [...faixas], trackIsSuppressed: () => false,
    },
    'src/api/library.ts': { getLibraryKeys: async () => new Set() },
    'src/api/plays.ts': { getHeavyRotation: async () => [] },
    'src/api/perfilDeRecomendacoes.ts': {
      lerPerfilDeRecomendacoes: async () => ({ escutas: new Map(), externos: new Map() }),
    },
    'src/api/afinidade.ts': { paresDeArtistaEPlaylist: async () => ({ pares: [], faixas: [] }) },
    'src/api/catalogo.ts': {
      vizinhancaDe: async (nome) => {
        ancorasConsultadas.push(nome);
        return nome === 'Aurora Atual' ? {
          artista: { id: 1, nome: 'Aurora Atual', fas: 100 },
          semelhantes: [
            { id: 2, nome: 'Horizonte Global', fas: 100 },
            { id: 3, nome: 'Vizinho Neutro', fas: 100 },
          ],
        } : {
          artista: { id: 2, nome: 'Horizonte Global', fas: 100 },
          semelhantes: [{ id: 4, nome: 'Outro Global', fas: 100 }],
        };
      },
      topDoArtista: async (id) => {
        topsConsultados.push(id);
        const artista = id === 2 ? 'Horizonte Global' : id === 1 ? 'Aurora Atual' : 'Vizinho Neutro';
        return [{ titulo: `Faixa ${id}`, artista, duracaoS: 180 }];
      },
    },
    'src/api/ytSearchFree.ts': { searchYouTubeFreeWithChannel: async (query) => [{
      channel: `${query.split(' Faixa')[0]} - Topic`,
      track: {
        source: 'youtube', sourceId: `video-${query}`, title: query,
        artist: query.split(' Faixa')[0], durationSeconds: 180, album: null, artworkUrl: null,
      },
    }] },
    'src/api/youtube.ts': {},
  });
  const descoberta = mundo.carregar('src/api/descoberta.ts');
  const contexto = [{ source: 'youtube', sourceId: 'atual', title: 'Canção Atual',
    artist: 'Aurora Atual - Topic', durationSeconds: 180, album: null, artworkUrl: null }];
  await descoberta.candidatasParaDescoberta(
    contexto, new Set(['youtube:atual']), new Set(), 10, 4,
    new Map([['horizonte global', 100]]), undefined,
    new Map([['horizonte global', 'Horizonte Global']]), true,
  );
  assert.deepEqual(ancorasConsultadas, ['Aurora Atual'],
    'numa sessão, o perfil global não substitui o contexto como âncora');
  assert.equal(topsConsultados[0], 2,
    'o perfil global continua a ordenar os semelhantes da âncora atual');
  console.log('Contexto da sessão: escolhe as âncoras; perfil global e playlists ficam como apoio à ordenação.');

  // O Smart Shuffle é ESTRITO: se o artista do que está a tocar não serve de
  // âncora, não há candidatas. Com `true` (o Jam) cai no perfil geral -- que
  // era de onde vinham as sugestões sem nada a ver com a música (25/9).
  // A biblioteca confirma OUTRO artista (um canal Topic), e o canal do que está
  // a tocar só aparece uma vez: não passa o crivo dos nomes.
  const comBiblioteca = ambiente(() => { throw Error('Este teste não usa rede'); }, {
    ...Object.fromEntries(['src/state/connectivity.ts', 'src/state/recommendationFeedback.ts',
      'src/api/library.ts', 'src/api/plays.ts', 'src/api/perfilDeRecomendacoes.ts',
      'src/api/catalogo.ts', 'src/api/ytSearchFree.ts', 'src/api/youtube.ts']
      .map((m) => [m, mundo.carregar(m)])),
    'src/api/afinidade.ts': { paresDeArtistaEPlaylist: async () => ({
      pares: [], faixas: [{ source: 'youtube', title: 'Outra', artist: 'Outra Banda - Topic' }],
    }) },
  }).carregar('src/api/descoberta.ts');
  const semConfianca = [{ source: 'youtube', sourceId: 'canal', title: 'Canção Qualquer',
    artist: 'Canal Qualquer', durationSeconds: 180, album: null, artworkUrl: null }];
  ancorasConsultadas.length = 0;
  const estrito = await comBiblioteca.candidatasParaDescoberta(
    semConfianca, new Set(), new Set(), 10, 4,
    new Map([['horizonte global', 100]]), undefined,
    new Map([['horizonte global', 'Horizonte Global']]), 'estrito',
  );
  void estrito;
  assert.deepEqual(ancorasConsultadas, ['Canal Qualquer'],
    'estrito: o que está a tocar é a âncora (o catálogo confirma quem é), e o perfil geral nunca');
  ancorasConsultadas.length = 0;
  await comBiblioteca.candidatasParaDescoberta(
    semConfianca, new Set(), new Set(), 10, 4,
    new Map([['horizonte global', 100]]), undefined,
    new Map([['horizonte global', 'Horizonte Global']]), true,
  );
  assert.deepEqual(ancorasConsultadas, ['Horizonte Global'], 'o Jam continua a poder partir do perfil');
  console.log('Smart Shuffle estrito: a âncora é sempre o que está a tocar, nunca o perfil geral.');
}

// As quotas de duas âncoras podem estar certas e, ainda assim, a primeira
// dominar o início inteiro da lista. As candidatas têm de alternar entre os
// lados do gosto antes de repetir uma âncora.
{
  const ladoDoNome = (nome) => /(?:^| )B(?: |$)/.test(nome) ? 'B' : 'A';
  const mundo = ambiente(() => { throw Error('Este teste não usa rede'); }, {
    'src/state/connectivity.ts': { useConnectivity: { getState: () => ({ offline: false }) } },
    'src/state/recommendationFeedback.ts': {
      artistasPreferidos: () => [], artistWeight: () => 1, feedbackReady: async () => {},
      filterSuggestions: (faixas) => [...faixas], trackIsSuppressed: () => false,
    },
    'src/api/library.ts': { getLibraryKeys: async () => new Set() },
    'src/api/plays.ts': { getHeavyRotation: async () => [] },
    'src/api/perfilDeRecomendacoes.ts': {
      lerPerfilDeRecomendacoes: async () => ({ escutas: new Map(), externos: new Map() }),
    },
    'src/api/afinidade.ts': { paresDeArtistaEPlaylist: async () => ({ pares: [], faixas: [] }) },
    'src/api/catalogo.ts': {
      vizinhancaDe: async (nome) => {
        const lado = ladoDoNome(nome);
        return {
          artista: { id: `${lado}-proprio`, nome: `Ancora ${lado}`, fas: 100 },
          semelhantes: Array.from({ length: 5 }, (_, i) => ({
            id: `${lado}-${i}`, nome: `${lado} Vizinho ${i}`, fas: 100 - i,
          })),
        };
      },
      topDoArtista: async (id) => {
        const lado = String(id).startsWith('A') ? 'A' : 'B';
        const artista = String(id).endsWith('proprio') ? `Ancora ${lado}` : `${lado} Vizinho ${String(id).slice(2)}`;
        return [{ titulo: `Tema ${id}`, artista, duracaoS: 180 }];
      },
    },
    'src/api/ytSearchFree.ts': { searchYouTubeFreeWithChannel: async (query) => {
      const onde = query.lastIndexOf(' Tema ');
      const artista = query.slice(0, onde);
      const titulo = query.slice(onde + 1);
      const lado = ladoDoNome(artista);
      return [{ channel: `${artista} - Topic`, track: {
        source: 'youtube', sourceId: `${lado}:${titulo}`, title: titulo, artist: artista,
        durationSeconds: 180, album: null, artworkUrl: null,
      } }];
    } },
    'src/api/youtube.ts': {},
  });
  const descoberta = mundo.carregar('src/api/descoberta.ts');
  const contexto = ['A', 'B'].map((lado) => ({
    source: 'youtube', sourceId: `actual-${lado}`, title: `Atual ${lado}`,
    artist: `Ancora ${lado} - Topic`, durationSeconds: 180, album: null, artworkUrl: null,
  }));
  const candidatas = await descoberta.candidatasParaDescoberta(
    contexto, new Set(contexto.map((t) => `youtube:${t.sourceId}`)), new Set(),
    10, 2, undefined, undefined, undefined, true,
  );
  const primeirosLados = candidatas.slice(0, 3).map((t) => t.sourceId.split(':')[0]);
  assert.equal(new Set(primeirosLados).size, 2,
    'as primeiras três candidatas incluem as duas âncoras de igual peso');
  const todosOsLados = candidatas.map((t) => t.sourceId.split(':')[0]);
  assert.equal(todosOsLados.filter((lado) => lado === 'A').length, 5,
    'intercalar não reduz a quota da âncora A');
  assert.equal(todosOsLados.filter((lado) => lado === 'B').length, 5,
    'intercalar não reduz a quota da âncora B');
  console.log('Diversidade das âncoras: as primeiras candidatas alternam os lados do contexto.');
}

// O preenchimento das misturas por playlists do YouTube não pode transformar
// o primeiro resultado da pesquisa em afinidade. Cada vídeo tem de pertencer
// a um vizinho confirmado e de corresponder a uma faixa concreta do catálogo.
{
  const item = (videoId, title, channel) => ({ videoId, title, channel, thumbnail: null });
  const playlists = {
    'playlist-com-valida': [
      item('fora-do-gosto', 'Orquestra Distante - Valsa da Noite', 'Orquestra Distante - Topic'),
      item('versao-errada', 'Banda Próxima - Luz Compatível (Live)', 'Banda Próxima - Topic'),
      item('validada', 'Banda Próxima - Luz Compatível', 'Banda Próxima - Topic'),
    ],
    'playlist-sem-validas': [
      item('outra-fora', 'Orquestra Distante - Outra Valsa', 'Orquestra Distante - Topic'),
    ],
  };
  const mundo = ambiente(() => { throw Error('Este teste não usa rede'); }, {
    'src/state/connectivity.ts': { useConnectivity: { getState: () => ({ offline: false }) } },
    'src/state/recommendationFeedback.ts': {
      artistasPreferidos: () => [], artistWeight: () => 1, feedbackReady: async () => {},
      filterSuggestions: (faixas) => [...faixas], trackIsSuppressed: () => false,
    },
    'src/api/library.ts': { getLibraryKeys: async () => new Set() },
    'src/api/plays.ts': { getHeavyRotation: async () => [] },
    'src/api/perfilDeRecomendacoes.ts': {
      lerPerfilDeRecomendacoes: async () => ({ escutas: new Map(), externos: new Map() }),
    },
    'src/api/afinidade.ts': { paresDeArtistaEPlaylist: async () => ({ pares: [], faixas: [] }) },
    'src/api/catalogo.ts': {
      vizinhancaDe: async (nome) => ({
        artista: { id: nome, nome, fas: 100 },
        semelhantes: [{ id: 2, nome: 'Banda Próxima', fas: 100 }],
      }),
      topDoArtista: async (id) => id === 2
        ? [{ titulo: 'Luz Compatível', artista: 'Banda Próxima', duracaoS: 203 }]
        : [],
    },
    'src/api/ytSearchFree.ts': { searchYouTubeFreeWithChannel: async () => [] },
    'src/api/youtube.ts': {
      searchYouTubePlaylists: async (query) => [{
        id: query.startsWith('Aurora Azul') ? 'playlist-com-valida' : 'playlist-sem-validas',
      }],
      fetchYouTubePlaylistById: async (id) => ({ items: playlists[id] ?? [] }),
    },
  });
  const descoberta = mundo.carregar('src/api/descoberta.ts');
  const nomes = mundo.carregar('src/lib/artistName.ts');

  const vizinhas = new Map();
  await descoberta.taparBuracosComOYouTube(['Aurora Azul'], vizinhas, nomes.chaveDeArtista);
  assert.deepEqual(
    [...vizinhas.get('aurora azul')].map((t) => t.sourceId),
    ['validada'],
    'só entra a gravação de um artista relacionado que o catálogo e o pickBest confirmam',
  );
  assert.equal(vizinhas.get('aurora azul')[0].durationSeconds, 203,
    'a duração vem do catálogo em vez de ficar desconhecida');

  const curta = new Map([['bruma lenta', [{
    source: 'youtube', sourceId: 'ja-validada', title: 'Faixa válida', artist: 'Vizinho',
    durationSeconds: 180, album: null, artworkUrl: null,
  }]]]);
  await descoberta.taparBuracosComOYouTube(['Bruma Lenta'], curta, nomes.chaveDeArtista);
  assert.deepEqual(curta.get('bruma lenta').map((t) => t.sourceId), ['ja-validada'],
    'sem candidatas validadas, conserva a mistura mais curta');
  console.log('Misturas da Search: playlists do YouTube só acrescentam faixas com afinidade, identidade e duração confirmadas.');
}

{
  // Afinidade: a cache é da conta, esquece-se quando uma playlist muda, uma
  // leitura velha não fica guardada e a leitura vai às páginas.
  let conta = 'conta-A', leituras = 0, paginas = [], suspender = null;
  const linhasDe = (id, n) => Array.from({ length: n }, (_, i) => ({
    playlist_id: `${id}-lista`,
    tracks: { source: 'youtube', title: `Faixa ${i}`, artist: `Artista ${id}` },
  }));
  let linhas = linhasDe('conta-A', 1);
  const mundo = ambiente(async () => {}, {
    'src/api/playlistSnapshot.ts': null,
    '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } },
    'src/lib/supabase.ts': { supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: conta } } } }),
        getUser: async () => ({ data: { user: { id: conta } }, error: null }), getSession: async () => ({ data: { session: { user: { id: conta } } } }),
      },
      rpc: async () => ({ data: 'copia', error: null }),
      from: () => {
        let inicio = 0, fim = 999, dono = null, apagar = false;
        const q = {
          select: () => q, order: () => q, match: () => q,
          delete: () => { apagar = true; return q; },
          eq: (coluna, valor) => { if (coluna === 'playlists.owner_id') dono = valor; return q; },
          range: (a, b) => { inicio = a; fim = b; return q; },
          then: (ok, falha) => {
            if (apagar) return Promise.resolve({ error: null }).then(ok, falha);
            leituras++; paginas.push([dono, inicio, fim]);
            const resposta = { data: linhas.filter((l) => l.playlist_id.startsWith(dono)).slice(inicio, fim + 1), error: null };
            const espera = suspender ?? Promise.resolve();
            return espera.then(() => resposta).then(ok, falha);
          },
        };
        return q;
      },
    } },
  });
  const afinidade = mundo.carregar('src/api/afinidade.ts');
  const playlists = mundo.carregar('src/api/playlists.ts');

  const deA = await afinidade.paresDeArtistaEPlaylist();
  await afinidade.paresDeArtistaEPlaylist();
  assert.equal(leituras, 1, 'a mesma conta usa a cache');
  assert.equal(deA.pares[0].playlistId, 'conta-A-lista');

  conta = 'conta-B'; linhas = linhasDe('conta-B', 1);
  const deB = await afinidade.paresDeArtistaEPlaylist();
  assert.equal(leituras, 2, 'outra conta não recebe a cache da anterior');
  assert.equal(deB.pares[0].playlistId, 'conta-B-lista');
  assert.equal(paginas.at(-1)[0], 'conta-B', 'a consulta filtra pela conta atual');

  await playlists.removeTrackFromPlaylist('conta-B-lista', 'faixa');
  await afinidade.paresDeArtistaEPlaylist();
  assert.equal(leituras, 3, 'mexer numa playlist obriga a reler a afinidade');

  let soltar;
  suspender = new Promise((r) => { soltar = r; });
  afinidade.esquecerAfinidade();
  const velha = afinidade.paresDeArtistaEPlaylist();
  await new Promise((r) => setTimeout(r, 0));
  afinidade.esquecerAfinidade();
  soltar(); suspender = null;
  assert.equal((await velha).pares.length, 1, 'quem pediu recebe a leitura');
  await afinidade.paresDeArtistaEPlaylist();
  assert.equal(leituras, 5, 'uma leitura anterior à mudança não fica guardada');

  linhas = linhasDe('conta-B', 1001); paginas = [];
  afinidade.esquecerAfinidade();
  const grande = await afinidade.paresDeArtistaEPlaylist();
  assert.equal(grande.pares.length, 1001, 'passa do corte de 1000 linhas do PostgREST');
  assert.deepEqual(paginas.map(([, a, b]) => `${a}-${b}`), ['0-999', '1000-1999']);
  console.log('Afinidade: cache por conta, esquecida quando as playlists mudam, e lida às páginas.');
}

{
  // Misturas: cada âncora leva a própria e dois semelhantes, e pára de
  // pesquisar quando já tem as faixas que chegam.
  let pesquisas = 0;
  const tops = [];
  const mundo = ambiente(() => { throw Error('Este teste não usa rede'); }, {
    'src/lib/supabase.ts': { supabase: { rpc: async () => ({ data: [], error: null }) } },
    'src/lib/prefs.ts': { getGostoDoSpotify: async () => null, getArtistasSemente: async () => [] },
    'src/state/connectivity.ts': { useConnectivity: { getState: () => ({ offline: false }) } },
    'src/state/recommendationFeedback.ts': {
      artistasPreferidos: () => [], artistWeight: () => 1, feedbackReady: async () => {},
      filterSuggestions: (faixas) => [...faixas], trackIsSuppressed: () => false,
    },
    'src/api/library.ts': { getLibraryKeys: async () => new Set() },
    'src/api/afinidade.ts': { paresDeArtistaEPlaylist: async () => ({ pares: [], faixas: [] }) },
    'src/api/catalogo.ts': {
      vizinhancaDe: async (nome) => ({
        artista: { id: nome, nome, fas: 100 },
        semelhantes: Array.from({ length: 5 }, (_, i) => ({ id: `${nome}-${i}`, nome: `${nome} Vizinho ${i}`, fas: 100 })),
      }),
      topDoArtista: async (id, n) => {
        tops.push(id);
        return Array.from({ length: n }, (_, i) => ({ titulo: `Tema ${i}`, artista: `Autor ${tops.length}`, duracaoS: 180 }));
      },
    },
    'src/api/ytSearchFree.ts': { searchYouTubeFreeWithChannel: async (query) => {
      pesquisas++;
      const [, artista, titulo] = query.match(/^(Autor \d+) (.*)$/);
      return [{ channel: `${artista} - Topic`, track: {
        source: 'youtube', sourceId: `v-${pesquisas}`, title: titulo, artist: artista,
        durationSeconds: 180, album: null, artworkUrl: null,
      } }];
    } },
    'src/api/youtube.ts': {},
  });
  const descoberta = mundo.carregar('src/api/descoberta.ts');
  const contexto = [0, 1, 2].map((i) => ({ source: 'youtube', sourceId: `a${i}`, title: `Faixa ${i}`,
    artist: 'Aurora Azul - Topic', durationSeconds: 180, album: null, artworkUrl: null }));
  const r = await descoberta.descobertasPorAncora(contexto, ['Aurora Azul']);
  assert.equal(tops.length, 3, 'a própria âncora e dois semelhantes');
  assert.equal(r.vizinhas.get('aurora azul')?.length, 8, 'fica com as faixas que chegam para não ir à rede');
  assert.ok(pesquisas < 15, `deixa de pesquisar quando a âncora chega (${pesquisas} de 15)`);

  // A proveniência chega ao Smart Shuffle: de que âncora, se é da própria,
  // que posição no Deezer e que faixa do top.
  const proveniencias = new Map();
  const sugestoes = await descoberta.candidatasParaDescoberta(
    contexto, new Set(), new Set(), 30, 1, undefined, undefined, undefined, true, proveniencias,
  );
  assert.ok(sugestoes.length > 0);
  assert.ok(sugestoes.every((t) => proveniencias.has(`${t.source}:${t.sourceId}`)),
    'cada sugestão devolvida leva a sua proveniência');
  const todas = [...proveniencias.values()];
  assert.ok(todas.every((p) => p.ancora === 'aurora azul'));
  const proprias = todas.filter((p) => p.propria);
  assert.ok(proprias.length > 0 && proprias.every((p) => p.posicaoNoCatalogo === 0),
    'as faixas da própria âncora vêm na posição 0');
  assert.ok(todas.some((p) => !p.propria && p.posicaoNoCatalogo >= 1), 'os semelhantes trazem a posição no Deezer');
  assert.deepEqual([...new Set(proprias.map((p) => p.ronda))].sort(), [0, 1, 2, 3, 4],
    'a ronda é a posição da faixa no top do artista');
  console.log('Misturas: âncoras da página, três artistas por âncora e pesquisas até chegar.');
}

{
  // Perfil e catálogo: a confiança lê a biblioteca inteira, e o top do Deezer
  // é lido mais fundo, saltando antes da pesquisa o que a pessoa já tem, já
  // recebeu ou já viu nas semanas anteriores.
  const procuradas = [];
  const consultas = [];
  let biblioteca = [];
  const mundo = ambiente(() => { throw Error('Este teste não usa rede'); }, {
    'src/lib/supabase.ts': { supabase: { rpc: async () => ({ data: [], error: null }) } },
    'src/lib/prefs.ts': { getGostoDoSpotify: async () => null, getArtistasSemente: async () => [] },
    'src/state/connectivity.ts': { useConnectivity: { getState: () => ({ offline: false }) } },
    'src/state/recommendationFeedback.ts': {
      artistasPreferidos: () => [], artistWeight: () => 1, feedbackReady: async () => {},
      filterSuggestions: (faixas) => [...faixas], trackIsSuppressed: () => false,
    },
    'src/api/library.ts': {
      getLibrary: async () => biblioteca,
      getLibraryKeys: async () => new Set(biblioteca.map((t) => `${t.source}:${t.sourceId}`)),
    },
    // Uma faixa oficial de outra banda: a confiança não fica vazia (vazia,
    // deixava passar tudo e o teste não provava nada).
    'src/api/afinidade.ts': { paresDeArtistaEPlaylist: async () => ({
      pares: [], faixas: [{ source: 'youtube', title: 'Outra', artist: 'Outra Banda - Topic' }],
    }) },
    'src/api/catalogo.ts': {
      vizinhancaDe: async (nome) => { consultas.push(nome); return { artista: { id: nome, nome, fas: 100 }, semelhantes: [] }; },
      topDoArtista: async (id, n) => Array.from({ length: n }, (_, i) => ({ titulo: `Tema ${i}`, artista: id, duracaoS: 180 })),
    },
    'src/api/ytSearchFree.ts': { searchYouTubeFreeWithChannel: async (query) => {
      procuradas.push(query);
      const i = query.indexOf(' Tema ');
      const artista = query.slice(0, i), titulo = query.slice(i + 1);
      return [{ channel: `${artista} - Topic`, track: {
        source: 'youtube', sourceId: `v-${titulo}`, title: titulo, artist: artista,
        durationSeconds: 180, album: null, artworkUrl: null,
      } }];
    } },
    'src/api/youtube.ts': {},
  });
  const descoberta = mundo.carregar('src/api/descoberta.ts');
  const identidade = mundo.carregar('src/lib/identidadeDaMusica.ts');
  const video = (id, title, artist) => ({ source: 'youtube', sourceId: id, title, artist,
    durationSeconds: 180, album: null, artworkUrl: null });
  const aTocar = video('a0', 'Aurora Azul - Canção 0', 'Aurora Azul Oficial');
  // Três músicas nas gostadas, com um canal que não é oficial, e as cinco
  // primeiras do top já guardadas.
  biblioteca = [
    aTocar, video('a1', 'Aurora Azul - Canção 1', 'Aurora Azul Oficial'),
    video('a2', 'Aurora Azul - Canção 2', 'Aurora Azul Oficial'),
    ...[0, 1, 2, 3, 4].map((i) => video(`t${i}`, `Aurora Azul - Tema ${i}`, 'Aurora Azul Oficial')),
  ];
  const numeros = () => procuradas.map((q) => Number(q.split(' Tema ')[1]));

  const jaRecebida = new Set(identidade.chavesDoCatalogo({ titulo: 'Tema 5', artista: 'Aurora Azul' }));
  const sessao = await descoberta.candidatasParaDescoberta(
    [aTocar], new Set(), jaRecebida, 5, 1, undefined, undefined, undefined, true,
  );
  assert.ok(consultas.includes('Aurora Azul'),
    'no Smart Shuffle, a música que toca serve de âncora pela confiança da biblioteca inteira');
  assert.deepEqual(numeros(), [6, 7, 8, 9, 10],
    'salta o que já tem e o que já recebeu antes de pesquisar, e desce no top');
  assert.equal(sessao.length, 5);

  procuradas.length = 0;
  const hoje = await descoberta.descobertasDoDia(5, biblioteca, true);
  assert.deepEqual(numeros(), [5, 6, 7, 8, 9]);
  assert.equal(hoje.length, 5);
  const historico = mundo.cache.get('descobertas:mostradas:v2');
  assert.ok(historico[0].chaves.some((k) => k.startsWith('musica2:')),
    'o dia guarda as chaves da música, não só o upload');
  // O dia seguinte: a lista de hoje passa a ser a de ontem.
  historico[0].dia -= 1;
  procuradas.length = 0;
  await descoberta.descobertasDoDia(5, biblioteca, true);
  assert.deepEqual(numeros(), [10, 11, 12, 13, 14],
    'o dia seguinte não gasta pesquisas com as do anterior e traz outras');
  console.log('Perfil e catálogo: confiança pela biblioteca inteira, top mais fundo e sem pesquisar o que já se tem ou já se viu.');
}
