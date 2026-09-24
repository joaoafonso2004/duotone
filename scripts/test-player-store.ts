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
import { ATRASO_DA_SUGESTAO_MS, definirPodeTocarSemRede, usePlayer } from '../src/state/player.ts';
import { trackKey } from '../src/lib/shuffle.ts';
import { controlo, reporControlo } from './duplos/controlo.ts';
import { guardadas } from './duplos/prefs.ts';
import { guardado as armazenamento } from './duplos/async-storage.ts';
import { naConta } from './duplos/cache.ts';
import { esquecerBiblioteca } from '../src/lib/cacheDaBiblioteca.ts';
import { tituloDeIdentidade } from '../src/lib/identidadeDaMusica.ts';
import { chaveDeArtista, displayArtist } from '../src/lib/artistName.ts';
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
    escutasDaSessao: null,
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

// Aprender rejeições exige uma recomendação, som confirmado, gesto manual e
// menos de 30 s. Falhas e fins automáticos passam pelo player sem virar gosto.
{
  const contexto = { surface: 'smart_shuffle', reasonCode: 'session_discovery', reason: 'teste' } as const;
  const q = fila('sugerida', 'seguinte');
  preparar();
  await usePlayer.getState().playTrack(q[0], q, false, false, contexto);
  usePlayer.getState()._onYtStateChange('playing');
  usePlayer.getState()._setProgress(12_000, 180_000);
  await usePlayer.getState().next();
  eq('skip precoce de uma recomendação com som alimenta a aprendizagem', controlo.aprendizagem.saltos.join(), 'sugerida');

  preparar();
  await usePlayer.getState().playTrack(q[0], q, false, false, contexto);
  await usePlayer.getState().next();
  eq('sem primeiro som, o skip não é tratado como gosto', controlo.aprendizagem.saltos.length, 0);

  preparar();
  await usePlayer.getState().playTrack(q[0], q, false, false, contexto);
  usePlayer.getState()._onYtStateChange('playing');
  usePlayer.getState()._setProgress(12_000, 180_000);
  await usePlayer.getState().next(false);
  eq('fim ou avanço automático não é uma rejeição', controlo.aprendizagem.saltos.length, 0);

  preparar();
  await usePlayer.getState().playTrack(q[0], q, false, false, contexto);
  usePlayer.getState()._onYtStateChange('playing');
  usePlayer.getState()._setProgress(45_000, 180_000);
  await usePlayer.getState().next();
  eq('passados 30 s, saltar já não é rejeição', controlo.aprendizagem.saltos.length, 0);

  preparar();
  await usePlayer.getState().playTrack(q[0], q);
  usePlayer.getState()._onYtStateChange('playing');
  usePlayer.getState()._setProgress(12_000, 180_000);
  await usePlayer.getState().next();
  eq('saltar uma faixa que não foi recomendada não ensina nada', controlo.aprendizagem.saltos.length, 0);
}

// A paciência que se pede (relatório premium, §1.1): seguinte ou outra música
// antes do primeiro som. Com som, ou num avanço automático, não conta.
{
  const saltos = () => controlo.eventos.filter((e) => e.nome === 'saltou_antes_do_som').map((e) => e.dados.gesto);
  const q = fila('p1', 'p2', 'p3');
  preparar();
  await usePlayer.getState().playTrack(q[0], q);
  await usePlayer.getState().next();
  eq('seguinte antes do som conta', saltos().join(), 'seguinte');
  eq('com o tempo que se esperou', typeof controlo.eventos.find((e) => e.nome === 'saltou_antes_do_som')?.dados.ms, 'number');

  preparar();
  await usePlayer.getState().playTrack(q[0], q);
  usePlayer.getState()._onYtStateChange('playing');
  await usePlayer.getState().next();
  eq('com som já não conta', saltos().length, 0);

  preparar();
  await usePlayer.getState().playTrack(q[0], q);
  await usePlayer.getState().next(false);
  eq('um avanço automático não conta', saltos().length, 0);

  preparar();
  await usePlayer.getState().playTrack(q[0], q);
  await usePlayer.getState().playTrack(faixa('outra'), [faixa('outra')]);
  eq('escolher outra música antes do som conta', saltos().join(), 'outra');

  preparar();
  await usePlayer.getState().playTrack(q[0], q);
  await usePlayer.getState().playTrack(q[0], q);
  eq('voltar a tocar a mesma não conta', saltos().length, 0);
}

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

// A ordem por sourceId não chega: uma playlist pode ter o videoclipe e o
// Official Audio da mesma música. Eram uploads diferentes e, por isso, o
// shuffle tocava o mesmo tema duas vezes antes de acabar os outros.
{
  const originais = Array.from({ length: 10 }, (_, i): Track => ({
    ...faixa(`tema-${i}-video`), title: `Tema ${i} (Official Video)`, artist: 'Artista',
  }));
  const copia0: Track = { ...faixa('tema-0-audio'), title: 'Tema 0 (Official Audio)', artist: 'Artista' };
  const copia1: Track = { ...faixa('tema-1-audio'), title: 'Tema 1 (Official Audio)', artist: 'Artista' };
  const comCopias = [originais[0], copia0, originais[1], copia1, ...originais.slice(2)];
  preparar({
    current: comCopias[0], queue: comCopias, queueIndex: 0,
    shuffle: true, shuffleOrder: comCopias.map(trackKey), autoplayRadio: false,
  });
  const ouvidas: string[] = [];
  for (let i = 0; i < 10; i++) {
    const faixaAtual = usePlayer.getState().current;
    if (faixaAtual) ouvidas.push(tituloDeIdentidade(faixaAtual.title));
    if (i < 9) await usePlayer.getState().next();
  }
  check('dez saltos de shuffle não repetem a mesma música noutro upload',
    new Set(ouvidas).size === 10, ouvidas.join(', '));
}

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
// Esta reprodução já existia antes da versão com memória própria. A primeira
// consulta ao Smart Shuffle tem de a trazer do histórico da conta.
controlo.recentes = [{
  ...faixa('march-antiga'), title: 'Future - March Madness (Official Audio)', artist: 'Future', lastPlayed: Date.now(),
}];
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

// REGRESSAO: o histórico antigo só guardava `youtube:sourceId`. A mesma música
// noutro upload passava por nova e podia aparecer todos os dias.
const maskOff = (id: string): Track => ({
  ...faixa(id), title: `Future - Mask Off (${id === 'mask-a' ? 'Official Video' : 'Official Audio'})`, artist: 'Future',
});
preparar({ shuffle: true, shuffleInteligente: true });
controlo.candidatas = [maskOff('mask-a')];
eq('a primeira Mask Off pode entrar', await usePlayer.getState().semearSugestoes(), 1);
check('a sugestão ficou persistida fora da sessão da fila',
  armazenamento.has('smart-shuffle:historico:v1:utilizador-de-teste'));
preparar({ shuffle: true, shuffleInteligente: true });
controlo.candidatas = [maskOff('mask-b')];
eq('outro upload de Mask Off fica bloqueado', await usePlayer.getState().semearSugestoes(), 0);
check('e não foi escondido na fila com outro id', !ids().includes('mask-b'), ids().join(','));
preparar({ shuffle: true, shuffleInteligente: true });
controlo.candidatas = [{
  ...faixa('march-nova'), title: 'Future - March Madness (Official Video)', artist: 'Future',
}];
eq('o histórico anterior à atualização também bloqueia outro upload',
  await usePlayer.getState().semearSugestoes(), 0);

// REGRESSAO (14/9): sugeria músicas já favoritas. A exclusão comparava só o
// upload, e a leitura das guardadas parava nas 1000 linhas. A favorita está
// aqui noutro upload, com o título escrito de outra maneira.
esquecerBiblioteca();
preparar({ shuffle: true, shuffleInteligente: true });
controlo.biblioteca = [{ ...faixa('lucid-topic'), title: 'Lucid Dreams', artist: 'Juice WRLD - Topic' }];
controlo.candidatas = [{
  ...faixa('lucid-video'), title: 'Juice WRLD - Lucid Dreams (Official Music Video)', artist: 'Juice WRLD',
}];
eq('uma favorita noutro upload não é sugerida', await usePlayer.getState().semearSugestoes(), 0);
preparar({ shuffle: true, shuffleInteligente: true });
controlo.candidatas = [{ ...faixa('robbery'), title: 'Juice WRLD - Robbery (Official Video)', artist: 'Juice WRLD' }];
eq('mas uma do mesmo artista que ele não tem entra', await usePlayer.getState().semearSugestoes(), 1);
esquecerBiblioteca();

// REGRESSAO (14/9): a memória dos 30 dias vivia só no aparelho. Uma sugestão
// saltada não conta como escuta e voltava no outro. O "PC" aqui é uma conta
// sem nada em memória, e a sugestão do "iPhone" está na conta.
preparar({ shuffle: true, shuffleInteligente: true });
controlo.sessao = 'conta-com-dois-aparelhos';
naConta.set('smart-shuffle:historico:v1', [{ em: Date.now(), chaves: ['youtube:do-iphone'] }]);
controlo.candidatas = [faixa('do-iphone')];
eq('uma sugestão feita noutro aparelho não volta', await usePlayer.getState().semearSugestoes(), 0);
preparar({ shuffle: true, shuffleInteligente: true });
controlo.sessao = 'conta-com-dois-aparelhos';
controlo.candidatas = [faixa('nova-no-pc')];
eq('uma sugestão nova entra', await usePlayer.getState().semearSugestoes(), 1);
await assentar();
{
  const guardadaNaConta = JSON.stringify(naConta.get('smart-shuffle:historico:v1'));
  check('e sobe para a conta sem apagar a do outro aparelho',
    guardadaNaConta.includes('youtube:nova-no-pc') && guardadaNaConta.includes('youtube:do-iphone'),
    guardadaNaConta);
}

// ===========================================================================
console.log('\na escolha do Smart Shuffle: pontuação e mínimo de confiança');
{
  const longe = { ancora: 'alguem', propria: false, posicaoNoCatalogo: 15, pontos: 1.9, ronda: 0 };
  preparar({ shuffle: true, shuffleInteligente: true });
  controlo.candidatas = [faixa('longe')];
  controlo.proveniencias.set('longe', longe);
  eq('um semelhante além do 10.º não entra na preparação', await usePlayer.getState().semearSugestoes(), 0);
  // Outra faixa: a anterior pode já estar na memória dos 30 dias.
  preparar({ shuffle: true, shuffleInteligente: true });
  controlo.candidatas = [faixa('longe-outra')];
  controlo.proveniencias.set('longe-outra', longe);
  eq('nem nas inserções seguintes', await usePlayer.getState().intercalarSugestao(), false);
  check('e a fila fica só com a lista', !ids().includes('longe-outra'), ids().join(','));

  const doAtual = chaveDeArtista(displayArtist(faixa('a')));
  preparar({ shuffle: true, shuffleInteligente: true });
  controlo.candidatas = [faixa('de-outro'), faixa('do-atual')];
  controlo.proveniencias.set('de-outro', { ancora: 'outra pessoa', propria: false, posicaoNoCatalogo: 1, pontos: 2, ronda: 0 });
  controlo.proveniencias.set('do-atual', { ancora: doAtual, propria: false, posicaoNoCatalogo: 3, pontos: 1, ronda: 0 });
  eq('a sugestão parte da música que está a tocar', await usePlayer.getState().intercalarSugestao(), true);
  eq('e é essa que entra a seguir, mesmo com menos pontos', ids()[1], 'do-atual');
}

// ===========================================================================
console.log('\no contexto real do Smart Shuffle');
// A fila física B,C,D não é o percurso ouvido B,F,D. Testa as chamadas reais
// à descoberta, não só um helper com a mesma implementação que a store.
{
  preparar({ autoplayRadio: false });
  const q = fila('a', 'b', 'c', 'd', 'e', 'f');
  await usePlayer.getState().playTrack(q[1], q);
  usePlayer.setState({ shuffle: true, shuffleOrder: ['b', 'f', 'd', 'a', 'c', 'e'].map(id => trackKey(faixa(id))) });
  usePlayer.getState()._onYtStateChange('playing');
  await usePlayer.getState().next();
  usePlayer.getState()._onYtStateChange('playing');
  await usePlayer.getState().next();
  usePlayer.getState()._onYtStateChange('playing');
  usePlayer.setState({ shuffleInteligente: true, desdeASugestao: 0 });
  const contexto = () => controlo.contextosDaDescoberta.at(-1)?.map(t => t.sourceId).join(',');
  await usePlayer.getState().semearSugestoes();
  eq('semear segue as últimas reproduções confirmadas B → F → D', contexto(), 'd,f,b');
  await usePlayer.getState().intercalarSugestao();
  eq('intercalar usa o mesmo contexto real', contexto(), 'd,f,b');

  // Alterar a fila não altera retroativamente o que se ouviu.
  usePlayer.getState().moveQueueItem(0, 5);
  await usePlayer.getState().semearSugestoes();
  eq('reordenar a fila mantém o contexto ouvido', contexto(), 'd,f,b');

  // Um salto manual no Up next não é um recuo por shuffleOrder. E uma faixa
  // abandonada antes de o motor confirmar som não entra no histórico.
  usePlayer.setState({ shuffleInteligente: false });
  await usePlayer.getState().playTrack(q[2], usePlayer.getState().queue);
  await usePlayer.getState().playTrack(q[0], usePlayer.getState().queue);
  usePlayer.getState()._onYtStateChange('playing');
  usePlayer.getState()._onYtStateChange('paused');
  usePlayer.getState()._onYtStateChange('playing');
  usePlayer.setState({ shuffleInteligente: true });
  await usePlayer.getState().semearSugestoes();
  eq('salto manual ignora C sem som e pausa/retoma não duplica A', contexto(), 'a,d,f');

  // No início só se conhece a faixa escolhida. Não adivinhar o passado pela
  // posição na nova lista; inclui também handoff e sessão restaurada.
  const outra = fila('x', 'y', 'z');
  await usePlayer.getState().playTrack(outra[2], outra);
  await usePlayer.getState().semearSugestoes();
  eq('nova lista começa só pela faixa escolhida, mesmo no índice 2', contexto(), 'z');
  usePlayer.getState()._onYtStateChange('playing');
  const remota = fila('r', 's', 't');
  usePlayer.getState().adoptSession({ track: remota[2], queue: remota, queueIndex: 2, positionMs: 50_000 });
  await usePlayer.getState().intercalarSugestao();
  eq('handoff não inventa as músicas anteriores do outro aparelho', contexto(), 't');
  usePlayer.getState()._onYtStateChange('playing');
  await usePlayer.getState().playTrack(remota[0], usePlayer.getState().queue);
  usePlayer.getState()._onYtStateChange('playing');
  controlo.sessao = 'outra-conta';
  await usePlayer.getState().semearSugestoes();
  eq('mudar de conta não reutiliza as escutas da anterior', contexto(), 'r');
  await usePlayer.getState().close();
  eq('fechar o player limpa a memória da sessão', usePlayer.getState().escutasDaSessao, null);
}

console.log('\no perfil que chega à descoberta');
{
  preparar({ shuffle: true, shuffleInteligente: true });
  controlo.artistasDoPerfil = [
    { name: 'Horizonte Novo', plays: 100, externo: true, artworkUrl: null },
    { name: 'Aurora Inicial', plays: 1, externo: true, artworkUrl: null },
    { name: '999', plays: 90, externo: false, artworkUrl: null },
  ];
  for (const acao of ['semearSugestoes', 'intercalarSugestao'] as const) {
    await usePlayer.getState()[acao]();
    const perfil = controlo.perfisDaDescoberta.at(-1);
    eq(`${acao}: preserva o nome e confiança do Spotify`, perfil?.externos?.get('horizonte novo'), 'Horizonte Novo');
    eq(`${acao}: preserva a escolha inicial`, perfil?.externos?.get('aurora inicial'), 'Aurora Inicial');
    eq(`${acao}: mantém o peso do perfil`, perfil?.escutas?.get('horizonte novo'), 100);
    check(`${acao}: histórico não recebe confiança externa`, !perfil?.externos?.has('999'));
    check(`${acao}: marca a descoberta como contexto de sessão`, perfil?.contextoDaSessao === true);
  }
  controlo.falharPerfil = true;
  const anteriores = controlo.chamadas.candidatas;
  await usePlayer.getState().semearSugestoes();
  eq('sem perfil continua a descobrir pelo contexto', controlo.chamadas.candidatas, anteriores + 1);
  eq('falha do perfil não reutiliza artistas externos anteriores', controlo.perfisDaDescoberta.at(-1)?.externos?.size ?? 0, 0);
}

console.log('\nas recomendações que chegam atrasadas');
{
  const adiar = () => {
    let entregar!: (faixas: Track[]) => void;
    const resposta = new Promise<Track[]>(resolve => { entregar = resolve; });
    controlo.candidatasPendentes.push(resposta);
    return entregar;
  };
  const comecar = async (id: string) => {
    preparar({ shuffle: true, shuffleInteligente: true, autoplayRadio: false });
    const q = fila(`${id}-a`, `${id}-b`, `${id}-c`);
    await usePlayer.getState().playTrack(q[0], q);
    usePlayer.setState({ shuffleOrder: q.map(trackKey), desdeASugestao: 0 });
    return q;
  };

  for (const acao of ['semearSugestoes', 'intercalarSugestao'] as const) {
    for (const mudanca of ['lista', 'handoff', 'fecho', 'modo'] as const) {
      const q = await comecar(`${acao}-${mudanca}`);
      const entregar = adiar();
      const pendente = usePlayer.getState()[acao]();
      await assentar();
      eq(`${acao}/${mudanca}: pedido chegou à descoberta`, controlo.chamadas.candidatas, 1);
      const nova = fila(`${acao}-${mudanca}-nova`);
      if (mudanca === 'lista') await usePlayer.getState().playTrack(nova[0], nova);
      if (mudanca === 'handoff') usePlayer.getState().adoptSession({ track: nova[0], queue: nova, queueIndex: 0, positionMs: 1000 });
      if (mudanca === 'fecho') {
        await usePlayer.getState().close();
        await usePlayer.getState().playTrack(q[0], q);
      }
      if (mudanca === 'modo') {
        usePlayer.getState().setShuffle(false);
        usePlayer.getState().setShuffle(true);
      }
      const antes = ids().join(',');
      const atrasada = faixa(`${acao}-${mudanca}-atrasada`);
      entregar([atrasada]);
      eq(`${acao}/${mudanca}: resposta antiga é descartada`, Boolean(await pendente), false);
      eq(`${acao}/${mudanca}: a fila atual fica intacta`, ids().join(','), antes);
      check(`${acao}/${mudanca}: não marca a faixa como sugerida`, !usePlayer.getState().sugeridas.includes(trackKey(atrasada)));
    }

    // Avançar e reordenar dentro da mesma sessão continua a aceitar a resposta.
    await comecar(`${acao}-continua`);
    const entregar = adiar();
    const pendente = usePlayer.getState()[acao]();
    await assentar();
    await usePlayer.getState().next();
    usePlayer.getState().moveQueueItem(0, 2);
    const aTocar = atual();
    const nova = faixa(`${acao}-sugestao-valida`);
    entregar([nova]);
    eq(`${acao}: next e reordenação na mesma lista aceitam a sugestão`, Boolean(await pendente), true);
    check(`${acao}: sugestão válida fica na fila`, ids().includes(nova.sourceId));
    eq(`${acao}: chegada da sugestão não interrompe a reprodução`, atual(), aTocar);

    await comecar(`${acao}-duplicado`);
    const entregarDuplicada = adiar();
    const duplicada = usePlayer.getState()[acao]();
    await assentar();
    const candidata = faixa(`${acao}-mesma-musica`);
    usePlayer.getState().addToQueue({ ...candidata, sourceId: `${acao}-outro-upload` });
    entregarDuplicada([candidata]);
    eq(`${acao}: relê identidades acrescentadas à fila durante a procura`, Boolean(await duplicada), false);
    check(`${acao}: não insere outra cópia da música entretanto acrescentada`, !ids().includes(candidata.sourceId));
  }

  // O gesto de mudar de lista vem antes da resolução da fonte. Invalidar no
  // gesto e na instalação evita aceitar pedidos feitos durante essa espera.
  await comecar('fonte-em-resolucao');
  const entregarAntesDoGesto = adiar();
  const antesDoGesto = usePlayer.getState().intercalarSugestao();
  await assentar();
  let resolverFonte!: (faixa: Track) => void;
  controlo.alternativaPendente = new Promise(resolve => { resolverFonte = resolve; });
  const outraFonte = fila('fonte-nova');
  const troca = usePlayer.getState().playTrack(outraFonte[0], outraFonte);
  entregarAntesDoGesto([faixa('resultado-anterior-ao-gesto')]);
  eq('mudar de lista invalida logo, antes de a fonte nova resolver', await antesDoGesto, false);
  const entregarDurante = adiar();
  const durante = usePlayer.getState().intercalarSugestao();
  await assentar();
  resolverFonte(outraFonte[0]);
  await troca;
  controlo.alternativaPendente = null;
  entregarDurante([faixa('resultado-durante-a-troca')]);
  eq('instalar a lista descarta pedidos feitos durante a resolução', await durante, false);
  eq('a nova lista não recebe resultados do intervalo de troca', ids().join(','), 'fonte-nova');

  // Uma procura abandonada não bloqueia a lista nova; o finally antigo não
  // pode libertar a vaga ocupada pelo pedido novo e permitir uma terceira ida.
  await comecar('pedido-antigo');
  const entregarAntiga = adiar();
  const antiga = usePlayer.getState().intercalarSugestao();
  await assentar();
  const novaFila = fila('pedido-novo-a', 'pedido-novo-b');
  await usePlayer.getState().playTrack(novaFila[0], novaFila);
  const entregarNova = adiar();
  const nova = usePlayer.getState().intercalarSugestao();
  await assentar();
  eq('lista nova começa a procurar sem esperar pela resposta antiga', controlo.chamadas.candidatas, 2);
  entregarAntiga([faixa('resultado-da-lista-antiga')]);
  eq('resposta antiga é descartada enquanto a nova está pendente', await antiga, false);
  const terceira = usePlayer.getState().intercalarSugestao();
  await assentar();
  eq('finally antigo não liberta o pedido novo ainda em curso', controlo.chamadas.candidatas, 2);
  entregarNova([faixa('resultado-da-lista-nova')]);
  eq('pedido da lista nova consegue inserir', await nova, true);
  eq('não começa uma terceira procura concorrente', await terceira, false);
  check('só entra o resultado da lista nova', ids().includes('resultado-da-lista-nova') && !ids().includes('resultado-da-lista-antiga'));

  // O next agenda a descoberta 2 s depois: tanto o timer como o seu callback
  // de falha pertencem à sessão que os criou.
  await comecar('timer-antigo');
  usePlayer.setState({ desdeASugestao: 4 });
  await usePlayer.getState().next();
  const aposTimer = fila('outra-lista-antes-do-timer');
  await usePlayer.getState().playTrack(aposTimer[0], aposTimer);
  usePlayer.setState({ desdeASugestao: 7 });
  await esperarUmTique();
  eq('timer da lista antiga não inicia uma procura na nova', controlo.chamadas.candidatas, 0);
  eq('timer antigo não apaga o contador da nova lista', usePlayer.getState().desdeASugestao, 7);

  await comecar('timer-com-resposta');
  const entregarTimer = adiar();
  usePlayer.setState({ desdeASugestao: 4 });
  await usePlayer.getState().next();
  await esperarUmTique();
  eq('pedido agendado começou na lista original', controlo.chamadas.candidatas, 1);
  const aposPedido = fila('outra-lista-durante-o-pedido');
  await usePlayer.getState().playTrack(aposPedido[0], aposPedido);
  usePlayer.setState({ desdeASugestao: 7 });
  entregarTimer([]);
  await assentar();
  eq('conclusão tardia não apaga o contador da nova lista', usePlayer.getState().desdeASugestao, 7);
}

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

// ===========================================================================
console.log('\nquando uma reprodução conta');
// ===========================================================================

// A regra está testada em scripts/test-contagem-de-escuta.ts. Aqui prova-se a
// LIGAÇÃO: que o `playTrack` já não conta no clique e que o `_setProgress` --
// por onde passam os três motores -- conta no limiar. O `_setProgress` lê o
// relógio a sério, por isso a faixa tem 2 s (limiar de 1 s) e as leituras vão
// com o tempo real.
const curta = (id: string): Track => ({ ...faixa(id), durationSeconds: 2 });
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ler = (ms: number) => usePlayer.getState()._setProgress(ms, 2000);

preparar();
await usePlayer.getState().playTrack(curta('k1'), [curta('k1')], false, false,
  { surface: 'smart_shuffle', reasonCode: 'session_discovery', reason: 'teste' });
usePlayer.getState()._setIsPlaying(true);
eq('o clique já não conta', controlo.contagens.plays.length, 0);
eq('mas o início fica registado', controlo.contagens.inicios.join(), 'k1');
ler(0);
await esperar(400); ler(400);
eq('a 400 ms de 2 s ainda não conta', controlo.contagens.plays.length, 0);
await esperar(700); ler(1100);
eq('passada a metade, conta', controlo.contagens.plays.join(), 'k1');
eq('nas duas contagens', controlo.contagens.locais.join(), 'k1');
eq('e a recomendação ouvida alivia a aprendizagem', controlo.aprendizagem.escutas.join(), 'k1');
await esperar(500); ler(1600);
eq('e uma vez só', controlo.contagens.plays.length, 1);

preparar();
await usePlayer.getState().playTrack(curta('k2'), [curta('k2')]);
usePlayer.getState()._setIsPlaying(true);
ler(0);
await esperar(100); ler(1900);
await esperar(100); ler(2000);
eq('arrastar a barra até ao fim não conta', controlo.contagens.plays.length, 0);

preparar({ current: null, queue: [], queueIndex: 0 });
usePlayer.getState().adoptSession({ track: curta('k3'), queue: [curta('k3')], queueIndex: 0, positionMs: 1200 });
usePlayer.getState()._setIsPlaying(true);
ler(1200);
await esperar(600); ler(1800);
eq('um handoff a 60% já contou no outro dispositivo', controlo.contagens.plays.length, 0);

preparar({ current: null, queue: [], queueIndex: 0 });
usePlayer.getState().adoptSession({ track: curta('k4'), queue: [curta('k4')], queueIndex: 0, positionMs: 300 });
usePlayer.getState()._setIsPlaying(true);
ler(300);
await esperar(900); ler(1200);
eq('um handoff a 15% conta aqui quando passa a metade', controlo.contagens.plays.join(), 'k4');

// ===========================================================================
console.log('\no padrão que chega de outro aparelho');
// ===========================================================================

// REGRESSAO (14/9): a velocidade das Definições não passava do iPhone para o
// PC. Com uma faixa carregada, a chegada de uma edição só gravava a memória.
preparar({
  playbackRate: 1.3, padraoRate: 1,
  ajustesPorFaixa: { 'youtube:a': { rate: 1.3, ganhos: null, visto: 1 } },
});
usePlayer.getState()._carregarPadrao({
  'youtube:a': { rate: 1.3, ganhos: null, visto: 1 },
  'padrao:global': { rate: 0.8, ganhos: null, visto: 2 },
});
eq('a velocidade padrão chega', usePlayer.getState().padraoRate, 0.8);
eq('a faixa que toca não muda a meio', usePlayer.getState().playbackRate, 1.3);
usePlayer.getState()._carregarPadrao({ 'youtube:a': { rate: 1.3, ganhos: null, visto: 1 } });
eq('sem padrão na conta, fica o que já cá estava', usePlayer.getState().padraoRate, 0.8);

// ===========================================================================
console.log('\ntocar numa música abre o leitor');
// ===========================================================================
preparar({ expanded: false });
await usePlayer.getState().playTrack(faixa('c'), undefined, true);
eq('uma lista que pede (shouldExpand) abre o leitor', usePlayer.getState().expanded, true);
preparar({ expanded: false });
await usePlayer.getState().next();
eq('o seguinte não abre nada', usePlayer.getState().expanded, false);
preparar({ expanded: false });
await usePlayer.getState().playTrack(faixa('c'));
eq('sem o pedido fica fechado', usePlayer.getState().expanded, false);

// ===========================================================================
console.log('\nsem rede, a fila só pára no que está no telemóvel');
// ===========================================================================
// No telemóvel estão a 'a' e a 'd' (docs/PLANO-OFFLINE-SOCIAL-DESCOBERTA-PC.md).
definirPodeTocarSemRede((t) => t.sourceId === 'a' || t.sourceId === 'd');
preparar();
controlo.offline = true;
await usePlayer.getState().next();
eq('next salta a b e a c', atual(), 'd');
eq('no fim da fila, sem mais nada no telemóvel, não há seguinte', usePlayer.getState().peekNextTrack()?.sourceId ?? null, null);
await usePlayer.getState().prev();
eq('prev volta pela mesma regra', atual(), 'a');
eq('a seguinte a pré-carregar (crossfade) também salta', usePlayer.getState().peekNextTrack()?.sourceId, 'd');
controlo.offline = false;
eq('com rede volta a ser a seguinte', usePlayer.getState().peekNextTrack()?.sourceId, 'b');
preparar({ current: faixa('b'), queueIndex: 1, isPlaying: false });
controlo.offline = true;
eq('sessão restaurada numa faixa fora do telemóvel muda', usePlayer.getState().ajustarSessaoSemRede(), true);
eq('para a primeira da fila que está no telemóvel', atual(), 'd');
eq('e o índice acompanha', usePlayer.getState().queueIndex, 3);
eq('e não volta a mexer se já está numa que toca', usePlayer.getState().ajustarSessaoSemRede(), false);
preparar({ current: faixa('b'), queueIndex: 1, isPlaying: false });
eq('com rede, a sessão restaurada fica onde estava', usePlayer.getState().ajustarSessaoSemRede(), false);
definirPodeTocarSemRede(null);

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
