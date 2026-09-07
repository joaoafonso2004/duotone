import assert from 'node:assert/strict';
import { registarOuvirJuntos, usePlayer } from '../src/state/player.ts';
import type { Track } from '../src/types.ts';
import { proximaFaixa, decisaoDeControlo, type PonteJam } from '../src/lib/jam.ts';
import { closePlayerSmoothly, confirmaSwipe } from '../src/lib/closePlayer.ts';
import { seguirSessao } from '../src/lib/seguirSessao.ts';
import type { SessaoDeEscuta } from '../src/api/ouvirJuntos.ts';

const faixa = (sourceId: string): Track => ({ source: 'youtube', sourceId,
  title: sourceId, artist: 'Teste', album: null, artworkUrl: null, durationSeconds: 180 });
const actual = faixa('actual'), escolhida = faixa('escolhida');
let sugeridas: Track[] = [], anunciadas: Track[] = [], pausas = 0, saltos: number[] = [];
let avancos = 0, erros = 0, saidas = 0;
let ponte: PonteJam | null;
const limpar = () => {
  sugeridas = []; anunciadas = []; pausas = 0; saltos = []; avancos = 0; erros = 0; saidas = 0;
  ponte = {
    sessao: { id: 'jam' }, fila: [{ track: escolhida }], anfitriao: false, convidadosControlam: false,
    sugerir: async t => { sugeridas.push(t); }, anunciarFaixa: async t => { anunciadas.push(t); },
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

registarOuvirJuntos(() => null);
await usePlayer.getState().playTrack(actual, [actual, escolhida]);
assert.equal(usePlayer.getState().proximaFaixa(), escolhida);
await usePlayer.getState().next();
assert.equal(usePlayer.getState().current?.sourceId, escolhida.sourceId, 'a audição individual continua a avançar');
console.log('Jam: fila, permissões, shuffle, comandos, falhas, pausa e fecho verificados.');
