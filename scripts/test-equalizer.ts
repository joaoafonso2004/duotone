import {
  aoTocar,
  BANDAS,
  chaveDaFaixa,
  compensacaoDb,
  compensacaoLinear,
  daPersistencia,
  ePlano,
  GANHO_MAXIMO,
  guardar,
  MAX_FAIXAS,
  normalizar,
  perfilDe,
  perfilPorId,
  PERFIS,
  ganhoDeProgramaDb,
  picoDb,
  PLANO,
  podar,
  respostaDb,
  TIPOS,
  type MemoriaDeAjustes,
} from '../src/lib/equalizer.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

console.log('\nas bandas');
check('sao dez', BANDAS.length === 10);
check('vao de 32 Hz a 16 kHz', BANDAS[0] === 32 && BANDAS[9] === 16000);
check('cada uma e o dobro da anterior',
  BANDAS.slice(1).every((b, i) => Math.abs(b / BANDAS[i] - 2) < 0.01 || Math.abs(b / BANDAS[i] - 1.953) < 0.01));

console.log('\nnormalizar');
check('o plano sao dez zeros', PLANO.length === 10 && ePlano(PLANO));
check('prende no maximo', normalizar([99])[0] === GANHO_MAXIMO);
check('prende no minimo', normalizar([-99])[0] === -GANHO_MAXIMO);
check('arredonda a uma casa', normalizar([3.14159])[0] === 3.1);
check('faltas viram zero', normalizar([3])[5] === 0);
check('lixo vira zero', normalizar([NaN, Infinity, 'x' as any])[0] === 0);
check('null nao rebenta', normalizar(null).length === 10 && ePlano(normalizar(null)));
check('sobras sao ignoradas', normalizar(new Array(40).fill(2)).length === 10);

console.log('\nos perfis sao para MUSICA');
check('ha seis', PERFIS.length === 6);
check('todos tem dez bandas', PERFIS.every((p) => p.ganhos.length === 10));
check('nenhum passa dos limites',
  PERFIS.every((p) => p.ganhos.every((g) => Math.abs(g) <= GANHO_MAXIMO)));
check('o flat e mesmo plano', ePlano(perfilPorId('flat')!.ganhos));
// Subir tudo e subir o volume, nao equalizar. Cada perfil (menos o flat) tem
// de ter pelo menos uma banda em baixo.
check('nenhum perfil levanta tudo',
  PERFIS.filter((p) => p.id !== 'flat').every((p) => p.ganhos.some((g) => g < 0)),
  PERFIS.filter((p) => p.id !== 'flat' && !p.ganhos.some((g) => g < 0)).map((p) => p.id).join());
check('o bass boost pesa em baixo e nao em cima',
  perfilPorId('bass')!.ganhos[0] > 3 && perfilPorId('bass')!.ganhos[8] < 3);
check('o bright faz o contrario',
  perfilPorId('bright')!.ganhos[0] < 0 && perfilPorId('bright')!.ganhos[8] > 3);
check('nao ha FPS Competition nem coisas de jogo',
  !PERFIS.some((p) => /fps|game|jogo|competition/i.test(p.nome + p.id)));
check('ids unicos', new Set(PERFIS.map((p) => p.id)).size === PERFIS.length);
check('id desconhecido nao rebenta', perfilPorId('nao-existe') === null);

console.log('\nreconhecer o perfil a partir dos ganhos');
check('reconhece o bass boost', perfilDe(perfilPorId('bass')!.ganhos)?.id === 'bass');
check('o plano e o flat', perfilDe(PLANO)?.id === 'flat');
check('uma curva a mao nao e perfil nenhum',
  perfilDe([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) === null);

console.log('\na resposta em frequencia');
const bass = perfilPorId('bass')!.ganhos;
const perto = (a: number, b: number, tol = 0.15) => Math.abs(a - b) <= tol;
check('o plano nao mexe em nada',
  [30, 60, 200, 1000, 8000, 16000].every((f) => Math.abs(respostaDb(PLANO, f)) < 0.001));

// A curva de REFERENCIA esta fixada AQUI e nao e a de nenhum perfil, de
// proposito: os numeros abaixo sao os que o getFrequencyResponse do Chrome
// devolve para esta cascata, comparados digito a digito, e servem para provar
// que a matematica esta certa. Se estivessem presos a um perfil, afinar esse
// perfil (que e uma decisao de gosto) partia a verificacao da matematica, que
// nao tem nada a ver. Aconteceu uma vez.
const CURVA_MEDIDA_NO_CHROME = [6, 5, 3.5, 1, -1, -1.5, -0.5, 0, 0.5, 1];
check('+7,9 dB a 40 Hz', perto(respostaDb(CURVA_MEDIDA_NO_CHROME, 40), 7.9),
  respostaDb(CURVA_MEDIDA_NO_CHROME, 40).toFixed(2));
check('+8,1 dB a 60 Hz', perto(respostaDb(CURVA_MEDIDA_NO_CHROME, 60), 8.1),
  respostaDb(CURVA_MEDIDA_NO_CHROME, 60).toFixed(2));
check('+6,4 dB a 100 Hz', perto(respostaDb(CURVA_MEDIDA_NO_CHROME, 100), 6.4),
  respostaDb(CURVA_MEDIDA_NO_CHROME, 100).toFixed(2));
check('-1,8 dB a 1 kHz', perto(respostaDb(CURVA_MEDIDA_NO_CHROME, 1000), -1.8),
  respostaDb(CURVA_MEDIDA_NO_CHROME, 1000).toFixed(2));
// A razao de existir o picoDb: as bandas sobrepoem-se, por isso o pico da
// curva e MAIOR do que a banda mais alta.
check('o pico e maior do que a banda mais alta',
  picoDb(CURVA_MEDIDA_NO_CHROME) > Math.max(...CURVA_MEDIDA_NO_CHROME),
  `pico ${picoDb(CURVA_MEDIDA_NO_CHROME)} vs banda ${Math.max(...CURVA_MEDIDA_NO_CHROME)}`);

console.log('\no bass boost tem de se OUVIR como bass boost');
// A queixa que originou isto: "o bass boost reduz o volume nos graves". A
// versao antiga punha a forca a 32-64 Hz, que uma coluna de portatil nao
// reproduz, e ja estava NEGATIVA aos 200 Hz -- so se ouvia o corte.
const efectivo = (f: number) => respostaDb(bass, f) + compensacaoDb(bass);
check('levanta onde os graves se ouvem em colunas pequenas (60-200 Hz)',
  [60, 80, 100, 150, 200].every((f) => efectivo(f) >= 2),
  [60, 80, 100, 150, 200].map((f) => `${f}:${efectivo(f).toFixed(1)}`).join(' '));
check('nao gasta a margem toda no sub, que nao se reproduz',
  bass[0] <= bass[2], `32Hz:${bass[0]} vs 125Hz:${bass[2]}`);
check('e nao cava os medios ao ponto de soar oco',
  efectivo(1000) > -6, efectivo(1000).toFixed(1));
check('todas as bandas sao peaking — as prateleiras foram medidas e davam menos',
  TIPOS.every((t) => t === 'peaking'));

console.log('\na margem que impede o corte');
check('o plano nao precisa de margem', compensacaoDb(PLANO) === 0 && compensacaoLinear(PLANO) === 1);
check('uma curva so a cortar tambem nao', compensacaoDb(BANDAS.map(() => -6)) === 0);
check('a margem nunca AUMENTA o volume',
  PERFIS.every((p) => compensacaoLinear(p.ganhos) <= 1));
check('a margem e sempre um multiplicador valido',
  PERFIS.every((p) => { const m = compensacaoLinear(p.ganhos); return m > 0 && m <= 1; }));
// A GARANTIA, e repara no que ela diz e no que nao diz: equalizar nao mexe no
// VOLUME. Nao diz que a curva nunca passa de 0 dB nalguma frequencia -- se nao
// passasse, nao havia reforco nenhum, so corte. Um "bass boost" que nao
// levanta os graves em lado nenhum nao e um bass boost.
check('com a margem, o volume de programa fica igual ao plano',
  PERFIS.every((p) => Math.abs(ganhoDeProgramaDb(p.ganhos) + compensacaoDb(p.ganhos)) <= 0.1),
  PERFIS.map((p) => `${p.id}:${(ganhoDeProgramaDb(p.ganhos) + compensacaoDb(p.ganhos)).toFixed(2)}`).join(' '));
// A regressao que o utilizador ouviu: a margem antiga era o PICO da curva,
// que e um tom puro no pior sitio. O bass boost perdia 5,3 dB de volume, e
// como so as faixas com perfil guardado levavam margem, umas tocavam mais
// alto do que outras.
check('nenhum perfil rouba mais de 1 dB de volume',
  PERFIS.every((p) => compensacaoDb(p.ganhos) + ganhoDeProgramaDb(p.ganhos) > -1),
  PERFIS.map((p) => `${p.id}:${compensacaoDb(p.ganhos)}`).join(' '));
check('a margem do bass boost e muito menor do que o pico da curva',
  Math.abs(compensacaoDb(bass)) < picoDb(bass) - 3,
  `margem ${compensacaoDb(bass)} vs pico ${picoDb(bass)}`);
// E o reforco continua la: e disto que a funcionalidade trata.
check('depois da margem, o bass boost ainda levanta os graves',
  respostaDb(bass, 60) + compensacaoDb(bass) > 3,
  (respostaDb(bass, 60) + compensacaoDb(bass)).toFixed(1));
check('e continua a baixar onde a curva desce',
  respostaDb(bass, 1000) + compensacaoDb(bass) < 0);
check('o pior caso (tudo a +12) atenua a serio',
  compensacaoDb(BANDAS.map(() => GANHO_MAXIMO)) < -10,
  String(compensacaoDb(BANDAS.map(() => GANHO_MAXIMO))));

console.log('\nmemoria por faixa');
const agora = Date.UTC(2026, 7, 29, 12, 0, 0);
const chave = chaveDaFaixa({ source: 'youtube', sourceId: 'abc' });
check('a chave e fonte:id', chave === 'youtube:abc');

let m: MemoriaDeAjustes = {};
// O ponto: uma faixa no normal NAO deixa registo, senao a memoria enchia-se de
// entradas que nao dizem nada.
m = guardar(m, chave, { rate: 1, ganhos: PLANO }, agora);
check('normal e plano nao deixa registo', Object.keys(m).length === 0);

m = guardar(m, chave, { rate: 0.8, ganhos: PLANO }, agora);
check('so a velocidade ja e registo', !!m[chave]);
check('guarda a velocidade', m[chave].rate === 0.8);
check('e nao guarda ganhos planos', m[chave].ganhos === null);

m = guardar(m, chave, { rate: 1, ganhos: perfilPorId('bass')!.ganhos }, agora);
check('so o EQ tambem e registo', m[chave].ganhos !== null);
check('e nao guarda a velocidade normal', m[chave].rate === null);

// Voltar tudo ao normal e como o utilizador desfaz.
m = guardar(m, chave, { rate: 1, ganhos: PLANO }, agora);
check('voltar ao normal APAGA a entrada', m[chave] === undefined);

console.log('\naplicar ao tocar');
let m2: MemoriaDeAjustes = {};
m2 = guardar(m2, 'youtube:x', { rate: 0.8, ganhos: perfilPorId('warm')!.ganhos }, agora);
const comRegisto = aoTocar(m2, 'youtube:x', { rate: 1, ganhos: PLANO });
check('devolve o que estava guardado', comRegisto.rate === 0.8 && comRegisto.lembrado === true);
check('e os ganhos guardados', comRegisto.ganhos[0] === perfilPorId('warm')!.ganhos[0]);

// O ajuste de uma faixa nao pode pingar para a seguinte.
const semRegisto = aoTocar(m2, 'youtube:outra', { rate: 1, ganhos: PLANO });
check('faixa sem registo volta ao padrao', semRegisto.rate === 1 && ePlano(semRegisto.ganhos));
check('e diz que nao era lembrada', semRegisto.lembrado === false);

const soRate = aoTocar(guardar({}, 'k', { rate: 1.5, ganhos: PLANO }, agora), 'k', { rate: 1, ganhos: PLANO });
check('registo so de velocidade nao inventa EQ', ePlano(soRate.ganhos) && soRate.rate === 1.5);

console.log('\nos ajustes NAO pingam de uma faixa para a seguinte');
// O bug relatado: pos-se uma musica lenta e a seguinte vinha lenta tambem. A
// causa era o padrao passado ser o estado ATUAL em vez do das Definicoes.
const memoria = guardar({}, 'youtube:lenta', { rate: 0.5, ganhos: PLANO }, agora);
const padrao = { rate: 1, ganhos: PLANO };
const primeira = aoTocar(memoria, 'youtube:lenta', padrao);
check('a faixa com registo vem lenta', primeira.rate === 0.5);
// A seguinte nao tem registo: TEM de voltar ao padrao, e nao herdar o 0.5.
const seguinte = aoTocar(memoria, 'youtube:outra', padrao);
check('a seguinte volta ao padrao e nao herda', seguinte.rate === 1);
check('e tambem nao herda o EQ',
  ePlano(aoTocar(guardar(memoria, 'youtube:eq', { rate: 1, ganhos: perfilPorId('bass')!.ganhos }, agora),
    'youtube:limpa', padrao).ganhos));
// E se o padrao NAO for 1, a faixa sem registo tem de vir com o padrao.
const comPadrao = aoTocar(memoria, 'youtube:nova', { rate: 1.5, ganhos: perfilPorId('warm')!.ganhos });
check('o padrao das Definicoes e que manda nas faixas sem registo',
  comPadrao.rate === 1.5 && comPadrao.ganhos[0] === perfilPorId('warm')!.ganhos[0]);

console.log('\no teto de faixas lembradas');
let grande: MemoriaDeAjustes = {};
for (let i = 0; i < MAX_FAIXAS + 50; i++) {
  grande = guardar(grande, `k${i}`, { rate: 1.2, ganhos: PLANO }, agora + i);
}
check('nao passa do teto', Object.keys(grande).length === MAX_FAIXAS, String(Object.keys(grande).length));
check('as que ficam sao as MAIS RECENTES', !!grande[`k${MAX_FAIXAS + 49}`] && !grande['k0']);
check('podar uma memoria pequena nao mexe nela',
  Object.keys(podar({ a: { rate: 1.1, ganhos: null, visto: 1 } })).length === 1);

console.log('\nler a persistencia sem confiar nela');
check('vazio da vazio', Object.keys(daPersistencia(null)).length === 0);
check('json partido da vazio', Object.keys(daPersistencia('{{{')).length === 0);
check('um array nao e memoria', Object.keys(daPersistencia('[1,2,3]')).length === 0);
check('entradas sem nada sao deitadas fora',
  Object.keys(daPersistencia('{"a":{"rate":null,"ganhos":null}}')).length === 0);
check('ganhos fora dos limites sao presos',
  daPersistencia('{"a":{"rate":null,"ganhos":[99,0,0,0,0,0,0,0,0,0],"visto":1}}').a.ganhos![0] === GANHO_MAXIMO);
check('rate invalido nao passa',
  daPersistencia('{"a":{"rate":"rapido","ganhos":[3,0,0,0,0,0,0,0,0,0],"visto":1}}').a.rate === null);
const ida = JSON.stringify(guardar({}, 'youtube:z', { rate: 0.7, ganhos: perfilPorId('vocal')!.ganhos }, agora));
check('ida e volta pela persistencia mantem tudo',
  JSON.stringify(daPersistencia(ida)) === ida, ida.slice(0, 60));

console.log(bad === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${bad} caso(s) a falhar.\n`);
process.exit(bad === 0 ? 0 : 1);
