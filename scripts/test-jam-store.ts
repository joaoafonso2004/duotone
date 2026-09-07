import assert from 'node:assert/strict';
import { registarOuvirJuntos, usePlayer } from '../src/state/player.ts';
import type { Track } from '../src/types.ts';
import { proximaFaixa, decisaoDeControlo, restoDaLista, velocidadeNaSessao, assinaturaDaSessao, baralhada, type PonteJam } from '../src/lib/jam.ts';
import { closePlayerSmoothly, confirmaSwipe } from '../src/lib/closePlayer.ts';
import { seguirSessao } from '../src/lib/seguirSessao.ts';
import type { SessaoDeEscuta } from '../src/api/ouvirJuntos.ts';

const faixa = (sourceId: string): Track => ({ source: 'youtube', sourceId,
  title: sourceId, artist: 'Teste', album: null, artworkUrl: null, durationSeconds: 180 });
const actual = faixa('actual'), escolhida = faixa('escolhida');
let sugeridas: Track[] = [], anunciadas: Track[] = [], pausas = 0, saltos: number[] = [];
let semeadas: Track[][] = [];
let avancos = 0, erros = 0, saidas = 0;
let ponte: PonteJam | null;
const limpar = () => {
  sugeridas = []; anunciadas = []; pausas = 0; saltos = []; avancos = 0; erros = 0; saidas = 0;
  semeadas = [];
  ponte = {
    sessao: { id: 'jam' }, fila: [{ track: escolhida }], anfitriao: false, convidadosControlam: false,
    temFaixa: true,
    sugerir: async t => { sugeridas.push(t); }, anunciarFaixa: async t => { anunciadas.push(t); },
    semearFila: async ts => { semeadas.push([...ts]); },
    alternarPausa: async () => { pausas++; }, procurar: async ms => { saltos.push(ms); },
    avancar: async automatico => { if (ponte && (automatico ? ponte.anfitriao : decisaoDeControlo(ponte) === 'anunciar')) avancos++; },
    sairAoFechar: async () => { saidas++; ponte = null; return true; }, avisarErro: () => { erros++; },
  };
  usePlayer.setState({ current: actual, queue: [actual, faixa('local')], queueIndex: 0,
    repeatMode: 'off', shuffle: false, closing: false, closeGain: 1, autoplayRadio: false,
    _yt: null, positionMs: 0, durationMs: 180_000 });
};
registarOuvirJuntos(() => ponte);
limpar();
await usePlayer.getState().playShuffled([escolhida]);
assert.equal(usePlayer.getState().current?.sourceId, 'actual', 'Play com shuffle do convidado não pode trocar a faixa local');
assert.deepEqual(sugeridas, [escolhida]);
assert.equal(usePlayer.getState().shuffle, false, 'sugerir não muda preferências locais');

for (const anfitriao of [false, true]) for (const convidadosControlam of [false, true]) {
  limpar(); Object.assign(ponte!, { anfitriao, convidadosControlam });
  const controla = anfitriao || convidadosControlam;
  assert.equal(decisaoDeControlo(ponte), controla ? 'anunciar' : 'sugerir');
  await usePlayer.getState().playTrack(escolhida);
  assert.deepEqual(controla ? anunciadas : sugeridas, [escolhida]);
  assert.equal(usePlayer.getState().current, actual, 'espera pela faixa confirmada pelo servidor');
  await usePlayer.getState().togglePlay();
  await usePlayer.getState().seekTo(12000);
  await usePlayer.getState().next();
  assert.equal(pausas, controla ? 1 : 0);
  assert.deepEqual(saltos, controla ? [12000] : []);
  assert.equal(avancos, controla ? 1 : 0);
  usePlayer.getState()._onYtStateChange('ended');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(avancos, (controla ? 1 : 0) + (anfitriao ? 1 : 0), 'só o anfitrião avança automaticamente');
}

limpar();
assert.equal(usePlayer.getState().proximaFaixa(), escolhida);
ponte!.fila = [];
usePlayer.setState({ repeatMode: 'all', shuffle: true });
assert.equal(usePlayer.getState().proximaFaixa(), null, 'Jam vazio nunca recorre à fila pessoal');
let leiturasLocais = 0;
assert.equal(proximaFaixa({ fila: [] }, () => { leiturasLocais++; return actual; }), null);
assert.equal(leiturasLocais, 0);
assert.equal(proximaFaixa(null, () => actual), actual);
assert.equal(decisaoDeControlo(null), 'local');

for (const acao of ['playNext', 'addToQueue'] as const) {
  limpar(); usePlayer.setState({ current: null, queue: [] });
  usePlayer.getState()[acao](escolhida);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(usePlayer.getState().current, null, `${acao} não inicia uma audição privada`);
  assert.deepEqual(sugeridas, [escolhida]);
}

limpar(); ponte!.sugerir = async () => { throw new Error('sem rede'); };
await usePlayer.getState().playTrack(escolhida);
assert.equal(usePlayer.getState().current, actual);
assert.equal(erros, 1, 'a falha de sugestão é visível e não cai em play local');
limpar(); ponte!.anfitriao = true; ponte!.anunciarFaixa = async () => { throw new Error('permissão revogada'); };
await usePlayer.getState().playTrack(escolhida);
assert.equal(usePlayer.getState().current, actual);
assert.equal(erros, 1);

limpar();
usePlayer.getState().adoptSession({ track: escolhida, queue: [escolhida], queueIndex: 0, positionMs: 1000 });
usePlayer.getState().removeFromQueue(0);
assert.equal(usePlayer.getState().current, actual, 'handoff e remoção local não substituem a faixa Jam');
await usePlayer.getState().playTrack(escolhida, [escolhida], false, true);
assert.equal(usePlayer.getState().current, escolhida, 'a faixa recebida da sessão é aplicada');
usePlayer.getState()._sincronizarPausa(false);
assert.equal(usePlayer.getState().isPlaying, false);
assert.equal(usePlayer.getState().autoplayOnLoad, false, 'um download que termine depois da pausa não arranca');
usePlayer.getState()._sincronizarPausa(true);
assert.equal(usePlayer.getState().autoplayOnLoad, true);
assert.equal(anunciadas.length, 0, 'aplicar estado remoto não o volta a anunciar');

limpar(); ponte!.sairAoFechar = async () => false;
await closePlayerSmoothly();
assert.equal(usePlayer.getState().current, actual, 'cancelar o fecho mantém a música');
assert.equal(usePlayer.getState().closeGain, 1, 'o diálogo vem antes do fade');
assert.ok(ponte);
limpar();
const fecho1 = closePlayerSmoothly(), fecho2 = closePlayerSmoothly();
assert.equal(fecho1, fecho2, 'botão e swipe partilham o mesmo fecho pendente');
await fecho1;
assert.equal(saidas, 1);
assert.equal(ponte, null);
assert.equal(usePlayer.getState().current, null);
limpar(); usePlayer.setState({ current: null, queue: [] });
await closePlayerSmoothly();
assert.equal(saidas, 1, 'sai também de uma sessão ainda sem música');
limpar(); ponte!.sairAoFechar = async () => { throw new Error('offline'); };
await usePlayer.getState().close();
assert.equal(usePlayer.getState().current, actual, 'falhar a saída mantém o Jam visível');
assert.equal(erros, 1);
assert.equal(confirmaSwipe(200, 5, 0, 350), true);
assert.equal(confirmaSwipe(5, 200, 0, 350), false);

// O anfitrião obedece a uma escolha do convidado, com o mesmo caminho de
// aplicação usado pelo hook. Pausas e seeks recebidos nunca geram anúncios.
const confirmada: SessaoDeEscuta = { id: 'jam', hostId: 'host', track: escolhida,
  comecouEmServidor: Date.now(), aTocar: true, pausadaEmMs: 0, convidadosControlam: true, acabouEm: null };
let vigente = true;
const porta = { player: usePlayer.getState, vigente: () => vigente,
  posicaoAgora: () => 42000, guardarRetoma: (ms: number) => usePlayer.setState({ resumePositionMs: ms }) };
for (const anfitriao of [true, false]) {
  limpar(); ponte!.anfitriao = anfitriao;
  await seguirSessao(confirmada, null, porta);
  assert.equal(usePlayer.getState().current, escolhida);
  assert.equal(usePlayer.getState().isPlaying, true);
  assert.deepEqual(anunciadas, []);
  await seguirSessao({ ...confirmada, aTocar: false, pausadaEmMs: 42000 }, confirmada, porta);
  assert.equal(usePlayer.getState().isPlaying, false);
  assert.equal(usePlayer.getState().positionMs, 42000);
  assert.equal(usePlayer.getState().resumePositionMs, 42000);
  assert.equal(pausas, 0); assert.deepEqual(saltos, []);
}
limpar(); vigente = false;
await seguirSessao(confirmada, null, porta);
assert.equal(usePlayer.getState().current, actual, 'uma sessão abandonada não reabre o player');
vigente = true;
limpar();
const entradaPausada = seguirSessao({ ...confirmada, aTocar: false }, null, porta);
assert.equal(usePlayer.getState().autoplayOnLoad, false, 'entrar em pausa não deixa o primeiro render arrancar áudio em cache');
await entradaPausada;
limpar();
// A leitura da posição pode chegar depois de outra faixa: não se aplica a velha.
const tocar = usePlayer.getState().playTrack;
usePlayer.setState({ playTrack: async (...args) => { await tocar(...args); vigente = false; } });
await seguirSessao({ ...confirmada, aTocar: false, pausadaEmMs: 42000 }, null, porta);
assert.equal(usePlayer.getState().resumePositionMs, null, 'uma aplicação invalidada durante o play não força seek');
usePlayer.setState({ playTrack: tocar }); vigente = true;

// ---- o resto da lista vai atras da faixa tocada ---------------------------
{
  const a = faixa('a'), b = faixa('b'), c = faixa('c');
  assert.deepEqual(restoDaLista([a, b, c], a).map(t => t.sourceId), ['b', 'c']);
  assert.deepEqual(restoDaLista([a, b, c], b).map(t => t.sourceId), ['c'],
    'dar play a meio leva o resto, nao o album todo outra vez');
  assert.deepEqual(restoDaLista([a, b, c], c), [], 'a ultima nao arrasta nada');
  assert.deepEqual(restoDaLista([a, b], faixa('fora')).map(t => t.sourceId), ['a', 'b'],
    'sem a tocada la dentro, a lista inteira e o que vem a seguir');
  assert.deepEqual(restoDaLista(undefined, a), []);
  assert.deepEqual(restoDaLista([a], a), [], 'uma musica sozinha nao se semeia a si propria');
  // A tocada nao pode entrar pela porta das traseiras e tocar duas vezes.
  assert.deepEqual(restoDaLista([a, b, a], a).map(t => t.sourceId), ['b']);
  assert.equal(restoDaLista(Array.from({ length: 250 }, (_, i) => faixa('f' + i)), a).length, 100,
    'o limite do cliente e o mesmo do servidor');
}

// ---- a velocidade dentro da sessao ----------------------------------------
assert.equal(velocidadeNaSessao(0.9, true), 1, 'acompanhado anda-se a 1x');
assert.equal(velocidadeNaSessao(1.25, true), 1);
assert.equal(velocidadeNaSessao(0.9, false), 0.9, 'sozinho a preferencia manda');

// ---- dar play numa playlist enche a fila partilhada ------------------------
limpar();
ponte!.anfitriao = true;
await usePlayer.getState().playTrack(escolhida, [actual, escolhida, faixa('d'), faixa('e')]);
assert.deepEqual(anunciadas.map(t => t.sourceId), ['escolhida'], 'a tocada e anunciada');
assert.deepEqual(semeadas[0]?.map(t => t.sourceId), ['d', 'e'],
  'o que vem depois dela entra na fila de toda a gente');

// Sem licenca, tocar numa musica propoe UMA, e nao a playlist de onde saiu.
limpar();
ponte!.anfitriao = false; ponte!.convidadosControlam = false;
await usePlayer.getState().playTrack(escolhida, [actual, escolhida, faixa('d')]);
assert.deepEqual(sugeridas.map(t => t.sourceId), ['escolhida']);
assert.equal(semeadas.length, 0, 'encher a fila dos outros sem autorizacao nao e sugerir');

// Com a licenca ligada, o convidado ja pode.
limpar();
ponte!.convidadosControlam = true;
await usePlayer.getState().playTrack(escolhida, [actual, escolhida, faixa('d')]);
assert.deepEqual(semeadas[0]?.map(t => t.sourceId), ['d']);


// ---- retomar re-ancora toda a gente ---------------------------------------
//
// O `retomar_sessao` mexe no `started_at` e deixa o `paused_position_ms`
// quieto. Enquanto o teste do comando de posicao exigia `anterior.aTocar`,
// retomar nao contava como comando e NINGUEM saltava: cada telemovel
// despausava quando o seu evento chegava, e a diferenca ficava la o resto da
// faixa. Ora um a frente, ora o outro -- conforme a rede do dia.
limpar();
usePlayer.setState({ current: escolhida, resumePositionMs: null });
const emPausa: SessaoDeEscuta = { ...confirmada, aTocar: false, pausadaEmMs: 30000 };
const retomada: SessaoDeEscuta = { ...emPausa, aTocar: true, comecouEmServidor: Date.now() + 5000 };
await seguirSessao(retomada, emPausa, porta);
assert.equal(usePlayer.getState().resumePositionMs, 42000,
  'retomar e um comando de posicao: toda a gente re-ancora no servidor');

// Uma faixa nova a tocar continua a NAO saltar: os dois arrancam do zero ao
// mesmo tempo, e meter o relogio na conta so introduzia erro.
limpar();
usePlayer.setState({ current: escolhida, resumePositionMs: null });
await seguirSessao(confirmada, { ...confirmada, track: actual }, porta);
assert.equal(usePlayer.getState().resumePositionMs, null, 'faixa nova a tocar arranca do zero, sem seek');

// ---- a ordem vai ao motor mesmo quando a intencao ja concorda --------------
//
// O `isPlaying` e a INTENCAO, nao "o motor esta a dar som". Depois de uma
// faixa acabar sozinha a intencao continua "tocar", e era por isso que o
// convidado ficava nos 0:00: a confirmacao chegava com aTocar=true, igual a
// intencao, e o `_sincronizarPausa` saia pela guarda sem chamar play().
{
  let plays = 0, pauses = 0;
  usePlayer.setState({ _yt: { play: () => { plays++; }, pause: () => { pauses++; },
    seek: () => {}, setVolume: () => {} } as never });
  usePlayer.getState()._sincronizarPausa(true);
  const comGuarda = plays;
  usePlayer.getState()._forcarReproducao(true);
  assert.equal(plays, comGuarda + 1, 'forcar manda sempre, mesmo com a intencao ja de acordo');
  usePlayer.getState()._forcarReproducao(false);
  assert.equal(pauses, 1);
  usePlayer.setState({ _yt: null });
}


// ---- o caminho INTEIRO da mudanca automatica, do lado do convidado ---------
//
// O teste acima prova o contrato do `_forcarReproducao`. Este prova o BUG:
// a sequencia real que deixava o convidado nos 0:00, do `ended` ate a
// confirmacao da faixa nova. Se alguem repuser a guarda, falha aqui.
{
  limpar();
  ponte!.anfitriao = false; ponte!.convidadosControlam = false;
  let plays = 0;
  usePlayer.setState({ _yt: { play: () => { plays++; }, pause: () => {},
    seek: () => {}, setVolume: () => {} } as never });

  // 1. o convidado esta a ouvir a faixa actual, a tocar.
  usePlayer.setState({ current: actual });
  usePlayer.getState()._sincronizarPausa(true);
  assert.equal(usePlayer.getState().isPlaying, true);

  // 2. a faixa acaba sozinha. No convidado o `avancar` nao faz nada -- quem
  //    avanca e o anfitriao -- e a INTENCAO fica em "tocar", como deve.
  usePlayer.getState()._onYtStateChange('ended');
  assert.equal(avancos, 0, 'o convidado nao avanca a sessao');
  assert.equal(usePlayer.getState().isPlaying, true,
    'a intencao sobrevive ao fim da faixa: quem ouvia continua a querer ouvir');

  // 3. o anfitriao avanca e a confirmacao chega com a faixa nova, a tocar.
  const antes = plays;
  await seguirSessao(confirmada, { ...confirmada, track: actual }, porta);

  // 4. o motor TEM de ter recebido a ordem. Era exactamente isto que faltava:
  //    aTocar=true era igual a intencao que ja la estava, a guarda do
  //    `_sincronizarPausa` fechava a porta, e so pausar e retomar curava.
  assert.equal(usePlayer.getState().current?.sourceId, escolhida.sourceId);
  assert.ok(plays > antes,
    'a confirmacao da faixa nova manda o motor tocar, mesmo com a intencao ja de acordo');
  usePlayer.setState({ _yt: null });
}


// ---- encher a fila nao pode cancelar a faixa a meio -------------------------
//
// Cada leitura do servidor devolve um objecto NOVO, e ha uma leitura depois de
// cada comando. Comparar por identidade fazia o `vigente()` dizer "ja nao e a
// mesma sessao" enquanto o audio ainda carregava, e a aplicacao desistia sem
// mandar tocar: faixa nova no ecra, faixa velha no ouvido.
{
  const lida = (): SessaoDeEscuta => ({ ...confirmada });
  const a = lida(), b = lida();
  assert.notEqual(a, b, 'sao objectos diferentes, como vem do servidor');
  assert.equal(assinaturaDaSessao(a), assinaturaDaSessao(b),
    'mesmos valores, mesma assinatura -- reler nao invalida nada');

  // O que MUDA o audio tem de mudar a assinatura.
  assert.notEqual(assinaturaDaSessao({ ...a, track: actual }), assinaturaDaSessao(a), 'faixa');
  assert.notEqual(assinaturaDaSessao({ ...a, aTocar: false }), assinaturaDaSessao(a), 'pausa');
  assert.notEqual(assinaturaDaSessao({ ...a, comecouEmServidor: a.comecouEmServidor + 1 }),
    assinaturaDaSessao(a), 'ancora nova');
  assert.notEqual(assinaturaDaSessao({ ...a, pausadaEmMs: 999 }), assinaturaDaSessao(a), 'seek');
  assert.equal(assinaturaDaSessao(null), null);

  // E o que NAO muda o audio nao pode mexer nela: acrescentar a fila e o caso.
  assert.equal(assinaturaDaSessao({ ...a, convidadosControlam: !a.convidadosControlam }),
    assinaturaDaSessao(a), 'dar controlo nao interrompe o que esta a dar');
}


// ---- Play numa lista dentro do jam nao apaga o que esta a dar --------------
{
  const a = faixa('la'), b = faixa('lb'), c = faixa('lc');

  // Com musica a dar, a lista vai para a fila e ninguem e interrompido.
  limpar(); ponte!.anfitriao = true; ponte!.temFaixa = true;
  await usePlayer.getState().tocarLista([a, b, c], false);
  assert.equal(anunciadas.length, 0, 'Play numa lista nao interrompe quem esta a ouvir');
  assert.deepEqual(semeadas[0]?.map(t => t.sourceId), ['la', 'lb', 'lc'],
    'a lista inteira entra na fila, a primeira incluida');

  // Sessao parada e sem faixa: ai Play quer mesmo dizer play.
  limpar(); ponte!.anfitriao = true; ponte!.temFaixa = false;
  await usePlayer.getState().tocarLista([a, b, c], false);
  assert.deepEqual(anunciadas.map(t => t.sourceId), ['la']);
  assert.deepEqual(semeadas[0]?.map(t => t.sourceId), ['lb', 'lc']);

  // Um convidado sem licenca nunca anuncia, mesmo com a sessao parada.
  limpar(); ponte!.anfitriao = false; ponte!.convidadosControlam = false; ponte!.temFaixa = false;
  await usePlayer.getState().tocarLista([a, b, c], false);
  assert.equal(anunciadas.length, 0);
  assert.deepEqual(semeadas[0]?.map(t => t.sourceId), ['la', 'lb', 'lc']);

  // Com aleatorio, entra a lista toda -- baralhada, sem perder nem repetir.
  limpar(); ponte!.anfitriao = true; ponte!.temFaixa = true;
  await usePlayer.getState().tocarLista([a, b, c], true);
  assert.deepEqual([...(semeadas[0] ?? [])].map(t => t.sourceId).sort(), ['la', 'lb', 'lc']);
}

// ---- baralhar nao perde nem repete -----------------------------------------
{
  const lista = Array.from({ length: 40 }, (_, i) => 'n' + i);
  // Gerador fixo: o teste nao pode depender da sorte do dia.
  let semente = 1;
  const rng = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
  const saida = baralhada(lista, rng);
  assert.equal(saida.length, lista.length);
  assert.deepEqual([...saida].sort(), [...lista].sort(), 'e uma permutacao, nao uma amostra');
  assert.notDeepEqual(saida, lista, 'e mesmo baralhada');
  assert.deepEqual(lista, Array.from({ length: 40 }, (_, i) => 'n' + i), 'a lista de entrada nao e tocada');
}


registarOuvirJuntos(() => null);
await usePlayer.getState().playTrack(actual, [actual, escolhida]);
assert.equal(usePlayer.getState().proximaFaixa(), escolhida);
await usePlayer.getState().next();
assert.equal(usePlayer.getState().current?.sourceId, escolhida.sourceId, 'a audição individual continua a avançar');
console.log('Jam: fila, permissões, shuffle, comandos, falhas, pausa e fecho verificados.');
