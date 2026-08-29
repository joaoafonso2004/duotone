import {
  derivados,
  falhou,
  INICIAL,
  transicao,
  type EstadoDeReproducao,
  type Evento,
} from '../src/lib/playbackMachine.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

const correr = (eventos: Evento['tipo'][], de: EstadoDeReproducao = INICIAL) =>
  eventos.reduce((e, tipo) => transicao(e, { tipo } as Evento), de);
const mostra = (e: EstadoDeReproducao) => `${e.intencao}/${e.fase}`;

console.log('\nponto de partida');
check('comeca parado e sem faixa', mostra(INICIAL) === 'parar/sem-faixa');
check('e nao mostra ampulheta', derivados(INICIAL).buffering === false);

console.log('\no percurso normal');
const p1 = correr(['faixa-escolhida']);
check('escolher uma faixa poe a resolver', mostra(p1) === 'tocar/a-resolver');
check('e ja conta como a tocar para a UI', derivados(p1).isPlaying === true);
check('com ampulheta', derivados(p1).buffering === true);

const p2 = correr(['faixa-escolhida', 'motor-pronto', 'a-tocar']);
check('com o motor pronto fica a tocar', mostra(p2) === 'tocar/pronto');
check('e a ampulheta desaparece', derivados(p2).buffering === false);

console.log('\nsem faixa, nada acontece');
// Era daqui que vinham estados sem sentido: buffering sem faixa nenhuma.
for (const tipo of ['motor-pronto', 'a-encher', 'a-tocar', 'em-pausa', 'quer-tocar', 'quer-parar', 'falhou'] as const) {
  check(`"${tipo}" e ignorado sem faixa`, mostra(correr([tipo])) === 'parar/sem-faixa');
}
check('e nunca ha ampulheta sem faixa', derivados(correr(['a-encher'])).buffering === false);

console.log('\na intencao e de quem manda: o utilizador');
// O bug que isto fecha: o motor confirmava "a tocar" DEPOIS de o utilizador ter
// carregado em pausa, e a reproducao ressuscitava.
const pausadoDepoisDeConfirmar = correr(['faixa-escolhida', 'motor-pronto', 'quer-parar', 'a-tocar']);
check('confirmacao atrasada do motor NAO desfaz a pausa',
  pausadoDepoisDeConfirmar.intencao === 'parar', mostra(pausadoDepoisDeConfirmar));
check('e a UI mostra parado', derivados(pausadoDepoisDeConfirmar).isPlaying === false);

const tocarDepoisDeConfirmarPausa = correr(['faixa-escolhida', 'quer-parar', 'quer-tocar', 'em-pausa']);
check('confirmacao atrasada de pausa NAO desfaz o play',
  tocarDepoisDeConfirmarPausa.intencao === 'tocar', mostra(tocarDepoisDeConfirmarPausa));

console.log('\ntrocar de faixa mantem quem estava a ouvir a ouvir');
const seguinte = correr(['faixa-escolhida', 'motor-pronto', 'a-tocar', 'faixa-escolhida']);
check('a faixa seguinte volta a resolver', seguinte.fase === 'a-resolver');
check('e continua com intencao de tocar', seguinte.intencao === 'tocar');
// O botao nao deve piscar entre faixas.
check('o botao continua em "a tocar" durante a resolucao', derivados(seguinte).isPlaying === true);

console.log('\nfalhar');
const f = correr(['faixa-escolhida', 'falhou']);
check('a fase fica em falhou', f.fase === 'falhou');
// Sem isto ficava "a querer tocar" uma coisa que nao toca, e a UI mostrava o
// botao de pausa por cima de um erro.
check('a intencao CAI ao falhar', f.intencao === 'parar');
check('nao ha ampulheta sobre um erro', derivados(f).buffering === false);
check('nem botao de pausa', derivados(f).isPlaying === false);
check('o helper diz que falhou', falhou(f) === true);

const retentar = correr(['faixa-escolhida', 'falhou', 'quer-tocar']);
check('carregar em play depois da falha e nova tentativa', mostra(retentar) === 'tocar/a-resolver');
check('encher depois de falhar e ignorado',
  correr(['faixa-escolhida', 'falhou', 'a-encher']).fase === 'falhou');

console.log('\nfechar o leitor');
const fechado = correr(['faixa-escolhida', 'motor-pronto', 'a-tocar', 'parou-tudo']);
check('volta ao inicio', mostra(fechado) === 'parar/sem-faixa');
check('sem ampulheta agarrada', derivados(fechado).buffering === false);

console.log('\ninvariantes, em todos os estados alcancaveis');
// Percorrer tudo o que se pode alcancar e verificar que nenhuma combinacao
// impossivel existe. E este teste que substitui "ter cuidado" nos 23 sitios
// que antes escreviam os booleanos a mao.
const TIPOS: Evento['tipo'][] = ['faixa-escolhida', 'motor-pronto', 'a-encher', 'a-tocar',
  'em-pausa', 'quer-tocar', 'quer-parar', 'falhou', 'parou-tudo'];
const vistos = new Map<string, EstadoDeReproducao>();
const porVer: EstadoDeReproducao[] = [INICIAL];
while (porVer.length) {
  const e = porVer.pop()!;
  if (vistos.has(mostra(e))) continue;
  vistos.set(mostra(e), e);
  for (const tipo of TIPOS) porVer.push(transicao(e, { tipo } as Evento));
}
let mau = '';
for (const [nome, e] of vistos) {
  const d = derivados(e);
  if (e.fase === 'sem-faixa' && (d.isPlaying || d.buffering)) mau = `${nome}: sem faixa mas ativo`;
  if (e.fase === 'falhou' && (d.isPlaying || d.buffering)) mau = `${nome}: falhou mas ativo`;
  if (d.buffering && !d.isPlaying) mau = `${nome}: ampulheta sem intencao de ouvir`;
  if (e.intencao === 'parar' && d.isPlaying) mau = `${nome}: parado mas a tocar`;
}
check(`${vistos.size} estados alcancaveis, nenhum contraditorio`, mau === '', mau);
// Se o numero disparar, alguem acrescentou uma dimensao sem dar por isso.
check('o espaco de estados continua pequeno', vistos.size <= 12, String(vistos.size));

console.log(bad === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${bad} caso(s) a falhar.\n`);
process.exit(bad === 0 ? 0 : 1);
