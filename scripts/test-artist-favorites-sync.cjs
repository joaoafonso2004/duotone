const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function load(file, mocks = {}) {
  const module = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file})(id=>{
    if(id in mocks)return mocks[id]; throw Error(id);
  },module,module.exports);
  return module.exports;
}
const {ArtistFavoritesSync,applyFavoriteEdits} = load('src/lib/artistFavoritesSync.ts');
const tick = () => new Promise(r=>setImmediate(r));
const deferred = () => {let resolve; const promise = new Promise(r=>resolve=r);return {promise,resolve};};
async function main() {
  let remote = {}, online = true;
  function device(initial={values:{},pending:{}}) {
    let local = structuredClone(initial), shown={}, status;
    const sync = new ArtistFavoritesSync({
      readLocal:async()=>structuredClone(local),writeLocal:async v=>{local=structuredClone(v);},
      exchange:async edits=>{if(!online)throw Error('offline');remote=applyFavoriteEdits(remote,edits);return {...remote};},
      apply:v=>{shown=v;},status:v=>{status=v;},
    });
    return {sync,get shown(){return shown;},get local(){return local;},get status(){return status;}};
  }
  const ios=device(),win=device();await Promise.all([ios.sync.sync(),win.sync.sync()]);
  ios.sync.edit('juice wrld',true);await ios.sync.sync();await win.sync.sync();
  assert.equal(win.shown['juice wrld'],true,'iPhone -> Windows');
  win.sync.edit('juice wrld',false);await win.sync.sync();await ios.sync.sync();
  assert.equal(ios.shown['juice wrld'],false,'Windows removal -> iPhone');
  const old=device({values:{'juice wrld':true},pending:{'juice wrld':{value:true,seed:true,revision:0}}});
  await old.sync.sync();assert.equal(old.shown['juice wrld'],false,'migration does not resurrect removals');
  online=false;ios.sync.edit('ellie',true);await ios.sync.sync();
  assert.equal(ios.status,'error');assert.equal(ios.local.pending.ellie.value,true,'outbox survives offline');
  ios.sync.stop();const restarted=device(ios.local);online=true;await restarted.sync.sync();await win.sync.sync();
  assert.equal(win.shown.ellie,true,'restart replays durable offline changes');
  await Promise.all([win.sync.sync(),restarted.sync.sync()]);
  win.sync.edit('a',true);restarted.sync.edit('b',true);
  await Promise.all([win.sync.sync(),restarted.sync.sync()]);await Promise.all([win.sync.sync(),restarted.sync.sync()]);
  assert.equal(win.shown.a,true);assert.equal(win.shown.b,true,'different artist edits both survive');

  const delayed=deferred();let shown, stored, calls=0;
  const inFlight=new ArtistFavoritesSync({readLocal:async()=>({values:{},pending:{}}),writeLocal:async s=>stored=s,
    apply:v=>shown=v,status:()=>{},exchange:async edits=>{calls++;if(calls===1)await delayed.promise;return applyFavoriteEdits({},edits);}});
  inFlight.edit('a',true);await tick();inFlight.edit('a',false);delayed.resolve();await inFlight.sync();
  assert.equal(shown.a,false,'late request cannot undo newer unfavourite');assert.deepEqual(stored.pending,{});
  assert.equal(calls,2,'new edits drain in a second request');
  const hydration=deferred();let hydrated;
  const early=new ArtistFavoritesSync({readLocal:()=>hydration.promise,writeLocal:async()=>{},exchange:async e=>applyFavoriteEdits({},e),apply:v=>hydrated=v,status:()=>{}});
  early.edit('early',true);hydration.resolve({values:{early:false},pending:{}});await early.sync();assert.equal(hydrated.early,true,'click during hydration wins');
  const late=deferred();let paints=0;
  const loggedOut=new ArtistFavoritesSync({readLocal:async()=>({values:{},pending:{}}),writeLocal:async()=>{},exchange:()=>late.promise,apply:()=>paints++,status:()=>{}});
  const request=loggedOut.sync();await tick();loggedOut.stop();const before=paints;late.resolve({private:true});await request;
  assert.equal(paints,before,'late response cannot cross accounts');

  // Execute actual compare-and-swap requests against a conflicting backend.
  let row={prefs:{theme:'dark'},updated_at:'2026-01-01T00:00:00.000Z'}, conflict=true, updates=0;
  const db={from(){let action='read',payload,stamp;const q={select(){return q;},eq(k,v){if(k==='updated_at')stamp=v;return q;},maybeSingle(){return Promise.resolve({data:structuredClone(row),error:null});},
    update(v){action='update';payload=v;return q;},insert(v){action='insert';payload=v;return q;},then(resolve,reject){
      if(action==='update') {updates++;if(conflict){conflict=false;row={prefs:{...row.prefs,artist_favorites_v1:{other:true}},updated_at:'2026-01-02T00:00:00.000Z'};}}
      const matches=action==='insert'?!row:row.updated_at===stamp;
      if(matches)row=structuredClone(payload);
      return Promise.resolve({data:matches?[{user_id:'me'}]:[],error:null}).then(resolve,reject);
    }};return q;}};
  const {updateAccountPrefs}=load('src/lib/accountPrefs.ts',{'./supabase':{supabase:db}});
  await updateAccountPrefs('me',p=>({...p,theme:'light'}));
  assert.equal(updates,2);assert.deepEqual(row.prefs.artist_favorites_v1,{other:true},'settings save preserves a simultaneous favourite');
  assert.equal(row.prefs.theme,'light');
  await assert.rejects(updateAccountPrefs('me',p=>p,()=>false),/Account changed/);
  console.log('Artist favourites: cross-device adds/removes, migration, offline restart, races, account isolation and CAS passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
