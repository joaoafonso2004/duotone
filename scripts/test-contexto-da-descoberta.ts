import {
  contextoDaPrateleira, contextoParaAnalytics, espacadasPorArtista,
  misturarPorFamiliaridade,
} from '../src/lib/contextoDaDescoberta.ts';

let falhas=0;
const check=(nome:string,ok:boolean,detalhe='')=>{
  if(!ok)falhas++;
  console.log(`  ${ok?'ok   ':'FALHA'} ${nome}${detalhe?` -> ${detalhe}`:''}`);
};
const eq=(nome:string,veio:unknown,esperado:unknown)=>check(nome,veio===esperado,veio===esperado?'':`${String(veio)} != ${String(esperado)}`);

const conhecidas=Array.from({length:30},(_,i)=>`k${i}`);
const novas=Array.from({length:30},(_,i)=>`n${i}`);
const primeiros=(tipo:'mix'|'radio'|'flow',n:number)=>
  misturarPorFamiliaridade(conhecidas,novas,n,tipo).map((x)=>x[0]).join('');

// As proporções do antigo Balanced, que ficaram quando o seletor saiu.
console.log('\nproporções');
eq('a mistura alterna familiar e nova',primeiros('mix',4),'knkn');
eq('o Flow ancora em duas tuas por cada nova',primeiros('flow',6),'kknkkn');
eq('o rádio dá três novas por cada tua',primeiros('radio',8),'nnnknnnk');

console.log('\ndegradação sem buracos');
const escassas=misturarPorFamiliaridade(['a'],['b','c','d'],10,'mix');
eq('não perde música quando um lado acaba',escassas.length,4);
check('não duplica ao tentar cumprir a proporção',new Set(escassas).size===escassas.length);

console.log('\ndiversidade por artista');
const entrada=['A','A','B','C','D','E','F','G','H'];
const espacadas=espacadasPorArtista(entrada,(x)=>x,7);
const posicoes=espacadas.map((x,i)=>x==='A'?i:-1).filter((i)=>i>=0);
check('deixa sete faixas entre repetições quando há diversidade',posicoes.every((p,i)=>i===0||p-posicoes[i-1]>=8),espacadas.join(''));
eq('fallback não apaga uma lista impossível',espacadasPorArtista(['A','A','A'],(x)=>x,7).join(''),'AAA');

console.log('\nprivacidade da medição');
const dados=contextoParaAnalytics(contextoDaPrateleira('descobrir'));
eq('leva apenas os dois códigos de produto',Object.keys(dados).sort().join(','),'motivo,superficie');
check('não leva título, pesquisa, faixa ou pessoa',!/(track|title|query|user|friend|artist)/i.test(JSON.stringify(dados)));

console.log(falhas===0?'\n  Todos os casos passaram.\n':`\n  ${falhas} caso(s) a falhar.\n`);
process.exitCode=falhas===0?0:1;
