import type { PlayCountEntry } from './playCounts';
import type { Track } from '../types';

export type SavedRule = 'any' | '7d' | '30d' | 'older';
export type ListeningRule = 'any' | 'never' | 'forgotten' | 'frequent';
export type DurationRule = 'any' | 'short' | 'medium' | 'long';

export interface SmartCollectionFilters {
  saved: SavedRule;
  listening: ListeningRule;
  duration: DurationRule;
  downloadedOnly: boolean;
  artist: string;
}

export interface SmartCollectionTemplate {
  id: 'new-unplayed' | 'forgotten' | 'quick' | 'offline' | 'rotation';
  name: string;
  description: string;
  icon: 'sparkles-outline' | 'time-outline' | 'flash-outline' | 'cloud-done-outline' | 'repeat-outline';
  filters: SmartCollectionFilters;
}

export const EMPTY_SMART_FILTERS: SmartCollectionFilters = {
  saved: 'any', listening: 'any', duration: 'any', downloadedOnly: false, artist: '',
};

export const SMART_COLLECTION_TEMPLATES: SmartCollectionTemplate[] = [
  { id:'new-unplayed',name:'New & unplayed',description:'Saved in the last 30 days and never played',icon:'sparkles-outline',filters:{...EMPTY_SMART_FILTERS,saved:'30d',listening:'never'} },
  { id:'forgotten',name:'Forgotten favourites',description:'Songs you played before, but not for 60 days',icon:'time-outline',filters:{...EMPTY_SMART_FILTERS,listening:'forgotten'} },
  { id:'quick',name:'Quick listens',description:'Songs up to three minutes',icon:'flash-outline',filters:{...EMPTY_SMART_FILTERS,duration:'short'} },
  { id:'offline',name:'Offline ready',description:'Liked songs downloaded on this device',icon:'cloud-done-outline',filters:{...EMPTY_SMART_FILTERS,downloadedOnly:true} },
  { id:'rotation',name:'Heavy rotation',description:'Songs played at least five times',icon:'repeat-outline',filters:{...EMPTY_SMART_FILTERS,listening:'frequent'} },
];

const DAY = 24 * 60 * 60 * 1000;
const keyOf=(track:Pick<Track,'source'|'sourceId'>)=>`${track.source}:${track.sourceId}`;
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();

function addedTime(track:Track):number|null {
  if(!track.addedAt)return null;
  const value=Date.parse(track.addedAt);
  return Number.isFinite(value)?value:null;
}

/**
 * Os atalhos que fazem sentido NESTE aparelho.
 *
 * No PC não há downloads -- o player é o IFrame oficial do YouTube --, e um
 * "Offline ready" que dá sempre zero é uma opção sem efeito, que é pior do que
 * não existir. Quem não tem downloads não vê os atalhos que dependem deles.
 */
export function smartCollectionTemplates(temDownloads:boolean):SmartCollectionTemplate[] {
  return temDownloads ? SMART_COLLECTION_TEMPLATES : SMART_COLLECTION_TEMPLATES.filter(t=>!t.filters.downloadedOnly);
}

export function activeSmartFilterCount(filters:SmartCollectionFilters):number {
  return Number(filters.saved!=='any')+Number(filters.listening!=='any')+Number(filters.duration!=='any')
    +Number(filters.downloadedOnly)+Number(!!filters.artist.trim());
}

/**
 * Motor local das Smart Collections. Não altera a biblioteca original e não
 * depende da rede: combina as cinco regras como uma interseção previsível.
 */
export function applySmartCollectionFilters(
  tracks:Track[],
  history:PlayCountEntry[],
  filters:SmartCollectionFilters,
  options:{
    now?:number;
    isDownloaded?:(track:Track)=>boolean;
    /**
     * O artista como a app o MOSTRA (`displayArtist`). O `track.artist` de uma
     * faixa do YouTube é muitas vezes o canal, e procurar pelo nome que se vê
     * na lista tem de encontrar essa faixa. Entra por parâmetro para isto
     * continuar a correr em Node puro.
     */
    artistOf?:(track:Track)=>string;
  }={},
):Track[]{
  const now=options.now??Date.now();
  const played=new Map(history.map(entry=>[keyOf(entry),entry]));
  const artist=normalize(filters.artist);

  const result=tracks.filter(track=>{
    const added=addedTime(track);
    if(filters.saved==='7d'&&(added===null||added<now-7*DAY))return false;
    if(filters.saved==='30d'&&(added===null||added<now-30*DAY))return false;
    if(filters.saved==='older'&&(added===null||added>=now-30*DAY))return false;

    const entry=played.get(keyOf(track));
    if(filters.listening==='never'&&(entry?.count??0)>0)return false;
    if(filters.listening==='forgotten'&&(!entry?.count||entry.lastPlayed>=now-60*DAY))return false;
    if(filters.listening==='frequent'&&(entry?.count??0)<5)return false;

    const duration=track.durationSeconds;
    if(filters.duration==='short'&&(duration===null||duration>180))return false;
    if(filters.duration==='medium'&&(duration===null||duration<=180||duration>300))return false;
    if(filters.duration==='long'&&(duration===null||duration<=300))return false;
    if(filters.downloadedOnly&&!options.isDownloaded?.(track))return false;
    if(artist&&![track.artist??'',options.artistOf?.(track)??''].some(nome=>normalize(nome).includes(artist)))return false;
    return true;
  });

  if(filters.listening==='frequent')return result.sort((a,b)=>(played.get(keyOf(b))?.count??0)-(played.get(keyOf(a))?.count??0));
  if(filters.listening==='forgotten')return result.sort((a,b)=>(played.get(keyOf(a))?.lastPlayed??0)-(played.get(keyOf(b))?.lastPlayed??0));
  if(filters.saved!=='any')return result.sort((a,b)=>(addedTime(b)??0)-(addedTime(a)??0));
  return result;
}
