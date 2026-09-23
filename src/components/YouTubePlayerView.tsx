import { atualizarVelocidadeDoMotor, tocarNaVelocidade } from '../lib/velocidadeDoMotor';
import { useConnectivity } from '../state/connectivity';
import { useEventListener } from 'expo';
import { useVideoPlayer } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { criarRenovacao, resolveYouTubeHls, resolveYouTubeStream, streamFromPlayerResponse, type YtStream } from '../api/ytstream';
import { BUILD_ID } from '../lib/buildInfo';
import { reafirmarComandosDeFaixa } from '../lib/comandosDeFaixa';
import { registar as registarEvento } from '../lib/eventos';
import { baterSessao } from '../lib/sessionSync';
import { urlsDaCapa } from '../lib/capaDoEcraBloqueado';
import {
  deveComecarCrossfade, podeCrossfade, volumesDoCrossfade,
  intervaloDaPosicao,
} from '../lib/crossfade';
import { acaoDoWatchdog, DESISTIR_MS, duracaoParaDetetarOFim, fimPorFaltaDeDados } from '../lib/fimDeFaixa';
import { definirCapaDoEcraBloqueado, temCapaNativa } from '../../modules/duotone-remote-commands';
import { getLastBotGuardError } from '../lib/botguardBridge';
import { getAudioQuality } from '../lib/prefs';
import { targetVolume } from '../lib/loudness';
import { getLoudnessDb, rememberLoudnessDb } from '../lib/loudnessCache';
import {
  cachedAudioFile, downloadProgressiveAudio, DOWNLOAD_ABORTED, removerOpusDaFaixa, temOpusEmDisco, transmitirAudio,
  verificarCancelamentos, type DownloadOptions,
} from '../lib/youtubeCache';
import { evitarOpusPara } from '../lib/codecDeAudio';
import { eConversaoDoOpus, resolverEDescarregar } from '../lib/resolverEDescarregar';
import { anotarOpus, opusProvado } from '../state/saudeDoOpus';
import { primeiraNota, type OrigemDoSom } from '../lib/tocarEnquantoDescarrega';
import { anotarTransmissao, ligacaoParaTransmitir } from '../state/saudeDoStream';
import { diagnosticoDoStream } from '../../modules/duotone-stream';
import { quantasAdiantar } from '../lib/adiantarFaixas';
import { preCarregarCapasGrandes } from '../state/capasGrandes';
import type { Prioridade } from '../lib/filaDeDownloads';
import { analisarFimDaFaixa, fimMusicalGuardado } from '../lib/caudaAnalisada';
import { comecarArranque, marcarResolver } from '../lib/arranqueDaFaixa';
import {
  classificar, mensagem as mensagemDaFalha, recuperacao, registar,
  registarNaFila, registarNoStream, sinalDoErro, type TipoFalha,
} from '../lib/playbackDiagnostics';
import { usePlayer } from '../state/player';
import { useSaudeDaReproducao } from '../state/saudeDaReproducao';
import { aoTocar as ajusteAoTocar, chaveDaFaixa, compensacaoLinear } from '../lib/equalizer';
import { arredondar as arredondarRate } from '../lib/playbackRate';
import { trocarFonte } from '../lib/trocaDeFonte';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { velocidadeNaSessao } from '../lib/jam';
import { useArranqueTravado } from '../hooks/useArranqueTravado';

/**
 * Quanto se espera por uma resolucao antes de a dar por perdida.
 *
 * O caminho de resolver uma faixa pode levar 27 segundos so no PO Token, e
 * nao tem prazo nenhum proprio. Quarenta da folga a uma rede lenta e continua
 * a ser menos do que o tempo que uma pessoa aguenta a olhar para 0:00.
 */
const PRAZO_DA_RESOLUCAO_MS = 40_000;
const RESOLUCAO_DEMOROU = 'resolucao sem resposta';

/**
 * Os adiantamentos a decorrer, por faixa.
 *
 * Vivem fora do componente porque sobrevivem à troca de faixa: avançar uma
 * música faz da que era a segunda a primeira, e se ela já vinha a descarregar
 * tem de CONTINUAR -- recomeçar do zero era deitar fora o que o adiantamento
 * veio ganhar. O que deixa de servir é marcado `abandonado`, que o download
 * consulta entre pedaços para largar a vaga.
 */
type Adiantamento = { abandonado: boolean; pronto: Promise<void> };
const aAdiantar = new Map<string, Adiantamento>();

/** Resolve e descarrega uma faixa por conta. Nunca rejeita: falhar aqui é só
 * não ganhar tempo, e a reprodução tenta por si quando chegar a vez dela. */
async function adiantarFaixa(
  faixa: Track,
  prioridade: Extract<Prioridade, 'seguinte' | 'adiantar'>,
  abandonada: () => boolean,
): Promise<void> {
  try {
    const quality = await getAudioQuality();
    const { uri: uriLocal, stream } = await resolverEDescarregar(
      faixa.sourceId, quality, faixa.durationSeconds, { prioridade, shouldAbort: abandonada },
      // A loudness fica conhecida antes de tocar, por isso a normalização já
      // se aplica no primeiro segundo dela.
      (s) => rememberLoudnessDb(faixa.sourceId, s?.loudnessDb),
    );
    const duracao = faixa.durationSeconds || stream.durationSeconds || null;
    // Com o ficheiro em disco e tempo de sobra até esta faixa tocar, fica-se a
    // saber onde a MÚSICA dela acaba -- que raramente é onde o ficheiro acaba.
    // É o que impede o crossfade de cruzar a seguinte com o silêncio do fim.
    if (!abandonada() && uriLocal) void analisarFimDaFaixa(faixa.sourceId, uriLocal, duracao);
  } catch (err: any) {
    if (err?.message !== DOWNLOAD_ABORTED) {
      console.warn('[Smart Cache] Falha ao adiantar música:', err);
    }
  }
}
import { displayArtist } from '../lib/artistName';
import { aplicarEqualizadorNativo, ligarAudioNativo, aplicarVelocidadeNativa } from '../../modules/duotone-audio';
import type { Track } from '../types';
import { type HarvestResult } from './YtStreamHarvester';

/**
 * Player do YouTube com TRÊS fases, em cascata:
 *
 * 1. HARVEST — DESLIGADA (ago 2026): o player web passou a SABR e já não
 *    existe URL nenhum na resposta para captar. Código mantido em
 *    YtStreamHarvester.tsx. Era: WebView invisível que deixa a página real
 *    do YouTube pedir os dados dela própria (com o token de origem genuíno
 *    que ela sabe gerar), e intercetamos a resposta. EXPERIMENTAL: só
 *    testável num dispositivo real; se não intercetar nada, avança para (2).
 *
 * 2. RESOLVER PRÓPRIO (ytstream.ts) — pedido nosso ao InnerTube. Sem PO
 *    Token, confirmado por teste: só dá acesso a ~1MB cumulativo de áudio por
 *    vídeo/IP (~20-30s) antes do CDN começar a rejeitar tudo com 403. Se
 *    houver um servidor bgutil-ytdlp-pot-provider configurado nas
 *    Definições (ver potProvider.ts / GUIA-POT-TOKEN.md), ytstream.ts anexa
 *    um PO Token real ao URL e esse limite desaparece — a faixa completa
 *    descarrega-se aos pedaços normalmente. Sem servidor configurado,
 *    continua a servir de rede de segurança limitada a ~20-30s, e ainda
 *    resolve HLS (que não sofre deste limite) quando disponível.
 *
 * 3. WEBVIEW (fallback final) — o embed oficial do YouTube, visível. Sempre
 *    toca, mas a música pára com o ecrã bloqueado (limitação do WKWebView).
 *
 * Em qualquer dos casos em que o áudio é mp4 progressivo (não HLS), descarrega-
 * se aos pedaços (dentro do limite conhecido) para um ficheiro LOCAL antes de
 * entregar ao AVPlayer — evita que o próprio AVPlayer falhe com "failed to
 * load player item" ao fazer um pedido sem Range (confirmado por teste).
 */

/**
 * Quanto se espera pela fila depois de uma passagem acabar.
 *
 * O `next()` pode ir à rede pelo caminho (uma sugestão do shuffle
 * inteligente, o rádio do fim da fila), por isso não pode ser curto. Seis
 * segundos são muito mais do que qualquer um desses demora e continuam a ser
 * menos do que o tempo que uma pessoa leva a perceber que algo encravou.
 */
const ESPERA_PELA_ENTREGA_MS = 6000;

const BRIDGE_JS = `
(function () {
  if (window.__duotoneHooked) { return; }
  window.__duotoneHooked = true;
  function post(m){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(m)); } }
  var attempts = 0;
  function hook(){
    // Deteta erros do embed do YouTube (vídeo indisponível, removido, privado, etc.)
    var errEl = document.querySelector('.ytp-error-content-wrap, .ytp-error, [class*="error"]');
    var errText = document.querySelector('.ytp-error-content-wrap-reason');
    if (errEl && errText && errText.textContent && errText.textContent.trim().length > 0) {
      post({ type:'unavailable', reason: errText.textContent.trim() });
      return;
    }
    var v = document.querySelector('video');
    if (!v) {
      attempts++;
      // Após ~8 segundos sem encontrar elemento <video>, o vídeo provavelmente não está disponível
      if (attempts > 20) { post({ type:'unavailable', reason:'no video element found' }); return; }
      setTimeout(hook, 400);
      return;
    }
    v.addEventListener('play', function(){ post({ type:'state', value:'playing' }); });
    v.addEventListener('pause', function(){ post({ type:'state', value:'paused' }); });
    v.addEventListener('ended', function(){ post({ type:'state', value:'ended' }); });
    v.addEventListener('error', function(){ post({ type:'unavailable', reason:'video element error' }); });
    setInterval(function(){
      var vv = document.querySelector('video');
      if (vv && vv.duration) { post({ type:'progress', position:(vv.currentTime||0)*1000, duration: vv.duration*1000 }); }
      // Verifica erros que aparecem depois do carregamento
      var lateErr = document.querySelector('.ytp-error-content-wrap-reason');
      if (lateErr && lateErr.textContent && lateErr.textContent.trim().length > 0) {
        post({ type:'unavailable', reason: lateErr.textContent.trim() });
      }
    }, 1000);
    window.__duotone = {
      play:  function(){ var vv=document.querySelector('video'); if(vv) vv.play(); },
      pause: function(){ var vv=document.querySelector('video'); if(vv) vv.pause(); },
      seek:  function(s){ var vv=document.querySelector('video'); if(vv) vv.currentTime=s; }
    };
    post({ type:'ready' });
  }
  hook();
})();
true;
`;

type Backend = 'resolving' | 'native' | 'webview';

/**
 * O que aparece no ecrã bloqueado e no Centro de Controlo.
 *
 * O desenho é do iOS e não se muda; o que é nosso são estes três campos.
 *
 * **O título vai INTEIRO, de propósito.** Chegou a ir limpo — sem o nome do
 * artista à frente e sem o "(Official Audio)" atrás, o que dava "Orlando" em
 * vez de "Juice WRLD - Orlando". O utilizador preferiu como estava, e o gosto
 * é dele. Não voltar a "arranjar" isto.
 *
 * O artista é que passou a sair do extractor em vez de ser o nome do canal:
 * no caso comum dá o mesmo, e nos outros deixa de aparecer o nome de quem fez
 * o upload no lugar do músico.
 */
function metadadosDoEcraBloqueado(track: Track) {
  return {
    title: track.title,
    artist: displayArtist(track),
    // A capa vai SEMPRE, mesmo havendo módulo nativo. Tirá-la daqui deixou o
    // ecrã de bloqueio sem imagem nenhuma quando o nosso caminho falhou --
    // um ecrã sem capa é muito pior do que uma capa com as barras do YouTube.
    // O módulo escreve a versão recortada por cima, e reafirma-a, por isso o
    // pior caso passa a ser cosmético em vez de não haver imagem.
    artwork: track.artworkUrl ?? undefined,
  };
}

export function YouTubePlayerView({ track }: { track: Track }) {
  const eqGanhos = usePlayer((s) => s.eqGanhos);
  const registerYtControls = usePlayer((s) => s.registerYtControls);
  const onStateChange = usePlayer((s) => s._onYtStateChange);
  const setProgress = usePlayer((s) => s._setProgress);
  const setBuffering = usePlayer((s) => s._setBuffering);
  const setDownloadProgress = usePlayer((s) => s._setDownloadProgress);
  const setError = usePlayer((s) => s.setError);
  const skipUnavailableTrack = usePlayer((s) => s.skipUnavailableTrack);
  const repeatMode = usePlayer((s) => s.repeatMode);
  const prev = usePlayer((s) => s.prev);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  // A rede do encravamento nos 0:00, sozinho ou acompanhado. Vive aqui e nao
  // no PlayerRoot porque este componente existe enquanto houver faixa, que e
  // exactamente quando ela faz sentido.
  useArranqueTravado();

  const velocidadeEscolhida = usePlayer((s) => s.playbackRate);
  /**
   * O percurso do shuffle é a fila, quando o shuffle está ligado.
   *
   * Faltava aqui, e passou a doer quando o arrasto começou a funcionar com o
   * shuffle: o `reordenarProximas` mexe no `shuffleOrder` e não no `queue`,
   * por isso reordenar não voltava a disparar o pré-carregamento -- e ficava
   * a descarregar a música que ESTAVA a seguir, não a que passou a estar.
   * Chegava-se depois a uma faixa sem ficheiro, com tudo o que isso traz.
   */
  const percursoDoShuffle = usePlayer((s) => s.shuffleOrder);
  const sessaoJam = useOuvirJuntos(s => s.sessao?.id);
  const filaJam = useOuvirJuntos(s => s.fila);
  // Acompanhado anda-se a 1x, e a preferência fica guardada à espera. A conta
  // da posição de uma sessão é tempo de parede -- ver `velocidadeNaSessao`.
  const playbackRate = velocidadeNaSessao(velocidadeEscolhida, !!sessaoJam);
  // Só para as dependências do pré-carregamento: ligar/desligar o shuffle a
  // meio de uma faixa muda qual é a faixa seguinte.
  const shuffle = usePlayer((s) => s.shuffle);
  const volumeNormalization = usePlayer((s) => s.volumeNormalization);
  const closeGain = usePlayer(s=>s.closeGain);
  const closing = usePlayer(s=>s.closing);
  const closingVolume = useRef<number|null>(null);

  const [backend, setBackend] = useState<Backend>('resolving');
  const _setActiveBackend = usePlayer((s) => s._setActiveBackend);
  useEffect(() => {
    _setActiveBackend(backend);
  }, [backend, _setActiveBackend]);

  const webRef = useRef<WebView>(null);
  const nativeTrackIdRef = useRef<string | null>(null);
  // Token por faixa. Cada troca de faixa incrementa-o; operações assíncronas
  // de uma faixa antiga comparam o token que capturaram com o atual e abortam
  // se já não bate certo. (Um booleano partilhado não servia: o novo efeito
  // repunha-o e o áudio antigo continuava a tocar por cima — bug reportado.)
  const runIdRef = useRef(0);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Desmontar abandona tudo. A limpeza do efeito do Smart Cache também
      // corre ao recalcular a fila; abortar aí matava a faixa a ser adotada.
      for (const pedido of aAdiantar.values()) pedido.abandonado = true;
      verificarCancelamentos();
    };
  }, []);

  /**
   * DOIS motores, e não um.
   *
   * Uma passagem cruzada obriga a faixa que sai e a que entra a soar ao
   * mesmo tempo, e um AVPlayer só toca um item de cada vez. A alternativa
   * -- um `replaceAsync` a meio da passagem -- é exatamente o que mata o
   * áudio antigo.
   *
   * O que impede isto de contaminar o resto do ficheiro: `player` continua
   * a existir e passa a significar O MOTOR ATIVO. Tudo o que já estava
   * escrito à volta dele -- eventos, watchdog, controlos -- fica igual e
   * passa a seguir quem estiver ativo.
   *
   * Duas coisas fogem a essa regra, e fogem de propósito, porque durante uma
   * passagem os dois motores estão MESMO a tocar:
   *
   *  - o equalizador e a velocidade são por FAIXA, e por isso vivem em cada
   *    motor e não no ativo. Os dois estão registados no módulo nativo, cada
   *    um com o seu perfil -- ver o efeito do `ligarAudioNativo` e o fim do
   *    `prepararSeguinte`. Sem isso, quem entrava tocava o fade inteiro sem
   *    equalizador e apanhava-o de golpe no instante da troca.
   *  - o `showNowPlayingNotification` é de um só: com os dois ligados havia
   *    dois a disputar o ecrã de bloqueio. Quem o decide é o efeito mais
   *    abaixo, que liga o novo antes de desligar o velho.
   */
  const configurarMotor = (p: any) => {
    p.staysActiveInBackground = true;
    p.timeUpdateEventInterval = 1;
    p.loop = false;
    // O tom acompanha a velocidade, e desde o primeiro item. O módulo nativo
    // também põe `.varispeed`, mas só quando o KVO do `currentItem` chega --
    // e um item nasce `.spectral`, que estica o tempo em vez de mexer no tom.
    // Dizendo-o também ao expo-video, ele estampa-o na criação do item e não
    // há janela nenhuma com o tom errado. É o que o PC já faz.
    p.preservesPitch = false;
  };
  const motorA = useVideoPlayer(null, configurarMotor);
  const motorB = useVideoPlayer(null, configurarMotor);
  const [qualMotor, setQualMotor] = useState<'a' | 'b'>('a');
  const player = qualMotor === 'a' ? motorA : motorB;
  const motorEmEspera = qualMotor === 'a' ? motorB : motorA;

  /**
   * Qual dos motores manda AGORA -- e nao qual mandava quando esta funcao foi
   * criada.
   *
   * O `player` sai de `qualMotor`, que e estado do React, e por isso fica
   * congelado no closure de tudo o que for `async`. O caminho que poe uma
   * faixa a tocar demora entre cinco e trinta segundos (resolver o YouTube e
   * descarregar o ficheiro), e uma passagem que termine a meio disso TROCA o
   * motor activo.
   *
   * Quando isso acontece, o audio acaba instalado no motor que ja nao manda,
   * enquanto a app -- controlos, watchdog, posicao -- esta a olhar para o
   * outro. Nada toca, a posicao fica em 0:00, e mudar de faixa nao resolve
   * porque a proxima tentativa tem o mesmo risco. So reiniciar.
   *
   * Isto existia antes, mas era dificil de apanhar: a passagem so comecava
   * mesmo no fim do ficheiro. Desde que ela passou a comecar no fim da MUSICA,
   * a janela ficou muito maior -- e foi por isso que apareceu agora.
   */
  const qualMotorRef = useRef(qualMotor);
  qualMotorRef.current = qualMotor;
  const motorActivo = () => (qualMotorRef.current === 'a' ? motorA : motorB);

  /**
   * A faixa que o motor em espera já tem carregada, se houver.
   *
   * Enquanto isto for `null` a app comporta-se exatamente como antes: sem
   * faixa preparada não há troca de motor, e a mudança de faixa segue o
   * caminho de sempre. Com o crossfade desligado nunca deixa de ser `null`.
   *
   * Traz a VELOCIDADE dela porque é por faixa, como o equalizador: quem entra
   * tem de soar à velocidade que é dela desde a primeira amostra, senão dava um
   * salto de tom no instante da troca. Os ganhos não vêm aqui — esses já foram
   * entregues ao motor em espera, do lado nativo.
   */
  const seguinteRef = useRef<{ sourceId: string; pronta: boolean; rate: number } | null>(null);
  /** Onde ia a faixa no último `timeUpdate`: o ritmo da posição precisa de saber quanto falta. */
  const pontoDaPosicaoRef = useRef<{ sourceId: string; posicao: number; duracao: number | null } | null>(null);
  /** O último ritmo escrito, e em que motor e faixa: não se repete a mesma escrita a cada evento. */
  const intervaloAplicadoRef = useRef<{ motor: unknown; sourceId: string; passo: number } | null>(null);
  const aPrepararRef = useRef(false);

  /**
   * A passagem a decorrer, ou `null`.
   *
   * Guarda os DOIS tetos porque cada faixa tem o seu, vindo da normalização
   * de loudness: a curva tem de respeitar os dois, senão a que entra salta.
   */
  /**
   * Uma passagem que já acabou e mandou a fila avançar, mas cuja faixa ainda
   * não chegou. Enquanto isto não for `null`, a entrega está a meio.
   */
  const entregaRef = useRef<{ deQual: string; quando: number } | null>(null);

  const passagemRef = useRef<{
    sourceId: string;
    tetoSai: number;
    tetoEntra: number;
    /** Fixa no arranque: mudar a definição a meio não torce a curva. */
    duracaoDoFade: number;
  } | null>(null);

  // Em background não há barra de progresso para animar. Dois segundos
  // continuam a verificar o sleep timer com boa precisão e reduzem para
  // metade as travessias nativo -> JS, atualizações Zustand e renders que o
  // iPhone teria de fazer com o ecrã bloqueado.
  useEffect(() => {
    reporIntervaloDeTempo();
    const sub = AppState.addEventListener('change', () => reporIntervaloDeTempo());
    return () => sub.remove();
  }, [player]);

  // A capa vai para o Lock Screen e para o ecrã do carro recortada, sem as
  // barras que o YouTube põe à volta -- o recorte é no nativo, que tem acesso
  // aos píxeis. Ver src/lib/capaDoEcraBloqueado.ts.
  useEffect(() => {
    if (!temCapaNativa()) return;
    definirCapaDoEcraBloqueado(urlsDaCapa(track.artworkUrl));
  }, [track.sourceId, track.artworkUrl]);

  // Repeat "one": o player nativo repete a própria faixa (sem passar por
  // 'ended'/next). Reativo ao modo de repetição escolhido no player.
  useEffect(() => {
    player.loop = repeatMode === 'one';
  }, [player, repeatMode]);

  // Quem publica o ecrã de bloqueio. Ligar o NOVO antes de desligar o velho:
  // se os dois ficarem desligados ao mesmo tempo, o expo-video chama
  // `unregisterPlayer` sem ninguém a substituir e o ecrã fica vazio.
  useEffect(() => {
    player.showNowPlayingNotification = true;
    motorEmEspera.showNowPlayingNotification = false;
  }, [player, motorEmEspera]);

  // Entrega OS DOIS motores ao módulo nativo, e não só o ativo. Daí em diante
  // é ele que trata de cada faixa nova em cada um, porque o que ele mexe — o
  // tom e o equalizador — vive no AVPlayerItem, e cada `replaceAsync` cria um
  // item de raiz. Do lado do JS não há evento fiável para isso; do lado nativo
  // há KVO no `currentItem`.
  //
  // Tem de ser os dois por causa da passagem: durante o fade os dois AVPlayer
  // soam ao mesmo tempo, e com só o ativo registado a música que entrava tocava
  // o fade inteiro sem equalizador e sem a margem do limitador, e apanhava-os
  // de golpe no instante da troca. Do lado nativo o `ligar` é idempotente por
  // motor, por isso repetir não custa nada.
  useEffect(() => {
    ligarAudioNativo(motorA);
    ligarAudioNativo(motorB);
  }, [motorA, motorB]);

  // O equalizador DA FAIXA QUE TOCA, no motor que a está a tocar. A margem é
  // calculada aqui e não no Swift, para a conta viver só num sítio: o
  // `lib/equalizer.ts`, que é quem sabe quanto é que as bandas somam quando se
  // sobrepõem. É a mesma que o PC usa.
  //
  // O `player` está nas dependências porque o perfil é por faixa: numa troca de
  // motor, o perfil novo tem de ir para o motor certo. Quem entra já o trouxe
  // do `prepararSeguinte`; isto reafirma-o, e é o que trata do caso normal, sem
  // passagem nenhuma.
  useEffect(() => {
    if (backend !== 'native') return;
    aplicarEqualizadorNativo(player, eqGanhos, compensacaoLinear(eqGanhos));
  }, [backend, player, eqGanhos]);

  // O módulo nativo preserva reprodução/pausa e evita reavaliar o buffer
  // durante uma alteração com áudio disponível. Não reinstala o tap do EQ.
  useEffect(() => {
    if (backend !== 'native') return;
    atualizarVelocidadeDoMotor(player,playbackRate,aplicarVelocidadeNativa);
  }, [backend, player, playbackRate]);

  // Guardado num ref para o efeito de arranque poder chamar a versão mais
  // recente sem re-executar a cada render (a função é recriada em cada um).
  const proceedRef = useRef<(h: HarvestResult | null, runId: number) => void>(() => {});

  // Stream resolvido da faixa atual + se já se tentou a rede de segurança
  // (descarregar o ficheiro), para o handler de erro do player os alcançar.
  const streamRef = useRef<YtStream | undefined>(undefined);
  const downloadTriedRef = useRef(false);
  // Evita disparar "ended" mais do que uma vez por faixa (ver bug da duração
  // a dobrar mais abaixo).
  const endedRef = useRef(false);
  // Watchdog de stream que não avança (músicas longas no 4G: o AVPlayer nem
  // sequer ARRANCA o progressivo). `lastProgressRef` = última posição vista +
  // quando; `wantsPlayRef` = a app tenciona estar a tocar (não foi pausada
  // pelo utilizador). Usamos a INTENÇÃO, não o estado real, para apanhar
  // também o caso em que nunca começa (o `playingChange` nunca dispara).
  const lastProgressRef = useRef({ time: 0, at: Date.now() });
  /**
   * O download em curso, e quando avancou pela ultima vez.
   *
   * O watchdog precisa de distinguir "esta lento" de "esta encravado". Um
   * ficheiro grande em 4G pode demorar minutos e nao ha nada de errado nisso
   * -- desde que va andando. O que nao pode acontecer e ficar tudo parado sem
   * ninguem reparar.
   */
  const descarregarRef = useRef({ ativo: false, at: Date.now() });
  const wantsPlayRef = useRef(true);

  /**
   * A faixa que toca enquanto descarrega, quando é o caso (`transmitirAudio`).
   * Fecha-se ao trocar de faixa, ao desmontar e quando o motor passa para o
   * ficheiro: é o que larga a sessão do lado nativo.
   */
  const transmissaoRef = useRef<{
    sessao: string;
    fechar: () => void;
    run: number;
    /** O motor já deu som por aqui. */
    tocou: boolean;
    /** Foi o download que falhou a meio: a culpa é da rede, não do motor. */
    downloadFalhou: boolean;
    /** O erro com que esse download falhou (um 403 do CDN salta o ficheiro). */
    erroDoDownload: unknown;
    /** A rede de segurança já está a passar isto para o ficheiro. */
    socorrida: boolean;
  } | null>(null);
  const fecharTransmissao = () => {
    const t = transmissaoRef.current;
    transmissaoRef.current = null;
    t?.fechar();
  };

  /** Quando se pediu a faixa e de onde veio o som: o evento `primeira_nota`. */
  const primeiraNotaRef = useRef<{ run: number; pedidaEm: number; origem: OrigemDoSom | null } | null>(null);

  // [duration-debug] log único por faixa do player.duration (o valor que o
  // expo-video envia para o Lock Screen) — remover depois de validar.

  // Intervalo do fade-in entre faixas.
  const fadeIntervalRef = useRef<any>(null);

  // Teto de volume desta faixa: 1.0 normalmente, menos quando a normalização
  // está ligada e a faixa é mais alta do que a referência do YouTube. Em ref
  // (não em estado) porque o fade lê-o dentro de um setInterval.
  const ceilingRef = useRef(1.0);

  /** Recalcula o teto para a faixa atual. Chamado antes de cada arranque. */
  const applyCeiling = () => {
    ceilingRef.current = targetVolume(
      getLoudnessDb(track.sourceId),
      usePlayer.getState().volumeNormalization
    );
    return ceilingRef.current;
  };

  const fadeIn = () => {
    if(usePlayer.getState().closing)return;
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    const ceiling = ceilingRef.current;
    player.volume = 0.0;
    let vol = 0.0;
    // Dez passos até ao teto, seja ele qual for — o fade dura 1s tanto numa
    // faixa normalizada como numa que fica em 1.0.
    const step = ceiling / 10;
    fadeIntervalRef.current = setInterval(() => {
      if(usePlayer.getState().closing){clearInterval(fadeIntervalRef.current);fadeIntervalRef.current=null;return;}
      vol += step;
      if (vol >= ceiling) {
        vol = ceiling;
        clearInterval(fadeIntervalRef.current!);
        fadeIntervalRef.current = null;
      }
      player.volume = vol;
    }, 100);
  };

  /**
   * Quantas vezes por segundo queremos saber a posição.
   *
   * É a única decisão sobre o ritmo dos eventos de tempo, e a regra vive em
   * `intervaloDaPosicao` (src/lib/crossfade.ts, testada). Com o ecrã bloqueado,
   * o ritmo rápido da faixa seguinte pronta só vale perto do fim: valia a
   * música inteira, e eram quatro vezes mais travessias nativo -> JS com o
   * telemóvel no bolso.
   *
   * Corre também a cada `timeUpdate` (é aí que se sabe quanto falta), e só
   * escreve no motor quando o ritmo muda.
   */
  const reporIntervaloDeTempo = () => {
    const ponto = pontoDaPosicaoRef.current?.sourceId === track.sourceId ? pontoDaPosicaoRef.current : null;
    const passo = intervaloDaPosicao({
      aPassar: !!passagemRef.current,
      seguintePronta: !!seguinteRef.current?.pronta,
      ativa: AppState.currentState === 'active',
      posicaoSegundos: ponto?.posicao ?? null,
      duracaoSegundos: ponto?.duracao ?? null,
      fimMusicalSegundos: fimMusicalGuardado(track.sourceId),
      duracaoDoFade: usePlayer.getState().crossfadeSegundos,
    });
    const aplicado = intervaloAplicadoRef.current;
    if (aplicado && aplicado.motor === player && aplicado.sourceId === track.sourceId && aplicado.passo === passo) return;
    try {
      player.timeUpdateEventInterval = passo;
      intervaloAplicadoRef.current = { motor: player, sourceId: track.sourceId, passo };
    } catch {
      // motor já libertado — ignorar
    }
  };

  /**
   * Deixa a faixa seguinte carregada no motor em espera, calada.
   *
   * Só usa o ficheiro que o Smart Cache já descarregou: nada aqui vai à
   * rede. Se o download ainda não acabou, não se prepara nada e a mudança
   * de faixa segue o caminho normal -- é melhor perder a passagem do que
   * gastar 4G a correr atrás dela.
   *
   * Com o crossfade nas Definições em 0, o `podeCrossfade` corta logo na
   * primeira linha e isto nunca chega a preparar nada.
   */
  const prepararSeguinte = async () => {
    if (aPrepararRef.current || backend !== 'native') return;
    const st = usePlayer.getState();
    const seguinte = st.proximaFaixa();
    if (!seguinte || seguinte.source !== 'youtube') return;
    if (seguinte.sourceId === track.sourceId) return;
    if (seguinteRef.current?.sourceId === seguinte.sourceId) return;

    // SEM PASSAGEM DENTRO DE UMA SESSÃO DE ESCUTA.
    //
    // Uma passagem tem de saber, com antecedência, qual é a faixa seguinte --
    // é isso que ela prepara no segundo motor. Numa sessão isso não se sabe: a
    // faixa seguinte sai da fila PARTILHADA, e essa só é consumida no fim da
    // música, depois de se esperar por quem ainda está a descarregar.
    //
    // Com os dois ligados, o crossfade preparava a faixa seguinte LOCAL e
    // começava a passagem; ao chegar ao fim, a sessão mandava tocar outra --
    // a da fila. Duas faixas a disputar o mesmo instante, com dois motores a
    // trocar de papéis a meio. O resultado foi a app a partir-se.
    //
    // Não se tenta fazê-los concordar: a passagem perde-se dentro de uma
    // sessão, e é uma perda pequena e compreensível. Ouvir junto é sobre a
    // mesma música ao mesmo tempo, não sobre a costura entre elas -- que aliás
    // nunca ficaria igual nos dois telemóveis.
    if (useOuvirJuntos.getState().sessao) return;

    const duracao = track.durationSeconds || streamRef.current?.durationSeconds || null;
    if (
      !podeCrossfade({
        duracaoDoFade: st.crossfadeSegundos,
        duracaoSegundos: duracao,
        posicaoSegundos: lastProgressRef.current.time,
        temFaixaSeguinte: true,
        repeatUma: st.repeatMode === 'one',
        backendNativo: true,
        seguinteCarregada: false,
        aDecorrer: false,
      })
    ) {
      return;
    }
    // Só perto do fim. Preparar no primeiro segundo deixava um AVPlayerItem
    // inteiro em memória durante a faixa toda, sem proveito nenhum.
    const falta = duracao! - lastProgressRef.current.time;
    if (falta > st.crossfadeSegundos + 20) return;

    const ficheiro = cachedAudioFile(seguinte.sourceId);
    if (!ficheiro.exists) return;
    // Um Opus que ainda não tocou neste telemóvel não entra numa passagem: se
    // o AVPlayer o recusar, a recusa acontece no motor em ESPERA, onde nada a
    // vê nem recua (lib/saudeDoOpus.ts). Entra pelo caminho normal, que recua.
    if (temOpusEmDisco(seguinte.sourceId) && !opusProvado()) return;

    // O que ESTA faixa lembra. O equalizador e a velocidade são por faixa, e
    // sem registo voltam ao padrão -- é o mesmo cálculo que o `playTrack` faz.
    // Tem de ser feito aqui e não lá: a store só passa a estes valores quando a
    // faixa começar mesmo, e nessa altura a passagem já acabou.
    const ajuste = ajusteAoTocar(
      st.ajustesPorFaixa,
      chaveDaFaixa(seguinte),
      { rate: st.padraoRate, ganhos: st.padraoGanhos },
    );

    aPrepararRef.current = true;
    seguinteRef.current = {
      sourceId: seguinte.sourceId,
      pronta: false,
      rate: arredondarRate(ajuste.rate),
    };
    // Guardado por cima do `await`: enquanto esta faixa não estiver `pronta`
    // não há troca de motor nenhuma, por isso não pode ficar obsoleto.
    const emEspera = motorEmEspera;
    try {
      emEspera.volume = 0;
      await trocarFonte(emEspera, {
        uri: ficheiro.uri,
        contentType: 'progressive',
        metadata: metadadosDoEcraBloqueado(seguinte),
      }, { desistir: () => seguinteRef.current?.sourceId !== seguinte.sourceId });
      // A faixa pode ter mudado enquanto isto carregava.
      if (seguinteRef.current?.sourceId === seguinte.sourceId) {
        // O perfil DELA no motor DELA, antes de soar uma amostra. É isto que
        // faz a música que entra numa passagem já vir com o equalizador certo,
        // em vez de o apanhar de repente no fim do fade.
        aplicarEqualizadorNativo(emEspera, ajuste.ganhos, compensacaoLinear(ajuste.ganhos));
        seguinteRef.current.pronta = true;
        // Daqui até ao fim da faixa vale a pena saber a posição mais vezes.
        reporIntervaloDeTempo();
      }
    } catch {
      // Fica marcada como tentada e não pronta. Voltar a pôr `null` fazia o
      // `timeUpdate` tentar de segundo a segundo, até ao fim da faixa, um
      // ficheiro que o AVPlayer já recusou.
      if (seguinteRef.current?.sourceId === seguinte.sourceId) {
        seguinteRef.current.pronta = false;
      }
    } finally {
      aPrepararRef.current = false;
    }
  };

  /**
   * Cala quem estava a entrar e devolve a faixa atual ao teto dela.
   *
   * É o `abortar` do src/lib/crossfade.ts, e é a saída que apanha o caso
   * perigoso: saltar a meio de uma passagem para uma faixa que NÃO é a que
   * estava a entrar. Sem isto ficavam duas músicas a tocar ao mesmo tempo.
   */
  const abortarPassagem = () => {
    const p = passagemRef.current;
    if (!p) return;
    passagemRef.current = null;
    seguinteRef.current = null;
    endedRef.current = false;
    reporIntervaloDeTempo();
    try {
      motorEmEspera.pause();
      motorEmEspera.volume = 0;
    } catch {
      // motor sem fonte — ignorar
    }
    try {
      player.volume = p.tetoSai;
    } catch {
      // motor sem fonte — ignorar
    }
  };

  /**
   * A passagem chegou ao fim. Avança a fila pelo caminho de sempre.
   *
   * Repare-se que não se chama `next()`: manda-se o mesmo `ended` que o fim
   * de uma faixa manda. É o `ended` que sabe de repeat, de rádio no fim da
   * fila e do resto -- e assim a passagem não tem de saber nada disso.
   */
  const terminarPassagem = () => {
    const p = passagemRef.current;
    if (!p) return;
    // Ligar o repeat "one" a meio de uma passagem tira-lhe a razão de ser:
    // a faixa vai repetir-se, não vai entregar o lugar a ninguém. Aborta e
    // deixa o `playToEnd` tratar da repetição, como sempre. Sem isto o
    // `ended` mandava repetir a faixa que sai -- que a curva já tinha
    // deixado em silêncio -- com a seguinte a tocar por cima.
    if (usePlayer.getState().repeatMode === 'one') {
      abortarPassagem();
      return;
    }
    passagemRef.current = null;
    reporIntervaloDeTempo();
    try {
      motorEmEspera.volume = p.tetoEntra;
    } catch {
      // motor sem fonte — ignorar
    }
    endedRef.current = true;
    registarNaFila(
      `${track.sourceId}: crossfade handed over at ${lastProgressRef.current.time.toFixed(1)}s`
      + ` of ${track.durationSeconds ?? streamRef.current?.durationSeconds ?? '?'}s`,
    );
    // A partir daqui a fila TEM de avançar. Se não avançar, quem entrou
    // fica a tocar sem ninguém a saber -- ver o ouvinte do motor em espera.
    entregaRef.current = { deQual: track.sourceId, quando: Date.now() };
    onStateChange('ended');
  };

  /**
   * Começa a passagem: a faixa seguinte arranca calada por cima da atual.
   *
   * O relógio da passagem é o `timeUpdate` do motor que sai, e NÃO um
   * `setInterval`: com o ecrã bloqueado o iOS suspende os temporizadores de
   * JS e a passagem ficava congelada a meio, com as duas faixas a meio
   * volume. O `timeUpdate` vem do AVPlayer e continua a chegar. Enquanto ela
   * dura pede-se um evento a cada 0,25 s, para a curva não se ouvir aos
   * degraus -- são uns segundos, não é o regime normal.
   *
   * O `endedRef` fica logo marcado: daqui em diante quem avança a fila é o
   * fim da passagem, não o `playToEnd` da faixa que sai.
   */
  const comecarPassagem = (seguinte: Track) => {
    const st = usePlayer.getState();
    passagemRef.current = {
      sourceId: seguinte.sourceId,
      tetoSai: ceilingRef.current,
      tetoEntra: targetVolume(getLoudnessDb(seguinte.sourceId), st.volumeNormalization),
      duracaoDoFade: st.crossfadeSegundos,
    };
    endedRef.current = true;
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    reporIntervaloDeTempo();
    try {
      motorEmEspera.volume = 0;
      // A velocidade DELA, e não a da faixa que sai: é por faixa, tal como o
      // equalizador, e veio calculada do `prepararSeguinte`. Com a da que sai,
      // quem entra tocava o fade inteiro à velocidade errada e saltava de tom
      // no instante da troca.
      tocarNaVelocidade(motorEmEspera,seguinteRef.current?.rate ?? st.playbackRate,aplicarVelocidadeNativa);
    } catch {
      abortarPassagem();
    }
  };

  /** Um passo da curva, a cada evento de tempo do motor que sai. */
  const avancarPassagem = (posicaoSegundos: number, duracaoSegundos: number) => {
    const p = passagemRef.current;
    if (!p) return;
    const duracaoDoFade = p.duracaoDoFade;
    // O decorrido lê-se da POSIÇÃO e não de um relógio: se um evento se
    // atrasar, o passo seguinte apanha o atraso em vez de o acumular.
    const decorrido = duracaoDoFade - (duracaoSegundos - posicaoSegundos);
    const v = volumesDoCrossfade(decorrido, duracaoDoFade, p.tetoSai, p.tetoEntra);
    try {
      player.volume = v.sai;
      motorEmEspera.volume = v.entra;
    } catch {
      // motor sem fonte — ignorar
    }
    if (decorrido >= duracaoDoFade) terminarPassagem();
  };

  useEffect(() => {
    // A faixa mudou: seja para a preparada ou para outra qualquer, a
    // entrega chegou ao destino.
    entregaRef.current = null;

    // CAMINHO CURTO: a faixa que agora entra já está carregada no outro
    // motor. Troca-se de motor, em vez de resolver e descarregar de novo.
    // Sem faixa preparada -- e é sempre o caso com o crossfade desligado --
    // segue-se o caminho de sempre, linha por linha igual ao que era.
    const preparada = seguinteRef.current;
    if (
      preparada?.pronta &&
      preparada.sourceId === track.sourceId &&
      backend === 'native' &&
      usePlayer.getState().autoplayOnLoad
    ) {
      // `cortar`: quem estava a entrar é exatamente quem agora toca.
      seguinteRef.current = null;
      passagemRef.current = null;
      runIdRef.current++;
      fecharTransmissao();
      primeiraNotaRef.current = null;
      verificarCancelamentos();
      const entra = motorEmEspera;
      const sai = player;
      streamRef.current = undefined;
      downloadTriedRef.current = false;
      lastProgressRef.current = { time: 0, at: Date.now() };
      descarregarRef.current = { ativo: false, at: Date.now() };
      endedRef.current = false;
      webviewSkippedRef.current = false;
      wantsPlayRef.current = true;
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      applyCeiling();
      usePlayer.setState({ resumePositionMs: null });
      nativeTrackIdRef.current = track.sourceId;
      try {
        sai.pause();
      } catch {
        // motor sem fonte — ignorar
      }
      try {
        entra.volume = ceilingRef.current;
        tocarNaVelocidade(entra,usePlayer.getState().playbackRate,aplicarVelocidadeNativa);
        // O `playingChange` do motor que entra ainda não tem ouvinte: só
        // passa a ter no render seguinte a esta troca. Sem isto a UI ficava
        // a dizer "em pausa" com a música a tocar, até ao primeiro
        // `timeUpdate` a corrigi-la.
        onStateChange('playing');
      } catch {
        // se o motor preparado falhar, o caminho normal volta a correr
        // quando o `sourceId` mudar outra vez
      }
      setQualMotor((q) => (q === 'a' ? 'b' : 'a'));
      return;
    }

    // A faixa que entra não é a que estava preparada. Calar o outro motor
    // é INCONDICIONAL, e não só quando há passagem a decorrer: entre o fim
    // de uma passagem e a fila avançar, o `next()` pode meter à frente uma
    // faixa diferente (o shuffle inteligente intercala uma sugestão de
    // quatro em quatro). Aí já não há passagem para abortar e a que estava a
    // entrar ficava a tocar por cima desta.
    abortarPassagem();
    try {
      motorEmEspera.pause();
      motorEmEspera.volume = 0;
    } catch {
      // motor sem fonte — ignorar
    }
    seguinteRef.current = null;
    const myRun = ++runIdRef.current;
    fecharTransmissao();
    primeiraNotaRef.current = { run: myRun, pedidaEm: Date.now(), origem: null };
    comecarArranque(track.sourceId);
    // O download da faixa que sai cancela já, e não na verificação seguinte.
    verificarCancelamentos();
    nativeTrackIdRef.current = null;
    streamRef.current = undefined;
    downloadTriedRef.current = false;
    lastProgressRef.current = { time: 0, at: Date.now() };
    descarregarRef.current = { ativo: false, at: Date.now() };
    wantsPlayRef.current = true;
    endedRef.current = false;
    webviewSkippedRef.current = false; // Reset webview skip flag
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    // Silenciar JÁ a faixa anterior enquanto a nova resolve (senão continuava
    // a tocar de fundo durante a resolução da nova).
    try {
      player.pause();
    } catch {
      // player pode ainda não ter fonte — ignorar
    }
    setBackend('resolving');
    // FASE 1 (harvest) DESLIGADA. O player web do YouTube passou a SABR: o
    // ytInitialPlayerResponse traz `serverAbrStreamingUrl` e NENHUM dos
    // formatos tem `url` (verificado: 0 em 24). Não existe URL nenhum para
    // captar, portanto o harvester só podia gastar 5s por faixa e falhar.
    proceedRef.current(null, myRun);
  }, [track.sourceId]);

  // Ao desmontar (ex.: fechar o player no X), parar mesmo o áudio nativo —
  // com staysActiveInBackground ele podia continuar a tocar sozinho.
  // Depende dos motores em si e não do ativo: se dependesse de `player`, a
  // troca de papéis fazia o React correr esta limpeza no motor que sai --
  // e um `replace(null)` no meio de uma passagem cortava-lhe o som.
  useEffect(() => {
    return () => {
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
      nativeTrackIdRef.current = null;
      seguinteRef.current = null;
      fecharTransmissao();
      for (const p of [motorA, motorB]) {
        try {
          p.pause();
          p.replace(null);
        } catch {
          // player já libertado — ignorar
        }
      }
    };
  }, [motorA, motorB]);

  /**
   * O degrau antes do embed: o HLS do mesmo vídeo, no motor nativo.
   *
   * A 22/9 o iPhone do João levava 403 do CDN aos ~1 MB em todas as músicas
   * (o teto de quem não tem PO Token válido), o recurso do ficheiro batia no
   * mesmo corte e a faixa ia para o embed -- que parava aos 29 s, com o ecrã
   * bloqueado ou não, e ficava parado de vez. O HLS não tem esse teto (ver
   * `resolveYouTubeHls`): toca no motor nativo, com segundo plano e ecrã
   * bloqueado, mas sem ficheiro para ouvir sem rede e sem equalizador. Só se
   * ele falhar é que se vai ao embed.
   *
   * Resolve e põe a fonte no motor ativo; play e estado são de quem chama,
   * porque o arranque e a troca a meio da faixa não são iguais. Devolve
   * também onde o motor ia ANTES da troca: a resolução leva um instante, e o
   * stream pode ter continuado a tocar o que já tinha chegado.
   * Devolve `null` se não houver HLS, se o motor o recusar ou se a faixa já
   * não for esta.
   */
  const abrirHls = async (ainda: () => boolean): Promise<{ hls: YtStream; ia: number } | null> => {
    let hls: YtStream;
    let ia = 0;
    try {
      hls = await resolveYouTubeHls(track.sourceId, await getAudioQuality());
      if (!ainda()) return null;
      try {
        ia = motorActivo().currentTime || 0;
      } catch {
        // motor sem fonte — começa do início
      }
      await trocarFonte(motorActivo(), {
        uri: hls.url,
        contentType: 'hls',
        metadata: metadadosDoEcraBloqueado(track),
      }, { desistir: () => !ainda() });
    } catch (e: any) {
      if (ainda()) {
        registar({
          quando: Date.now(),
          videoId: track.sourceId,
          titulo: track.title,
          fase: 'hls',
          tipo: classificar(sinalDoErro(e)),
          detalhe: `build=${BUILD_ID} :: ${e?.message ?? 'unknown'}`,
        });
      }
      return null;
    }
    if (!ainda()) return null;
    streamRef.current = hls;
    // Daqui já não há ficheiro para onde o watchdog fugir: o seguinte é o embed.
    downloadTriedRef.current = true;
    descarregarRef.current = { ativo: false, at: Date.now() };
    rememberLoudnessDb(track.sourceId, hls.loudnessDb);
    applyCeiling();
    return { hls, ia };
  };

  // Chamado pelo YtStreamHarvester (fase 1) com o que conseguiu capturar, ou
  // `null` se não capturou nada dentro do timeout.
  const proceedWithPlayerResponse = async (harvested: HarvestResult | null, runId: number) => {
    // `true` enquanto esta for a faixa atual; passa a `false` mal o utilizador
    // troque de faixa, cortando esta cadeia assíncrona em qualquer await.
    const alive = () => isMountedRef.current && runId === runIdRef.current;
    if (!alive()) return;
    setBackend('resolving');

    // Arranque comum aos dois caminhos (cache local e stream). Respeita o
    // restauro de sessão: com autoplayOnLoad=false (app reaberta com fila
    // restaurada) prepara o áudio, retoma a posição guardada e fica em pausa
    // até o utilizador carregar em play.
    const beginPlayback = (origem: OrigemDoSom) => {
      const st = usePlayer.getState();
      const resumeMs = st.resumePositionMs;
      if (resumeMs && resumeMs > 1500) {
        try {
          motorActivo().currentTime = resumeMs / 1000;
        } catch {
          // seek falhou — recomeça do início
        }
      }
      const autoplay = st.autoplayOnLoad;
      // Uma sessão restaurada em pausa não mede nada: o som vem quando a
      // pessoa carregar em play, não quando a faixa ficou pronta.
      const nota = primeiraNotaRef.current;
      if (nota && nota.run === runId) {
        if (autoplay) nota.origem = origem;
        else primeiraNotaRef.current = null;
      }
      applyCeiling();
      usePlayer.setState({ resumePositionMs: null });
      lastProgressRef.current = { time: 0, at: Date.now() };
      descarregarRef.current = { ativo: false, at: Date.now() };
      nativeTrackIdRef.current = track.sourceId;
      wantsPlayRef.current = autoplay;
      if (autoplay) {
        tocarNaVelocidade(motorActivo(),velocidadeNaSessao(st.playbackRate,!!useOuvirJuntos.getState().sessao),aplicarVelocidadeNativa);
        fadeIn();
      } else {
        // Garantia explícita de pausa: nada abaixo pode arrancar o playback
        // (o efeito da velocidade também preserva a pausa).
        try {
          motorActivo().pause();
        } catch {
          // player sem fonte — ignorar
        }
        motorActivo().volume = ceilingRef.current;
        st._setIsPlaying(false);
        st._setBuffering(false);
      }
      setBackend('native');
    };

    // MODO OFFLINE / CACHE RÁPIDO: Se a música já estiver guardada localmente, toca-a imediatamente
    const localFile = cachedAudioFile(track.sourceId);
    if (localFile.exists) {
      try {
        await trocarFonte(motorActivo(), {
          uri: localFile.uri,
          contentType: 'progressive',
          metadata: metadadosDoEcraBloqueado(track),
        }, { desistir: () => !alive() });
        if (!alive()) return;
        beginPlayback('cache');
        return;
      } catch (err) {
        console.warn('Erro a reproduzir ficheiro local em cache, tentando rede:', err);
        // Um Opus que nem abriu: a rede, a seguir, tem de ir buscar o AAC --
        // sem isto voltava a dar o mesmo ficheiro.
        if (temOpusEmDisco(track.sourceId)) recusarOpus('abrir');
      }
    }

    if(useConnectivity.getState().offline){
      setError('This song is not available offline. Choose a downloaded song in Songs.');
      usePlayer.getState()._setBuffering(false);
      return;
    }

    // Fora do try para ficar acessível no catch (diagnóstico do cliente/token).
    let stream: YtStream | undefined;
    /** Quando começou a resolução, para o evento `resolvedor`. */
    let resolverDesde: number | null = null;
    try {
      const quality = await getAudioQuality();
      if (!alive()) return;

      if (harvested?.kind === 'playerResponse') {
        stream = streamFromPlayerResponse(harvested.data, quality);
        // Marcar a origem: sem isto a mensagem de erro dizia `client=?` e
        // não se distinguia um harvest falhado de um resolve falhado.
        stream.client = 'harvest/playerResponse';
      } else if (harvested?.kind === 'rawUrl') {
        const isHls = harvested.url.includes('.m3u8');
        stream = {
          url: harvested.url,
          isHls,
          expiresAt: Date.now() + 5 * 60 * 60 * 1000,
          contentLength: null,
          client: 'harvest/rawUrl',
        };
      } else {
        // COM PRAZO. O `resolveYouTubeStream` não tem nenhum: fala com o
        // InnerTube e pede um PO Token à WebView do BotGuard, que sozinho pode
        // levar 27 segundos (12 à espera que ela fique pronta, 15 a cunhar).
        // Trocar de música depressa põe várias destas em curso ao mesmo tempo,
        // e uma que não volte deixa a faixa em 0:00 sem nada a acontecer.
        //
        // Uma resolução que passa deste prazo já não vale a pena esperar: ou a
        // rede está mesmo mal, ou encravou. Falhar aqui dá uma mensagem e
        // devolve o controlo -- não fazer nada deixa a app à espera para
        // sempre.
        marcarResolver(track.sourceId, { inicio: true });
        resolverDesde = Date.now();
        stream = await Promise.race([
          resolveYouTubeStream(track.sourceId, quality),
          new Promise<never>((_, rejeitar) =>
            setTimeout(() => rejeitar(new Error(RESOLUCAO_DEMOROU)), PRAZO_DA_RESOLUCAO_MS)
          ),
        ]);
      }
      if (!alive()) return;
      streamRef.current = stream;
      marcarResolver(track.sourceId, { fim: true, cliente: stream.client ?? null });
      if (resolverDesde !== null) {
        registarEvento('resolvedor', {
          ok: true,
          cliente: String(stream.client ?? '?').slice(0, 24),
          recurso: !!stream.resolverNote,
          ms: Date.now() - resolverDesde,
        });
      }
      // Guardar a loudness ANTES de aplicar o teto: da próxima vez a faixa
      // toca do ficheiro local e já não passa por aqui.
      rememberLoudnessDb(track.sourceId, stream.loudnessDb);
      applyCeiling();

      // O progressivo passa SEMPRE pelo disco (entregar o URL remoto ao
      // AVPlayer falha). Com o módulo `duotone-stream`, o motor começa a ler
      // o ficheiro enquanto ele chega; sem ele, espera-se pelo ficheiro todo.
      let playableUri = stream.url;
      let origem: OrigemDoSom = stream.isHls ? 'hls' : 'ficheiro';
      if (!stream.isHls) {
        downloadTriedRef.current = true;
        descarregarRef.current = { ativo: true, at: Date.now() };
        const duracao = track.durationSeconds || stream.durationSeconds || null;
        const opcoes: DownloadOptions = {
          // Esta e a faixa que o utilizador esta a ouvir: ninguem a ultrapassa.
          prioridade: 'reproducao',
          // Aborta entre chunks se o utilizador trocar de faixa — sem isto,
          // saltar várias faixas deixava vários downloads completos a
          // competir pela rede.
          shouldAbort: () => !alive(),
          onProgress: (f) => {
            // Cada byte que chega adia o watchdog: lento nao e encravado.
            descarregarRef.current.at = Date.now();
            if (alive()) setDownloadProgress(f);
          },
          // Se o CDN matar o URL a meio (403), pede um fresco em vez de
          // repetir o morto — ver fetchChunkWithRetry e `criarRenovacao`.
          renewUrl: criarRenovacao(track.sourceId, quality, stream.formato ?? 'aac'),
        };
        // O Opus chega em WebM e só vira MP4 com o ficheiro inteiro: não há
        // como o dar ao motor enquanto chega.
        const ligacao = stream.formato === 'opus' ? null : ligacaoParaTransmitir();
        const s = stream;
        const descarregarComRecuo = async (): Promise<string> => {
          try {
            return await downloadProgressiveAudio(track.sourceId, s.url, s.contentLength, duracao, opcoes);
          } catch (erro) {
            // O WebM do Opus não se converteu: esta faixa passa a AAC e
            // descarrega-se outra vez, já em AAC.
            if (!eConversaoDoOpus(erro) || !alive()) throw erro;
            evitarOpusPara(track.sourceId);
            registarEvento('opus_recusado', { motivo: 'conversao' });
            const aac = await resolveYouTubeStream(track.sourceId, quality, false, 'aac');
            if (!alive()) throw new Error(DOWNLOAD_ABORTED);
            stream = aac;
            streamRef.current = aac;
            if (aac.isHls) throw erro;
            return downloadProgressiveAudio(track.sourceId, aac.url, aac.contentLength, duracao, {
              ...opcoes, renewUrl: criarRenovacao(track.sourceId, quality, 'aac'),
            });
          }
        };
        const t = ligacao
          ? await transmitirAudio(track.sourceId, stream.url, stream.contentLength, duracao, ligacao, opcoes)
          : { tipo: 'ficheiro' as const, uri: await descarregarComRecuo() };
        if (t.tipo === 'stream') {
          if (!alive()) {
            t.fechar();
            return;
          }
          origem = 'stream';
          playableUri = t.uri;
          transmissaoRef.current = {
            sessao: t.sessao, fechar: t.fechar, run: runId, tocou: false, downloadFalhou: false, erroDoDownload: null,
            socorrida: false,
          };
          const estaTransmissao = transmissaoRef.current;
          const minha = () => alive() && transmissaoRef.current === estaTransmissao;
          t.ficheiro.then(
            () => {
              if (!minha()) return;
              descarregarRef.current.ativo = false;
              setDownloadProgress(null);
              // Com o ficheiro inteiro no disco, o watchdog volta a poder
              // trocar para ele se o stream não andar -- e o relógio dele
              // recomeça: o motor precisa de um instante para ler o fim.
              downloadTriedRef.current = false;
              lastProgressRef.current = { time: lastProgressRef.current.time, at: Date.now() };
            },
            (erro) => {
              if (!minha()) return;
              descarregarRef.current.ativo = false;
              setDownloadProgress(null);
              if (erro?.message === DOWNLOAD_ABORTED) return;
              // O som já começou com o que chegou; o resto vem pelo caminho
              // antigo, que tem as suas próprias tentativas e mensagens.
              estaTransmissao.downloadFalhou = true;
              estaTransmissao.erroDoDownload = erro;
              downloadTriedRef.current = false;
              void fallbackRef.current();
            },
          );
        } else {
          playableUri = t.uri;
          descarregarRef.current.ativo = false;
          if (!alive()) return;
          setDownloadProgress(null);
        }
      }

      await trocarFonte(motorActivo(), {
        uri: playableUri,
        contentType: stream.isHls ? 'hls' : 'progressive',
        metadata: metadadosDoEcraBloqueado(track),
      }, { desistir: () => !alive() });
      if (!alive()) return;
      beginPlayback(origem);
      // A extração passou. Só aqui, e não no ramo da cache: uma faixa já
      // guardada toca do ficheiro e não prova nada sobre o YouTube.
      useSaudeDaReproducao.getState().observar({ tipo: 'nativo' });
    } catch (e: any) {
      // Falhou: ja nao ha download a decorrer, e o watchdog nao tem de contar
      // um tempo de espera que deixou de existir.
      descarregarRef.current.ativo = false;
      if (alive()) {
        const errMsg = e?.message ?? 'unknown';
        marcarResolver(track.sourceId, { erro: errMsg });
        setDownloadProgress(null);
        if (errMsg === DOWNLOAD_ABORTED) return; // cancelamento silencioso, não é erro

        // O tipo da falha deixou de ser adivinhado por regex sobre a mensagem.
        // Isso era um bug a sério: a mensagem vinha muitas vezes do
        // `playabilityStatus.reason`, que o YouTube devolve LOCALIZADO — com a
        // app em português a regex em inglês não apanhava nada, e um vídeo
        // removido acabava classificado como problema de rede e caía no embed,
        // que também não o ia tocar. Agora manda o sinal estruturado, e quando
        // a cascata inteira falhou o veredito já vem decidido do resolver.
        const tipo: TipoFalha = e?.tipoConsolidado ?? classificar(sinalDoErro(e));

        // O detalhe técnico vai para o relatório, não para o ecrã.
        const clientInfo = stream?.client
          ? `client=${stream.client}${stream.resolverNote ? ` (fell back: ${stream.resolverNote})` : ''}`
          : 'client=?';
        const potInfo = stream?.hasPoToken
          ? 'pot=yes'
          : `pot=no (${getLastBotGuardError() ?? 'n/a'})`;
        registar({
          quando: Date.now(),
          videoId: track.sourceId,
          titulo: track.title,
          fase: 'resolver',
          tipo,
          detalhe: `build=${BUILD_ID} ${clientInfo} ${potInfo} :: ${errMsg}`,
        });
        // O anel acima vive neste telemóvel; a analítica é o que diz, no SQL
        // Editor, se a porta se fechou a mais alguém. Só a etiqueta do tipo.
        registarEvento('faixa_falhou', { tipo, fase: 'resolver' });
        // Só se a falha foi na resolução (o `stream` ainda não existe).
        if (resolverDesde !== null && !stream) {
          registarEvento('resolvedor', { ok: false, tipo, ms: Date.now() - resolverDesde });
        }
        const plano = recuperacao(tipo);
        // O HLS antes do embed (ver `abrirHls`). Quem vai saltar (o vídeo
        // morreu) e quem está sem rede não chegam aqui.
        if (plano.embed && await abrirHls(alive)) {
          registarEvento('caiu_no_hls', { motivo: tipo, fase: 'resolver' });
          // Um stream que tenha chegado a abrir já não serve a ninguém.
          fecharTransmissao();
          beginPlayback('hls');
          // Toca no motor nativo, com o ecrã bloqueado: o aviso de que a música
          // vai parar deixa de ser verdade.
          useSaudeDaReproducao.getState().observar({ tipo: 'nativo' });
          return;
        }
        if (!alive()) return;
        useSaudeDaReproducao.getState().observar({ tipo: 'falha', falha: tipo, videoId: track.sourceId });

        // Uma frase, sem build id, sem nome de cliente e sem estado do PO
        // Token. A barra do leitor mostra isto em 220 px — o que lá estava
        // antes só cabia truncado.
        setError(mensagemDaFalha(tipo));

        if (plano.saltar) {
          if (!endedRef.current) {
            endedRef.current = true;
            void skipUnavailableTrack(track.sourceId);
          }
          return;
        }
        if (plano.embed) {
          registarEvento('caiu_no_embed', { motivo: tipo });
          setBackend('webview');
          return;
        }
        // Sem rede: não saltar (percorria a fila toda em segundos) nem cair no
        // embed (que também precisa de rede). Fica a mensagem, e o utilizador
        // volta a tentar quando tiver ligação.
        setBuffering(false);
      }
    }
  };
  proceedRef.current = proceedWithPlayerResponse;

  /**
   * O motor não tocou o Opus desta faixa (entrega 3 do plano): conta para o
   * desligar (lib/saudeDoOpus.ts), fica AAC até a app fechar, e o ficheiro
   * Opus sai do disco para ninguém o voltar a dar ao motor.
   */
  const recusarOpus = (motivo: 'abrir' | 'reproduzir') => {
    anotarOpus('recusou');
    evitarOpusPara(track.sourceId);
    removerOpusDaFaixa(track.sourceId);
    registarEvento('opus_recusado', { motivo });
  };

  /**
   * Recuar do Opus para o AAC com a faixa a tocar: descarrega o AAC e troca a
   * fonte na mesma posição, como a rede de segurança faz. `false` se não
   * houver AAC para onde ir -- aí segue o caminho de sempre (HLS, embed).
   */
  const recuoDoOpusRef = useRef<number | null>(null);
  const recuarDoOpus = async (): Promise<boolean> => {
    const myRun = runIdRef.current;
    recuoDoOpusRef.current = myRun;
    recusarOpus('reproduzir');
    const ainda = () => isMountedRef.current && myRun === runIdRef.current;
    const resumeAt = motorActivo().currentTime;
    try {
      const quality = await getAudioQuality();
      const { uri, stream: aac } = await resolverEDescarregar(track.sourceId, quality, track.durationSeconds, {
        prioridade: 'reproducao',
        shouldAbort: () => !ainda(),
        onProgress: (fr) => { if (ainda()) setDownloadProgress(fr); },
      });
      setDownloadProgress(null);
      if (!ainda()) return true;
      if (!uri) return false;
      streamRef.current = aac;
      downloadTriedRef.current = true;
      await trocarFonte(motorActivo(), {
        uri,
        contentType: 'progressive',
        metadata: metadadosDoEcraBloqueado(track),
      }, { desistir: () => !ainda() });
      if (!ainda()) return true;
      nativeTrackIdRef.current = track.sourceId;
      try {
        if (resumeAt > 1) motorActivo().currentTime = resumeAt;
      } catch {
        // ignorar — recomeça do início se o seek falhar
      }
      lastProgressRef.current = { time: lastProgressRef.current.time, at: Date.now() };
      if (wantsPlayRef.current) {
        motorActivo().play();
        fadeIn();
      } else {
        motorActivo().volume = ceilingRef.current;
      }
      return true;
    } catch (e: any) {
      setDownloadProgress(null);
      if (!ainda() || e?.message === DOWNLOAD_ABORTED) return true;
      return false;
    } finally {
      if (recuoDoOpusRef.current === myRun) recuoDoOpusRef.current = null;
    }
  };

  // Rede de segurança: troca o streaming direto (que pode ESTANCAR em músicas
  // longas no 4G) pelo download do ficheiro inteiro aos pedaços — que provei
  // descarregar sem estancar. Retoma na posição atual (não recomeça). Devolve
  // `true` se assumiu o caso (arrancou o download ou desistiu p/ embed).
  const runDownloadFallback = async (): Promise<boolean> => {
    // O motor recusou um Opus (erro do AVPlayer ou o watchdog a ver a posição
    // presa): recua-se para o AAC ANTES de tudo o resto -- descarregar outra
    // vez devolvia o mesmo ficheiro, e sem stream em memória (tocou da cache)
    // a regra de baixo mandava a faixa para o embed.
    if (recuoDoOpusRef.current === runIdRef.current) return true;
    if (temOpusEmDisco(track.sourceId)) return recuarDoOpus();
    const stream = streamRef.current;
    if (!stream || stream.isHls) return false;
    // A tocar enquanto descarregava: pode passar-se para o ficheiro a qualquer
    // momento, mesmo com o download ainda a correr -- o de baixo junta-se a
    // ele, ou devolve logo o ficheiro que ele publicou. Uma segunda chamada
    // durante a passagem não pode mandar ninguém para o embed.
    const transmissao = transmissaoRef.current;
    if (transmissao?.socorrida) return true;
    if (!transmissao && downloadTriedRef.current) return false;
    if (transmissao) transmissao.socorrida = true;
    downloadTriedRef.current = true;
    const myRun = runIdRef.current;
    const resumeAt = motorActivo().currentTime;
    // Se não foi a rede a falhar, foi o motor que não aguentou o stream -- e
    // isso conta para o desligar.
    if (transmissao) {
      if (!transmissao.downloadFalhou) anotarTransmissao('falhou');
      registarNoStream(
        `${track.sourceId}: ${transmissao.downloadFalhou ? 'download failed mid-stream' : 'player stuck on the stream'}`
        + `, switching to the file (played: ${transmissao.tocou}) ${diagnosticoDoStream(transmissao.sessao).slice(0, 600)}`,
      );
    }
    const largarTransmissao = () => {
      if (transmissao && transmissaoRef.current === transmissao) fecharTransmissao();
    };
    const ainda = () => isMountedRef.current && myRun === runIdRef.current;
    // O download do stream levou 403 do CDN, e já com as renovações todas
    // (ver `criarRenovacao`). Descarregar o ficheiro outra vez desde o início
    // batia no mesmo corte -- a 22/9 eram mais uns segundos parado antes do
    // embed. Vai-se direto ao HLS.
    const cortado = !!transmissao?.downloadFalhou
      && classificar(sinalDoErro(transmissao.erroDoDownload)) === 'bloqueio-bot';
    try {
      if (cortado) throw transmissao!.erroDoDownload;
      const uri = await downloadProgressiveAudio(
        track.sourceId,
        stream.url,
        stream.contentLength,
        track.durationSeconds || stream.durationSeconds || null,
        {
          prioridade: 'reproducao',
          shouldAbort: () => !ainda(),
          onProgress: (f) => {
            if (ainda()) setDownloadProgress(f);
          },
          renewUrl: criarRenovacao(track.sourceId, await getAudioQuality(), stream.formato ?? 'aac'),
        }
      );
      setDownloadProgress(null);
      if (!isMountedRef.current || myRun !== runIdRef.current) return true;
      await trocarFonte(motorActivo(), {
        uri,
        contentType: 'progressive',
        metadata: metadadosDoEcraBloqueado(track),
      }, { desistir: () => !isMountedRef.current || myRun !== runIdRef.current });
      if (!isMountedRef.current || myRun !== runIdRef.current) return true;
      largarTransmissao();
      nativeTrackIdRef.current = track.sourceId;
      try {
        if (resumeAt > 1) motorActivo().currentTime = resumeAt;
      } catch {
        // ignorar — recomeça do início se o seek falhar
      }
      // Quem pausou continua em pausa: a troca pode vir de um download que
      // falhou com a música parada, e não só do watchdog (que só corre a tocar).
      if (wantsPlayRef.current) {
        motorActivo().play();
        fadeIn();
      } else {
        motorActivo().volume = ceilingRef.current;
      }
    } catch (e: any) {
      setDownloadProgress(null);
      if (!ainda()) return true;
      if (e?.message === DOWNLOAD_ABORTED) return true;
      // Era aqui que o 403 ao fim de ~1 MB (a porta fechada, ago 2026) caía no
      // embed: com o `[build ...]` no ecrã e sem entrar no relatório. Passa
      // pelo mesmo caminho do resolver -- classificar, registar, uma frase.
      const tipo = classificar(sinalDoErro(e));
      // O PO Token entra no detalhe: sem ele, o relatório de 22/9 não dizia se
      // o corte era de um token que falhou ou de um que nem chegou a existir.
      const potInfo = stream.hasPoToken
        ? 'pot=yes'
        : `pot=no (${getLastBotGuardError() ?? 'n/a'})`;
      const detalhe = `build=${BUILD_ID} client=${stream.client ?? '?'} ${potInfo} :: ${e?.message ?? 'unknown'}`
        + (cortado ? ' (stream)' : '');

      // O HLS antes do embed (ver `abrirHls`). O stream, se ainda estiver a
      // tocar o que chegou, continua até a fonte mudar.
      if (recuperacao(tipo).embed) {
        const aberto = await abrirHls(ainda);
        if (!ainda()) return true;
        if (aberto) {
          largarTransmissao();
          nativeTrackIdRef.current = track.sourceId;
          const retomarEm = aberto.ia > 1 ? aberto.ia : resumeAt;
          try {
            if (retomarEm > 1) motorActivo().currentTime = retomarEm;
          } catch {
            // ignorar — recomeça do início se o seek falhar
          }
          lastProgressRef.current = { time: lastProgressRef.current.time, at: Date.now() };
          if (wantsPlayRef.current) {
            motorActivo().play();
            fadeIn();
          } else {
            motorActivo().volume = ceilingRef.current;
          }
          registar({
            quando: Date.now(), videoId: track.sourceId, titulo: track.title,
            fase: 'download', tipo, detalhe: `${detalhe} -> HLS`,
          });
          registarEvento('caiu_no_hls', { motivo: tipo, fase: 'download' });
          useSaudeDaReproducao.getState().observar({ tipo: 'nativo' });
          return true;
        }
      }

      largarTransmissao();
      registar({
        quando: Date.now(),
        videoId: track.sourceId,
        titulo: track.title,
        fase: 'download',
        tipo,
        detalhe: `${detalhe} -> embed`,
      });
      registarEvento('caiu_no_embed', { motivo: tipo, fase: 'download' });
      useSaudeDaReproducao.getState().observar({ tipo: 'falha', falha: tipo, videoId: track.sourceId });
      setError(mensagemDaFalha(tipo));
      setBackend('webview');
    }
    return true;
  };
  const fallbackRef = useRef(runDownloadFallback);
  fallbackRef.current = runDownloadFallback;

  /**
   * O fim que o AVPlayer não anunciou. Segue exatamente o caminho do
   * `playToEnd` para o repeat e a fila se comportarem na mesma, e é
   * idempotente por `endedRef` -- os dois detetores podem disparar juntos.
   */
  const avancarPorFimSilencioso = () => {
    if (endedRef.current || usePlayer.getState().closing) return;
    if (nativeTrackIdRef.current !== track.sourceId) return;
    if (repeatMode === 'one') {
      player.currentTime = 0;
      player.play();
      return;
    }
    registarNaFila(
      `${track.sourceId}: silent end at ${lastProgressRef.current.time.toFixed(1)}s`
      + ` of ${track.durationSeconds ?? streamRef.current?.durationSeconds ?? '?'}s`,
    );
    endedRef.current = true;
    onStateChange('ended');
  };

  // Eventos do player nativo -> store
  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    // Mudar de ritmo faz o expo-video reconstruir os alvos do Now Playing e
    // voltar a ligar os saltos de ±10 s. Reafirmar aqui, não por relógio.
    reafirmarComandosDeFaixa();
    if (backend === 'native' && nativeTrackIdRef.current === track.sourceId) {
      onStateChange(isPlaying ? 'playing' : 'paused');
    }
  });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    // Sleep timer verificado aqui porque este evento continua a disparar em
    // background (sessão de áudio ativa) — ao contrário dos setInterval JS,
    // que o iOS suspende com o ecrã bloqueado.
    usePlayer.getState().checkSleepTimer();
    // Pelo mesmo motivo, e não por acaso ao lado: o batimento da sessão de
    // handoff. Estava num `setInterval` e por isso NUNCA corria com o ecrã
    // bloqueado -- justamente quando o outro dispositivo precisava de saber
    // onde é que a música ia.
    baterSessao();
    if (backend !== 'native' || nativeTrackIdRef.current !== track.sourceId) return;
    // Regista avanço real da posição (para o watchdog de stream preso).
    if (currentTime !== lastProgressRef.current.time) {
      lastProgressRef.current = { time: currentTime, at: Date.now() };
    }
    // O áudio começou mesmo → deixa de estar "a carregar" (pára o pulsar).
    if (currentTime > 0) setBuffering(false);
    if (currentTime > 0) {
      const nota = primeiraNotaRef.current;
      if (nota?.origem && nota.run === runIdRef.current) {
        primeiraNotaRef.current = null;
        const medida = primeiraNota(nota.pedidaEm, Date.now(), nota.origem);
        if (medida) registarEvento('primeira_nota', medida);
        // Um Opus a tocar é a prova de que este iPhone o toca (lib/saudeDoOpus.ts).
        if (nota.origem !== 'hls' && temOpusEmDisco(track.sourceId)) anotarOpus('tocou');
      }
      const t = transmissaoRef.current;
      if (t && !t.tocou && t.run === runIdRef.current) {
        t.tocou = true;
        anotarTransmissao('tocou');
        registarNoStream(`${track.sourceId}: first sound while downloading ${diagnosticoDoStream(t.sessao).slice(0, 600)}`);
      }
    }
    if(currentTime>0&&player.playing&&!usePlayer.getState().playbackConfirmed)onStateChange('playing');

    // [duration-debug] player.duration é exatamente o que o expo-video publica
    // no Lock Screen (MPMediaItemPropertyPlaybackDuration = currentItem.duration).
    // Esperado após a correção: player.duration ≈ track.durationSeconds (1x).
    // A duração REAL vem da YouTube Data API (track.durationSeconds) ou do
    // resolved stream (streamRef.current?.durationSeconds), que é fiável.
    // Não usamos player.duration porque alguns streams m4a do YouTube
    // reportam o DOBRO da duração (contentor com duração errada) — o áudio
    // acaba a meio do "fim" do player. Só caímos no player.duration se a app
    // não souber a duração real.
    const durationSec = track.durationSeconds || streamRef.current?.durationSeconds || player.duration || 0;
    const knownMs = durationSec * 1000;
    setProgress(currentTime * 1000, knownMs);

    // A passagem para a faixa seguinte -- as decisões estão em
    // src/lib/crossfade.ts; aqui só se mexem volumes.
    //
    // A duração usada é a de CONFIANÇA, sem o `player.duration`: há m4a do
    // YouTube que reportam o dobro, e com um deles a passagem começaria a
    // meio da música.
    const duracaoFiavel = track.durationSeconds || streamRef.current?.durationSeconds || null;
    // O ritmo dos eventos depende de quanto falta -- ver `reporIntervaloDeTempo`.
    pontoDaPosicaoRef.current = { sourceId: track.sourceId, posicao: currentTime, duracao: duracaoFiavel };
    reporIntervaloDeTempo();
    if (passagemRef.current) {
      if (duracaoFiavel) avancarPassagem(currentTime, duracaoFiavel);
    } else if (!usePlayer.getState().closing) {
      const preparada = seguinteRef.current;
      if (!preparada?.pronta) {
        // O `timeUpdate` vem do AVPlayer e continua a chegar com o ecrã
        // bloqueado -- ao contrário do `setInterval` do watchdog, que o iOS
        // suspende. Preparar a seguinte a partir dali dava crossfade com a
        // app à frente e nenhum com o telemóvel no bolso, que é o caso que
        // conta.
        void prepararSeguinte();
      } else if (!endedRef.current) {
        // O `endedRef` já marcado quer dizer que esta faixa já entregou o
        // lugar -- ou por uma passagem que fechou, ou pelo fim normal. Sem
        // esta guarda, enquanto o `next()` não voltasse (pode ir à rede
        // buscar uma sugestão), a faixa que sai começava uma SEGUNDA
        // passagem por cima da que já estava a tocar em cheio.
        const st = usePlayer.getState();
        const seguinte = st.proximaFaixa();
        if (useOuvirJuntos.getState().sessao || !seguinte || seguinte.sourceId !== preparada.sourceId) {
          // A fila mudou por baixo: deixa preparar outra vez.
          seguinteRef.current = null;
          reporIntervaloDeTempo();
        } else if (
          deveComecarCrossfade({
            duracaoDoFade: st.crossfadeSegundos,
            duracaoSegundos: duracaoFiavel,
            posicaoSegundos: currentTime,
            temFaixaSeguinte: true,
            repeatUma: st.repeatMode === 'one',
            backendNativo: true,
            seguinteCarregada: true,
            aDecorrer: false,
            // Onde a música acaba mesmo, quando a análise da cauda já correu.
            // Sem ela conta-se do fim do ficheiro, como sempre.
            fimMusicalSegundos: fimMusicalGuardado(track.sourceId),
          })
        ) {
          comecarPassagem(seguinte);
        }
      }
    }

    // Nunca antecipar o fim com base numa duração arredondada. O código
    // antigo começava um fade quando ainda faltavam 1,5 s e marcava a faixa
    // como terminada no fim desse fade — daí a fila saltar visivelmente antes
    // do tempo indicado. O `playToEnd` abaixo é emitido pelo media player no
    // fim real do áudio e é a única autoridade para avançar/repetir.
  });
  useEventListener(player, 'playToEnd', () => {
    if(usePlayer.getState().closing)return;
    if (backend === 'native' && nativeTrackIdRef.current === track.sourceId) {
      if (passagemRef.current) {
        // O áudio que sai acabou antes de a curva fechar -- a duração
        // conhecida é aproximada. Fecha-a já: sem mais eventos de tempo a
        // passagem ficava pendurada e a fila não avançava.
        terminarPassagem();
        return;
      }
      registarNaFila(
        `${track.sourceId}: engine reported the end at ${lastProgressRef.current.time.toFixed(1)}s`
        + ` of ${track.durationSeconds ?? streamRef.current?.durationSeconds ?? '?'}s`,
      );
      if (repeatMode === 'one') {
        player.currentTime = 0;
        player.play();
      } else if (!endedRef.current) {
        endedRef.current = true;
        onStateChange('ended');
      }
    }
  });
  useEventListener(player, 'playbackRateChange', ({ playbackRate }) => {
    if (backend === 'native' && nativeTrackIdRef.current === track.sourceId && playbackRate === 0.07) {
      player.playbackRate = 1.0;
      prev();
    }
  });
  useEventListener(player, 'statusChange', ({ status, error }) => {
    // `readyToPlay` faz o expo-video reconstruir os alvos. Numa ligação lenta
    // chega muito depois da faixa mudar, fora de qualquer janela de espera.
    if (status === 'readyToPlay') reafirmarComandosDeFaixa();

    // Fim de faixa com o ecrã bloqueado. O `setInterval` do watchdog é
    // suspenso pelo iOS aí; este evento vem de KVO no AVPlayer e continua a
    // chegar. É também o único sinal que separa uma pausa (readyToPlay) de
    // um encravamento (loading) -- ver src/lib/fimDeFaixa.ts.
    if (
      backend === 'native' &&
      nativeTrackIdRef.current === track.sourceId &&
      fimPorFaltaDeDados({
        querTocar: wantsPlayRef.current,
        aCarregar: status === 'loading',
        aTocar: player.playing,
        posicaoSegundos: lastProgressRef.current.time,
        // Aqui -- e SÓ aqui e no watchdog -- o `player.duration` entra como
        // último recurso. Ver `duracaoParaDetetarOFim`: uma faixa que chega sem
        // duração ficava presa no último segundo para sempre.
        duracaoSegundos: duracaoParaDetetarOFim(
          track.durationSeconds || streamRef.current?.durationSeconds,
          player.duration,
        ),
      })
    ) {
      // Um fim que o AVPlayer não anunciou. Vale a pena saber quantos são.
      registarEvento('fim_encravado');
      avancarPorFimSilencioso();
      return;
    }
    if (backend !== 'native' || status !== 'error' || nativeTrackIdRef.current !== track.sourceId) return;
    fallbackRef.current().then((handled) => {
      if (!handled) {
        // O motor nativo deu erro e não havia ficheiro para onde fugir. A
        // frase é a do diagnóstico; o detalhe vai para o relatório.
        const tipo = classificar(sinalDoErro(error));
        registar({
          quando: Date.now(),
          videoId: track.sourceId,
          titulo: track.title,
          fase: 'motor',
          tipo,
          detalhe: `build=${BUILD_ID} :: ${error?.message ?? 'unknown'}`,
        });
        setError(mensagemDaFalha(tipo));
        registarEvento('caiu_no_embed', { motivo: 'erro_de_reproducao' });
        setBackend('webview');
      }
    });
  });

  // Cada `replaceAsync` cria um AVPlayerItem novo e o expo-video volta a
  // registar os comandos. Acontece também a meio da faixa, quando o watchdog
  // troca para o ficheiro descarregado — e aí nada no React muda.
  useEventListener(player, 'sourceChange', () => {
    reafirmarComandosDeFaixa();
  });

  /**
   * A rede de segurança da passagem, e a razão de ela existir.
   *
   * O crossfade entrega a fila ao `ended`, que é quem sabe de repeat, de
   * rádio e do shuffle inteligente. Só que o `ended` pode não avançar faixa
   * nenhuma -- e quando isso acontece a app fica num estado que não se
   * desfaz: quem entrou está a tocar, a loja continua na faixa que saiu, e
   * os controlos mexem no motor que já acabou. O botão de pausa deixa de
   * fazer barulho nenhum e só reiniciar a app resolve. Aconteceu.
   *
   * O relógio é o motor que ENTROU, e não há outro: quem saiu já acabou e
   * não emite mais nada, e um `setInterval` não corre com o ecrã bloqueado.
   * Fora de uma entrega este ouvinte não faz nada -- o motor em espera está
   * parado, portanto não manda eventos.
   *
   * A recuperação é modesta de propósito: cala quem entrou e volta a pedir
   * o `ended` uma vez. Se a fila avançar, continua-se com uma falha no som;
   * se não avançar, fica-se no estado que a app teria sem crossfade nenhum
   * -- faixa acabada e parado. Feio, mas mexe-se, que era o que faltava.
   */
  useEventListener(motorEmEspera, 'timeUpdate', () => {
    const entrega = entregaRef.current;
    if (!entrega) return;
    if (entrega.deQual !== track.sourceId) {
      entregaRef.current = null;
      return;
    }
    if (Date.now() - entrega.quando < ESPERA_PELA_ENTREGA_MS) return;

    entregaRef.current = null;
    seguinteRef.current = null;
    registarEvento('entrega_falhada');
    try {
      motorEmEspera.pause();
      motorEmEspera.volume = 0;
    } catch {
      // motor sem fonte — ignorar
    }
    onStateChange('ended');
  });

  // No embed (webview) a reprodução é do próprio YouTube — deixa de fazer
  // sentido o estado "a carregar" (pára o pulsar da capa).
  useEffect(() => {
    if (backend === 'webview') setBuffering(false);
  }, [backend, setBuffering]);

  // Watchdog da posição parada. Duas paragens, duas respostas -- a decisão
  // está isolada e testada em src/lib/fimDeFaixa.ts:
  //
  //  - longe do fim, o stream não arrancou ou morreu a meio (músicas longas
  //    em 4G, que às vezes nem começam): troca para o ficheiro descarregado;
  //  - no último par de segundos não há nada a recuperar, o áudio acabou e o
  //    AVPlayer não emitiu o `playToEnd`: avança na fila.
  //
  // Usa a INTENÇÃO (wantsPlayRef), por isso apanha também o caso em que a
  // música nunca chega a começar (posição presa em ~0).
  useEffect(() => {
    if (backend !== 'native') return;
    const id = setInterval(() => {
      // A duração de confiança primeiro; o `player.duration` só se não houver
      // outra. Ver `duracaoParaDetetarOFim` -- é o único par de sítios onde ele
      // entra, e entra porque errar aqui por excesso só perde a deteção.
      const acao = acaoDoWatchdog({
        querTocar: wantsPlayRef.current,
        paradoMs: Date.now() - lastProgressRef.current.at,
        posicaoSegundos: lastProgressRef.current.time,
        duracaoSegundos: duracaoParaDetetarOFim(
          track.durationSeconds || streamRef.current?.durationSeconds,
          player.duration,
        ),
        jaDescarregou: downloadTriedRef.current,
        downloadParadoMs: descarregarRef.current.ativo
          ? Date.now() - descarregarRef.current.at
          : null,
      });

      if (acao === 'descarregar') { registarEvento('trocou_para_ficheiro'); fallbackRef.current(); }
      // Nunca arrancou e nada mexe ha muito tempo. Nao ha recuperacao a
      // tentar -- ha um estado por destrancar. Ficar calado aqui era o que
      // deixava a faixa em 0:00 ate a app ser reiniciada.
      if (acao === 'desistir') {
        registarEvento('desistiu_de_arrancar');
        registar({
          quando: Date.now(),
          videoId: track.sourceId,
          titulo: track.title,
          fase: 'watchdog',
          tipo: 'tempo-esgotado',
          detalhe: `build=${BUILD_ID} nada avancou em ${DESISTIR_MS}ms`,
        });
        descarregarRef.current.ativo = false;
        wantsPlayRef.current = false;
        setDownloadProgress(null);
        usePlayer.getState()._setBuffering(false);
        // A mensagem dizia "Retrying another way..." e não havia retry nenhum:
        // este ramo mostrava o aviso e parava ali. Um beco sem saída com uma
        // placa a dizer que a estrada continua -- e a faixa ficava nos 0:00 até
        // a app ser reiniciada, que foi exactamente o que voltou a acontecer.
        //
        // Agora diz o que faz e faz o que diz. O `skipUnavailableTrack` já
        // sabe o resto: numa sessão avança a fila partilhada, sozinho procura
        // uma cópia segura desta música antes de desistir dela.
        setError('This track did not start. Skipping…');
        void skipUnavailableTrack(track.sourceId);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [backend, track.durationSeconds, track.sourceId, repeatMode, player, onStateChange]);

  // Ligar/desligar a normalização nas Definições aplica-se já, sem esperar
  // pela faixa seguinte.
  useEffect(() => {
    if (backend !== 'native') return;
    const ceiling = applyCeiling();
    // Não mexer a meio de um fade nem de uma passagem: os dois acabam no
    // teto novo à mesma.
    if (!fadeIntervalRef.current && !passagemRef.current && !usePlayer.getState().closing) {
      try {
        player.volume = ceiling;
      } catch {
        // player sem fonte — ignorar
      }
    }
  }, [volumeNormalization, backend, track.sourceId]);

  // O fecho usa o volume efetivo: não sobrescreve a preferência nem compete com o fade-in.
  useEffect(()=>{
    if(backend !== 'native') return;
    if(closing){
      // Fechar não é passar: cala a que entrava e leva só a atual no fade.
      abortarPassagem();
      if(closingVolume.current === null) closingVolume.current=player.volume;
      if(fadeIntervalRef.current){clearInterval(fadeIntervalRef.current);fadeIntervalRef.current=null;}
      player.volume=closingVolume.current*closeGain;
    } else if(closingVolume.current !== null){
      closingVolume.current=null;
      player.volume=ceilingRef.current;
    }
  },[closeGain,closing,backend,player]);

  // O Smart Cache adianta as PRÓXIMAS faixas -- três em Wi-Fi, duas em dados
  // móveis (lib/adiantarFaixas.ts) -- uma de cada vez e sempre atrás da que
  // toca. Só a seguinte era adiantada, e saltar duas de seguida era esperar
  // pelo download (13/9). A primeira continua a ser a da mesma decisão da
  // reprodução, com a prioridade que o crossfade precisa.
  useEffect(() => {
    const lista = usePlayer
      .getState()
      .proximasFaixas(quantasAdiantar(useConnectivity.getState().dadosMoveis))
      .filter((faixa) => faixa.sourceId !== track.sourceId);
    // Já, e não daqui a cinco segundos. A fila só deixa passar um download de
    // cada vez e não interrompe ninguém: um adiantamento que deixou de servir
    // tem de largar a vaga ANTES de a faixa escolhida a pedir. A que está a
    // tocar fica de fora do abandono -- se vinha a ser adiantada, a reprodução
    // está à espera desse mesmo download, e abandoná-lo fazia-o recomeçar.
    // Mesmo a resolver: a atual pode adotar o seu adiantamento, mas os outros
    // têm de largar a vaga para ela. Depois de pronta, volta-se a adiantar.
    const servem = new Set([track.sourceId, ...(backend === 'native' ? lista.map((faixa) => faixa.sourceId) : [])]);
    for (const [id, pedido] of aAdiantar) pedido.abandonado = !servem.has(id);
    verificarCancelamentos();
    if (backend !== 'native') return;

    // As capas grandes vêm com elas, e já: são leves ao pé do áudio, e sem isto
    // o skip mostrava o leitor sem capa até a imagem de 1280 px chegar (14/9).
    if (!useConnectivity.getState().offline) preCarregarCapasGrandes(lista);

    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const [i, faixa] of lista.entries()) {
        if (cancelled || useConnectivity.getState().offline) return;
        if (cachedAudioFile(faixa.sourceId).exists) continue;
        // Uma que já vinha a descarregar de antes continua, não recomeça.
        const jaVem = aAdiantar.get(faixa.sourceId);
        if (jaVem) {
          await jaVem.pronto;
          continue;
        }
        const pedido: Adiantamento = { abandonado: false, pronto: Promise.resolve() };
        aAdiantar.set(faixa.sourceId, pedido);
        pedido.pronto = adiantarFaixa(faixa, i === 0 ? 'seguinte' : 'adiantar', () => pedido.abandonado)
          .finally(() => {
            if (aAdiantar.get(faixa.sourceId) === pedido) aAdiantar.delete(faixa.sourceId);
          });
        await pedido.pronto;
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      // O setup seguinte decide o que deixou de servir. Um abort() aqui não
      // pode ser desfeito ao repor abandonado=false na faixa que passou a tocar.
    };
  }, [track.sourceId, backend, queue, queueIndex, shuffle, percursoDoShuffle, repeatMode, sessaoJam, filaJam]);

  // Registar os controlos do backend ativo na store (play/pause/seek).
  useEffect(() => {
    if (backend === 'resolving') return;
    if (backend === 'native') {
      registerYtControls({
        play: () => {
          wantsPlayRef.current = true;
          // Reinicia o cronómetro do watchdog — sem isto, retomar depois de
          // uma pausa longa disparava o fallback de download por engano.
          lastProgressRef.current = { time: lastProgressRef.current.time, at: Date.now() };
          // Configura antes de tocar: começar a 1x e corrigir logo depois
          // introduzia uma segunda mudança audível ao retomar. Jam mantém 1x.
          tocarNaVelocidade(player,velocidadeNaSessao(
            usePlayer.getState().playbackRate,!!useOuvirJuntos.getState().sessao
          ),aplicarVelocidadeNativa);
          // Passagem suspensa: os dois motores voltam juntos, de onde iam.
          if (passagemRef.current) {
            try {
              motorEmEspera.play();
            } catch {
              // motor sem fonte — ignorar
            }
          }
        },
        pause: () => {
          wantsPlayRef.current = false;
          player.pause();
          // `suspender`: quem pausa quer voltar, e a passagem continua de
          // onde ia. Parar o motor que sai já congela a curva, porque é o
          // `timeUpdate` dele que a faz andar.
          if (passagemRef.current) {
            try {
              motorEmEspera.pause();
            } catch {
              // motor sem fonte — ignorar
            }
          }
        },
        seek: (ms) => {
          // `abortar`: a posição deixa de estar no fim, a razão da passagem
          // desapareceu -- e a faixa atual continua.
          abortarPassagem();
          player.currentTime = ms / 1000;
        },
      });
    } else {
      registerYtControls({
        play: () =>
          webRef.current?.injectJavaScript(
            'window.__duotone&&window.__duotone.play();true;'
          ),
        pause: () =>
          webRef.current?.injectJavaScript(
            'window.__duotone&&window.__duotone.pause();true;'
          ),
        setVolume: (v) => webRef.current?.injectJavaScript(`(function(){var v=document.querySelector('video');if(v)v.volume=${Math.max(0,Math.min(1,v/100))};})();true;`),
        seek: (ms) =>
          webRef.current?.injectJavaScript(
            `window.__duotone&&window.__duotone.seek(${(ms / 1000).toFixed(2)});true;`
          ),
      });
    }
    return () => registerYtControls(null);
  }, [backend, player, registerYtControls]);

  const webviewSkippedRef = useRef(false);
  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'state') onStateChange(msg.value);
      else if (msg.type === 'progress' && msg.duration > 0)
        setProgress(msg.position, msg.duration);
      else if (msg.type === 'unavailable' && !webviewSkippedRef.current) {
        // Vídeo indisponível no embed — retirar da sessão e saltar já, sem
        // ficar à espera do rádio automático no fim da fila.
        webviewSkippedRef.current = true;
        console.warn(`[YouTubePlayer] Embed indisponível (${msg.reason}), a saltar.`);
        if (!endedRef.current) {
          endedRef.current = true;
          void skipUnavailableTrack(track.sourceId);
        }
      }
    } catch {
      // ignorar
    }
  };

  if (backend === 'webview') {
    // origin=https://www.youtube.com + Referer evitam boa parte dos falsos
    // "erro 153" (config error) que o embed mostra quando não reconhece de
    // onde está a ser carregado.
    const uri =
      `https://www.youtube.com/embed/${track.sourceId}` +
      '?playsinline=1&autoplay=1&rel=0&controls=1&fs=0&origin=https%3A%2F%2Fwww.youtube.com';
    return (
      <WebView
        ref={webRef}
        key={track.sourceId}
        source={{ uri, headers: { Referer: 'https://www.youtube.com/' } }}
        style={styles.fill}
        onMessage={onMessage}
        injectedJavaScript={BRIDGE_JS}
        javaScriptEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={false}
        scrollEnabled={false}
        bounces={false}
      />
    );
  }

  // resolving | native -> Para poupar bateria e evitar o aquecimento do telemóvel,
  // não renderizamos o VideoView. Como a app é exclusivamente focada em áudio,
  // escusamos de forçar o descodificador de vídeo nativo a desenhar frames no ecrã.
  return null;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#000',
  },
});
