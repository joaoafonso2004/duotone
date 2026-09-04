import React, { useCallback, useEffect, useRef } from 'react';
import { searchYouTube } from '../api/youtube';
import { pickBest } from '../lib/trackMatch';
import { rememberPlaybackAlternative } from '../lib/playbackAlternatives';
import {
  classificar, mensagem as mensagemDaFalha, recuperacao, registar, type TipoFalha,
} from '../lib/playbackDiagnostics';
import { usePlayer } from '../state/player';
import type { Track } from '../types';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type RecoveryRun = {
  original: Track;
  failedIds: Set<string>;
  replacements: number;
};

// As alternativas pertencentes à mesma tentativa partilham esta informação.
// Assim, se a primeira substituição também estiver bloqueada, não se entra
// num ciclo a alternar eternamente entre dois vídeos indisponíveis.
const recoveryByVideoId = new Map<string, RecoveryRun>();

function playbackNotice(message: string) {
  window.dispatchEvent(new CustomEvent('duotone:playback-notice', { detail: message }));
}

async function recoverUnavailableVideo(track: Track, tipo: TipoFalha) {
  const state = usePlayer.getState();
  const run = recoveryByVideoId.get(track.sourceId) ?? {
    original: track,
    failedIds: new Set<string>(),
    replacements: 0,
  };
  run.failedIds.add(track.sourceId);
  recoveryByVideoId.set(track.sourceId, run);

  // Uma substituição automática chega. Se essa cópia também estiver
  // bloqueada, insistir noutras versões aumenta muito o risco de acabar num
  // remix ou numa gravação errada; nesse caso avança-se imediatamente.
  if (run.replacements >= 1) {
    if (state.current?.sourceId === track.sourceId) {
      playbackNotice('That replacement is also unavailable. Skipping this track.');
      await state.skipUnavailableTrack(track.sourceId);
    }
    return;
  }

  state.setError(null);
  // A frase diz a razao VERDADEIRA — "removido" e "bloqueado no teu pais" nao
  // sao a mesma coisa para quem esta a ouvir, e ate aqui eram a mesma frase.
  playbackNotice(mensagemDaFalha(tipo));
  state._setBuffering(true);

  try {
    // O título original é a consulta mais restrita possível. A escolha não é
    // simplesmente o primeiro resultado: reutiliza a pontuação do importador,
    // que penaliza live, remix, slowed, karaoke, instrumental, etc.
    const candidates = (await searchYouTube(run.original.title))
      .filter((candidate) => !run.failedIds.has(candidate.sourceId));
    const match = pickBest(
      candidates.map((candidate) => ({
        id: candidate.sourceId,
        title: candidate.title,
        channel: candidate.artist ?? '',
        durationSec: candidate.durationSeconds,
      })),
      {
        title: run.original.title,
        artist: run.original.artist ?? '',
        durationSec: run.original.durationSeconds,
      }
    );
    const alternative = match.best
      ? candidates.find((candidate) => candidate.sourceId === match.best?.id)
      : null;

    if (match.confident && alternative) {
      run.replacements += 1;
      recoveryByVideoId.set(alternative.sourceId, run);
      if (usePlayer.getState().replaceUnavailableTrack(track.sourceId, alternative)) {
        void rememberPlaybackAlternative(track.sourceId, alternative.sourceId);
        playbackNotice('Found a playable copy and saved it for next time.');
        return;
      }
      // A faixa mudou enquanto a pesquisa decorria; não saltar a nova.
      return;
    }
  } catch (error) {
    console.warn('[YouTubePlayer] Automatic replacement search failed', error);
  }

  // Sem cópia segura: avançar é melhor do que deixar a reprodução bloqueada.
  if (usePlayer.getState().current?.sourceId === track.sourceId) {
    playbackNotice('No safe equivalent was found. Skipping this track.');
    await usePlayer.getState().skipUnavailableTrack(track.sourceId);
  }
}

export function YouTubePlayerView({ track }: { track: Track }) {
  const hostId = useRef(`duotone-player-${Math.random().toString(36).slice(2)}`);
  const playerRef = useRef<any>(null);

  // A faixa actual, lida por referência: agora as callbacks do player
  // sobrevivem à troca de música e não podem ficar presas à primeira.
  const faixaRef = useRef(track);
  faixaRef.current = track;
  const progressoRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const vigiaRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prontoRef = useRef(false);
  const arrancouRef = useRef(false);
  const primeiraRef = useRef(true);

  /**
   * O watchdog é por FAIXA, não por player.
   *
   * A IFrame API não tem timeout nenhum. Se o embed nunca ficar pronto (rede,
   * IP marcado pela Google, embed bloqueado no vídeo), o onReady/onStateChange
   * nunca dispara — e como são os ÚNICOS sítios que limpam o `buffering`, a UI
   * ficava em ampulheta para sempre e sem erro nenhum. Com o player agora
   * reutilizado entre faixas, isto tem de ser re-armado a cada troca.
   */
  const armarVigia = useCallback(() => {
    clearTimeout(vigiaRef.current);
    arrancouRef.current = false;
    vigiaRef.current = setTimeout(() => {
      if (arrancouRef.current) return;
      const state = usePlayer.getState();
      state._setBuffering(false);
      // Nunca arrancou: se nem o embed ficou pronto, o mais provável é a rede.
      const tipo: TipoFalha = prontoRef.current ? 'tempo-esgotado' : 'sem-rede';
      registar({
        quando: Date.now(),
        videoId: faixaRef.current.sourceId,
        titulo: faixaRef.current.title,
        fase: 'watchdog',
        tipo,
        detalhe: 'sem arranque em 15s (embed ' + (prontoRef.current ? 'pronto' : 'nunca ficou pronto') + ')',
      });
      state.setError(mensagemDaFalha(tipo));
      playbackNotice(mensagemDaFalha(tipo));
    }, 15000);
  }, []);

  /**
   * O player nasce UMA vez e fica.
   *
   * Estava preso a `[track.sourceId]`, e a limpeza dele chamava `destroy()`:
   * por cada música deitava-se fora o iframe, construía-se outro, e esperava-se
   * que o YouTube carregasse o player dele antes de haver som. Era esse o
   * silêncio entre faixas no PC. Agora a troca é um `loadVideoById` no player
   * que já está quente — ver o efeito a seguir.
   */
  useEffect(() => {
    let player: any;
    let disposed = false;
    const state = usePlayer.getState();

    armarVigia();

    const mount = () => {
      if (disposed || !window.YT?.Player) return;
      player = new window.YT.Player(hostId.current, {
        height: '1',
        width: '1',
        videoId: faixaRef.current.sourceId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          playsinline: 1,
          ...(window.location.protocol.startsWith('http') ? { origin: window.location.origin } : {}),
        },
        events: {
          onReady: (event: any) => {
            prontoRef.current = true;
            playerRef.current = event.target;
            try {
              event.target.setVolume(state.volume);
            } catch (err) {
              console.warn('Failed to set initial volume on YT player', err);
            }
            // Medido: o IFrame aceita QUALQUER valor, nao so os oito que
            // anuncia — 0,3 a 2 saem exatos. So o 0,2 e que ele prende em
            // 0,25, e por isso a barra nao desce abaixo disso.
            try {
              event.target.setPlaybackRate?.(usePlayer.getState().playbackRate);
            } catch {}
            const initialPos = usePlayer.getState().positionMs;
            if (initialPos > 1500) {
              event.target.seekTo(initialPos / 1000, true);
            }
            if (usePlayer.getState().isPlaying) {
              event.target.playVideo();
            } else {
              event.target.pauseVideo();
            }
            state.registerYtControls({
              play: () => event.target.playVideo(),
              pause: () => event.target.pauseVideo(),
              seek: (ms) => event.target.seekTo(ms / 1000, true),
              setVolume: (vol) => {
                try {
                  event.target.setVolume(vol);
                } catch (err) {
                  console.warn('Failed to set volume on YT player', err);
                }
              },
            });
            state._setBuffering(false);
            progressoRef.current = setInterval(() => {
              const duration = Number(event.target.getDuration?.() || 0) * 1000;
              const position = Number(event.target.getCurrentTime?.() || 0) * 1000;
              usePlayer.getState()._setProgress(position, duration);

              try {
                const iframe = document.getElementById(hostId.current) as HTMLIFrameElement | null;
                const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
                const videos = doc?.querySelectorAll('video');
                videos?.forEach((video: any) => {
                  if (video.preservesPitch !== false) {
                    // O tom ACOMPANHA a velocidade, de proposito: era isto que fazia
                    // o "slowed" soar a slowed e o "fast" a nightcore. Preservar o tom
                    // daria uma leitura de podcast acelerado, que e outra coisa.
                    video.preservesPitch = false;
                    video.mozPreservesPitch = false;
                    video.webkitPreservesPitch = false;
                    const currentRate = video.playbackRate;
                    video.playbackRate = 1.0;
                    video.playbackRate = currentRate;
                  }
                });
              } catch {}
            }, 500);
          },
          onStateChange: (event: any) => {
            const s = event.data;
            if (s === 1 || s === 2) arrancouRef.current = true;
            if (s === 1) state._onYtStateChange('playing');
            else if (s === 2) state._onYtStateChange('paused');
            else if (s === 0) state._onYtStateChange('ended');
            if (s === 3) state._setBuffering(true);
            if (s === 1 || s === 2) state._setBuffering(false);
          },
          onError: (event: any) => {
            // Códigos da IFrame API: 2 id inválido, 5 erro do player HTML5,
            // 100 vídeo removido/privado, 101/150 embed proibido pelo dono.
            // São números e não texto, por isso classificam-se sem adivinhar.
            arrancouRef.current = true;
            state._setBuffering(false);
            const code = Number(event?.data);
            const tipo = classificar({ codigoEmbed: Number.isFinite(code) ? code : null });
            registar({
              quando: Date.now(),
              videoId: faixaRef.current.sourceId,
              titulo: faixaRef.current.title,
              fase: 'embed',
              tipo,
              detalhe: 'iframe code=' + code,
            });
            if (recuperacao(tipo).alternativa) {
              void recoverUnavailableVideo(faixaRef.current, tipo);
            } else {
              state.setError(mensagemDaFalha(tipo));
              playbackNotice(mensagemDaFalha(tipo));
            }
          },
        },
      });
      playerRef.current = player;
    };

    if (window.YT?.Player) {
      mount();
    } else {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); mount(); };
      if (!document.querySelector('script[data-duotone-youtube]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.dataset.duotoneYoutube = 'true';
        // Sem isto, um script bloqueado (rede/firewall) ficava em silêncio.
        script.onerror = () => {
          if (disposed) return;
          arrancouRef.current = true;
          state._setBuffering(false);
          registar({
            quando: Date.now(),
            videoId: faixaRef.current.sourceId,
            titulo: faixaRef.current.title,
            fase: 'iframe-api',
            tipo: 'sem-rede',
            detalhe: 'o script iframe_api nao carregou (rede ou firewall)',
          });
          state.setError(mensagemDaFalha('sem-rede'));
          playbackNotice(mensagemDaFalha('sem-rede'));
        };
        document.body.appendChild(script);
      }
    }

    return () => {
      disposed = true;
      clearTimeout(vigiaRef.current);
      clearInterval(progressoRef.current);
      playerRef.current = null;
      try { player?.mute?.(); } catch {}
      try { player?.destroy?.(); } catch {}
    };
  }, [armarVigia]);

  /**
   * Trocar de faixa no player que já existe.
   *
   * A primeira já foi carregada pelo `videoId` da criação, por isso este efeito
   * salta-a — senão pedia-se o mesmo vídeo duas vezes ao arrancar.
   */
  useEffect(() => {
    if (primeiraRef.current) { primeiraRef.current = false; return; }
    const p = playerRef.current;
    if (!p?.loadVideoById) return;
    usePlayer.getState()._setBuffering(true);
    armarVigia();
    try { p.loadVideoById(track.sourceId); } catch {}
  }, [track.sourceId, armarVigia]);

  const playbackRate = usePlayer((s) => s.playbackRate);
  useEffect(() => {
    // O `playerRef` pode ainda ser null (o IFrame monta-se depois). Antes havia
    // aqui um `if (!p) return` que abortava o efeito inteiro — e como ele so
    // volta a correr quando a velocidade muda, o pedido do tom nunca chegava a
    // ser agendado na primeira faixa.
    try {
      playerRef.current?.setPlaybackRate?.(playbackRate);
    } catch {}
    // O tom tem de ACOMPANHAR a velocidade. Sem isto o browser estica o tempo
    // para o manter, e a 0,5x um time-stretch tem de inventar metade do sinal
    // — sao esses os artefactos que se ouviam em camara lenta.
    //
    // Isto vive no processo principal porque o iframe e de OUTRA ORIGEM. Aqui
    // estava um `iframe.contentDocument.querySelectorAll('video')` que devolvia
    // sempre null e nunca fez nada; o `catch {}` a volta escondia-o.
    //
    // O atraso da tempo ao iframe de trocar de <video> na mudanca de faixa.
    const t = setTimeout(() => { void window.duotoneDesktop?.naoEsticarOTempo?.(); }, 400);
    return () => clearTimeout(t);
  }, [playbackRate, track.sourceId]);

  return <div id={hostId.current} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />;
}
