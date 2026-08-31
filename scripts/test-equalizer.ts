import {
  aoTocar,
  BANDAS,
  chaveDaFaixa,
  compensacaoDb,
  compensacaoLinear,
  daPersistencia,
  ePlano,
  ETIQUETAS_BANDAS,
  GANHO_MAXIMO,
  ganhosPorOmissao,
  guardar,
  MAX_FAIXAS,
  migrarCurvaAntiga,
  normalizar,
  perfilDe,
  perfilPorId,
  PERFIS,
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
check('as pontas sao shelves de bass e treble',
  BANDAS[0] === 105 && TIPOS[0] === 'lowshelf' && BANDAS[9] === 10000 && TIPOS[9] === 'highshelf');
check('a UI usa nomes perceptivos em vez de frequencias',
  ETIQUETAS_BANDAS.join(',') === 'BASS,SUB,PUNCH,WARM,BODY,MIDS,PRES,CLEAR,AIR,TREBLE');

console.log('\nnormalizar');
check('o plano sao dez zeros', PLANO.length === 10 && ePlano(PLANO));
check('o default e sempre uma copia plana',
  ePlano(ganhosPorOmissao()) && ganhosPorOmissao() !== PLANO);
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
// Bass/Bright sao de proposito aditivos: o erro anterior era baixar a musica
// inteira para criar a ilusao de reforco.
check('bass e bright nao cortam nenhuma banda',
  ['bass', 'bright'].every((id) => perfilPorId(id)!.ganhos.every((g) => g >= 0)));
check('o bass boost pesa em baixo e nao em cima',
  perfilPorId('bass')!.ganhos[0] > 3 && perfilPorId('bass')!.ganhos[8] < 3);
check('o bright faz o contrario',
  perfilPorId('bright')!.ganhos[0] === 0 && perfilPorId('bright')!.ganhos[9] > 3);
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
const bright = perfilPorId('bright')!.ganhos;
const perto = (a: number, b: number, tol = 0.15) => Math.abs(a - b) <= tol;
check('o plano nao mexe em nada',
  [30, 60, 200, 1000, 8000, 16000].every((f) => Math.abs(respostaDb(PLANO, f)) < 0.001));

const SO_BASS = [6, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const SO_TREBLE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 6];
check('o low-shelf chega aos subgraves e desaparece nos medios',
  respostaDb(SO_BASS, 30) > 5.5 && Math.abs(respostaDb(SO_BASS, 1000)) < 0.1,
  `30:${respostaDb(SO_BASS, 30).toFixed(1)} 1k:${respostaDb(SO_BASS, 1000).toFixed(1)}`);
check('o high-shelf chega ao ar e desaparece nos medios',
  respostaDb(SO_TREBLE, 16000) > 5 && Math.abs(respostaDb(SO_TREBLE, 1000)) < 0.1,
  `16k:${respostaDb(SO_TREBLE, 16000).toFixed(1)} 1k:${respostaDb(SO_TREBLE, 1000).toFixed(1)}`);
check('o pico da curva e medido', picoDb(bass) >= 5);

console.log('\no bass boost tem de se OUVIR como bass boost');
// A queixa que originou isto: "o bass boost reduz o volume nos graves". A
// versao antiga punha a forca a 32-64 Hz, que uma coluna de portatil nao
// reproduz, e ja estava NEGATIVA aos 200 Hz -- so se ouvia o corte.
const efectivo = (f: number) => respostaDb(bass, f) + compensacaoDb(bass);
check('levanta onde os graves se ouvem em colunas pequenas (60-200 Hz)',
  [60, 80, 100, 150, 200].every((f, i) => efectivo(f) >= [4, 4, 3.5, 2, 1][i]),
  [60, 80, 100, 150, 200].map((f) => `${f}:${efectivo(f).toFixed(1)}`).join(' '));
check('medios e agudos ficam no volume original',
  [500, 1000, 2000, 4000, 8000, 16000].every((f) => Math.abs(efectivo(f)) < 0.2),
  [500, 1000, 4000, 16000].map((f) => `${f}:${efectivo(f).toFixed(1)}`).join(' '));

console.log('\no reforco de agudos também tem de ser aditivo');
const agudoEfectivo = (f: number) => respostaDb(bright, f) + compensacaoDb(bright);
check('levanta detalhe e ar entre 4 e 16 kHz',
  [4000, 8000, 12000, 16000].every((f) => agudoEfectivo(f) >= 1.5),
  [4000, 8000, 12000, 16000].map((f) => `${f}:${agudoEfectivo(f).toFixed(1)}`).join(' '));
check('nao transforma bright num simples corte global',
  agudoEfectivo(8000) > 2 && Math.abs(agudoEfectivo(1000)) < 0.2,
  `8k:${agudoEfectivo(8000).toFixed(1)} 1k:${agudoEfectivo(1000).toFixed(1)}`);

console.log('\nsem atenuacao global');
check('o plano nao precisa de margem', compensacaoDb(PLANO) === 0 && compensacaoLinear(PLANO) === 1);
check('uma curva so a cortar tambem nao', compensacaoDb(BANDAS.map(() => -6)) === 0);
check('a compatibilidade nunca AUMENTA o volume',
  PERFIS.every((p) => compensacaoLinear(p.ganhos) <= 1));
check('o multiplicador de compatibilidade e valido',
  PERFIS.every((p) => { const m = compensacaoLinear(p.ganhos); return m > 0 && m <= 1; }));
check('nenhum perfil baixa o master',
  PERFIS.every((p) => compensacaoDb(p.ganhos) === 0 && compensacaoLinear(p.ganhos) === 1));
// E o reforco continua la: e disto que a funcionalidade trata.
check('sem atenuacao, o bass boost levanta os graves',
  respostaDb(bass, 60) + compensacaoDb(bass) > 3,
  (respostaDb(bass, 60) + compensacaoDb(bass)).toFixed(1));
check('sem atenuacao, o bright levanta os agudos',
  respostaDb(bright, 8000) + compensacaoDb(bright) > 2,
  (respostaDb(bright, 8000) + compensacaoDb(bright)).toFixed(1));
check('e o bass nao baixa onde a curva nao mexe',
  Math.abs(respostaDb(bass, 1000) + compensacaoDb(bass)) < 0.1);

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

console.log('\nreafinar um perfil nao pode deixar o que estava guardado orfao');
// O que se guarda por faixa sao os GANHOS, nao o nome do perfil. Quando o Bass
// boost foi reafinado, tudo o que estava guardado com a curva velha ficou a
// tocar a versao velha E deixou de corresponder a botao nenhum -- nem se
// percebia em que estado se estava. Instalar por cima nao limpa nada.
const BASS_ANTIGO = [6, 5, 3.5, 1, -1, -1.5, -0.5, 0, 0.5, 1];
check('a curva antiga do bass boost vira a nova',
  migrarCurvaAntiga(BASS_ANTIGO).every((g, i) => g === perfilPorId('bass')!.ganhos[i]),
  migrarCurvaAntiga(BASS_ANTIGO).join(','));
check('e passa a ser reconhecida como perfil', perfilDe(migrarCurvaAntiga(BASS_ANTIGO))?.id === 'bass');
check('um perfil ATUAL nao e tocado',
  migrarCurvaAntiga(perfilPorId('warm')!.ganhos).every((g, i) => g === perfilPorId('warm')!.ganhos[i]));
// Uma curva feita a mao e do utilizador: nao se lhe mexe.
check('uma curva a mao fica como esta',
  migrarCurvaAntiga([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])[3] === 4);
check('o plano fica plano', ePlano(migrarCurvaAntiga(PLANO)));
// E a migracao tem de acontecer AO LER, senao nao serve de nada.
check('a persistencia ja devolve a curva migrada',
  daPersistencia(JSON.stringify({ 'youtube:x': { rate: null, ganhos: BASS_ANTIGO, visto: 1 } }))['youtube:x']
    .ganhos!.every((g, i) => g === perfilPorId('bass')!.ganhos[i]));

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
