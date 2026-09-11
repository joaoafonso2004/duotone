import {
  contextoDaPrateleira, contextoParaAnalytics, espacadasPorArtista,
  intervaloDoSmartShuffle, misturarPorFamiliaridade,
  type DiscoveryMode,
} from '../src/lib/discoveryControl.ts';

let falhas=0;
const check=(nome:string,ok:boolean,detalhe='')=>{
  if(!ok)falhas++;
  console.log(`  ${ok?'ok   ':'FALHA'} ${nome}${detalhe?` -> ${detalhe}`:''}`);
};
const eq=(nome:string,veio:unknown,esperado:unknown)=>check(nome,veio===esperado,veio===esperado?'':`${String(veio)} != ${String(esperado)}`);

const conhecidas=Array.from({length:30},(_,i)=>`k${i}`);
const novas=Array.from({length:30},(_,i)=>`n${i}`);
const primeiros=(modo:DiscoveryMode,tipo:'mix'|'radio'|'flow',n:number)=>
  misturarPorFamiliaridade(conhecidas,novas,n,modo,tipo).map((x)=>x[0]).join('');

console.log('\nproporções visíveis');
eq('Comfort mix ancora em música conhecida',primeiros('comfort','mix',4),'kkkn');
eq('Balanced mix alterna familiar e nova',primeiros('balanced','mix',4),'knkn');
eq('Explore mix dá três descobertas por âncora',primeiros('explore','mix',4),'nnnk');
eq('Comfort flow arrisca uma em seis',primeiros('comfort','flow',6),'kkkkkn');
eq('Explore flow põe descoberta primeiro',primeiros('explore','flow',6),'nnknnk');
eq('Balanced radio mantém 3 novas por familiar',primeiros('balanced','radio',8),'nnnknnnk');
eq('Explore radio sobe para 6 novas por familiar',primeiros('explore','radio',7),'nnnnnnk');

console.log('\ndegradação sem buracos');
const escassas=misturarPorFamiliaridade(['a'],['b','c','d'],10,'comfort','mix');
eq('não perde música quando um lado acaba',escassas.length,4);
check('não duplica ao tentar cumprir a proporção',new Set(escassas).size===escassas.length);

console.log('\nsmart shuffle');
eq('Comfort sugere a cada 6',intervaloDoSmartShuffle('comfort'),6);
eq('Balanced sugere a cada 4',intervaloDoSmartShuffle('balanced'),4);
eq('Explore sugere a cada 2',intervaloDoSmartShuffle('explore'),2);

console.log('\ndiversidade por artista');
const entrada=['A','A','B','C','D','E','F','G','H'];
const espacadas=espacadasPorArtista(entrada,(x)=>x,7);
const posicoes=espacadas.map((x,i)=>x==='A'?i:-1).filter((i)=>i>=0);
check('deixa sete faixas entre repetições quando há diversidade',posicoes.every((p,i)=>i===0||p-posicoes[i-1]>=8),espacadas.join(''));
eq('fallback não apaga uma lista impossível',espacadasPorArtista(['A','A','A'],(x)=>x,7).join(''),'AAA');

console.log('\nprivacidade da medição');
const dados=contextoParaAnalytics(contextoDaPrateleira('descobrir','balanced'));
eq('leva apenas os três códigos de produto',Object.keys(dados).sort().join(','),'modo,motivo,superficie');
check('não leva título, pesquisa, faixa ou pessoa',!/(track|title|query|user|friend|artist)/i.test(JSON.stringify(dados)));

console.log(falhas===0?'\n  Todos os casos passaram.\n':`\n  ${falhas} caso(s) a falhar.\n`);
process.exit(falhas===0?0:1);
