import { passoLinear, primeiraTocavelAoRestaurar, saltarAteTocavel } from '../src/lib/filaSemRede.ts';

let mau = 0;
const eq = (rotulo: string, veio: unknown, esperado: unknown) => {
  const ok = JSON.stringify(veio) === JSON.stringify(esperado);
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${ok ? '' : `  -> esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`}`);
};

// Uma fila de letras; as maiúsculas estão no telemóvel.
const fila = ['a', 'B', 'c', 'd', 'E', 'f'];
const emDisco = (f: string) => f === f.toUpperCase();
const tudo = () => true;

console.log('\npara a frente');
eq('com rede não muda nada: é a seguinte', saltarAteTocavel(fila, 0, passoLinear(6, 1, false), tudo), 1);
eq('sem rede salta até à primeira em disco', saltarAteTocavel(fila, 1, passoLinear(6, 1, false), emDisco), 4);
eq('sem nenhuma à frente, e sem repeat, acaba', saltarAteTocavel(fila, 4, passoLinear(6, 1, false), emDisco), null);
eq('com repeat dá a volta', saltarAteTocavel(fila, 4, passoLinear(6, 1, true), emDisco), 1);
eq('com repeat e só a atual em disco, repete-a', saltarAteTocavel(['a', 'B', 'c'], 1, passoLinear(3, 1, true), emDisco), 1);
eq('nenhuma em disco, com repeat: acaba, não fica em ciclo', saltarAteTocavel(['a', 'b', 'c'], 0, passoLinear(3, 1, true), emDisco), null);

console.log('\npara trás');
eq('salta para trás até uma em disco', saltarAteTocavel(fila, 4, passoLinear(6, -1, false), emDisco), 1);
eq('no início, sem repeat, não há anterior', saltarAteTocavel(fila, 1, passoLinear(6, -1, false), emDisco), null);
eq('com repeat, volta pelo fim', saltarAteTocavel(fila, 1, passoLinear(6, -1, true), emDisco), 4);

console.log('\ncom um percurso de shuffle');
// O percurso toca 5, 2, 0, 4, 1, 3 (índices); o passo é o do percurso.
const percurso = [5, 2, 0, 4, 1, 3];
const passoDoPercurso = (i: number) => { const p = percurso.indexOf(i); return p >= 0 && p + 1 < percurso.length ? percurso[p + 1] : null; };
eq('segue o percurso e salta as que não estão em disco', saltarAteTocavel(fila, 5, passoDoPercurso, emDisco), 4);
eq('no fim do percurso, null (quem chama decide se baralha)', saltarAteTocavel(fila, 1, passoDoPercurso, emDisco), null);
eq('um passo que devolve lixo não rebenta', saltarAteTocavel(fila, 0, () => 99, emDisco), null);

console.log('\nao restaurar');
eq('a atual está em disco: fica', primeiraTocavelAoRestaurar(fila, 1, emDisco), null);
eq('a atual não está: a seguinte em disco', primeiraTocavelAoRestaurar(fila, 2, emDisco), 4);
eq('depois do fim, dá a volta', primeiraTocavelAoRestaurar(fila, 5, emDisco), 1);
eq('nenhuma em disco: fica como estava', primeiraTocavelAoRestaurar(['a', 'b'], 0, emDisco), null);
eq('índice fora da fila conta como o início', primeiraTocavelAoRestaurar(fila, 42, emDisco), 1);
eq('fila vazia', primeiraTocavelAoRestaurar([], 0, emDisco), null);

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
