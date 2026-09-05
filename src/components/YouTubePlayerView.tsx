import { useConnectivity } from '../state/connectivity';
import { useEventListener } from 'expo';
import { useVideoPlayer } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { resolveYouTubeStream, streamFromPlayerResponse, type YtStream } from '../api/ytstream';
import { BUILD_ID } from '../lib/buildInfo';
import { reafirmarComandosDeFaixa } from '../lib/comandosDeFaixa';
import { urlsDaCapa } from '../lib/capaDoEcraBloqueado';
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
import { compensacaoLinear } from '../lib/equalizer';
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

  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.timeUpdateEventInterval = 1;
    p.loop = false;
  });

  // Em background não há barra de progresso para animar. Dois segundos
  // continuam a verificar o sleep timer com boa precisão e reduzem para
  // metade as travessias nativo -> JS, atualizações Zustand e renders que o
  // iPhone teria de fazer com o ecrã bloqueado.
  useEffect(() => {
    const ajustar = (state = AppState.currentState) => {
      player.timeUpdateEventInterval = state === 'active' ? 1 : 2;
    };
    ajustar();
    const sub = AppState.addEventListener('change', ajustar);
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

  // Entrega o player ao módulo nativo, UMA vez. Daí em diante é ele que trata
  // de cada faixa nova, porque o que ele mexe — o tom e o equalizador — vive
  // no AVPlayerItem, e cada `replaceAsync` cria um item de raiz. Do lado do JS
  // não há evento fiável para isso; do lado nativo há KVO no `currentItem`.
  useEffect(() => {
    ligarAudioNativo(player);
  }, [player]);

  // O equalizador. A margem é calculada aqui e não no Swift, para a conta
  // viver só num sítio: o `lib/equalizer.ts`, que é quem sabe quanto é que as
  // bandas somam quando se sobrepõem. É a mesma que o PC usa.
  useEffect(() => {
    if (backend !== 'native') return;
    aplicarEqualizadorNativo(eqGanhos, compensacaoLinear(eqGanhos));
  }, [backend, eqGanhos]);

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

  useEffect(() => {
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

    // Nunca antecipar o fim com base numa duração arredondada. O código
    // antigo começava um fade quando ainda faltavam 1,5 s e marcava a faixa
    // como terminada no fim desse fade — daí a fila saltar visivelmente antes
    // do tempo indicado. O `playToEnd` abaixo é emitido pelo media player no
    // fim real do áudio e é a única autoridade para avançar/repetir.
  });
  useEventListener(player, 'playToEnd', () => {
    if(usePlayer.getState().closing)return;
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
      avancarPorFimSilencioso();
      return;
    }
    if (backend !== 'native' || status !== 'error' || nativeTrackIdRef.current !== track.sourceId) return;
    fallbackRef.current().then((handled) => {
      if (!handled) {
        setError(`[build ${BUILD_ID}] YouTube: playback error (${error?.message ?? 'unknown'}), using embed.`);
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

      if (acao === 'descarregar') fallbackRef.current();
    }, 2000);
    return () => clearInterval(id);
  }, [backend, track.durationSeconds, track.sourceId, repeatMode, player, onStateChange]);

  // Ligar/desligar a normalização nas Definições aplica-se já, sem esperar
  // pela faixa seguinte.
  useEffect(() => {
    if (backend !== 'native') return;
    const ceiling = applyCeiling();
    // Não mexer a meio de um fade: ele acaba no teto novo à mesma.
    if (!fadeIntervalRef.current && !usePlayer.getState().closing) {
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
