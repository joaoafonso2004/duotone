import assert from 'node:assert/strict';
import { usePlayer, registarOuvirJuntos } from '../src/state/player.ts';
import { rememberRadioListen, radioSessionSeeds } from '../src/lib/radioSession.ts';
import { controlo, reporControlo } from './duplos/controlo.ts';
import { displayArtist, chaveDeArtista } from '../src/lib/artistName.ts';
import type { Track } from '../src/types.ts';

const track=(id:string,artist='Isak'):Track=>({source:'youtube',sourceId:id,title:id,artist,album:null,artworkUrl:null,durationSeconds:60});
const current=track('current'), past=track('past'), queued=track('queued','Bruno Mars');
const seeds=(session:Parameters<typeof radioSessionSeeds>[0],owner:string|null=null)=>radioSessionSeeds(session,owner,current,displayArtist,chaveDeArtista);
let history=null as Parameters<typeof rememberRadioListen>[0];
for(const t of [track('isak1'),track('isak2'),track('hh','Holly Hood'),track('isak3')])history=rememberRadioListen(history,null,t);
assert.deepEqual(seeds(history).map(t=>t.sourceId),['isak3','hh','isak2']);
assert.deepEqual(seeds(history,'another'),[current],'histórico de outra conta não é contexto');
for(let n=0;n<30;n++)history=rememberRadioListen(history,null,track(`repeat${n}`));
assert.equal(history?.tracks.length,20,'memória limitada à sessão recente');

registarOuvirJuntos(()=>null);
let pauses=0,plays=0,seeks=0;
const initial=usePlayer.getState();
function reset(){
  reporControlo();
  const queue=[past,current,queued];
  usePlayer.setState({...initial,current,queue,queueIndex:1,positionMs:23_000,durationMs:60_000,
    radioMode:'off',radioContext:[],radioOwner:null,radioStopped:false,radioError:null,radioListeningSession:{owner:'utilizador-de-teste',tracks:[track('heard')]},
    autoplayRadio:true,shuffle:true,shuffleInteligente:false,shuffleOrder:queue.map(t=>`${t.source}:${t.sourceId}`),
    _yt:{pause:()=>{pauses++;},play:()=>{plays++;},seekTo:()=>{seeks++;}}} as any);
  controlo.radio=[track('radio1'),track('radio2')];
  pauses=plays=seeks=0;
}
const pending=()=>{let resolve!:(ts:Track[])=>void;const promise=new Promise<Track[]>(r=>{resolve=r;});controlo.radioPendentes.push(promise);return resolve;};
async function waitForFetch(){for(let n=0;n<10&&!controlo.chamadas.radio;n++)await new Promise(r=>setTimeout(r,0));assert.equal(controlo.chamadas.radio,1);}

reset();
const before=usePlayer.getState();
assert.equal(await before.startRadio(),true);
assert.deepEqual(usePlayer.getState().queue.map(t=>t.sourceId),['past','current','radio1','radio2']);
assert.deepEqual(controlo.radioContextos[0].map(t=>t.sourceId),['heard'],'contexto só da escuta, nunca da posição passada nem futura na fila');
assert.equal(controlo.radioModos[0],'session');
assert.equal(usePlayer.getState().current,current);
assert.equal(usePlayer.getState().positionMs,23_000);
assert.equal(usePlayer.getState().maquina,before.maquina);
assert.deepEqual([pauses,plays,seeks],[0,0,0],'ativar Rádio não chama nenhum comando de áudio');
assert.equal(usePlayer.getState().shuffle,false);
usePlayer.setState({radioListeningSession:{owner:'utilizador-de-teste',tracks:[track('newlisten','Pop')]} });
controlo.radio=[track('radio3')];
assert.equal(await usePlayer.getState().extendQueueWithRadio(),true);
assert.deepEqual(controlo.radioContextos[1].map(t=>t.sourceId),['heard'],'reabastecer conserva as âncoras de antes de ativar');
usePlayer.getState().stopRadio();
const after=usePlayer.getState().queue;
assert.equal(await usePlayer.getState().extendQueueWithRadio(),false,'Off também impede a preferência de autoplay de o voltar a ligar');
assert.equal(usePlayer.getState().queue,after,'desligar mantém a fila já criada');

for(const change of ['off','queue','account','offline','jam'] as const){
  reset();const originalQueue=usePlayer.getState().queue;const resolve=pending();
  const result=usePlayer.getState().startRadio();await waitForFetch();
  if(change==='off')usePlayer.getState().stopRadio();
  if(change==='queue')usePlayer.setState({queue:[current,track('manual')]});
  if(change==='account')controlo.sessao='different-account';
  if(change==='offline')controlo.offline=true;
  if(change==='jam')registarOuvirJuntos(()=>({sessao:{id:'jam'}} as any));
  const expected=usePlayer.getState().queue;
  resolve([track('late')]);
  assert.equal(await result,false,`${change}: resposta tardia cancelada`);
  assert.equal(usePlayer.getState().queue,expected,`${change}: nunca substitui a fila depois de o estado mudar`);
  if(change!=='queue')assert.equal(expected,originalQueue);
  registarOuvirJuntos(()=>null);
}
reset();controlo.radio=[];const untouched=usePlayer.getState().queue;
assert.equal(await usePlayer.getState().startRadio(),false);
assert.equal(usePlayer.getState().queue,untouched);
assert.match(usePlayer.getState().radioError ?? '',/unchanged/);
reset();controlo.offline=true;
assert.equal(await usePlayer.getState().startRadio(),false);
assert.equal(controlo.chamadas.radio,0);

// O percurso real de reprodução é quem alimenta o histórico; cliques e seeks não contam.
reset();await usePlayer.getState().playTrack(track('audible'),[track('audible')]);
usePlayer.setState({radioListeningSession:null});
assert.equal(usePlayer.getState().radioListeningSession,null);
const now=Date.now;let time=1_000;
try{
  Date.now=()=>time;
  usePlayer.getState()._onYtStateChange('playing');
  usePlayer.getState()._setProgress(0,60_000);
  for(let position=1_000;position<=31_000;position+=1_000){time+=1_000;usePlayer.getState()._setProgress(position,60_000);}
  assert.deepEqual(usePlayer.getState().radioListeningSession?.tracks.map(t=>t.sourceId),['audible']);
}finally{Date.now=now;}
// O Radio não acaba (5/10): com as âncoras secas, tenta sem a memória de 30 dias.
reset();
assert.equal(await usePlayer.getState().startRadio(),true);
controlo.radioPendentes.push(Promise.resolve([]));
controlo.radio=[track('more','Holly Hood')];
const chamadasAntes=controlo.chamadas.radio;
assert.equal(await usePlayer.getState().extendQueueWithRadio(),true,'um lote vazio não acaba o Radio');
assert.equal(controlo.chamadas.radio-chamadasAntes,2,'pediu outra vez');
assert.equal(controlo.radioJaDescobertas?.size,0,'a segunda tentativa já não salta o que se descobriu há dias');
assert.ok(usePlayer.getState().queue.some(t=>t.sourceId==='more'));
assert.equal(usePlayer.getState().radioMode,'on');

// Aprende com um salto cedo de uma faixa do Radio, com som (5/10).
reset();
assert.equal(await usePlayer.getState().startRadio(),true);
await usePlayer.getState().next();
assert.equal(usePlayer.getState().current?.sourceId,'radio1');
usePlayer.getState()._onYtStateChange('playing');
usePlayer.setState({positionMs:5_000});
await usePlayer.getState().next();
assert.deepEqual(usePlayer.getState().radioListeningSession?.skipped?.map(t=>t.sourceId),['radio1'],'o salto ficou na sessão do Radio');
assert.deepEqual(usePlayer.getState().radioListeningSession?.tracks.map(t=>t.sourceId),['heard'],'e as escutas continuam');

// Sobrevive a reabrir a app (5/10): fica ligado, com as mesmas âncoras.
reset();
assert.equal(await usePlayer.getState().startRadio(),true);
const opcoes=(usePlayer as any).persist.getOptions();
const guardado=opcoes.partialize(usePlayer.getState());
assert.equal(guardado.radioMode,'on');
assert.deepEqual(guardado.radioContext.map((t:Track)=>t.sourceId),['heard']);
const reposto=opcoes.merge(JSON.parse(JSON.stringify(guardado)),{...initial});
assert.equal(reposto.radioMode,'on','volta ligado');
assert.equal(reposto.radioStopped,false,'e o autoplay não fica travado');
usePlayer.getState().stopRadio();
assert.equal(opcoes.merge(JSON.parse(JSON.stringify(opcoes.partialize(usePlayer.getState()))),{...initial}).radioMode,'off','desligado à mão, volta desligado');

// Sem conta lida ainda (o arranque), espera em vez de desligar o Radio.
reset();
assert.equal(await usePlayer.getState().startRadio(),true);
controlo.semConta=true;
assert.equal(await usePlayer.getState().extendQueueWithRadio(),false);
assert.equal(usePlayer.getState().radioMode,'on','não desligou');
controlo.semConta=false;

console.log('Radio session: listening context, strict discovery, uninterrupted audio, replenishment and cancellation races passed.');
console.log('Radio que aprende: não acaba, aprende com um salto, sobrevive a reabrir e espera pela conta.');
