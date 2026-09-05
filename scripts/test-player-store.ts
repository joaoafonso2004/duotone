/**
 * A loja do player, a correr de verdade.
 *
 * Os outros testes exercitam funções puras. Este exercita a `store` inteira --
 * `playTrack`, `next`, `playShuffled`, o shuffle inteligente -- com as folhas
 * que não correm em Node (armazenamento, Supabase, YouTube, o módulo nativo)
 * trocadas por duplos. Ver a nota nos DUPLOS em scripts/resolver-ts.mjs.
 *
 * Porque é que isto passou a existir: num só dia saíram três bugs, e os três
 * viviam aqui. Nenhum era uma conta errada -- eram sequências, quem lê o quê e
 * quando, e por isso nenhuma função pura os podia apanhar. Os casos marcados
 * com REGRESSAO são esses; se algum voltar a falhar, é porque voltou.
 *
 * Corre-se com:
 *   DUOTONE_DUPLOS=1 node --experimental-strip-types \
 *     --import ./scripts/registar-resolver.mjs scripts/test-player-store.ts
 */
import { usePlayer } from '../src/state/player.ts';
import { trackKey } from '../src/lib/shuffle.ts';
import { controlo, reporControlo } from './duplos/controlo.ts';
import { guardadas } from './duplos/prefs.ts';
import type { Track } from '../src/types.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};
const eq = (rotulo: string, veio: unknown, esperado: unknown) =>
  check(rotulo, veio === esperado, veio === esperado ? '' : `esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);

const faixa = (id: string): Track => ({
  source: 'youtube', sourceId: id, title: id, artist: 'Alguém',
  album: null, artworkUrl: null, durationSeconds: 180,
});
const fila = (...ids: string[]) => ids.map(faixa);
const ids = () => usePlayer.getState().queue.map((t) => t.sourceId);
const atual = () => usePlayer.getState().current?.sourceId ?? null;

/**
 * Deixa o que ficou pendente resolver-se.
 *
 * O `playShuffled` semeia com `void`, sem esperar, porque a semente não pode
 * atrasar o play. Os duplos resolvem de imediato, por isso duas voltas ao
 * ciclo de eventos chegam -- não é uma espera por tempo, é dar a vez.
 */
const assentar = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
};

/** Põe a loja num ponto conhecido. Sem isto um caso herdava o anterior. */
function preparar(over: Record<string, unknown> = {}) {
  reporControlo();
  const q = fila('a', 'b', 'c', 'd');
  usePlayer.setState({
    current: q[0], queue: q, queueIndex: 0,
    shuffle: false, shuffleInteligente: false, shuffleOrder: [],
    repeatMode: 'off', desdeASugestao: 0, sugeridas: [],
    autoplayRadio: true, radioActive: false,
    positionMs: 0, durationMs: 180_000, error: null,
    ...over,
  } as any);
}

// ===========================================================================
console.log('\no caminho normal');
// ===========================================================================

preparar();
await usePlayer.getState().next();
eq('next avança para a faixa seguinte', atual(), 'b');
eq('e o índice acompanha', usePlayer.getState().queueIndex, 1);

preparar({ queueIndex: 3, current: faixa('d') });
await usePlayer.getState().next();
eq('no fim da fila, sem rádio, a faixa NÃO muda', atual(), 'd');
check('e foi mesmo perguntar ao rádio', controlo.chamadas.radio === 1, String(controlo.chamadas.radio));
// Este é o estado que fazia o crossfade encravar: a reprodução parava e a
// faixa ficava onde estava. Sem crossfade isso via-se; com ele, o segundo
// motor continuava a tocar por cima. Ver a rede de segurança em b16f94e.

preparar({ queueIndex: 3, current: faixa('d') });
controlo.radio = fila('r1', 'r2');
await usePlayer.getState().next();
eq('com rádio, a fila estende-se e avança', atual(), 'r1');
check('as faixas do rádio ficaram na fila', ids().includes('r2'));

preparar({ queueIndex: 3, current: faixa('d'), repeatMode: 'all' });
await usePlayer.getState().next();
eq('repeat all volta ao princípio', atual(), 'a');

// ===========================================================================
console.log('\no shuffle inteligente');
// ===========================================================================

// REGRESSAO (a95b7e9). O `next()` lia a fila ANTES de mandar intercalar a
// sugestão e depois seguia com essa cópia. O percurso já conhecia a chave nova
// e a fila não, por isso o `stepIndex` devolvia null e o `playTrack` -- que
// recebe a fila por argumento e a grava por cima -- apagava a sugestão que
// acabara de entrar. Nunca chegava ao "Up next".
preparar({
  shuffle: true, shuffleInteligente: true, desdeASugestao: 4,
  shuffleOrder: fila('a', 'b', 'c', 'd').map(trackKey),
});
controlo.candidatas = [faixa('nova')];
await usePlayer.getState().next();
check('a sugestão fica na fila', ids().includes('nova'), ids().join(','));
eq('e é ela que toca a seguir', atual(), 'nova');
eq('o contador da sugestão foi reposto', usePlayer.getState().desdeASugestao, 1);

preparar({
  shuffle: true, shuffleInteligente: true, desdeASugestao: 1,
  shuffleOrder: fila('a', 'b', 'c', 'd').map(trackKey),
});
controlo.candidatas = [faixa('nova')];
await usePlayer.getState().next();
check('cedo demais não sugere nada', !ids().includes('nova'));
eq('e nem foi à rede', controlo.chamadas.candidatas, 0);

preparar({
  shuffle: true, shuffleInteligente: false, desdeASugestao: 9,
  shuffleOrder: fila('a', 'b', 'c', 'd').map(trackKey),
});
controlo.candidatas = [faixa('nova')];
await usePlayer.getState().next();
check('shuffle normal nunca sugere', !ids().includes('nova'));

preparar({
  shuffle: true, shuffleInteligente: true, desdeASugestao: 4,
  shuffleOrder: fila('a', 'b', 'c', 'd').map(trackKey),
});
controlo.offline = true;
controlo.candidatas = [faixa('nova')];
await usePlayer.getState().next();
check('sem rede não entra sugestão nenhuma', !ids().includes('nova'));
check('mas a fila avança na mesma', atual() !== 'a', String(atual()));

preparar({
  shuffle: true, shuffleInteligente: true, desdeASugestao: 4,
  shuffleOrder: fila('a', 'b', 'c', 'd').map(trackKey),
});
controlo.candidatas = [];
await usePlayer.getState().next();
eq('sem candidatas, o contador volta a zero e espera', usePlayer.getState().desdeASugestao, 1);
// (1 e não 0: o `playTrack` da faixa seguinte incrementa-o logo a seguir.)

// ===========================================================================
console.log('\no play a partir de uma lista');
// ===========================================================================

// REGRESSAO (0d6981b). O botão da barra inferior semeava; o Play das Liked
// Songs e das playlists não -- e ainda monta uma fila nova por cima da que o
// botão pudesse ter semeado. Ficava-se com o modo ligado e nada na fila.
preparar();
controlo.candidatas = fila('n1', 'n2', 'n3');
await usePlayer.getState().playShuffled(fila('x', 'y', 'z', 'w'), true);
await assentar();
check('o smart shuffle semeia ao tocar de uma lista',
  ids().some((i) => i.startsWith('n')), ids().join(','));
eq('e o modo ficou guardado', guardadas.shuffleInteligente, true);

preparar();
controlo.candidatas = fila('n1', 'n2', 'n3');
await usePlayer.getState().playShuffled(fila('x', 'y', 'z', 'w'), false);
await assentar();
check('o shuffle normal não semeia', !ids().some((i) => i.startsWith('n')), ids().join(','));
eq('e o modo também ficou guardado', guardadas.shuffleInteligente, false);

// ===========================================================================
console.log('\na posição e o instante a que ela se refere');
// ===========================================================================

// REGRESSAO (b4706b3). O handoff publicava a hora da ESCRITA ao lado de uma
// posição que podia ser de há um minuto. O par tem de andar sempre junto.
preparar();
const antes = Date.now();
usePlayer.getState()._setProgress(42_000, 180_000);
const st = usePlayer.getState();
eq('a posição é a que se mandou', st.positionMs, 42_000);
check('e traz o instante em que era verdade',
  st.positionAt >= antes && st.positionAt <= Date.now(), String(st.positionAt));

preparar();
await usePlayer.getState().next();
check('mudar de faixa carimba a posição de novo',
  usePlayer.getState().positionAt >= antes && usePlayer.getState().positionMs === 0);

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
