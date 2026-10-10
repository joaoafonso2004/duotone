import {parseLrc,type LyricLine} from '../lib/lyricsParser';
import {cleanTrackTitle,cleanArtistName,rankLyrics} from '../lib/lyricsMatch';
import {letraDoYtMusic} from './ytMusic';
import type {LetraDoYtMusic} from '../lib/letrasDoYtMusic';
export {cleanTrackTitle,cleanArtistName};
export interface LyricsData {
  id:number;trackName:string;artistName:string;albumName?:string;duration?:number;instrumental:boolean;
  plainLyrics?:string;syncedLyrics?:string;parsedLines:LyricLine[];timingAvailable:boolean;
  /** De onde veio (10/10): o lrclib, ou o YouTube Music quando o lrclib não tinha tempos. */
  fonte?:'lrclib'|'ytmusic';
}
let cooldownUntil=0;
let requests=Promise.resolve();
let lastRequest=0;
/** Pedidos sequenciais; respeitar Retry-After e nunca guardar um erro como ausência. */
function read(url:URL):Promise<any>{
  const job=requests.catch(()=>{}).then(async()=>{
    if(cooldownUntil>Date.now())throw Error('Lyrics are busy. Please try again shortly.');
    const delay=250-(Date.now()-lastRequest);if(delay>0)await new Promise(r=>setTimeout(r,delay));
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6500);lastRequest=Date.now();
    try{
      const response=await fetch(url.toString(),{signal:controller.signal});
      if(response.status===404)return null;
      if(response.status===429){
        const retry=response.headers.get('Retry-After');
        cooldownUntil=Date.now()+Math.max(1000,retry&&Number.isFinite(Number(retry))?Number(retry)*1000:Math.max(30000,Date.parse(retry??'')-Date.now()||0));
        throw Error('Lyrics are busy. Please try again shortly.');
      }
      if(!response.ok)throw Error('Could not load lyrics. Please try again.');
      return await response.json();
    }finally{clearTimeout(timeout);}
  });
  requests=job.then(()=>{},()=>{});return job;
}
function mapped(data:any,duration?:number):LyricsData {
  const parsed=parseLrc(data.syncedLyrics??'');
  // Um vídeo com introdução ou uma edição slowed não tem necessariamente o
  // mesmo relógio da gravação. Mostrar o texto sem inventar sincronização.
  const timingAvailable=parsed.length>0&&(!duration||!data.duration||Math.abs(duration-data.duration)<=5);
  return {...data,parsedLines:parsed,timingAvailable,plainLyrics:data.plainLyrics||parsed.map(x=>x.text).join('\n'),fonte:'lrclib'};
}
/**
 * A letra: o lrclib primeiro; quando ele não a tem com tempos (ou não responde),
 * o YouTube Music desse vídeo (10/10, `lib/letrasDoYtMusic.ts`). Os tempos de lá
 * são os DESTE áudio -- num videoclipe ele manda o texto sem tempos --, e uma
 * letra sincronizada ganha a uma sem tempos. Sem `videoId`, só o lrclib.
 */
export async function fetchLyrics(trackName:string,artistName:string,durationSeconds?:number,videoId?:string):Promise<LyricsData|null>{
  let doLrclib:LyricsData|null=null,erro:unknown=null;
  try{doLrclib=await lerDoLrclib(trackName,artistName,durationSeconds);}catch(e){erro=e;}
  if(!videoId||doLrclib?.timingAvailable||doLrclib?.instrumental){if(erro)throw erro;return doLrclib;}
  let doYt:LetraDoYtMusic|null=null;
  try{doYt=await letraDoYtMusic(videoId);}catch{/* sem rede: fica o que o lrclib deu */}
  if(doYt?.sincronizada)return doYoutube(doYt,trackName,artistName,durationSeconds);
  if(doLrclib)return doLrclib;
  if(doYt)return doYoutube(doYt,trackName,artistName,durationSeconds);
  if(erro)throw erro;
  return null;
}
function doYoutube(l:LetraDoYtMusic,trackName:string,artistName:string,duration?:number):LyricsData{
  return {id:0,trackName:cleanTrackTitle(trackName),artistName:cleanArtistName(artistName),duration,instrumental:false,
    plainLyrics:l.texto,parsedLines:l.linhas,timingAvailable:l.sincronizada,fonte:'ytmusic'};
}
async function lerDoLrclib(trackName:string,artistName:string,durationSeconds?:number):Promise<LyricsData|null>{
  const title=cleanTrackTitle(trackName),artist=cleanArtistName(artistName);
  if(!title||!artist)return null;
  const url=new URL('https://lrclib.net/api/get');url.searchParams.set('track_name',title);url.searchParams.set('artist_name',artist);
  if(durationSeconds&&durationSeconds<=3600)url.searchParams.set('duration',String(Math.round(durationSeconds)));
  const exact=await read(url);
  if(exact&&rankLyrics(exact,title,artist,durationSeconds)>=0&&(exact.syncedLyrics||exact.instrumental))return mapped(exact,durationSeconds);
  const search=new URL('https://lrclib.net/api/search');search.searchParams.set('track_name',title);search.searchParams.set('artist_name',artist);
  let rows;
  try { rows=await read(search); }
  catch (error) {
    if(exact&&rankLyrics(exact,title,artist,durationSeconds)>=0)return mapped(exact,durationSeconds);
    throw error;
  }
  let candidates=[...(exact?[exact]:[]),...(Array.isArray(rows)?rows:[])];
  const best=()=>candidates.map(value=>({value,score:rankLyrics(value,title,artist,durationSeconds)})).filter(v=>v.score>=0).sort((a,b)=>b.score-a.score)[0]?.value;
  if(!best()){
    search.search='';search.searchParams.set('q',`${title} ${artist}`);rows=await read(search);
    candidates=[...candidates,...(Array.isArray(rows)?rows:[])];
  }
  const chosen=best();return chosen?mapped(chosen,durationSeconds):null;
}
