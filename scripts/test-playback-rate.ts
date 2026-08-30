import {
  arredondar,
  daFraccao,
  daPreferenciaAntiga,
  eNormal,
  formatar,
  paraFraccao,
  passo,
  PASSO_FINO,
  PASSO_GROSSO,
  PASSO_LARGO,
  RATE_MAXIMO,
  RATE_MINIMO,
} from '../src/lib/playbackRate.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

console.log('\no intervalo');
check('comeca em 0.5', RATE_MINIMO === 0.5);
check('acaba em 2', RATE_MAXIMO === 2);
check('o arrasto anda 0.05', PASSO_GROSSO === 0.05);
check('o teclado anda 0.01', PASSO_FINO === 0.01);
check('shift anda 0.1', PASSO_LARGO === 0.1);

console.log('\narredondar');
check('um valor exato fica igual', arredondar(1.37) === 1.37);
check('arredonda a centesima', arredondar(1.374) === 1.37 && arredondar(1.376) === 1.38);
check('abaixo do minimo prende em 0.5', arredondar(0.1) === 0.5);
check('acima do maximo prende em 2', arredondar(9) === 2);
check('NaN volta ao normal', arredondar(NaN) === 1);
check('Infinity tambem', arredondar(Infinity) === 1);
// O que estava guardado de antes: a barra ia a 0.25, agora nao vai.
check('um valor antigo abaixo de 0.5 sobe para o minimo', arredondar(0.25) === 0.5);
check('com o passo grosso, 1.37 cai em 1.35', arredondar(1.37, PASSO_GROSSO) === 1.35);
check('com o passo grosso, 1.38 sobe para 1.4', arredondar(1.38, PASSO_GROSSO) === 1.4);
// Os degraus grossos contam a partir do MINIMO, senao 0.5 nao seria um deles.
check('o minimo e um degrau grosso', arredondar(0.5, PASSO_GROSSO) === 0.5);
check('0.55 e um degrau grosso', arredondar(0.55, PASSO_GROSSO) === 0.55);

console.log('\nsem lixo de virgula flutuante');
// 0.5 + 0.01*3 em ponto flutuante da 0.53000000000000005, e isso aparecia no
// ecra. Toda a matematica anda em centesimos inteiros por causa disto.
const todos: number[] = [];
for (let c = 50; c <= 200; c++) todos.push(arredondar(c / 100));
check('os 151 valores sao centesimas exatas',
  todos.every((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9));
check('nenhum passa dos limites', todos.every((v) => v >= 0.5 && v <= 2));
check('somar de 0.01 em 0.01 do minimo ao maximo nao acumula erro', (() => {
  let v = RATE_MINIMO;
  for (let i = 0; i < 150; i++) v = passo(v, 1, PASSO_FINO);
  return v === 2;
})());

console.log('\na barra');
check('o minimo esta na ponta esquerda', paraFraccao(0.5) === 0);
check('o maximo esta na ponta direita', paraFraccao(2) === 1);
check('o meio da barra da 1.25', daFraccao(0.5) === 1.25);
check('fraccao 0 da o minimo', daFraccao(0) === 0.5);
check('fraccao 1 da o maximo', daFraccao(1) === 2);
check('fora dos limites nao rebenta', daFraccao(-3) === 0.5 && daFraccao(4) === 2);
check('NaN na fraccao nao rebenta', daFraccao(NaN) === 0.5);
// A escala e LINEAR: 1.25 esta a meio de 0.5 e 2, e tem de estar a meio da
// barra. A antiga nao era, porque o primeiro degrau era irregular.
check('a escala e linear', Math.abs(paraFraccao(1.25) - 0.5) < 1e-9);
check('o 1x fica a um terco', Math.abs(paraFraccao(1) - 1 / 3) < 1e-9);
// O arrasto so produz multiplos de 0.05 — e o que se acerta com o rato.
check('arrastar so da degraus de 0.05', (() => {
  for (let i = 0; i <= 200; i++) {
    const v = daFraccao(i / 200);
    if (Math.round((v - 0.5) * 100) % 5 !== 0) return false;
  }
  return true;
})());
check('ida e volta pela barra nao perde um degrau grosso', (() => {
  for (let c = 50; c <= 200; c += 5) {
    const v = c / 100;
    if (daFraccao(paraFraccao(v)) !== v) return false;
  }
  return true;
})());

console.log('\nas setas do teclado');
check('sobe 0.01', passo(1, 1, PASSO_FINO) === 1.01);
check('desce 0.01', passo(1, -1, PASSO_FINO) === 0.99);
check('shift sobe 0.1', passo(1, 1, PASSO_LARGO) === 1.1);
check('por omissao anda o passo do arrasto', passo(1, 1) === 1.05);
check('no minimo, descer nao passa disso', passo(0.5, -1, PASSO_FINO) === 0.5);
check('no maximo, subir nao passa disso', passo(2, 1, PASSO_FINO) === 2);
// Vindo de um valor fino, o passo largo tem de sair de um degrau largo e nao
// deixar o valor preso entre dois.
check('do 1.03 com shift vai para 1.1', passo(1.03, 1, PASSO_LARGO) === 1.1);

console.log('\ncomo se escreve');
check('o normal e so 1x', formatar(1) === '1×');
check('o minimo e 0.5x', formatar(0.5) === '0.5×');
check('2 nao leva casa decimal', formatar(2) === '2×');
check('1.5 nao leva o zero a mais', formatar(1.5) === '1.5×');
check('1.05 mostra as duas casas', formatar(1.05) === '1.05×');
check('0.87 mostra as duas casas', formatar(0.87) === '0.87×');
check('1.1 mostra so uma casa', formatar(1.1) === '1.1×');
check('nunca sai um zero pendurado',
  todos.every((v) => !/\.\d*0×$/.test(formatar(v))),
  todos.filter((v) => /\.\d*0×$/.test(formatar(v))).map(formatar).join(','));
check('eNormal so no 1', eNormal(1) === true && eNormal(1.01) === false);

console.log('\nmigrar os tres presets antigos');
check('slowed vira 0.8 — continua lento', daPreferenciaAntiga('slowed') === 0.8);
check('fast vira 1.4', daPreferenciaAntiga('fast') === 1.4);
check('normal fica 1', daPreferenciaAntiga('normal') === 1);
check('sem preferencia guardada fica 1', daPreferenciaAntiga(null) === 1);
check('lixo na preferencia fica 1', daPreferenciaAntiga('seja o que for') === 1);
check('tudo o que migra cai dentro do intervalo novo',
  ['slowed', 'fast', 'normal', null].every((p) => {
    const v = daPreferenciaAntiga(p);
    return v >= RATE_MINIMO && v <= RATE_MAXIMO && arredondar(v) === v;
  }));

console.log(bad === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${bad} caso(s) a falhar.\n`);
process.exit(bad === 0 ? 0 : 1);
