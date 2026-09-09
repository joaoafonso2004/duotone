const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
function load(name, mocks={}, globals={}) {
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInThisContext(`(function(require,module,exports,${Object.keys(globals).join(",")}){${code}\n})`,{filename:name})(id => {
    if (id in mocks) return mocks[id];
    throw new Error('Unexpected import '+id);
  },module,module.exports,...Object.values(globals));
  return module.exports;
}
const core=load('src/lib/inAppNotifications.ts');
const {createNotificationJournal:journal,shouldPresentNotification:show,enqueueNotification:enqueue,serialRefresh}=core;
const msg=(id,time=1,other={}) => ({id,createdAt:new Date(time*1000).toISOString(),sender:{id:'ana',name:'Ana',username:'ana'},itemType:'track',trackData:null,message:'Hello',...other});
const request=(id) => ({friendId:id,status:'pending',isSender:false,name:id});
const snap=(received=[],friends=[],accountId='me')=>({accountId,received,friends});
const ids=items=>items.map(i=>i.id);
async function main() {
  const consume=journal('me');
  assert.deepEqual(consume(snap()),[]);
  const first=consume(snap([msg('1')]))[0];
  assert.equal(first.target.friendId,'ana');
  assert.deepEqual(consume(snap([msg('1')])),[],'repeated Realtime/poll');
  assert.deepEqual(ids(consume(snap([msg('3',3),msg('2',2),msg('1')]))),['2','3'],'burst and order');
  consume(snap([msg('1')]));
  assert.deepEqual(consume(snap([msg('3',3),msg('1')])),[],'archiving latest cannot notify older rows');
  assert.deepEqual(consume(snap([msg('foreign')],[],'other')),[],'account isolation');
  assert.deepEqual(consume(snap([msg('own',4,{sender:{id:'me'}})])),[],'own group messages');
  const historic=journal('me');
  assert.deepEqual(historic(snap([msg('old')])),[],'initial history is silent');
  assert.deepEqual(ids(historic(snap([msg('new',1),msg('old')]))),['new'],'equal timestamps keep distinct IDs');
  assert.deepEqual(historic(snap([msg('revealed-history',0)])),[],'older rows revealed by archive are silent');
  const partial=journal('me');
  partial({accountId:'me'}); // failed network is not an empty successful baseline
  assert.deepEqual(partial(snap([msg('old')],[request('a')])),[]);
  assert.deepEqual(ids(partial(snap([], [request('b')]))),['request:b'],'same request count, different identity');
  assert.deepEqual(partial(snap([], [request('b')])),[]);
  partial(snap());
  assert.equal(partial(snap([], [request('b')])).length,1,'withdrawn and re-sent request');
  const group=journal('me'); group(snap());
  const invite=group(snap([msg('invite',3,{groupId:'band',itemType:'sessao',message:null})]))[0];
  assert.deepEqual(invite.target,{groupId:'band'});assert.match(invite.body,/listen together/);
  const context={enabled:true,active:true,openConversation:null,seen:{}};
  assert.equal(show(first,context),true);
  for (const c of [{enabled:false},{active:false},{openConversation:'ana'},{seen:{ana:first.createdAt}}])
    assert.equal(show(first,{...context,...c}),false);
  assert.equal(show(invite,{...context,openConversation:'ana'}),true,'group distinct from sender');
  assert.equal(show(invite,{...context,openConversation:'group:band'}),false);
  let queue=enqueue([],first);
  queue=enqueue(queue,{...first,id:'2'});assert.deepEqual(ids(queue),['2']);
  for(let i=0;i<8;i++)queue=enqueue(queue,{...first,id:String(i),conversationKey:String(i)});
  assert.equal(queue.length,4,'bounded queue');
  let calls=0,release;
  const refresh=serialRefresh(async()=>{calls++;if(calls===1)await new Promise(r=>{release=r;});});
  const run=refresh();refresh();refresh();release();await run;
  assert.equal(calls,2,'event during request is drained once');
  let fail=true;
  const retry=serialRefresh(async()=>{if(fail)throw Error('offline');});
  await assert.rejects(retry());fail=false;await retry();

  // Execute the actual hook: storage awaits, AppState, account/logout and bursts.
  const store=(initial)=>{let state=initial;const listeners=new Set();return {getState:()=>state,
    setState:patch=>{const old=state;state={...state,...patch};for(const cb of listeners)cb(state,old);},
    subscribe:cb=>{listeners.add(cb);return()=>listeners.delete(cb);}};};
  const auth=Object.assign(fn=>fn(auth.getState()),store({session:{user:{id:'me'}}}));
  const social=store({inboxSnapshot:null,seen:{},friends:[]}),connection=store({offline:false});
  const notices=store({banners:[],epoch:0});
  notices.setState({enqueue:item=>notices.setState({banners:enqueue(notices.getState().banners,item)}),
    dismiss:id=>notices.setState({banners:notices.getState().banners.filter(n=>n.id!==id)}),
    clearBanners:()=>notices.setState({banners:[],epoch:notices.getState().epoch+1})});
  let cleanup, appListener, open=null, enabled=true, permissionResolve=null;
  const app={currentState:'active',addEventListener:(_,cb)=>{appListener=cb;return {remove(){}};}};
  const hook=load('src/hooks/useInAppNotifications.ts',{
    react:{useEffect:fn=>{cleanup=fn();}},'react-native':{AppState:app},
    '../state/auth':{useAuth:auth},'../state/social':{useSocial:social},
    '../state/notifications':{useNotifications:notices},'../state/connectivity':{useConnectivity:connection},
    '../lib/prefs':{getNotificationsEnabled:()=>new Promise(r=>{permissionResolve=()=>r(enabled);})},
    '../lib/inAppNotifications':core,
  });
  hook.useInAppNotifications(()=>open);
  const flush=()=>new Promise(r=>setImmediate(r));
  const deliver=async()=>{await flush();permissionResolve?.();permissionResolve=null;await flush();};
  social.setState({inboxSnapshot:snap()});
  social.setState({inboxSnapshot:snap([msg('live')])});
  social.setState({inboxSnapshot:snap([msg('live')])});
  await deliver();assert.deepEqual(ids(notices.getState().banners),['live']);
  open='ana';social.setState({seen:{}});assert.equal(notices.getState().banners.length,0);
  social.setState({inboxSnapshot:snap([msg('open',2)])});await deliver();assert.equal(notices.getState().banners.length,0);
  open=null;social.setState({inboxSnapshot:snap([msg('background',3)])});await flush();
  app.currentState='background';appListener();app.currentState='active';appListener();await deliver();
  assert.equal(notices.getState().banners.length,0,'no stale async banner after background');
  enabled=false;social.setState({inboxSnapshot:snap([msg('disabled',4)])});await deliver();
  enabled=true;social.setState({inboxSnapshot:snap([msg('disabled',4)])});await deliver();
  assert.equal(notices.getState().banners.length,0,'disabled notifications never replay');
  social.setState({inboxSnapshot:snap([msg('toggle-race',5)])});await flush();
  notices.getState().clearBanners();await deliver();assert.equal(notices.getState().banners.length,0);
  social.setState({inboxSnapshot:snap([msg('logout',6)])});await flush();cleanup();await deliver();
  assert.equal(notices.getState().banners.length,0,'logout cancels storage result');
  const overlays=load('src/lib/notificationOverlays.ts');
  let close=false,done=false;
  const dismissed=overlays.registerNotificationOverlay(()=>{close=true;});
  const wait=overlays.closeNotificationOverlays().then(()=>{done=true;});
  await flush();assert.equal(close,true);assert.equal(done,false,'wait for native dismissal');
  dismissed();await wait;assert.equal(done,true);
  // Actual Social store: inbox delivery survives metadata failure, a second
  // event during a query is read, recovery pauses when hidden, and late results
  // cannot replace data after changing account.
  let visible=true,inboxCalls=0,resolveFirst,resolveStale, failInbox=false;
  const intervals=new Map(),handlers=new Map();
  const channel={on(_,filter,cb){handlers.set(filter.table,cb);return this;},subscribe(){return this;}};
  const create=fn=>{
    const state=store({});
    const hook=Object.assign(selector=>selector(state.getState()),state);
    hook.setState=patch=>state.setState(typeof patch==='function'?patch(state.getState()):patch);
    hook.setState(fn(hook.setState,hook.getState));return hook;
  };
  const socialModule=load('src/state/social.ts',{
    zustand:{create},'react-native':{AppState:{addEventListener:()=>({remove(){}})},Platform:{OS:'ios'}},
    '../api/social':{
      getInboxItems:()=>{inboxCalls++;if(failInbox)return Promise.reject(Error('network'));
        if(inboxCalls===1)return new Promise(r=>{resolveFirst=r;});
        if(inboxCalls===4)return new Promise(r=>{resolveStale=r;});
        return Promise.resolve([msg(String(inboxCalls))]);},
      getFriendships:async()=>[],getGrupos:async()=>{throw Error('metadata unavailable');},
      lerConversasVistas:async()=>({}),marcarConversaVista:async()=>{},
    },
    '../lib/prefs':{getChatsVistos:async()=>({}),marcarChatVisto:async()=>({})},
    '../lib/supabase':{supabase:{rpc:async()=>({data:null,error:null}),channel:()=>channel,removeChannel:async()=>{}}},
    '../lib/socialPresence':{estadoDaPresenca:()=>({})},'../lib/social':load('src/lib/social.ts'),
    '../lib/profileMedia':{clearProfileMediaCache(){}},'../api/profiles':{getSocialConversations:async()=>[]},
    '../lib/appVisibility':{appEstaVisivel:()=>visible},'../lib/inAppNotifications':core,
  },{setInterval:(cb,ms)=>{intervals.set(ms,cb);return ms;},clearInterval:id=>intervals.delete(id),
    console:{warn(){}}});
  const stop=socialModule.iniciarSocial('me');await flush();
  handlers.get('shared_items')();resolveFirst([msg('initial')]);await flush();
  assert.equal(inboxCalls,2,'events during a fetch cause a follow-up read');
  assert.equal(socialModule.useSocial.getState().received[0].id,'2','metadata failure does not block inbox');
  visible=false;intervals.get(15000)();await flush();assert.equal(inboxCalls,2,'no recovery while backgrounded');
  visible=true;intervals.get(15000)();await flush();assert.equal(inboxCalls,3,'15-second recovery');
  failInbox=true;intervals.get(15000)();await flush();
  assert.equal(socialModule.useSocial.getState().inboxError,true);
  assert.equal(socialModule.useSocial.getState().received[0].id,'3','failed queries preserve messages');
  failInbox=false;
  // Force one unresolved query across cleanup, independent of the call count.
  inboxCalls=3;intervals.get(15000)();await flush();stop();resolveStale([msg('old-account')]);await flush();
  assert.equal(socialModule.useSocial.getState().inboxSnapshot,null,'late query after account cleanup ignored');
  assert.equal(intervals.size,0,'all recovery timers removed');
  console.log('Notification regression tests passed (journal, delivery lifecycle, coalescing, recovery, modal navigation).');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
