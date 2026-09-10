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
import { ATRASO_DA_SUGESTAO_MS, usePlayer } from '../src/state/player.ts';
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
 * Deixa a sugestao do shuffle inteligente chegar.
 *
 * Ela deixou de ser esperada pelo `next` -- ver o comentario la -- e por
 * isso os testes que olham para a fila tem de lhe dar o tique que ela
 * precisa. Sem isto assertavam a fila de ANTES da sugestao.
 */
const esperarUmTique = () => new Promise((r) => setTimeout(r, ATRASO_DA_SUGESTAO_MS + 60));

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

// A FAIXA MUDA JA, e a sugestao chega a seguir.
//
// Isto era sincrono: o `next` esperava pela sugestao -- duas consultas ao
// Supabase mais uma pesquisa no YouTube -- ANTES de mudar de musica. De quatro
// em quatro faixas, o utilizador carregava em seguinte e ficava a olhar para a
// faixa antiga enquanto a app procurava uma sugestao para dali a umas musicas.
//
// A troca deliberada: a sugestao passa a tocar uma faixa mais tarde, porque se
// insere depois de a fila ja ter avancado. Invisivel para quem ouve; o atraso
// no botao nao era.
eq('a faixa muda já, sem esperar pela rede', atual(), 'b');
await esperarUmTique();
check('a sugestão entra na fila logo a seguir', ids().includes('nova'), ids().join(','));
eq('e fica a seguir à que está a tocar', ids()[usePlayer.getState().queueIndex + 1], 'nova');
// Zero, e nao um. Antes a sugestao corria ANTES do `playTrack`, que depois
// incrementava o contador para 1. Agora corre depois, e o valor final e o
// que a propria sugestao deixa -- que e o mais correcto dos dois: acabou
// de se sugerir, faltam quatro faixas para a proxima.
eq('o contador da sugestão foi reposto', usePlayer.getState().desdeASugestao, 0);

preparar({
  shuffle: true, shuffleInteligente: true, desdeASugestao: 1,
  shuffleOrder: fila('a', 'b', 'c', 'd').map(trackKey),
});
controlo.candidatas = [faixa('nova')];
await usePlayer.getState().next();
await esperarUmTique();
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
await esperarUmTique();
eq('sem candidatas, o contador volta a zero e espera', usePlayer.getState().desdeASugestao, 0);
// Zero pela mesma razao do caso acima: a reposicao passou a ser a ultima coisa
// a acontecer. O que importa e que NAO fique alto -- senao cada mudanca de
// faixa ia a rede, e essa tem quota diaria.

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

// ===========================================================================
console.log('\ntocar a seguir, em todos os modos');
// ===========================================================================
// A P0 do relatório estratégico: "Play next funciona em fila comum, rádio,
// repeat, shuffle e Jam". O Jam tem os seus (test-jam-store.ts); o resto vive
// aqui, com a store a correr, porque a falha que se viu a conduzir não era uma
// conta errada -- era quem lia a fila e quando. `lib/playerQueue.ts` testa só
// a peça pura (`colocarASeguir`).
const aSeguir = () => usePlayer.getState().peekNextTrack()?.sourceId ?? null;

preparar();
usePlayer.getState().playNext(faixa('x'));
eq('fila comum: entra logo a seguir à atual', ids().join(), 'a,x,b,c,d');
eq('e é por ela que o pré-carregamento espera', aSeguir(), 'x');
await usePlayer.getState().next();
eq('e é ela que toca a seguir', atual(), 'x');

preparar();
usePlayer.getState().playNext(faixa('c'));
eq('uma que já estava por tocar muda de lugar, sem cópia', ids().join(), 'a,c,b,d');
usePlayer.getState().playNext(faixa('c'));
eq('pedir outra vez não duplica nem muda nada', ids().join(), 'a,c,b,d');

preparar({ queueIndex: 3, current: faixa('d'), repeatMode: 'all' });
usePlayer.getState().playNext(faixa('x'));
eq('repeat all, no fim da fila: o pré-carregamento vê a pedida', aSeguir(), 'x');
await usePlayer.getState().next();
eq('repeat all: toca a pedida, e não volta já ao início', atual(), 'x');
await usePlayer.getState().next();
eq('e só depois dá a volta', atual(), 'a');

preparar({ repeatMode: 'one' });
usePlayer.getState().playNext(faixa('x'));
eq('repeat one: a pedida fica logo a seguir', ids().join(), 'a,x,b,c,d');
// No repeat "one" o FIM da faixa repete-a (é o motor que decide); o botão de
// seguinte salta sempre. Por isso não há nada a pré-carregar, mas saltar leva
// à pedida.
eq('repeat one: não se pré-carrega nada', aSeguir(), null);
await usePlayer.getState().next();
eq('repeat one: saltar leva à pedida', atual(), 'x');

preparar({ queueIndex: 3, current: faixa('d') });
controlo.radio = fila('r1', 'r2');
usePlayer.getState().playNext(faixa('x'));
await usePlayer.getState().next();
eq('rádio no fim da fila: a pedida toca antes do rádio', atual(), 'x');
check('e para isso nem se foi ao rádio', controlo.chamadas.radio === 0, String(controlo.chamadas.radio));
await usePlayer.getState().next();
eq('só depois entra o rádio', atual(), 'r1');

preparar({ queueIndex: 3, current: faixa('d') });
controlo.radio = fila('r1', 'r2');
// O rádio estende a fila em ANTECIPAÇÃO (useAutoplayRadio): quando se pede a
// seguinte, as dele já lá estão.
await usePlayer.getState().extendQueueWithRadio();
usePlayer.getState().playNext(faixa('x'));
eq('com o rádio já na fila, a pedida passa-lhe à frente', ids().join(), 'a,b,c,d,x,r1,r2');
await usePlayer.getState().next();
eq('e toca antes dele', atual(), 'x');

preparar({ shuffle: true });
usePlayer.getState()._ensureShuffleOrder();
usePlayer.getState().playNext(faixa('x'));
eq('shuffle: o pré-carregamento segue o percurso até à pedida', aSeguir(), 'x');
await usePlayer.getState().next();
eq('shuffle: a pedida é a próxima do percurso', atual(), 'x');

preparar({ current: null, queue: [], queueIndex: 0 });
usePlayer.getState().playNext(faixa('x'));
await assentar();
eq('sem nada a tocar, "a seguir" é agora', atual(), 'x');

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
