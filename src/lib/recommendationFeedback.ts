/** Lógica pura: só se aplica a sugestões, nunca à biblioteca ou à fila manual. */
export type Feedback = {kind:'track'|'artist';key:string;label:string};
export function ajustarSugestoes<T>(tracks:readonly T[],prefs:readonly Feedback[],trackKey:(t:T)=>string,artistKey:(t:T)=>string):T[] {
  const blocked=new Set(prefs.filter(p=>p.kind==='track').map(p=>p.key));
  const less=new Set(prefs.filter(p=>p.kind==='artist').map(p=>p.key));
  const normal:T[]=[],reduced:T[]=[];
  // No máximo uma candidata por artista reduzido, depois das alternativas.
  // As restantes não regressam só por faltarem alternativas.
  const allowed=tracks.filter(t=>!blocked.has(trackKey(t)));
  const kept=new Map<string,number>();
  for(const t of allowed){
    const k=artistKey(t);
    if(!less.has(k)){normal.push(t);continue;}
    const n=kept.get(k)??0;
    if(n<1){reduced.push(t);kept.set(k,n+1);}
  }
  return [...normal,...reduced];
}
