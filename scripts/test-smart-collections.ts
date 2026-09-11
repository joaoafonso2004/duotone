import assert from 'node:assert/strict';
import {
  activeSmartFilterCount, applySmartCollectionFilters, EMPTY_SMART_FILTERS,
  SMART_COLLECTION_TEMPLATES, smartCollectionTemplates, type SmartCollectionFilters,
} from '../src/lib/smartCollections.ts';
import type { PlayCountEntry } from '../src/lib/playCounts.ts';
import type { Track } from '../src/types.ts';

const DAY=24*60*60*1000;
const now=Date.UTC(2026,8,11,12);
const track=(sourceId:string,daysAgo:number,durationSeconds:number|null,artist:string):Track=>({
  id:`db-${sourceId}`,source:'youtube',sourceId,title:`Song ${sourceId}`,artist,album:null,
  artworkUrl:null,durationSeconds,addedAt:new Date(now-daysAgo*DAY).toISOString(),
});
const entry=(sourceId:string,count:number,lastDaysAgo:number):PlayCountEntry=>({
  source:'youtube',sourceId,title:`Song ${sourceId}`,artist:null,artworkUrl:null,durationSeconds:null,
  count,lastPlayed:now-lastDaysAgo*DAY,
});

const tracks=[
  track('new',2,170,'Beyoncé'),
  track('forgotten',200,240,'Massive Attack'),
  track('rotation',50,320,'Björk'),
  track('download',10,null,'João Gilberto'),
  {...track('unknown-date',1,181,'Rosalía'),addedAt:'not-a-date'},
];
const history=[entry('forgotten',2,90),entry('rotation',8,1),entry('download',1,3)];
const run=(filters:Partial<SmartCollectionFilters>,downloaded:string[]=[])=>(
  applySmartCollectionFilters(tracks,history,{...EMPTY_SMART_FILTERS,...filters},{now,isDownloaded:t=>downloaded.includes(t.sourceId)})
);
const ids=(value:Track[])=>value.map(t=>t.sourceId);

assert.equal(SMART_COLLECTION_TEMPLATES.length,5,'há cinco atalhos úteis');
assert.deepEqual(ids(run({saved:'7d'})),['new'],'datas inválidas não entram em filtros de data');
assert.deepEqual(ids(run({saved:'30d'})),['new','download']);
assert.deepEqual(ids(run({saved:'older'})),['rotation','forgotten'],'mais antigas ordenam por data recente primeiro');
assert.deepEqual(ids(run({listening:'never'})),['new','unknown-date']);
assert.deepEqual(ids(run({listening:'forgotten'})),['forgotten']);
assert.deepEqual(ids(run({listening:'frequent'})),['rotation']);
assert.deepEqual(ids(run({duration:'short'})),['new']);
assert.deepEqual(ids(run({duration:'medium'})),['forgotten','unknown-date']);
assert.deepEqual(ids(run({duration:'long'})),['rotation']);
assert.deepEqual(ids(run({downloadedOnly:true},['download','rotation'])),['rotation','download']);
assert.deepEqual(ids(run({artist:'beyonce'})),['new'],'a pesquisa ignora acentos');
assert.deepEqual(ids(run({saved:'30d',listening:'never',duration:'short',artist:'bey'})),['new'],'os filtros combinam por interseção');
assert.deepEqual(ids(tracks),['new','forgotten','rotation','download','unknown-date'],'o motor não altera a biblioteca');
assert.equal(activeSmartFilterCount({...EMPTY_SMART_FILTERS,saved:'7d',downloadedOnly:true,artist:'Björk'}),3);

// O artista como a lista o mostra. Uma faixa cujo `artist` é o canal tem de
// aparecer quando se procura pelo nome que se vê.
{
  const doCanal={...track('canal',5,200,'LusiEntertainment'),title:'Juice WRLD - Lucid Dreams'};
  const mostrado=(t:Track)=>t.sourceId==='canal'?'Juice WRLD':t.artist??'';
  const porNome=(q:string,artistOf?:(t:Track)=>string)=>ids(applySmartCollectionFilters([doCanal],[],{...EMPTY_SMART_FILTERS,artist:q},{now,artistOf}));
  assert.deepEqual(porNome('juice',mostrado),['canal'],'procura pelo artista mostrado, não só pelo canal');
  assert.deepEqual(porNome('lusi',mostrado),['canal'],'o canal continua a servir');
  assert.deepEqual(porNome('juice'),[],'sem artistOf fica só o canal, como antes');
}

// No PC não há downloads: os atalhos que dependem deles não aparecem.
assert.equal(smartCollectionTemplates(true).length,SMART_COLLECTION_TEMPLATES.length);
assert.ok(!smartCollectionTemplates(false).some(t=>t.filters.downloadedOnly),'sem downloads, nenhum atalho de downloads');
assert.equal(smartCollectionTemplates(false).length,SMART_COLLECTION_TEMPLATES.length-1);

for(const template of SMART_COLLECTION_TEMPLATES){
  assert.ok(activeSmartFilterCount(template.filters)>0,`${template.name} tem pelo menos uma regra`);
  assert.ok(template.name&&template.description,`${template.id} explica o resultado`);
}

console.log('Smart Collections: cinco filtros, templates, ordenação e modo offline passaram.');
