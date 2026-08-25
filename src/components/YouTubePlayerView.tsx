import { useEventListener } from 'expo';
import { useVideoPlayer } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, AppState } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { resolveYouTubeStream, streamFromPlayerResponse, type YtStream } from '../api/ytstream';
import { BUILD_ID } from '../lib/buildInfo';
import { getLastBotGuardError } from '../lib/botguardBridge';
import { getAudioQuality } from '../lib/prefs';
import { cachedAudioFile, downloadProgressiveAudio, DOWNLOAD_ABORTED } from '../lib/youtubeCache';
import { usePlayer } from '../state/player';
import type { Track } from '../types';
import { YtStreamHarvester, type HarvestResult } from './YtStreamHarvester';

/**
 * Player do YouTube com TRÊS fases, em cascata:
 *
 * 1. HARVEST (YtStreamHarvester) — WebView invisível que deixa a página real
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

// Circuit breaker da fase 1. Se o harvest não apanhar nada duas vezes
// seguidas, desiste-se para o resto da sessão: não vale a pena atrasar
// TODAS as faixas 5s por um mecanismo que claramente não está a captar
// neste dispositivo/rede. Volta a zero assim que uma captura resulte.
let harvestFailures = 0;
const HARVEST_MAX_FAILURES = 2;

export function YouTubePlayerView({ track }: { track: Track }) {
  const registerYtControls = usePlayer((s) => s.registerYtControls);
  const onStateChange = usePlayer((s) => s._onYtStateChange);
  const setProgress = usePlayer((s) => s._setProgress);
  const setBuffering = usePlayer((s) => s._setBuffering);
  const setDownloadProgress = usePlayer((s) => s._setDownloadProgress);
  const setError = usePlayer((s) => s.setError);
  const repeatMode = usePlayer((s) => s.repeatMode);
  const prev = usePlayer((s) => s.prev);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const soundPreset = usePlayer((s) => s.soundPreset);

  const [backend, setBackend] = useState<Backend>('resolving');
  // Faixa a ser captada pela fase 1, com o runId da altura — sem o runId
  // não dá para distinguir um resultado que chega tarde, já de outra música.
  const [harvest, setHarvest] = useState<{ videoId: string; run: number } | null>(null);
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

  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.timeUpdateEventInterval = 1;
    p.loop = false;
  });

  // Repeat "one": o player nativo repete a própria faixa (sem passar por
  // 'ended'/next). Reativo ao modo de repetição escolhido no player.
  useEffect(() => {
    player.loop = repeatMode === 'one';
  }, [player, repeatMode]);

  // Aplica o Preset de Som reativamente na velocidade de reprodução nativa.
  // ATENÇÃO: no expo-video, definir playbackRate faz `AVPlayer.rate = x`, e no
  // AVFoundation rate != 0 É "play" — sem o guard de wantsPlayRef, isto
  // arrancava a música sozinho no restauro de sessão (que fica em pausa).
  useEffect(() => {
    if (backend !== 'native' || !wantsPlayRef.current) return;
    let rate = 1.0;
    if (soundPreset === 'slowed') rate = 0.85;
    else if (soundPreset === 'fast') rate = 1.5;

    player.playbackRate = rate;
  }, [backend, player, soundPreset]);

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
  const durationLoggedRef = useRef(false);

  // Fade transition refs
  const fadeIntervalRef = useRef<any>(null);
  const fadingOutRef = useRef(false);

  const fadeIn = () => {
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    player.volume = 0.0;
    let vol = 0.0;
    fadeIntervalRef.current = setInterval(() => {
      vol += 0.1; // 1s total fade-in
      if (vol >= 1.0) {
        vol = 1.0;
        clearInterval(fadeIntervalRef.current!);
        fadeIntervalRef.current = null;
      }
      player.volume = vol;
    }, 100);
  };

  const fadeOut = (callback: () => void) => {
    // Se a app estiver em background/bloqueada, o setInterval do JS é suspenso
    // pelo iOS. Chamamos o callback imediatamente para a fila não ficar presa.
    if (AppState.currentState !== 'active') {
      callback();
      return;
    }

    if (fadingOutRef.current) return;
    fadingOutRef.current = true;
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    let vol = player.volume;
    fadeIntervalRef.current = setInterval(() => {
      vol -= 0.1; // 1s total fade-out
      if (vol <= 0.0) {
        vol = 0.0;
        clearInterval(fadeIntervalRef.current!);
        fadeIntervalRef.current = null;
        callback();
      }
      player.volume = vol;
    }, 100);
  };

  // Se a app for minimizada ou o ecrã for bloqueado a meio do fadeOut,
  // cancelamos o interval e avançamos imediatamente a música.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' && fadingOutRef.current && !endedRef.current) {
        if (fadeIntervalRef.current) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
        }
        fadingOutRef.current = false;
        endedRef.current = true;
        onStateChange('ended');
      }
    });
    return () => sub.remove();
  }, [onStateChange]);

  useEffect(() => {
    const myRun = ++runIdRef.current;
    nativeTrackIdRef.current = null;
    streamRef.current = undefined;
    downloadTriedRef.current = false;
    lastProgressRef.current = { time: 0, at: Date.now() };
    wantsPlayRef.current = true;
    endedRef.current = false;
    durationLoggedRef.current = false; // [duration-debug]
    fadingOutRef.current = false; // Reset fade states
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
    // FASE 1 (harvest). Estava por ligar: este `null` mandava sempre direito
    // ao resolver próprio, que é exatamente o caminho que a Google bloqueia
    // em IPs marcados. Deixar a página real do YouTube pedir o stream com o
    // token de origem dela, e apanhar a resposta, é o caminho que se sabe
    // funcionar no 4G (é o mesmo mecanismo do embed, que toca sempre).
    // Com ficheiro local não vale a pena — o proceed trata disso sem rede.
    if (cachedAudioFile(track.sourceId).exists || harvestFailures >= HARVEST_MAX_FAILURES) {
      proceedRef.current(null, myRun);
    } else {
      setHarvest({ videoId: track.sourceId, run: myRun });
    }
  }, [track.sourceId]);

  // Ao desmontar (ex.: fechar o player no X), parar mesmo o áudio nativo —
  // com staysActiveInBackground ele podia continuar a tocar sozinho.
  useEffect(() => {
    return () => {
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
      nativeTrackIdRef.current = null;
      try {
        player.pause();
        player.replace(null);
      } catch {
        // player já libertado — ignorar
      }
    };
  }, [player]);

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
      usePlayer.setState({ resumePositionMs: null });
      lastProgressRef.current = { time: 0, at: Date.now() };
      nativeTrackIdRef.current = track.sourceId;
      wantsPlayRef.current = autoplay;
      if (autoplay) {
        player.play();
        fadeIn();
      } else {
        // Garantia explícita de pausa: nada abaixo pode arrancar o playback
        // (nem o efeito do soundPreset — ver guard de wantsPlayRef acima).
        try {
          player.pause();
        } catch {
          // player sem fonte — ignorar
        }
        player.volume = 1.0;
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
          metadata: {
            title: track.title,
            artist: track.artist ?? 'YouTube',
            artwork: track.artworkUrl ?? undefined,
          },
        });
        if (!alive()) return;
        beginPlayback();
        return;
      } catch (err) {
        console.warn('Erro a reproduzir ficheiro local em cache, tentando rede:', err);
      }
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
        metadata: {
          title: track.title,
          artist: track.artist ?? 'YouTube',
          artwork: track.artworkUrl ?? undefined,
        },
      });
      if (!alive()) return;
      beginPlayback();
    } catch (e: any) {
      if (alive()) {
        const errMsg = e?.message ?? 'unknown';
        setDownloadProgress(null);
        if (errMsg === DOWNLOAD_ABORTED) return; // cancelamento silencioso, não é erro
        // Se o vídeo não é reproduzível (removido, privado, região, etc.),
        // avançar para a próxima faixa em vez de cair no embed (que também
        // não vai conseguir tocar). Deteção: o InnerTube devolve um status
        // explícito no playabilityStatus (ver ytstream.ts streamFromPlayerResponse).
        const isNotPlayable = /not playable|unavailable|private|removed|age|sign in|copyright|deleted/i.test(errMsg);
        if (isNotPlayable) {
          console.warn(`[YouTubePlayer] Vídeo indisponível (${errMsg}), a saltar para a próxima.`);
          if (!endedRef.current) {
            endedRef.current = true;
            onStateChange('ended');
          }
          return;
        }
        // Erro de rede/download — tentar o embed como fallback.
        const clientInfo = stream?.client
          ? `client=${stream.client}${stream.resolverNote ? ` (fell back: ${stream.resolverNote})` : ''}`
          : 'client=?';
        const potInfo = stream?.hasPoToken
          ? 'pot=yes'
          : `pot=no (${getLastBotGuardError() ?? 'n/a'})`;
        setError(
          `[build ${BUILD_ID}] YouTube [${clientInfo}] [${potInfo}]: ${errMsg}, using embed.`
        );
        setBackend('webview');
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
        metadata: {
          title: track.title,
          artist: track.artist ?? 'YouTube',
          artwork: track.artworkUrl ?? undefined,
        },
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

  // Eventos do player nativo -> store
  useEventListener(player, 'playingChange', ({ isPlaying }) => {
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

    // [duration-debug] player.duration é exatamente o que o expo-video publica
    // no Lock Screen (MPMediaItemPropertyPlaybackDuration = currentItem.duration).
    // Esperado após a correção: player.duration ≈ track.durationSeconds (1x).
    if (currentTime > 0 && !durationLoggedRef.current) {
      durationLoggedRef.current = true;
      console.log(
        `[duration-debug][player] AVPlayerItem.duration=${player.duration}s ` +
          `track.durationSeconds=${track.durationSeconds ?? 'null'} ` +
          `stream.durationSeconds=${streamRef.current?.durationSeconds ?? 'null'} ` +
          `isHls=${streamRef.current?.isHls ?? '?'}`
      );
    }

    // A duração REAL vem da YouTube Data API (track.durationSeconds) ou do
    // resolved stream (streamRef.current?.durationSeconds), que é fiável.
    // Não usamos player.duration porque alguns streams m4a do YouTube
    // reportam o DOBRO da duração (contentor com duração errada) — o áudio
    // acaba a meio do "fim" do player. Só caímos no player.duration se a app
    // não souber a duração real.
    const durationSec = track.durationSeconds || streamRef.current?.durationSeconds || player.duration || 0;
    const knownMs = durationSec * 1000;
    setProgress(currentTime * 1000, knownMs);

    // Se conhecemos a duração real e já lá chegámos, avançamos — ou repetimos.
    const duration = track.durationSeconds || streamRef.current?.durationSeconds || player.duration;
    if (duration) {
      const remaining = duration - currentTime;
      if (remaining <= 1.5) {
        if (repeatMode === 'one') {
          if (currentTime >= duration - 0.5) {
            player.currentTime = 0;
            player.play();
          }
        } else if (!endedRef.current && !fadingOutRef.current) {
          fadeOut(() => {
            if (!endedRef.current) {
              endedRef.current = true;
              onStateChange('ended');
            }
          });
        }
      }
    }
  });
  useEventListener(player, 'playToEnd', () => {
    if (backend === 'native' && nativeTrackIdRef.current === track.sourceId) {
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
    if (backend !== 'native' || status !== 'error' || nativeTrackIdRef.current !== track.sourceId) return;
    fallbackRef.current().then((handled) => {
      if (!handled) {
        setError(`[build ${BUILD_ID}] YouTube: playback error (${error?.message ?? 'unknown'}), using embed.`);
        setBackend('webview');
      }
    });
  });

  // No embed (webview) a reprodução é do próprio YouTube — deixa de fazer
  // sentido o estado "a carregar" (pára o pulsar da capa).
  useEffect(() => {
    if (backend === 'webview') setBuffering(false);
  }, [backend, setBuffering]);

  // Watchdog: se a app tenciona tocar mas a posição não avança há vários
  // segundos, o AVPlayer não conseguiu arrancar/continuar o stream progressivo
  // (típico de músicas longas no 4G — nem começam). Muda para o download do
  // ficheiro, que arranca de certeza. Usa a INTENÇÃO (wantsPlayRef), por isso
  // apanha também o caso em que a música NUNCA começa (posição presa em ~0).
  useEffect(() => {
    if (backend !== 'native') return;
    const id = setInterval(() => {
      if (downloadTriedRef.current || !wantsPlayRef.current) return;
      const stuckMs = Date.now() - lastProgressRef.current.at;
      const dur = track.durationSeconds ?? 0;
      const nearEnd = dur > 0 && lastProgressRef.current.time >= dur - 2;
      if (stuckMs > 6000 && !nearEnd) {
        fallbackRef.current();
      }
    }, 2000);
    return () => clearInterval(id);
  }, [backend, track.durationSeconds]);

  // Smart Cache: Pré-descarrega a próxima música da fila em segundo plano após 5 segundos
  useEffect(() => {
    if (backend !== 'native') return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const nextIndex = queueIndex + 1;
      if (nextIndex >= queue.length) return;

      const nextTrack = queue[nextIndex];
      if (nextTrack.source !== 'youtube') return;

      const file = cachedAudioFile(nextTrack.sourceId);
      if (file.exists) return; // já descarregado

      try {
        const quality = await getAudioQuality();
        const stream = await resolveYouTubeStream(nextTrack.sourceId, quality);
        if (cancelled) return;
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
  }, [track.sourceId, backend, queue, queueIndex]);

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
          // Reaplica o preset de som: o efeito reativo não corre no play
          // manual (deps inalteradas) e o guard de wantsPlayRef pode tê-lo
          // saltado enquanto estávamos em pausa (ex.: restauro de sessão).
          const preset = usePlayer.getState().soundPreset;
          player.playbackRate = preset === 'slowed' ? 0.85 : preset === 'fast' ? 1.5 : 1.0;
        },
        pause: () => {
          wantsPlayRef.current = false;
          player.pause();
        },
        seek: (ms) => {
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
        // Vídeo indisponível no embed — saltar para a próxima faixa.
        webviewSkippedRef.current = true;
        console.warn(`[YouTubePlayer] Embed indisponível (${msg.reason}), a saltar.`);
        if (!endedRef.current) {
          endedRef.current = true;
          onStateChange('ended');
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
  // Única exceção: a fase 1 precisa da WebView invisível montada para captar.
  return harvest ? (
    <YtStreamHarvester
      videoId={harvest.videoId}
      timeoutMs={5000}
      onResult={(r) => {
        // Se a faixa mudou entretanto, este resultado é de outra música.
        if (harvest.run !== runIdRef.current) return;
        if (r) harvestFailures = 0;
        else harvestFailures += 1;
        setHarvest(null);
        proceedRef.current(r, harvest.run);
      }}
    />
  ) : null;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#000',
  },
});
