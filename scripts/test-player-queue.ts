import {
  prazoDoTemporizador,
  restanteDoTemporizador,
  saltoAposFalha,
  sessaoParaGuardar,
  substituicaoDe,
  type AjudantesDeShuffle,
  type EstadoDaFila,
} from '../src/lib/playerQueue.ts';
import { shuffleKeys, stepIndex } from '../src/lib/shuffle.ts';
import type { Track } from '../src/types.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

const yt = (id: string, title = id): Track => ({
  source: 'youtube', sourceId: id, title, artist: 'A',
  album: null, artworkUrl: null, durationSeconds: 200,
});
const chave = (t: Track) => `${t.source}:${t.sourceId}`;
const ajudantes: AjudantesDeShuffle = { trackKey: chave, stepIndex, shuffleKeys };

const fila3 = [yt('a'), yt('b'), yt('c')];
const base = (extra: Partial<EstadoDaFila> = {}): EstadoDaFila => ({
  current: fila3[0], queue: fila3, queueIndex: 0,
  shuffle: false, repeatMode: 'off', shuffleOrder: [], ...extra,
});

console.log('\nsubstituir por uma copia que toca');
const sub = substituicaoDe(
  { current: yt('a', 'Blonde'), queue: fila3, queueIndex: 0, shuffleOrder: [] },
  'a', { ...yt('zzz'), durationSeconds: 250 }, chave);
check('devolve substituicao', sub !== null);
check('so o sourceId muda', sub!.current.sourceId === 'zzz');
// A razao de nao se copiar o titulo da alternativa: a biblioteca parecia
// mudar de faixa a meio.
check('titulo e do ORIGINAL, nao da copia', sub!.current.title === 'Blonde');
check('duracao vem da copia quando ela a sabe', sub!.current.durationSeconds === 250);
check('a fila e trocada no mesmo indice', sub!.queue[0].sourceId === 'zzz');
check('as outras posicoes ficam', sub!.queue[1].sourceId === 'b');

const semDuracao = substituicaoDe(
  { current: { ...yt('a'), durationSeconds: 180 }, queue: fila3, queueIndex: 0, shuffleOrder: [] },
  'a', { ...yt('zzz'), durationSeconds: null }, chave);
check('sem duracao na copia, mantem a do original', semDuracao!.current.durationSeconds === 180);

// A protecao contra trocar a faixa debaixo dos pes de quem esta a ouvir.
check('nao substitui se a faixa atual ja mudou',
  substituicaoDe({ current: yt('outra'), queue: fila3, queueIndex: 0, shuffleOrder: [] },
    'a', yt('zzz'), chave) === null);
check('nao substitui sem faixa atual',
  substituicaoDe({ current: null, queue: fila3, queueIndex: 0, shuffleOrder: [] },
    'a', yt('zzz'), chave) === null);

console.log('\nsubstituir mantem o percurso do shuffle');
const comOrdem = substituicaoDe(
  { current: yt('b'), queue: fila3, queueIndex: 1,
    shuffleOrder: ['youtube:c', 'youtube:b', 'youtube:a'] },
  'b', yt('zzz'), chave);
check('a chave e trocada NO MESMO LUGAR',
  comOrdem!.shuffleOrder.join() === 'youtube:c,youtube:zzz,youtube:a', comOrdem!.shuffleOrder.join());
// Se a copia ja estivesse no percurso, ficava la duas vezes.
const dup = substituicaoDe(
  { current: yt('b'), queue: fila3, queueIndex: 1,
    shuffleOrder: ['youtube:c', 'youtube:b', 'youtube:a'] },
  'b', yt('c'), chave);
check('nao deixa a mesma chave duas vezes no percurso',
  new Set(dup!.shuffleOrder).size === dup!.shuffleOrder.length, dup!.shuffleOrder.join());

console.log('\nsaltar a faixa que nao toca');
const s1 = saltoAposFalha(base(), ajudantes);
check('vai para a seguinte', s1.alvo?.sourceId === 'b');
// O ponto: a morta sai da fila DESTA sessao, senao com repeat all voltava a
// bloquear na volta seguinte.
check('a morta sai da fila', s1.fila.length === 2 && !s1.fila.some((t) => t.sourceId === 'a'));

const s2 = saltoAposFalha(base({ current: fila3[2], queueIndex: 2 }), ajudantes);
check('ultima faixa sem repeat: nao ha alvo', s2.alvo === null);
check('a chave da morta sai do percurso ao acabar', !s2.ordem.includes('youtube:c'));

const s3 = saltoAposFalha(base({ current: fila3[2], queueIndex: 2, repeatMode: 'all' }), ajudantes);
check('ultima com repeat all volta ao principio', s3.alvo?.sourceId === 'a');

const s4 = saltoAposFalha(
  { current: fila3[0], queue: [fila3[0]], queueIndex: 0, shuffle: false, repeatMode: 'all', shuffleOrder: [] },
  ajudantes);
check('fila de uma so, com repeat all, nao se repete a si propria', s4.alvo === null);
check('e fica vazia', s4.fila.length === 0);

console.log('\nsaltar com shuffle ligado');
const ordem = ['youtube:b', 'youtube:c', 'youtube:a'];
const s5 = saltoAposFalha(
  base({ current: fila3[1], queueIndex: 1, shuffle: true, shuffleOrder: ordem }), ajudantes);
check('segue o PERCURSO, nao o indice da fila', s5.alvo?.sourceId === 'c', String(s5.alvo?.sourceId));

// Fim do percurso com repeat all: baralha-se de novo em vez de repetir a
// mesma ordem.
const s6 = saltoAposFalha(
  base({ current: fila3[0], queueIndex: 0, shuffle: true, repeatMode: 'all', shuffleOrder: ordem }),
  ajudantes);
check('fim do percurso com repeat all da ordem nova e alvo', s6.alvo !== null);
check('a ordem foi refeita', s6.ordem.length === 3);

console.log('\nsleep timer — prazo absoluto, nunca contador');
const agora = 1_000_000;
const p = prazoDoTemporizador(30, agora);
check('30 min viram um instante de fim', p.fimEm === agora + 30 * 60_000);
check('e 1800 segundos', p.restanteS === 1800);
check('zero minutos desliga', prazoDoTemporizador(0, agora).fimEm === null);
check('negativo desliga', prazoDoTemporizador(-5, agora).fimEm === null);

check('sem prazo nao ha conta', restanteDoTemporizador(null, agora).restanteS === 0);
check('sem prazo nao termina', restanteDoTemporizador(null, agora).terminou === false);
check('a meio conta bem', restanteDoTemporizador(agora + 90_000, agora).restanteS === 90);
check('no fim termina', restanteDoTemporizador(agora, agora).terminou === true);
// O caso que o contador com setInterval falhava: a app esteve suspensa e
// voltou DEPOIS do prazo. O prazo absoluto apanha-o na mesma.
check('suspensa e acordada depois do prazo, termina na mesma',
  restanteDoTemporizador(agora - 600_000, agora).terminou === true);
check('e nunca da segundos negativos',
  restanteDoTemporizador(agora - 600_000, agora).restanteS === 0);

console.log('\npersistencia da sessao');
const guardada = sessaoParaGuardar({
  current: fila3[0], queue: fila3, queueIndex: 1, positionMs: 4200, durationMs: 200000,
  sugeridas: ['youtube:s1'], desdeASugestao: 2,
  isPlaying: true, shuffle: true, repeatMode: 'all',
} as any);
check('guarda os sete campos', Object.keys(guardada).sort().join() ===
  'current,desdeASugestao,durationMs,positionMs,queue,queueIndex,sugeridas');
// Repeat e shuffle vivem nas prefs; a sessao e outra coisa.
check('NAO guarda o isPlaying', !('isPlaying' in guardada));
check('NAO guarda shuffle nem repeat',
  !('shuffle' in guardada) && !('repeatMode' in guardada));
// A marca do shuffle inteligente e sobre ESTA fila, nao e uma preferencia:
// sem ela a fila voltava a abrir cheia de musicas sem estrela, que e o mesmo
// que nao saber o que a app meteu la.
check('guarda as sugeridas', guardada.sugeridas.join() === 'youtube:s1');
// A zeros em cada arranque, obrigava a ouvir quatro faixas antes da proxima.
check('guarda o contador ate a proxima sugestao', guardada.desdeASugestao === 2);
console.log(bad === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${bad} caso(s) a falhar.\n`);
process.exit(bad === 0 ? 0 : 1);
