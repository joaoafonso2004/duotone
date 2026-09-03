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

// Regressão 1.5.9: uma coluna social em falta escondia toda a biblioteca.
let playlistError={code:'42703',message:'column playlists.visible_on_profile does not exist'};
let playlistReads=[];
const profileEnv=ambiente(async()=>{}, {
  'src/api/library.ts':{},
  'src/lib/supabase.ts':{supabase:{auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:()=>{
    let fields='';const query={select:s=>{fields=s;return query;},eq:(key,value)=>{assert.equal(key,'owner_id');assert.equal(value,'owner');return query;},order:()=>query,
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

let reads=0,failedSection='highlights';
const sections=ambiente(async()=>{}, {
  'src/api/profiles.ts':{
    getSocialProfileTracks:async(_id,recent)=>{reads++;if(failedSection==='recent'&&recent)throw Error('network');return [{id:recent?'recent':'most'}];},
    getProfileHighlights:async()=>{reads++;if(failedSection==='highlights')throw {code:'42703',message:'column p.visible_on_profile does not exist'};return {playlistIds:[],moment:null};},
  },
  'src/api/playlists.ts':{listPlaylists:async()=>{reads++;return [{id:'original'}];},listProfilePlaylists:async()=>{reads++;return [];},copiasGuardadas:async()=>{reads++;return new Set();}},
}).carregar('src/api/profileSections.ts');
let parts=await sections.loadProfileSections('owner',true,true);
assert.equal(parts.highlights.status,'rejected');assert.equal(parts.most.value[0].id,'most');assert.equal(parts.recent.value[0].id,'recent');assert.equal(parts.playlists.value[0].id,'original');
failedSection='recent';parts=await sections.loadProfileSections('owner',true,true);
assert.equal(parts.recent.status,'rejected');assert.equal(parts.highlights.status,'fulfilled');assert.equal(parts.most.status,'fulfilled');
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
  const remote=new Map();const cursor=new Map();let loseReply=true;
  const row=(entry,count)=>({source:entry.source,source_id:entry.sourceId,title:entry.title,artist:entry.artist,
    artwork_url:entry.artworkUrl,duration_seconds:entry.durationSeconds,play_count:count,last_played:new Date(entry.lastPlayed).toISOString()});
  const supabase={
    auth:{getSession:async()=>({data:{session:{user:{id:'user-1'}}}})},
    rpc:async(_name,{entries})=>{
      for(const entry of entries){const previous=cursor.get(entry.operationDevice)??0;if(entry.operationSequence<=previous)continue;
        cursor.set(entry.operationDevice,entry.operationSequence);const old=remote.get(`${entry.source}:${entry.sourceId}`);
        remote.set(`${entry.source}:${entry.sourceId}`,row(entry,(old?.play_count??0)+entry.count));}
      if(loseReply){loseReply=false;return {error:{message:'resposta perdida'}};}return {error:null};
    },
    from:()=>{const query={select:()=>query,eq:()=>query,order:()=>query,
      range:async(start,end)=>({data:[...remote.values()].sort((a,b)=>`${a.source}:${a.source_id}`.localeCompare(`${b.source}:${b.source_id}`)).slice(start,end+1),error:null}),
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
  for(let i=0;i<1004;i++)remote.set(`youtube:bulk-${String(i).padStart(4,'0')}`,{
    source:'youtube',source_id:`bulk-${String(i).padStart(4,'0')}`,title:`Faixa ${i}`,artist:null,artwork_url:null,
    duration_seconds:null,play_count:1,last_played:new Date(0).toISOString(),
  });
  assert.equal((await counts.getMostPlayed(2000)).length,1005,'a paginação traz todas as linhas');
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
  console.log('Downloads: tamanho máximo, descoberta remota e cancelamento foram limitados.');
}
