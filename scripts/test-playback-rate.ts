import {
  arredondar,
  daFraccao,
  daPreferenciaAntiga,
  eNormal,
  formatar,
  paraFraccao,
  passo,
  PASSOS,
  RATE_MAXIMO,
  RATE_MINIMO,
} from '../src/lib/playbackRate.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

console.log('\nos degraus');
check('comeca em 0.25 — o minimo real do motor', RATE_MINIMO === 0.25);
check('acaba em 2', RATE_MAXIMO === 2);
check('sao 19 degraus', PASSOS.length === 19, String(PASSOS.length));
// O 0.2 que foi pedido nao existe: o IFrame prende em 0.25, e um degrau que o
// motor ignora era o controlo a mentir.
check('NAO ha degrau abaixo de 0.25', !PASSOS.some((p) => p < 0.25));
check('de 0.3 para cima vai de 0.1 em 0.1',
  PASSOS.slice(1).every((p, i) => Math.abs(p - (0.3 + i / 10)) < 1e-9));
check('nao ha valores com lixo de virgula flutuante',
  PASSOS.every((p) => Math.abs(p * 100 - Math.round(p * 100)) < 1e-9), PASSOS.join(','));

console.log('\narredondar');
check('um degrau exato fica igual', arredondar(1.4) === 1.4);
check('1.42 cai em 1.4', arredondar(1.42) === 1.4);
check('1.47 sobe para 1.5', arredondar(1.47) === 1.5);
// 0.85 esta exatamente a meio de 0.8 e 0.9. O desempate documentado fica com o
// degrau MAIS BAIXO, que e o que o utilizador ve a esquerda do dedo.
check('empate fica no degrau mais baixo', arredondar(0.85) === 0.8);
check('abaixo do minimo prende em 0.25', arredondar(0.05) === 0.25);
check('0.2 — o que foi pedido — prende em 0.25', arredondar(0.2) === 0.25);
check('acima do maximo prende em 2', arredondar(9) === 2);
check('NaN nao rebenta, volta ao normal', arredondar(NaN) === 1);
check('Infinity tambem nao', arredondar(Infinity) === 1);

console.log('\na barra');
check('o minimo esta na ponta esquerda', paraFraccao(0.25) === 0);
check('o maximo esta na ponta direita', paraFraccao(2) === 1);
check('o meio da barra da um degrau do meio', daFraccao(0.5) === PASSOS[9]);
check('fraccao 0 da o minimo', daFraccao(0) === 0.25);
check('fraccao 1 da o maximo', daFraccao(1) === 2);
check('fora dos limites nao rebenta', daFraccao(-3) === 0.25 && daFraccao(4) === 2);
check('NaN na fraccao nao rebenta', daFraccao(NaN) === 0.25);
// O 0.25 e o 0.3 estao colados em VALOR mas tem de ter o mesmo espaco na
// barra que os outros — senao o primeiro degrau era impossivel de agarrar.
const larguras = PASSOS.map((p, i) => (i === 0 ? 0 : paraFraccao(p) - paraFraccao(PASSOS[i - 1])));
check('todos os degraus ocupam o mesmo espaco na barra',
  larguras.slice(1).every((w) => Math.abs(w - larguras[1]) < 1e-9));
check('ida e volta pela barra nao perde o valor',
  PASSOS.every((p) => daFraccao(paraFraccao(p)) === p));

console.log('\nsetas do teclado');
check('sobe um degrau', passo(1, 1) === 1.1);
check('desce um degrau', passo(1, -1) === 0.9);
check('do 0.3 para baixo vai ao 0.25', passo(0.3, -1) === 0.25);
check('no minimo, descer nao passa disso', passo(0.25, -1) === 0.25);
check('no maximo, subir nao passa disso', passo(2, 1) === 2);

console.log('\ncomo se escreve');
check('o normal e so 1x', formatar(1) === '1×');
check('o minimo mostra as centesimas', formatar(0.25) === '0.25×');
check('1.4 mostra-se inteiro', formatar(1.4) === '1.4×');
check('2 nao leva casa decimal', formatar(2) === '2×');
check('eNormal so no 1', eNormal(1) === true && eNormal(1.1) === false);

console.log('\nmigrar os tres presets antigos');
// Quem tinha "Slowed" nao pode abrir a app e encontra-la a 1x.
// Nao vem de arredondar: uma migracao nao se decide num empate.
check('slowed vira 0.8 — continua lento', daPreferenciaAntiga('slowed') === 0.8);
check('fast vira 1.4', daPreferenciaAntiga('fast') === 1.4);
check('normal fica 1', daPreferenciaAntiga('normal') === 1);
check('sem preferencia guardada fica 1', daPreferenciaAntiga(null) === 1);
check('lixo na preferencia fica 1', daPreferenciaAntiga('seja o que for') === 1);
// Todos os valores migrados tem de ser degraus validos, senao a barra
// aparecia entre duas marcas.
check('tudo o que migra e um degrau',
  ['slowed', 'fast', 'normal', null].every((p) => PASSOS.includes(daPreferenciaAntiga(p))));

console.log(bad === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${bad} caso(s) a falhar.\n`);
process.exit(bad === 0 ? 0 : 1);
