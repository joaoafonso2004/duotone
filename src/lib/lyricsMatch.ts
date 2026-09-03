import {displayArtist,limparPrefixoDeUpload,artistaPrincipal} from './artistName';
import type {Track} from '../types';
export const lyricKey=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function cleanTrackTitle(title:string){return limparPrefixoDeUpload(title)
  .replace(/\s*[([][^)\]]*(?:official|video|audio|lyrics?|visuali[sz]er|hq|hd|4k|slowed|sped up|nightcore|reverb)[^)\]]*[)\]]/gi,'')
  .replace(/\s*[([](?:feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]/gi,'').replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i,'')
  .replace(/\s*[|]\s*.*$/,'').replace(/\s+-\s+(?:official|lyrics?|audio|video).*$/i,'').trim();}
export function cleanArtistName(artist:string){return artist.replace(/\s*-\s*Topic$/i,'').replace(/VEVO$/i,'').replace(/\s+(?:feat\.?|ft\.?).*$/i,'').trim();}
export function lyricsIdentity(track:Pick<Track,'title'|'artist'|'source'>){
  const artist=cleanArtistName(displayArtist(track)),raw=cleanTrackTitle(track.title);
  const parts=raw.split(/\s+[-–—]\s+/);
  let title=raw;
  if(parts.length>1){
    if(lyricKey(artistaPrincipal(parts[0]))===lyricKey(artist))title=parts.slice(1).join(' - ');
    else if(lyricKey(parts.at(-1)!)===lyricKey(artist))title=parts.slice(0,-1).join(' - ');
  }
  return {title:cleanTrackTitle(title),artist};
}
function similarity(a:string,b:string){
  const x=lyricKey(a),y=lyricKey(b);if(x===y)return 1;
  const xa=new Set(x.split(' ')),ya=new Set(y.split(' '));
  const n=[...xa].filter(w=>ya.has(w)).length;return 2*n/(xa.size+ya.size);
}
export type LyricCandidate={trackName:string;artistName:string;duration?:number;syncedLyrics?:string;plainLyrics?:string;instrumental?:boolean};
export function rankLyrics(candidate:LyricCandidate,title:string,artist:string,duration?:number):number {
  const t=similarity(cleanTrackTitle(candidate.trackName),title),a=similarity(cleanArtistName(candidate.artistName),artist);
  if(t<0.8||a<0.65||!lyricKey(artist))return -1;
  for(const version of ['live','remix','acoustic','instrumental'])if(new RegExp(`\\b${version}\\b`,'i').test(title)!==new RegExp(`\\b${version}\\b`,'i').test(candidate.trackName))return -1;
  if(!candidate.syncedLyrics&&!candidate.plainLyrics&&!candidate.instrumental)return -1;
  const difference=duration&&candidate.duration?Math.abs(duration-candidate.duration):0;
  return t*100+a*50+(candidate.syncedLyrics?12:0)-Math.min(35,difference/2);
}
