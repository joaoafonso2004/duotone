import { useEventListener } from 'expo';
import { useVideoPlayer } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { resolveYouTubeStream, streamFromPlayerResponse, type YtStream } from '../api/ytstream';
import { BUILD_ID } from '../lib/buildInfo';
import { getLastBotGuardError } from '../lib/botguardBridge';
import { getAudioQuality } from '../lib/prefs';
import { cachedAudioFile, downloadProgressiveAudio } from '../lib/youtubeCache';
import { usePlayer } from '../state/player';
import type { Track } from '../types';
import { type HarvestResult } from './YtStreamHarvester';

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
  function hook(){
    var v = document.querySelector('video');
    if (!v) { setTimeout(hook, 400); return; }
    v.addEventListener('play', function(){ post({ type:'state', value:'playing' }); });
    v.addEventListener('pause', function(){ post({ type:'state', value:'paused' }); });
    v.addEventListener('ended', function(){ post({ type:'state', value:'ended' }); });
    setInterval(function(){
      var vv = document.querySelector('video');
      if (vv && vv.duration) { post({ type:'progress', position:(vv.currentTime||0)*1000, duration: vv.duration*1000 }); }
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

export function YouTubePlayerView({ track }: { track: Track }) {
  const registerYtControls = usePlayer((s) => s.registerYtControls);
  const onStateChange = usePlayer((s) => s._onYtStateChange);
  const setProgress = usePlayer((s) => s._setProgress);
  const setBuffering = usePlayer((s) => s._setBuffering);
  const setError = usePlayer((s) => s.setError);
  const repeatMode = usePlayer((s) => s.repeatMode);
  const prev = usePlayer((s) => s.prev);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const soundPreset = usePlayer((s) => s.soundPreset);

  const [backend, setBackend] = useState<Backend>('resolving');
  const webRef = useRef<WebView>(null);
  // Token por faixa. Cada troca de faixa incrementa-o; operações assíncronas
  // de uma faixa antiga comparam o token que capturaram com o atual e abortam
  // se já não bate certo. (Um booleano partilhado não servia: o novo efeito
  // repunha-o e o áudio antigo continuava a tocar por cima — bug reportado.)
  const runIdRef = useRef(0);

  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.timeUpdateEventInterval = 1;
    p.loop = false;
    p.audioMixingMode = 'doNotMix';
  });

  // Repeat "one": o player nativo repete a própria faixa (sem passar por
  // 'ended'/next). Reativo ao modo de repetição escolhido no player.
  useEffect(() => {
    player.loop = repeatMode === 'one';
  }, [player, repeatMode]);

  // Aplica o Preset de Som reativamente na velocidade de reprodução nativa e correção de pitch
  useEffect(() => {
    if (backend !== 'native') return;
    let rate = 1.0;
    let pitchCorrection = true;

    if (soundPreset === 'slowed') {
      rate = 0.80; // Velocidade slowed ideal (80%)
      pitchCorrection = false; // Desativa a correção de pitch para dar voz grave e batidas profundas (estilo slowed reverb)
    } else if (soundPreset === 'fast') {
      rate = 1.35; // Velocidade acelerada ideal (135%)
      pitchCorrection = true;
    }

    player.playbackRate = rate;
    player.preservesPitch = pitchCorrection;
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

  useEffect(() => {
    const myRun = ++runIdRef.current;
    streamRef.current = undefined;
    downloadTriedRef.current = false;
    lastProgressRef.current = { time: 0, at: Date.now() };
    wantsPlayRef.current = true;
    endedRef.current = false;
    fadingOutRef.current = false; // Reset fade states
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
    proceedRef.current(null, myRun);
  }, [track.sourceId]);

  // Ao desmontar (ex.: fechar o player no X), parar mesmo o áudio nativo —
  // com staysActiveInBackground ele podia continuar a tocar sozinho.
  useEffect(() => {
    return () => {
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
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
    const alive = () => runId === runIdRef.current;
    if (!alive()) return;
    setBackend('resolving');

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
        wantsPlayRef.current = true;
        player.play();
        fadeIn();
        setBackend('native');
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
      } else if (harvested?.kind === 'rawUrl') {
        const isHls = harvested.url.includes('.m3u8');
        stream = {
          url: harvested.url,
          isHls,
          expiresAt: Date.now() + 5 * 60 * 60 * 1000,
          contentLength: null,
        };
      } else {
        stream = await resolveYouTubeStream(track.sourceId, quality);
      }
      if (!alive()) return;
      streamRef.current = stream;

      // Toca diretamente da rede para começar a reproduzir instantaneamente.
      // Em simultâneo, descarrega em segundo plano para a cache para as próximas vezes.
      let playableUri = stream.url;
      if (!stream.isHls) {
        downloadTriedRef.current = true;
        downloadProgressiveAudio(track.sourceId, stream.url, stream.contentLength).catch((err) => {
          console.warn('[Cache] Background download failed:', err);
        });
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
       // Cronómetro do watchdog começa AQUI (quando mandamos tocar).
      lastProgressRef.current = { time: 0, at: Date.now() };
      wantsPlayRef.current = true;
      player.play();
      fadeIn();
      setBackend('native');
    } catch (e: any) {
      if (alive()) {
        // Diagnóstico visível: que cliente InnerTube deu o stream, porque
        // caiu para o IOS (se caiu), e o estado do PO Token on-device — é
        // isto que nos diz, sem ambiguidade, o que se passou no dispositivo.
        const clientInfo = stream?.client
          ? `client=${stream.client}${stream.resolverNote ? ` (fell back: ${stream.resolverNote})` : ''}`
          : 'client=?';
        const potInfo = stream?.hasPoToken
          ? 'pot=yes'
          : `pot=no (${getLastBotGuardError() ?? 'n/a'})`;
        setError(
          `[build ${BUILD_ID}] YouTube [${clientInfo}] [${potInfo}]: ${e?.message ?? 'unknown'}, using embed.`
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
      const uri = await downloadProgressiveAudio(track.sourceId, stream.url, stream.contentLength);
      if (myRun !== runIdRef.current) return true;
      await player.replaceAsync({
        uri,
        contentType: 'progressive',
        metadata: {
          title: track.title,
          artist: track.artist ?? 'YouTube',
          artwork: track.artworkUrl ?? undefined,
        },
      });
      if (myRun !== runIdRef.current) return true;
      try {
        if (resumeAt > 1) player.currentTime = resumeAt;
      } catch {
        // ignorar — recomeça do início se o seek falhar
      }
      player.play();
      fadeIn();
    } catch (e: any) {
      if (myRun !== runIdRef.current) return true;
      setError(`[build ${BUILD_ID}] YouTube: playback error (${e?.message ?? 'unknown'}), using embed.`);
      setBackend('webview');
    }
    return true;
  };
  const fallbackRef = useRef(runDownloadFallback);
  fallbackRef.current = runDownloadFallback;

  // Eventos do player nativo -> store
  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (backend === 'native') onStateChange(isPlaying ? 'playing' : 'paused');
  });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (backend !== 'native') return;
    // Regista avanço real da posição (para o watchdog de stream preso).
    if (currentTime !== lastProgressRef.current.time) {
      lastProgressRef.current = { time: currentTime, at: Date.now() };
    }
    // O áudio começou mesmo → deixa de estar "a carregar" (pára o pulsar).
    if (currentTime > 0) setBuffering(false);

    // A duração REAL vem da YouTube Data API (track.durationSeconds), que é
    // fiável. Não usamos player.duration porque alguns streams m4a do YouTube
    // reportam o DOBRO da duração (contentor com duração errada) — o áudio
    // acaba a meio do "fim" do player. Só caímos no player.duration se a app
    // não souber a duração real.
    const knownMs = track.durationSeconds
      ? track.durationSeconds * 1000
      : (player.duration || 0) * 1000;
    setProgress(currentTime * 1000, knownMs);

    // Se conhecemos a duração real e já lá chegámos, avançamos — ou repetimos.
    const duration = track.durationSeconds || player.duration;
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
    if (backend === 'native') {
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
    if (backend === 'native' && playbackRate === 0.07) {
      player.playbackRate = 1.0;
      prev();
    }
  });
  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (backend !== 'native' || status !== 'error') return;
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
        if (stream && !stream.isHls) {
          // Descarregar localmente em segundo plano
          await downloadProgressiveAudio(nextTrack.sourceId, stream.url, stream.contentLength);
        }
      } catch (err) {
        console.warn('[Smart Cache] Falha ao pré-carregar música seguinte:', err);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [track.sourceId, backend, queue, queueIndex]);

  // Registar os controlos do backend ativo na store (play/pause/seek).
  useEffect(() => {
    if (backend === 'resolving') return;
    if (backend === 'native') {
      registerYtControls({
        play: () => {
          wantsPlayRef.current = true;
          player.play();
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

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'state') onStateChange(msg.value);
      else if (msg.type === 'progress' && msg.duration > 0)
        setProgress(msg.position, msg.duration);
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
