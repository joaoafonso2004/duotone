import {
  A_CADA,
  deveSugerir,
  escolherSugestao,
  modoDeShuffle,
  posicaoDaSugestao,
  proximoModo,
  rotuloDoModo,
  type ModoDeShuffle,
} from '../src/lib/smartShuffle.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};
const eq = (rotulo: string, veio: unknown, esperado: unknown) =>
  check(rotulo, veio === esperado, veio === esperado ? '' : `esperado "${esperado}", veio "${veio}"`);

console.log('\no ciclo do botao');
eq('off vai para normal', proximoModo('off'), 'normal');
eq('normal vai para inteligente', proximoModo('normal'), 'inteligente');
eq('inteligente volta a off', proximoModo('inteligente'), 'off');
// Tres carregadelas voltam ao principio: o botao tem de ser um ciclo fechado,
// senao nao se consegue desligar sem ir as definicoes.
eq('tres carregadelas voltam ao inicio',
  proximoModo(proximoModo(proximoModo('off'))), 'off');

console.log('\no modo a partir do estado guardado');
eq('desligado', modoDeShuffle(false, false), 'off');
// O "inteligente" so existe COM shuffle ligado. Guardado sozinho nao vale.
eq('inteligente sem shuffle nao conta', modoDeShuffle(false, true), 'off');
eq('ligado e normal', modoDeShuffle(true, false), 'normal');
eq('ligado e inteligente', modoDeShuffle(true, true), 'inteligente');

console.log('\nquando e que entra uma sugestao');
check('nunca com o shuffle desligado', !deveSugerir('off', 99));
check('nunca com o shuffle normal', !deveSugerir('normal', 99));
check('nao na primeira faixa', !deveSugerir('inteligente', 0));
check('nem a meio do intervalo', !deveSugerir('inteligente', A_CADA - 1));
check('sim ao fim do intervalo', deveSugerir('inteligente', A_CADA));
check('e continua a valer se passar', deveSugerir('inteligente', A_CADA + 3));
// Um intervalo invalido nao pode fazer sugerir a toda a hora.
check('intervalo zero nao rebenta', !deveSugerir('inteligente', 5, 0));
check('intervalo negativo tambem nao', !deveSugerir('inteligente', 5, -2));
// A frequencia importa: uma em cada duas deixa de ser a playlist do
// utilizador, uma em cada dez nao se nota.
check('o intervalo esta entre 3 e 6', A_CADA >= 3 && A_CADA <= 6, String(A_CADA));

console.log('\nonde entra');
eq('logo a seguir a atual', posicaoDaSugestao(10, 3), 4);
eq('no inicio da fila', posicaoDaSugestao(10, 0), 1);
// Nao pode cair fora da fila: um indice a mais dava um buraco.
eq('no fim da fila entra depois da ultima', posicaoDaSugestao(3, 2), 3);
eq('um indice alem do fim e preso', posicaoDaSugestao(3, 99), 3);
eq('um indice negativo e preso', posicaoDaSugestao(3, -5), 1);
eq('fila vazia nao rebenta', posicaoDaSugestao(0, 0), 0);

console.log('\nescolher a sugestao');
const chave = (t: { k: string }) => t.k;
const candidatas = [{ k: 'a' }, { k: 'b' }, { k: 'c' }];
eq('a primeira que serve',
  escolherSugestao(candidatas, chave, new Set(), new Set())?.k, 'a');
// Sugerir algo que ja esta na fila nao e sugerir nada.
eq('salta as que ja estao na fila',
  escolherSugestao(candidatas, chave, new Set(['a']), new Set())?.k, 'b');
// E repetir uma sugestao e pior do que nao sugerir.
eq('salta as ja sugeridas',
  escolherSugestao(candidatas, chave, new Set(), new Set(['a', 'b']))?.k, 'c');
eq('sem nada que sirva devolve null',
  escolherSugestao(candidatas, chave, new Set(['a', 'b', 'c']), new Set()), null);
eq('sem candidatas devolve null', escolherSugestao([], chave, new Set(), new Set()), null);
eq('uma chave vazia e ignorada',
  escolherSugestao([{ k: '' }, { k: 'b' }], chave, new Set(), new Set())?.k, 'b');

console.log('\nos rotulos');
const modos: ModoDeShuffle[] = ['off', 'normal', 'inteligente'];
check('cada modo tem rotulo proprio',
  new Set(modos.map(rotuloDoModo)).size === modos.length);
check('nenhum rotulo e um identificador',
  modos.every((m) => !/^[a-z]+$/.test(rotuloDoModo(m))),
  modos.map(rotuloDoModo).join(' | '));

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
