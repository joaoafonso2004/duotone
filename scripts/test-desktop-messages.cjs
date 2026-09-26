const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},globals={}){
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,console,...globals,require:id=>{if(id in mocks)return mocks[id];throw Error(id);}},{filename:file});return module.exports;
}
const {messageBadge,setMessageAttention}=require('../electron/messageBadge.cjs');
for(const n of [1,9,10,99,100,1000]) {const b=messageBadge(n);assert.equal(b.bitmap.length,32*32*4);assert.equal(b.label,n>99?'99+':String(n));assert.ok(b.bitmap.some(v=>v));}
let focus=false;const flashes=[],icons=[];
const win={isFocused:()=>focus,flashFrame:v=>flashes.push(v),setOverlayIcon:(v,t)=>icons.push([v,t])};
const native={createFromBitmap:()=>({image:true})};
setMessageAttention(win,native,3,true,'win32');assert.equal(flashes.at(-1),true);assert.equal(icons.at(-1)[1],'3 unread messages');
setMessageAttention(win,native,3,false,'win32');assert.equal(flashes.length,1,'count refresh does not stop flashing');assert.equal(icons.length,1,'same count does not redraw');
focus=true;setMessageAttention(win,native,3,true,'win32');assert.equal(flashes.at(-1),false);assert.equal(icons.length,1,'focus preserves unread badge');
setMessageAttention(win,native,0,false,'win32');assert.equal(icons.at(-1)[0],null);
const previous=icons.length;for(const n of [-1,NaN,Infinity,'5',{},1.2])setMessageAttention(win,native,n,true,'win32');assert.equal(icons.length,previous,'invalid IPC ignored');
const store=initial=>{let state=initial;const listeners=new Set();const api={getState:()=>state,setState:p=>{const old=state;state={...state,...p};for(const cb of listeners)cb(state,old);},subscribe:cb=>{listeners.add(cb);return()=>listeners.delete(cb);}};return Object.assign(fn=>fn(state),api);};
const core=load('src/lib/inAppNotifications.ts'),socialCore=load('src/lib/social.ts');
const auth=store({session:{user:{id:'me'}}});
const social=store({received:[],seen:{},friends:[],inboxSnapshot:{accountId:'me',received:[]}});
const notices=store({banners:[]});notices.setState({clearBanners:()=>notices.setState({banners:[]}),enqueue:n=>notices.setState({banners:core.enqueueNotification(notices.getState().banners,n)}),dismiss:id=>notices.setState({banners:notices.getState().banners.filter(n=>n.id!==id)})});
let cleanup,opened=null,enabled=true,focused=true;const badges=[],nativeNotices=[];
const listeners=new Map();const window={duotoneDesktop:{setUnreadMessages:(...v)=>badges.push(v),notifyMessage:n=>nativeNotices.push(n),onNotificationClick:()=>()=>{}},addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
const document={visibilityState:'visible',hasFocus:()=>focused,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
const hook=load('src/hooks/useDesktopNotifications.ts',{
 react:{useEffect:fn=>cleanup=fn(),useRef:v=>({current:v})},'../state/auth':{useAuth:auth},'../state/social':{useSocial:social},'../state/notifications':{useNotifications:notices},
 '../lib/prefs':{getNotificationsEnabled:async()=>enabled},'../lib/inAppNotifications':core,'../lib/social':socialCore,
},{window,document});
const msg=(id,sender='ana',groupId)=>({id,createdAt:new Date(Number(id)*1000).toISOString(),sender:{id:sender,name:'Ana',avatarUrl:'avatar.png'},message:'Hello',itemType:'track',groupId});
const flush=()=>new Promise(r=>setImmediate(r));
const publish=rows=>social.setState({received:rows,inboxSnapshot:{accountId:'me',received:rows}});
async function main(){
 hook.useDesktopNotifications(()=>{},()=>opened);
 publish([msg('1')]);await flush();assert.equal(notices.getState().banners[0].avatarUrl,'avatar.png');assert.equal(nativeNotices.length,0);assert.equal(badges.at(-1)[0],1);
 publish([msg('1')]);await flush();assert.equal(notices.getState().banners.length,1,'duplicate query stays one card');
 opened='ana';publish([msg('2'),msg('1')]);await flush();assert.equal(notices.getState().banners.length,0,'open chat silent');
 focused=false;document.visibilityState='hidden';publish([msg('3'),msg('2'),msg('1')]);await flush();assert.equal(nativeNotices.length,1,'open but hidden chat still alerts');assert.equal(badges.at(-1)[1],true);
 social.setState({seen:{ana:msg('3').createdAt}});assert.equal(badges.at(-1)[0],0,'read markers clear badge');
 enabled=false;publish([msg('4'),msg('3')]);await flush();assert.equal(nativeNotices.length,1);assert.equal(badges.at(-1)[0],1,'muted notifications retain unread count');
 enabled=true;focused=true;document.visibilityState='visible';publish([msg('5','ana','group'),msg('4')]);await flush();assert.equal(notices.getState().banners[0].target.groupId,'group','group opens its own conversation');
 publish([msg('6','me','group'),msg('5','ana','group'),msg('4')]);await flush();assert.equal(badges.at(-1)[0],2,'own group messages excluded');
 cleanup();assert.equal(badges.at(-1)[0],0);assert.equal(notices.getState().banners.length,0);assert.equal(listeners.size,0);
 console.log('Desktop messages: avatar banners, open/hidden chats, groups, mute, read counts, flashing, badge validation and logout passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
