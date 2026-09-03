export interface LyricLine {timeMs:number;text:string}
/** LRC: várias marcas por linha, centésimos/milésimos e offset global. */
export function parseLrc(lrc:string):LyricLine[]{
  const result:LyricLine[]=[];
  const offset=Number(lrc.match(/\[offset:([+-]?\d+)\]/i)?.[1]??0);
  for(const line of lrc.split(/\r?\n/)){
    const tags=[...line.matchAll(/\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const text=line.replace(/\[[^\]]*\]/g,'').trim();
    for(const tag of tags){
      if(Number(tag[2])>=60)continue;
      result.push({timeMs:Math.max(0,Number(tag[1])*60000+Number(tag[2])*1000+Number((tag[3]??'0').padEnd(3,'0'))+offset),text});
    }
  }
  return result.sort((a,b)=>a.timeMs-b.timeMs).slice(0,1500);
}
export function activeLyricIndex(lines:LyricLine[],positionMs:number):number {
  let low=0,high=lines.length-1,result=-1;
  while(low<=high){const mid=(low+high)>>1;if(lines[mid].timeMs<=positionMs){result=mid;low=mid+1;}else high=mid-1;}
  return result;
}
