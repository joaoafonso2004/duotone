import { useConnectivity } from '../state/connectivity';
import { useEventListener } from 'expo';
import { useVideoPlayer } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { resolveYouTubeStream, streamFromPlayerResponse, type YtStream } from '../api/ytstream';
import { BUILD_ID } from '../lib/buildInfo';
import { reafirmarComandosDeFaixa } from '../lib/comandosDeFaixa';
import { registar as registarEvento } from '../lib/eventos';
import { urlsDaCapa } from '../lib/capaDoEcraBloqueado';
import {
  deveComecarCrossfade, podeCrossfade, volumesDoCrossfade,
} from '../lib/crossfade';
import { acaoDoWatchdog, fimPorFaltaDeDados } from '../lib/fimDeFaixa';
import { definirCapaDoEcraBloqueado, temCapaNativa } from '../../modules/duotone-remote-commands';
import { getLastBotGuardError } from '../lib/botguardBridge';
import { getAudioQuality } from '../lib/prefs';
import { targetVolume } from '../lib/loudness';
import { getLoudnessDb, rememberLoudnessDb } from '../lib/loudnessCache';
import { cachedAudioFile, downloadProgressiveAudio, DOWNLOAD_ABORTED } from '../lib/youtubeCache';
import {
  classificar, mensagem as mensagemDaFalha, recuperacao, registar,
  sinalDoErro, type TipoFalha,
} from '../lib/playbackDiagnostics';
import { usePlayer } from '../state/player';
import { aoTocar as ajusteAoTocar, chaveDaFaixa, compensacaoLinear } from '../lib/equalizer';
import { arredondar as arredondarRate } from '../lib/playbackRate';
import { displayArtist } from '../lib/artistName';
import { aplicarEqualizadorNativo, ligarAudioNativo } from '../../modules/duotone-audio';
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
  const playbackRate = usePlayer((s) => s.playbackRate);
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
  const aPrepararRef = useRef(false);

  /**
   * A passagem a decorrer, ou `null`.
   *
   * Guarda os DOIS tetos porque cada faixa tem o seu, vindo da normalização
   * de loudness: a curva tem de respeitar os dois, senão a que entra salta.
   */
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

  // Aplica o Preset de Som reativamente na velocidade de reprodução nativa.
  // ATENÇÃO: no expo-video, definir playbackRate faz `AVPlayer.rate = x`, e no
  // AVFoundation rate != 0 É "play" — sem o guard de wantsPlayRef, isto
  // arrancava a música sozinho no restauro de sessão (que fica em pausa).
  useEffect(() => {
    if (backend !== 'native' || !wantsPlayRef.current) return;
    player.playbackRate = playbackRate;
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
  const wantsPlayRef = useRef(true);

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
   * É a única decisão sobre o ritmo dos eventos de tempo, e está toda aqui:
   *
   *  - durante uma passagem, 0,25 s, para a curva não se ouvir aos degraus;
   *  - com a faixa seguinte já preparada, 0,5 s, para não se perder o
   *    instante de começar (a 2 s podia começar quase no fim do fade, e a
   *    música que sai caía de repente);
   *  - de resto, 1 s à frente e 2 s atrás -- em background não há barra de
   *    progresso para animar e é metade das travessias nativo -> JS.
   */
  const reporIntervaloDeTempo = () => {
    const passo = passagemRef.current
      ? 0.25
      : seguinteRef.current?.pronta
        ? 0.5
        : AppState.currentState === 'active'
          ? 1
          : 2;
    try {
      player.timeUpdateEventInterval = passo;
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
    const seguinte = st.peekNextTrack();
    if (!seguinte || seguinte.source !== 'youtube') return;
    if (seguinte.sourceId === track.sourceId) return;
    if (seguinteRef.current?.sourceId === seguinte.sourceId) return;

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
      await emEspera.replaceAsync({
        uri: ficheiro.uri,
        contentType: 'progressive',
        metadata: metadadosDoEcraBloqueado(seguinte),
      });
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
      motorEmEspera.playbackRate = seguinteRef.current?.rate ?? st.playbackRate;
      motorEmEspera.play();
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
      const entra = motorEmEspera;
      const sai = player;
      streamRef.current = undefined;
      downloadTriedRef.current = false;
      lastProgressRef.current = { time: 0, at: Date.now() };
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
        entra.playbackRate = usePlayer.getState().playbackRate;
        entra.play();
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
    nativeTrackIdRef.current = null;
    streamRef.current = undefined;
    downloadTriedRef.current = false;
    lastProgressRef.current = { time: 0, at: Date.now() };
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
    const beginPlayback = () => {
      const st = usePlayer.getState();
      const resumeMs = st.resumePositionMs;
      if (resumeMs && resumeMs > 1500) {
        try {
          player.currentTime = resumeMs / 1000;
        } catch {
          // seek falhou — recomeça do início
        }
      }
      const autoplay = st.autoplayOnLoad;
      applyCeiling();
      usePlayer.setState({ resumePositionMs: null });
      lastProgressRef.current = { time: 0, at: Date.now() };
      nativeTrackIdRef.current = track.sourceId;
      wantsPlayRef.current = autoplay;
      if (autoplay) {
        player.play();
        fadeIn();
      } else {
        // Garantia explícita de pausa: nada abaixo pode arrancar o playback
        // (nem o efeito da velocidade — ver guard de wantsPlayRef acima).
        try {
          player.pause();
        } catch {
          // player sem fonte — ignorar
        }
        player.volume = ceilingRef.current;
        st._setIsPlaying(false);
        st._setBuffering(false);
      }
      setBackend('native');
    };

    // MODO OFFLINE / CACHE RÁPIDO: Se a música já estiver guardada localmente, toca-a imediatamente
    const localFile = cachedAudioFile(track.sourceId);
    if (localFile.exists) {
      try {
        await player.replaceAsync({
          uri: localFile.uri,
          contentType: 'progressive',
          metadata: metadadosDoEcraBloqueado(track),
        });
        if (!alive()) return;
        beginPlayback();
        return;
      } catch (err) {
        console.warn('Erro a reproduzir ficheiro local em cache, tentando rede:', err);
      }
    }

    if(useConnectivity.getState().offline){
      setError('This song is not available offline. Choose a downloaded song in Songs.');
      usePlayer.getState()._setBuffering(false);
      return;
    }

    // Fora do try para ficar acessível no catch (diagnóstico do cliente/token).
    let stream: YtStream | undefined;
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
        stream = await resolveYouTubeStream(track.sourceId, quality);
      }
      if (!alive()) return;
      streamRef.current = stream;
      // Guardar a loudness ANTES de aplicar o teto: da próxima vez a faixa
      // toca do ficheiro local e já não passa por aqui.
      rememberLoudnessDb(track.sourceId, stream.loudnessDb);
      applyCeiling();

      // Descarrega primeiro se for progressive (comportamento antigo e fiável).
      let playableUri = stream.url;
      if (!stream.isHls) {
        downloadTriedRef.current = true;
        playableUri = await downloadProgressiveAudio(
          track.sourceId,
          stream.url,
          stream.contentLength,
          track.durationSeconds || stream.durationSeconds || null,
          {
            // Aborta entre chunks se o utilizador trocar de faixa — sem isto,
            // saltar várias faixas deixava vários downloads completos a
            // competir pela rede.
            shouldAbort: () => !alive(),
            onProgress: (f) => {
              if (alive()) setDownloadProgress(f);
            },
            // Se o CDN matar o URL a meio (403), pede um fresco em vez de
            // repetir o morto — ver fetchChunkWithRetry.
            renewUrl: async () =>
              (await resolveYouTubeStream(track.sourceId, quality, true)).url,
          }
        );
        if (!alive()) return;
        setDownloadProgress(null);
      }

      await player.replaceAsync({
        uri: playableUri,
        contentType: stream.isHls ? 'hls' : 'progressive',
        metadata: metadadosDoEcraBloqueado(track),
      });
      if (!alive()) return;
      beginPlayback();
    } catch (e: any) {
      if (alive()) {
        const errMsg = e?.message ?? 'unknown';
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

        // Uma frase, sem build id, sem nome de cliente e sem estado do PO
        // Token. A barra do leitor mostra isto em 220 px — o que lá estava
        // antes só cabia truncado.
        setError(mensagemDaFalha(tipo));

        const plano = recuperacao(tipo);
        if (plano.saltar) {
          if (!endedRef.current) {
            endedRef.current = true;
            void skipUnavailableTrack(track.sourceId);
          }
          return;
        }
        if (plano.embed) {
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

  // Rede de segurança: troca o streaming direto (que pode ESTANCAR em músicas
  // longas no 4G) pelo download do ficheiro inteiro aos pedaços — que provei
  // descarregar sem estancar. Retoma na posição atual (não recomeça). Devolve
  // `true` se assumiu o caso (arrancou o download ou desistiu p/ embed).
  const runDownloadFallback = async (): Promise<boolean> => {
    const stream = streamRef.current;
    if (!stream || stream.isHls || downloadTriedRef.current) return false;
    downloadTriedRef.current = true;
    const myRun = runIdRef.current;
    const resumeAt = player.currentTime;
    try {
      const uri = await downloadProgressiveAudio(
        track.sourceId,
        stream.url,
        stream.contentLength,
        track.durationSeconds || stream.durationSeconds || null,
        {
          shouldAbort: () => !isMountedRef.current || myRun !== runIdRef.current,
          onProgress: (f) => {
            if (isMountedRef.current && myRun === runIdRef.current) setDownloadProgress(f);
          },
          renewUrl: async () =>
            (await resolveYouTubeStream(track.sourceId, await getAudioQuality(), true)).url,
        }
      );
      setDownloadProgress(null);
      if (!isMountedRef.current || myRun !== runIdRef.current) return true;
      await player.replaceAsync({
        uri,
        contentType: 'progressive',
        metadata: metadadosDoEcraBloqueado(track),
      });
      if (!isMountedRef.current || myRun !== runIdRef.current) return true;
      nativeTrackIdRef.current = track.sourceId;
      try {
        if (resumeAt > 1) player.currentTime = resumeAt;
      } catch {
        // ignorar — recomeça do início se o seek falhar
      }
      player.play();
      fadeIn();
    } catch (e: any) {
      setDownloadProgress(null);
      if (!isMountedRef.current || myRun !== runIdRef.current) return true;
      if (e?.message === DOWNLOAD_ABORTED) return true;
      setError(`[build ${BUILD_ID}] YouTube: playback error (${e?.message ?? 'unknown'}), using embed.`);
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
    if (backend !== 'native' || nativeTrackIdRef.current !== track.sourceId) return;
    // Regista avanço real da posição (para o watchdog de stream preso).
    if (currentTime !== lastProgressRef.current.time) {
      lastProgressRef.current = { time: currentTime, at: Date.now() };
    }
    // O áudio começou mesmo → deixa de estar "a carregar" (pára o pulsar).
    if (currentTime > 0) setBuffering(false);
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
        const seguinte = st.peekNextTrack();
        if (!seguinte || seguinte.sourceId !== preparada.sourceId) {
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
        duracaoSegundos: track.durationSeconds || streamRef.current?.durationSeconds || 0,
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
        setError(`[build ${BUILD_ID}] YouTube: playback error (${error?.message ?? 'unknown'}), using embed.`);
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
      // A mesma duração que a barra mostra. O `player.duration` fica de fora
      // de propósito: há m4a do YouTube que reportam o dobro, e com ele a
      // faixa nunca seria vista como perto do fim.
      const acao = acaoDoWatchdog({
        querTocar: wantsPlayRef.current,
        paradoMs: Date.now() - lastProgressRef.current.at,
        posicaoSegundos: lastProgressRef.current.time,
        duracaoSegundos: track.durationSeconds || streamRef.current?.durationSeconds || 0,
        jaDescarregou: downloadTriedRef.current,
      });

      if (acao === 'descarregar') { registarEvento('trocou_para_ficheiro'); fallbackRef.current(); }
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

  // Smart Cache: Pré-descarrega a próxima música da fila em segundo plano após 5 segundos
  //
  // A faixa vem do `peekNextTrack` da store, que é a MESMA decisão que o
  // `next()` toma. Antes isto era `queueIndex + 1` fixo, e com shuffle ligado
  // pré-carregava sistematicamente a faixa errada: gastava rede e a seguinte
  // apanhava na mesma o buraco do download. Também ignorava a volta do
  // repeat "all" (da última para a primeira).
  useEffect(() => {
    if (backend !== 'native') return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const nextTrack = usePlayer.getState().peekNextTrack();
      if (!nextTrack || nextTrack.source !== 'youtube') return;
      // Fila de uma faixa só, ou repeat "one": não há nada para adiantar.
      if (nextTrack.sourceId === track.sourceId) return;

      const file = cachedAudioFile(nextTrack.sourceId);
      if (file.exists||useConnectivity.getState().offline) return; // já descarregado ou sem rede

      try {
        const quality = await getAudioQuality();
        const stream = await resolveYouTubeStream(nextTrack.sourceId, quality);
        if (cancelled) return;
        // A faixa seguinte fica com a loudness conhecida antes de tocar, por
        // isso a normalização já se aplica no primeiro segundo dela.
        rememberLoudnessDb(nextTrack.sourceId, stream?.loudnessDb);
        if (stream && !stream.isHls) {
          // Descarregar localmente em segundo plano; aborta se a faixa mudar
          await downloadProgressiveAudio(
            nextTrack.sourceId,
            stream.url,
            stream.contentLength,
            nextTrack.durationSeconds || stream.durationSeconds || null,
            {
              shouldAbort: () => cancelled,
              renewUrl: async () =>
                (await resolveYouTubeStream(nextTrack.sourceId, quality, true)).url,
            }
          );
        }
      } catch (err: any) {
        if (err?.message !== DOWNLOAD_ABORTED) {
          console.warn('[Smart Cache] Falha ao pré-carregar música seguinte:', err);
        }
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [track.sourceId, backend, queue, queueIndex, shuffle, repeatMode]);

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
          player.play();
          // Reaplica a velocidade: o efeito reativo não corre no play manual
          // (deps inalteradas) e o guard de wantsPlayRef pode tê-lo saltado
          // enquanto estávamos em pausa (ex.: restauro de sessão).
          player.playbackRate = usePlayer.getState().playbackRate;
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
