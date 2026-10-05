const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
let now=Date.now(),uid='one',revision=1,changes=[{playlist_id:'a',deleted:false},{playlist_id:'b',deleted:false}];
class Clock extends Date {static now(){return now;}}
const disk=new Map([['playCounts:migrated:v2:one','1'],['playCounts:lastUser:v2','one']]);
let failCheckpoint=false,reads=0,rpcReads=0,historyReads=0;
const storage={getItem:async k=>disk.get(k)??null,removeItem:async k=>disk.delete(k),
  setItem:async(k,v)=>{if(failCheckpoint&&k.startsWith('playCounts:snapshot:'))throw Error('disk');disk.set(k,v);},
  multiSet:async pairs=>{for(const [k,v]of pairs)disk.set(k,v);}};
const track=n=>({id:'t'+n,source:'youtube',source_id:'s'+n,title:'Song '+n,artist:'Artist - Topic',album:null,artwork_url:null,duration_seconds:180});
let rows=Array.from({length:2105},(_,n)=>({playlist_id:n<2000?'a':'b',position:n,tracks:track(n)}));
let countRevision=0;const remote=new Map(),historyChanges=new Map(),operations=new Map();
function change(row,deleted=false){const key=row.source+':'+row.source_id;historyChanges.set(key,{...row,deleted,revision:++countRevision});if(deleted)remote.delete(key);else remote.set(key,row);}
for(let n=0;n<1105;n++)change({source:'youtube',source_id:'h'+n,title:'History '+n,artist:null,artwork_url:null,duration_seconds:180,play_count:1,last_played:new Date(now).toISOString()});
const supabase={auth:{getSession:async()=>({data:{session:uid?{user:{id:uid}}:null}})},
  rpc:async(name,args)=>{
    if(name==='get_playlist_changes'){rpcReads++;return {data:{revision,changes:args.p_after<revision?changes:[]},error:null};}
    if(name==='get_play_count_changes'){
      historyReads++;const all=[...historyChanges.values()].filter(x=>x.revision>args.p_after).sort((a,b)=>a.revision-b.revision);
      const page=all.slice(0,args.p_limit);return {data:{changes:page,revision:page.at(-1)?.revision??countRevision,more:all.length>page.length},error:null};
    }
    if(name==='apply_play_count_deltas'){
      for(const e of args.entries){if((operations.get(e.operationDevice)??0)>=e.operationSequence)continue;
        operations.set(e.operationDevice,e.operationSequence);const old=remote.get(e.source+':'+e.sourceId);
        change({source:e.source,source_id:e.sourceId,title:e.title,artist:e.artist,artwork_url:e.artworkUrl,duration_seconds:e.durationSeconds,
          play_count:(old?.play_count??0)+e.count,last_played:new Date(e.lastPlayed).toISOString()});}
      return {error:null};
    } throw Error(name);
  },
  from:table=>{let start=0,end=999,owner='',playlist='',deleted=false;
    const query={select:()=>query,order:()=>query,eq:(key,value)=>{if(key==='playlists.owner_id')owner=value;if(key==='playlist_id')playlist=value;return query;},
      range:(a,b)=>{start=a;end=b;return query;},delete:()=>{deleted=true;return query;},
      then:(resolve,reject)=>{
        if(table==='user_play_counts'){if(!deleted)throw Error('Full history read forbidden');for(const row of remote.values())change(row,true);return Promise.resolve({error:null}).then(resolve,reject);}
        if(table==='library_tracks')return Promise.resolve({data:[],error:null}).then(resolve,reject);
        if(table!=='playlist_tracks')throw Error(table);
        reads++;return Promise.resolve({data:(owner==='one'?rows:[]).filter(r=>!playlist||r.playlist_id===playlist).slice(start,end+1),error:null}).then(resolve,reject);
      }};return query;},
};
function runtime(){const cache=new Map();
  const mocks={'@react-native-async-storage/async-storage':storage,
    'src/lib/supabase.ts':{supabase},'src/lib/idDaConta.ts':{idDaConta:async()=>uid},
    'src/lib/likedSongsCache.ts':{likedCacheRevision:()=>0,cacheLikedSongs:async()=>{}},
    'src/api/artistNames.ts':{confirmarArtistasEmSegundoPlano:()=>{}}};
  function load(file){file=file.replaceAll('\\','/');if(mocks[file])return mocks[file];if(cache.has(file))return cache.get(file).exports;
    const absolute=path.resolve(root,file),module={exports:{}};cache.set(file,module);
    const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    vm.runInNewContext(code,{module,exports:module.exports,Date:Clock,console,performance,setTimeout,clearTimeout,
      require:name=>mocks[name]??load(path.relative(root,path.resolve(path.dirname(absolute),name+'.ts')))}, {filename:absolute});
    return module.exports;}
  return load;
}
const wait=()=>new Promise(r=>setTimeout(r,5));
async function main(){
  let load=runtime();const snapshot=load('src/api/playlistSnapshot.ts');
  const library=load('src/api/library.ts'),affinity=load('src/api/afinidade.ts');
  const [lib,pairs]=await Promise.all([library.getLibrary(),affinity.paresDeArtistaEPlaylist()]);
  assert.equal(lib.length,2105);assert.equal(pairs.pares.length,2105);assert.equal(reads,3,'uma única leitura paginada para biblioteca e afinidade');
  await snapshot.lerFaixasDasPlaylists();assert.equal(reads,3);await wait();
  load=runtime();const restarted=load('src/api/playlistSnapshot.ts');
  assert.equal((await restarted.lerFaixasDasPlaylists()).length,2105);assert.equal(reads,3,'reiniciar valida revisão sem reler as faixas');
  now+=16000;revision=2;changes=[{playlist_id:'b',deleted:false}];rows=rows.filter(r=>r.playlist_id==='a').concat([{playlist_id:'b',position:0,tracks:track(9000)}]);
  assert.equal((await restarted.lerFaixasDasPlaylists()).length,2001);assert.equal(reads,4,'só lê a playlist alterada, não as 2000 faixas da outra');
  restarted.esquecerFaixasDasPlaylists();revision=3;changes=[{playlist_id:'b',deleted:true}];rows=rows.filter(r=>r.playlist_id==='a');
  assert.equal((await restarted.lerFaixasDasPlaylists()).length,2000);assert.equal(reads,4,'um apagamento não descarrega faixas');
  uid='two';assert.equal((await restarted.lerFaixasDasPlaylists()).length,0,'outra conta não recebe cache privada');uid=null;
  await assert.rejects(restarted.lerFaixasDasPlaylists(),/Session expired/);uid='one';

  load=runtime();let counts=load('src/lib/playCounts.ts');
  assert.equal((await counts.getMostPlayed(2000)).length,1105);assert.equal(historyReads,3,'histórico inicial paginado por revisões');
  const t={source:'youtube',sourceId:'current',title:'Current',artist:'Artist'};
  const before=historyReads;for(let n=0;n<10;n++)await counts.incrementPlayCount(t);
  assert.equal(remote.get('youtube:current').play_count,10);assert.equal(historyReads,before,'dez incrementos não fazem dez leituras');
  assert.equal((await counts.getMostPlayed())[0].count,10);
  change({...remote.get('youtube:h1'),play_count:40});change(remote.get('youtube:h2'),true);
  await counts.synchronizePlayCounts();let local=await counts.getMostPlayed(2000);
  assert.equal(local.find(x=>x.sourceId==='h1').count,40);assert.ok(!local.some(x=>x.sourceId==='h2'));assert.equal(historyReads,before+1);
  load=runtime();counts=load('src/lib/playCounts.ts');await counts.synchronizePlayCounts();
  assert.equal((await counts.getMostPlayed(2000)).length,1105,'checkpoint persiste dados e cursor juntos');
  change({...remote.get('youtube:h3'),play_count:70});failCheckpoint=true;
  await counts.synchronizePlayCounts();failCheckpoint=false;await counts.synchronizePlayCounts();
  assert.equal((await counts.getMostPlayed())[0].count,70,'falha de persistência não adianta cursor e não perde alterações');
  await counts.clearPlayCounts();assert.equal((await counts.getMostPlayed(2000)).length,0,'clear é propagado por tombstones');
  const names=load('src/lib/artistName.ts'),tracks=Array.from({length:1205},(_,n)=>({source:'spotify',title:'Track',artist:'Artist '+n}));
  const expected=names.aprenderVocabulario(tracks);let yields=0;
  await names.aprenderComABibliotecaEmBlocos(tracks,async()=>{yields++;});
  assert.equal(JSON.stringify([...names.vocabularioAprendido().porChave]),JSON.stringify([...expected.porChave]));assert.ok(yields>=12);
  console.log('ok - cliente: snapshot partilhado, reinício, atualização de uma playlist, apagamento, contas, deltas, checkpoint, retry e aprendizagem em blocos');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
