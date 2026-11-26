/** Uma palavra (ou um bocado) de uma linha com o tempo de cada palavra (LRC "enhanced"). */
export interface PalavraDaLetra {timeMs:number;text:string}
/**
 * Uma linha da letra. `palavras` só existe quando a fonte traz o tempo de cada
 * palavra (26/11, item 23 do plano): aí cada uma acende quando é cantada. Nas
 * outras letras não existe, e a linha é exatamente a de sempre.
 */
export interface LyricLine {timeMs:number;text:string;palavras?:PalavraDaLetra[]}

const MARCA_DA_LINHA=/\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g;
/** A marca de uma palavra no LRC "enhanced": `<mm:ss.xx>`. */
const MARCA_DA_PALAVRA=/<(\d+):(\d{2})(?:[.:](\d{1,3}))?>/g;
const emMs=(m:string,s:string,f:string|undefined)=>Number(m)*60000+Number(s)*1000+Number((f??'0').padEnd(3,'0'));

/**
 * As palavras de uma linha com marcas `<mm:ss.xx>`, ou `undefined` se não as tem (ou se
 * não fazem sentido: menos de duas, fora de ordem, ou antes da linha). O que vem antes
 * da primeira marca começa com a linha. Os espaços ficam colados à palavra de antes,
 * para o texto junto ser o da linha.
 */
export function palavrasDaLinha(texto:string,inicioDaLinha:number,offset=0):PalavraDaLetra[]|undefined{
  const marcas=[...texto.matchAll(MARCA_DA_PALAVRA)];
  if(!marcas.length)return undefined;
  const palavras:PalavraDaLetra[]=[];
  const juntar=(timeMs:number,bocado:string)=>{
    const t=bocado.replace(/\s+/g,' ');
    if(t.trim())palavras.push({timeMs,text:t});
    else if(palavras.length&&t&&!palavras[palavras.length-1].text.endsWith(' '))palavras[palavras.length-1].text+=' ';
  };
  juntar(inicioDaLinha,texto.slice(0,marcas[0].index));
  marcas.forEach((m,i)=>{
    const fim=i+1<marcas.length?marcas[i+1].index:texto.length;
    juntar(Math.max(0,emMs(m[1],m[2],m[3])+offset),texto.slice((m.index??0)+m[0].length,fim));
  });
  if(palavras.length<2)return undefined;
  // A primeira sem espaço à frente, a última sem espaço atrás: o texto junto é o da linha.
  palavras[0].text=palavras[0].text.replace(/^\s+/,'');
  palavras[palavras.length-1].text=palavras[palavras.length-1].text.replace(/\s+$/,'');
  for(let i=1;i<palavras.length;i++)if(palavras[i].timeMs<palavras[i-1].timeMs)return undefined;
  if(palavras[0].timeMs<inicioDaLinha-50)return undefined;
  return palavras;
}

/** LRC: várias marcas por linha, centésimos/milésimos e offset global. */
export function parseLrc(lrc:string):LyricLine[]{
  const result:LyricLine[]=[];
  const offset=Number(lrc.match(/\[offset:([+-]?\d+)\]/i)?.[1]??0);
  for(const line of lrc.split(/\r?\n/)){
    const tags=[...line.matchAll(MARCA_DA_LINHA)];
    const semMarcas=line.replace(/\[[^\]]*\]/g,'');
    // Só nas linhas com as marcas das palavras se mexe no texto (tiram-se; antes de
    // 26/11 apareciam na letra). As outras ficam exatamente como eram.
    const comPalavras=MARCA_DA_PALAVRA.test(semMarcas);
    MARCA_DA_PALAVRA.lastIndex=0;
    const text=comPalavras?semMarcas.replace(MARCA_DA_PALAVRA,'').replace(/\s+/g,' ').trim():semMarcas.trim();
    const validas=tags.filter(tag=>Number(tag[2])<60);
    for(const tag of validas){
      const timeMs=Math.max(0,emMs(tag[1],tag[2],tag[3])+offset);
      // Os tempos das palavras são absolutos: numa linha repetida (várias marcas) só valem para uma.
      const palavras=comPalavras&&validas.length===1?palavrasDaLinha(semMarcas,timeMs,offset):undefined;
      result.push(palavras?{timeMs,text,palavras}:{timeMs,text});
    }
  }
  return result.sort((a,b)=>a.timeMs-b.timeMs).slice(0,1500);
}
export function activeLyricIndex(lines:LyricLine[],positionMs:number):number {
  let low=0,high=lines.length-1,result=-1;
  while(low<=high){const mid=(low+high)>>1;if(lines[mid].timeMs<=positionMs){result=mid;low=mid+1;}else high=mid-1;}
  return result;
}

/** Quantas palavras já foram cantadas na posição dada (as acesas). */
export function palavrasAcesas(palavras:readonly PalavraDaLetra[],positionMs:number):number{
  let n=0;
  while(n<palavras.length&&palavras[n].timeMs<=positionMs)n++;
  return n;
}

/** Quanto falta (ms da música) até a palavra seguinte acender, ou `null` se já acenderam todas. */
export function proximaPalavraEm(palavras:readonly PalavraDaLetra[],positionMs:number):number|null{
  const n=palavrasAcesas(palavras,positionMs);
  return n<palavras.length?palavras[n].timeMs-positionMs:null;
}
