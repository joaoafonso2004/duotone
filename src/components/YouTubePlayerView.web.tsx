import React, { useCallback, useEffect, useRef } from 'react';
import { pesquisarFaixas } from '../api/search';
import { pickBest } from '../lib/trackMatch';
import { rememberPlaybackAlternative } from '../lib/playbackAlternatives';
import {
  classificar, deveAvisarArranquePreso, mensagem as mensagemDaFalha,
  recuperacao, registar, type TipoFalha,
} from '../lib/playbackDiagnostics';
import { baterSessao } from '../lib/sessionSync';
import { velocidadeNaSessao } from '../lib/jam';
import { usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { registar as registarEvento } from '../lib/eventos';
import { primeiraNota } from '../lib/tocarEnquantoDescarrega';
import type { Track } from '../types';
import {
  ANTECEDENCIA_DO_PC_S, decorridoDaPassagem, deveComecarCrossfade, devePrepararSeguinte, podeCrossfade,
  volumesDoCrossfade, type ContextoDoCrossfade,
} from '../lib/crossfade';

/**
 * A velocidade a que o motor anda AGORA: a escolhida, ou 1x dentro de um Jam.
 *
 * O iPhone já fazia isto e o PC não: um PC com a velocidade guardada em 1,1x
 * tocava o Jam a 1,1x, e a posição da sessão -- que é tempo de parede --
 * fugia-lhe um segundo a cada dez. Ver `velocidadeNaSessao`.
 */
function velocidadeDoMotor(): number {
  return velocidadeNaSessao(usePlayer.getState().playbackRate, !!useOuvirJuntos.getState().sessao);
}

/** O player do IFrame está neste vídeo? Sem maneira de saber, assume-se que sim. */
function estaNoVideo(player: any, sourceId: string): boolean {
  try {
    const id = player?.getVideoData?.()?.video_id;
    return !id || id === sourceId;
  } catch {
    return true;
  }
}

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
    const candidates = (await pesquisarFaixas(run.original.title))
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

/**
 * Quanto tempo a passagem espera que a fila avance depois de pedir o `ended`.
 * Se a loja não mudar para a faixa preparada (fim da fila sem rádio, repeat
 * ligado a meio), quem entrou é calado -- em vez de ficar a tocar sem ninguém
 * saber, com os controlos a mexer no player que já acabou.
 */
const ESPERA_PELA_ENTREGA_MS = 3000;

/**
 * O motor do PC: o IFrame oficial do YouTube -- DOIS, para o crossfade.
 *
 * O CROSSFADE (24/9). O IFrame não mistura nada: cada player é um vídeo. Por
 * isso há um segundo player escondido (o "em espera"), que só nasce quando há
 * crossfade nas Definições. Perto do fim ele carrega a faixa seguinte CALADO
 * (`ANTECEDENCIA_DO_PC_S`), e na janela da passagem os dois volumes cruzam-se
 * pela curva de igual potência do lib/crossfade.ts -- a mesma do iPhone. No
 * fim, a fila avança pelo `ended` de sempre (quem sabe de repeat, rádio e
 * shuffle), e quando a loja muda para a faixa preparada os papéis trocam-se:
 * o que estava em espera passa a ser o ATIVO, sem carregar nada.
 *
 * - Só o ATIVO fala com a loja (posição, a tocar, fim, erros). O outro, a
 *   preparar-se ou a entrar, não diz nada.
 * - Seguinte à mão com a faixa preparada: troca-se na hora (quem entra é quem
 *   se pediu). Outra faixa qualquer: a preparada cala-se.
 * - Pausa a meio: a passagem suspende (a que entra fica parada onde ia) e
 *   retoma pela posição. Seek para trás: aborta, e a preparada volta ao 0.
 * - Com a janela no tabuleiro o Chromium estrangula os temporizadores, e a
 *   curva andava a degraus de um segundo: perto do fim pede-se ao processo
 *   principal que não o faça (`naoEstrangular`), e devolve-se depois.
 * - Dentro de um Jam não há crossfade: manda a posição partilhada.
 */
export function YouTubePlayerView({ track }: { track: Track }) {
  const hostA = useRef(`duotone-player-${Math.random().toString(36).slice(2)}`);
  const hostB = useRef(`duotone-player-${Math.random().toString(36).slice(2)}`);
  /** O player que representa a faixa da loja. */
  const ativoRef = useRef<any>(null);
  /** O outro: nasce com o primeiro crossfade e prepara a seguinte. */
  const esperaRef = useRef<any>(null);
  const aCriarEsperaRef = useRef(false);
  /** A faixa carregada no player em espera; `pronta` quando já está parada no 0, calada. */
  const seguinteRef = useRef<{ sourceId: string; pronta: boolean } | null>(null);
  /** Há uma passagem a decorrer (duração do fade dela). */
  const passagemRef = useRef<{ fade: number } | null>(null);
  /** A passagem acabou e pediu o `ended`; à espera que a loja mude de faixa. */
  const entregaRef = useRef<{ deQual: string; quando: number } | null>(null);
  const estrangularRef = useRef(true);

  // A faixa actual, lida por referência: agora as callbacks do player
  // sobrevivem à troca de música e não podem ficar presas à primeira.
  const faixaRef = useRef(track);
  faixaRef.current = track;
  const progressoRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const atualizarProgressoRef = useRef<(() => void) | null>(null);
  const vigiaRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prontoRef = useRef(false);
  const arrancouRef = useRef(false);
  const primeiraRef = useRef(true);
  /**
   * Quando se pediu a faixa atual, para o `primeira_nota` do PC. Uma sessão
   * restaurada em pausa não mede: o som vem quando alguém carregar em play.
   */
  const notaRef = useRef<{ id: string; em: number } | null>(null);
  useEffect(() => {
    notaRef.current = usePlayer.getState().autoplayOnLoad ? { id: track.sourceId, em: Date.now() } : null;
  }, [track.sourceId]);
  const querTocar = usePlayer((s) => s.isPlaying);

  // Ao restaurar a janela, não esperar pelos cinco segundos do ritmo de
  // background para atualizar a barra e a posição da sessão.
  useEffect(() => {
    const visibilidade = () => {
      if (!document.hidden) atualizarProgressoRef.current?.();
    };
    document.addEventListener('visibilitychange', visibilidade);
    return () => document.removeEventListener('visibilitychange', visibilidade);
  }, []);

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
      const state = usePlayer.getState();
      if (!deveAvisarArranquePreso(state.isPlaying, arrancouRef.current)) return;
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

  // Uma sessão restaurada em pausa não está a tentar arrancar. A vigia nasce
  // quando há intenção real de tocar (incluindo um Play posterior) e também é
  // renovada quando se muda de faixa durante a reprodução.
  useEffect(() => {
    clearTimeout(vigiaRef.current);
    arrancouRef.current = false;
    if (querTocar) armarVigia();
    return () => clearTimeout(vigiaRef.current);
  }, [querTocar, track.sourceId, armarVigia]);

  /** Deixar (ou não) o Chromium estrangular os temporizadores com a janela escondida. */
  const estrangular = useCallback((permitir: boolean) => {
    if (estrangularRef.current === permitir) return;
    estrangularRef.current = permitir;
    try { window.duotoneDesktop?.naoEstrangular?.(!permitir); } catch {}
  }, []);

  /** A que entrava cala-se e para; a que sai volta ao volume dela. `rebobinar`: a preparada volta ao 0. */
  const abortarPassagem = useCallback((rebobinar: boolean) => {
    const espera = esperaRef.current;
    passagemRef.current = null;
    try { espera?.pauseVideo?.(); espera?.mute?.(); espera?.setVolume?.(0); } catch {}
    if (rebobinar) { try { espera?.seekTo?.(0, true); } catch {} }
    try { ativoRef.current?.setVolume?.(usePlayer.getState().volume); } catch {}
  }, []);

  /** A preparada deixou de servir (outra faixa, fila mexida): fica calada e esquecida. */
  const largarSeguinte = useCallback(() => {
    if (!seguinteRef.current && !passagemRef.current) return;
    abortarPassagem(false);
    seguinteRef.current = null;
    entregaRef.current = null;
  }, [abortarPassagem]);

  /** Carrega a seguinte no player em espera, calado. */
  const carregarNaEspera = useCallback(() => {
    const espera = esperaRef.current;
    const prep = seguinteRef.current;
    if (!espera || !prep || prep.pronta) return;
    try {
      espera.mute?.();
      espera.setVolume?.(0);
      espera.setPlaybackRate?.(velocidadeDoMotor());
      espera.loadVideoById(prep.sourceId);
    } catch {
      seguinteRef.current = null;
    }
  }, []);

  const aoMudarEstadoRef = useRef<(event: any) => void>(() => {});
  const aoErroRef = useRef<(event: any) => void>(() => {});

  /** O segundo player nasce no primeiro crossfade, e fica. */
  const garantirEspera = useCallback(() => {
    if (esperaRef.current || aCriarEsperaRef.current || !window.YT?.Player) return;
    aCriarEsperaRef.current = true;
    // eslint-disable-next-line no-new
    new window.YT.Player(hostB.current, {
      host: 'https://www.youtube-nocookie.com',
      height: '1',
      width: '1',
      playerVars: {
        autoplay: 0,
        controls: 0,
        playsinline: 1,
        ...(window.location.protocol.startsWith('http') ? { origin: window.location.origin } : {}),
      },
      events: {
        onReady: (event: any) => {
          aCriarEsperaRef.current = false;
          try { event.target.mute(); event.target.setVolume(0); } catch {}
          esperaRef.current = event.target;
          carregarNaEspera();
        },
        onStateChange: (event: any) => aoMudarEstadoRef.current(event),
        onError: (event: any) => aoErroRef.current(event),
      },
    });
  }, [carregarNaEspera]);

  /** A passagem chegou ao fim: a fila avança pelo `ended` de sempre. */
  const terminarPassagem = useCallback(() => {
    if (!passagemRef.current) return;
    passagemRef.current = null;
    try { esperaRef.current?.setVolume?.(usePlayer.getState().volume); } catch {}
    try { ativoRef.current?.pauseVideo?.(); } catch {}
    const deQual = faixaRef.current.sourceId;
    entregaRef.current = { deQual, quando: Date.now() };
    usePlayer.getState()._onYtStateChange('ended');
    // Rede de segurança: a fila não avançou para a preparada.
    setTimeout(() => {
      const e = entregaRef.current;
      if (!e || e.deQual !== deQual || faixaRef.current.sourceId !== deQual) return;
      registarEvento('entrega_falhada');
      largarSeguinte();
    }, ESPERA_PELA_ENTREGA_MS);
  }, [largarSeguinte]);

  /**
   * O crossfade, a cada leitura da posição da faixa que sai. Devolve de quanto
   * em quanto tempo quer a leitura seguinte (null: o ritmo de sempre).
   */
  const cuidarDaPassagem = useCallback((posicao: number, duracao: number): number | null => {
    const st = usePlayer.getState();
    const emJam = !!useOuvirJuntos.getState().sessao;
    const seguinte = emJam ? null : st.proximaFaixa();
    const prep = seguinteRef.current;
    // A seguinte mudou (fila mexida, shuffle, repeat): a preparada já não serve.
    if (prep && !passagemRef.current && prep.sourceId !== seguinte?.sourceId) largarSeguinte();
    const c: ContextoDoCrossfade = {
      duracaoDoFade: emJam ? 0 : st.crossfadeSegundos,
      duracaoSegundos: duracao > 0 ? duracao : null,
      posicaoSegundos: posicao,
      temFaixaSeguinte: !!seguinte && seguinte.source === 'youtube',
      repeatUma: st.repeatMode === 'one',
      backendNativo: true,
      seguinteCarregada: !!seguinteRef.current?.pronta,
      aDecorrer: !!passagemRef.current,
    };

    const passagem = passagemRef.current;
    if (passagem) {
      const decorrido = decorridoDaPassagem({ ...c, duracaoDoFade: passagem.fade });
      if (decorrido < -0.5 || c.repeatUma) { abortarPassagem(true); return null; }
      const volume = st.volume;
      const v = volumesDoCrossfade(decorrido, passagem.fade, volume, volume);
      try { ativoRef.current?.setVolume?.(Math.round(v.sai)); } catch {}
      try { esperaRef.current?.setVolume?.(Math.round(v.entra)); } catch {}
      if (decorrido >= passagem.fade) { terminarPassagem(); return null; }
      return 100;
    }
    if (entregaRef.current || !st.isPlaying) return null;

    if (seguinte && !seguinteRef.current && devePrepararSeguinte(c, ANTECEDENCIA_DO_PC_S)) {
      seguinteRef.current = { sourceId: seguinte.sourceId, pronta: false };
      if (esperaRef.current) carregarNaEspera(); else garantirEspera();
    }
    if (deveComecarCrossfade(c)) {
      passagemRef.current = { fade: c.duracaoDoFade };
      try {
        const espera = esperaRef.current;
        espera.setVolume(0);
        espera.unMute();
        espera.setPlaybackRate?.(velocidadeDoMotor());
        espera.playVideo();
      } catch {
        abortarPassagem(true);
        return null;
      }
      return 100;
    }
    const perto = podeCrossfade(c) && duracao - posicao <= c.duracaoDoFade + ANTECEDENCIA_DO_PC_S;
    estrangular(!perto);
    return perto ? 250 : null;
  }, [abortarPassagem, carregarNaEspera, estrangular, garantirEspera, largarSeguinte, terminarPassagem]);
  const cuidarDaPassagemRef = useRef(cuidarDaPassagem);
  cuidarDaPassagemRef.current = cuidarDaPassagem;

  /**
   * Os eventos dos DOIS players passam por aqui. Só o ativo fala com a loja; o
   * em espera só avisa que a preparada ficou pronta (parada no 0, calada).
   */
  aoMudarEstadoRef.current = (event: any) => {
    const state = usePlayer.getState();
    const s = event.data;
    // Antes do `onReady` do primeiro ainda não há ativo: tudo o que chega é dele.
    if (ativoRef.current && event.target !== ativoRef.current) {
      const prep = seguinteRef.current;
      if (prep && !prep.pronta && s === 1 && estaNoVideo(event.target, prep.sourceId)) {
        try { event.target.pauseVideo(); event.target.seekTo(0, true); } catch {}
        prep.pronta = true;
      }
      return;
    }
    // O fim da que sai, a meio de uma passagem, é o fim da passagem -- e não um
    // segundo `ended`, que saltava uma faixa.
    if (s === 0 && (passagemRef.current || entregaRef.current)) {
      if (passagemRef.current) terminarPassagem();
      return;
    }
    if (s === 1 || s === 2) arrancouRef.current = true;
    // A tocar, em pausa ou em espera (5): o vídeo desta faixa está
    // carregado. Sem isto o `activeBackend` ficava em 'resolving' para
    // sempre no PC -- só o leitor do iPhone o mudava --, e o Jam via o PC
    // eternamente em "Loading · 0%" e nunca lhe corrigia o desvio.
    //
    // Só se o evento for do vídeo DESTA faixa, quando o player o sabe
    // dizer: ao trocar de música, a pausa do vídeo anterior pode chegar
    // depois de a faixa nova ter começado a carregar. Não é blindado --
    // o IFrame às vezes já responde com o id novo --, e aí vale a
    // correção do desvio, que agora também corre no PC.
    if ((s === 1 || s === 2 || s === 5) && estaNoVideo(event.target, faixaRef.current.sourceId)) {
      state._setActiveBackend('webview');
    }
    if (s === 1) {
      const nota = notaRef.current;
      if (nota && nota.id === faixaRef.current.sourceId && estaNoVideo(event.target, nota.id)) {
        notaRef.current = null;
        const medida = primeiraNota(nota.em, Date.now(), 'embed');
        if (medida) registarEvento('primeira_nota', medida);
      }
      clearTimeout(vigiaRef.current);
      state.setError(null);
      state._onYtStateChange('playing');
    }
    else if (s === 2) state._onYtStateChange('paused');
    else if (s === 0) state._onYtStateChange('ended');
    if (s === 3) state._setBuffering(true);
    if (s === 1 || s === 2) state._setBuffering(false);
  };

  aoErroRef.current = (event: any) => {
    const state = usePlayer.getState();
    // A preparada falhou: esquece-se. Quando chegar a vez dela, o caminho de
    // sempre carrega-a no ativo e trata o erro como sempre.
    if (ativoRef.current && event.target !== ativoRef.current) {
      largarSeguinte();
      return;
    }
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
  };

  /**
   * O player principal nasce UMA vez e fica.
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

    const mount = () => {
      if (disposed || !window.YT?.Player) return;
      player = new window.YT.Player(hostA.current, {
        // O mesmo player, servido do dominio sem cookies de publicidade. A app
        // do PC fica horas aberta, e o embed normal ia deixando esse rasto
        // dentro dela. O `main.cjs` ja procura os frames por
        // `(youtube|youtube-nocookie).com`, por isso o equalizador e o tom
        // continuam a chegar la dentro.
        host: 'https://www.youtube-nocookie.com',
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
            ativoRef.current = event.target;
            try {
              event.target.setVolume(state.volume);
            } catch (err) {
              console.warn('Failed to set initial volume on YT player', err);
            }
            // Medido: o IFrame aceita QUALQUER valor, nao so os oito que
            // anuncia — 0,3 a 2 saem exatos. So o 0,2 e que ele prende em
            // 0,25, e por isso a barra nao desce abaixo disso.
            try {
              event.target.setPlaybackRate?.(velocidadeDoMotor());
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
            // Os controlos falam sempre com o ATIVO, que muda de player a cada
            // passagem -- por isso leem a referência e não o `event.target`.
            state.registerYtControls({
              play: () => {
                ativoRef.current?.playVideo();
                // Uma passagem suspensa pela pausa retoma pela posição.
              },
              pause: () => {
                // A pausa suspende a passagem: a que entra fica parada onde ia.
                if (passagemRef.current) abortarPassagem(false);
                ativoRef.current?.pauseVideo();
              },
              seek: (ms) => ativoRef.current?.seekTo(ms / 1000, true),
              setVolume: (vol) => {
                try {
                  ativoRef.current?.setVolume(vol);
                } catch (err) {
                  console.warn('Failed to set volume on YT player', err);
                }
              },
            });
            state._setBuffering(false);
            const atualizarProgresso = () => {
              clearTimeout(progressoRef.current);
              if (disposed) return;
              const ativo = ativoRef.current;
              if (!ativo) return;
              const duration = Number(ativo.getDuration?.() || 0);
              const position = Number(ativo.getCurrentTime?.() || 0);
              usePlayer.getState()._setProgress(position * 1000, duration * 1000);
              // O batimento da sessão de handoff anda com o relógio do
              // player e não com um temporizador à parte -- com a janela
              // escondida o Chromium estrangula os temporizadores, e a
              // posição publicada tem de ser a que acabámos de ler.
              baterSessao();
              // Com a janela escondida basta manter uma posição recente para
              // handoff/restauro. Não há barra visível que justifique acordar
              // React duas vezes por segundo. Visível, 1 Hz é suficiente e
              // coincide com o player nativo. Perto do fim de uma faixa com
              // crossfade, o ritmo é o da passagem.
              const ritmo = cuidarDaPassagemRef.current(position, duration);
              progressoRef.current = setTimeout(atualizarProgresso, ritmo ?? (document.hidden ? 5000 : 1000));
            };
            atualizarProgressoRef.current = atualizarProgresso;
            atualizarProgresso();
          },
          onStateChange: (event: any) => aoMudarEstadoRef.current(event),
          onError: (event: any) => aoErroRef.current(event),
        },
      });
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
      clearTimeout(progressoRef.current);
      atualizarProgressoRef.current = null;
      for (const p of [ativoRef.current, esperaRef.current, player]) {
        try { p?.mute?.(); } catch {}
        try { p?.destroy?.(); } catch {}
      }
      ativoRef.current = null;
      esperaRef.current = null;
      seguinteRef.current = null;
      passagemRef.current = null;
      try { window.duotoneDesktop?.naoEstrangular?.(false); } catch {}
    };
    // O motor monta uma vez; as funções da passagem são estáveis (useCallback sem estado).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Trocar de faixa.
   *
   * CAMINHO CURTO: a faixa que agora entra é a que estava preparada no player
   * em espera -- no fim de uma passagem, ou num "seguinte" à mão perto do fim.
   * Trocam-se os papéis, e a música continua sem carregar nada. Senão é o
   * caminho de sempre: um `loadVideoById` no ativo, e a preparada cala-se.
   *
   * A primeira já foi carregada pelo `videoId` da criação, por isso este efeito
   * salta-a — senão pedia-se o mesmo vídeo duas vezes ao arrancar.
   */
  useEffect(() => {
    if (primeiraRef.current) { primeiraRef.current = false; return; }
    const state = usePlayer.getState();
    const prep = seguinteRef.current;
    const espera = esperaRef.current;
    if (prep?.pronta && espera && prep.sourceId === track.sourceId) {
      const sai = ativoRef.current;
      ativoRef.current = espera;
      esperaRef.current = sai;
      seguinteRef.current = null;
      passagemRef.current = null;
      entregaRef.current = null;
      notaRef.current = null;
      try { sai?.pauseVideo?.(); sai?.mute?.(); sai?.setVolume?.(0); } catch {}
      try {
        espera.unMute();
        espera.setVolume(state.volume);
        espera.setPlaybackRate?.(velocidadeDoMotor());
        if (state.isPlaying || state.autoplayOnLoad) espera.playVideo();
      } catch {}
      arrancouRef.current = true;
      clearTimeout(vigiaRef.current);
      state.setError(null);
      state._setBuffering(false);
      state._setActiveBackend('webview');
      // O player que entrou já estava a tocar: não vai mandar outro "playing".
      if (state.isPlaying || state.autoplayOnLoad) state._onYtStateChange('playing');
      estrangular(true);
      atualizarProgressoRef.current?.();
      return;
    }
    // Outra faixa qualquer: a preparada cala-se (`abortar`).
    largarSeguinte();
    estrangular(true);
    const p = ativoRef.current;
    if (!p?.loadVideoById) return;
    state._setBuffering(true);
    try { p.unMute?.(); p.setVolume?.(state.volume); } catch {}
    try { p.loadVideoById(track.sourceId); } catch {}
  }, [track.sourceId, estrangular, largarSeguinte]);

  const velocidadeEscolhida = usePlayer((s) => s.playbackRate);
  // Entrar e sair de um Jam também muda a velocidade do motor: a 1x lá dentro,
  // e de volta à escolhida à saída.
  const emJam = useOuvirJuntos((s) => !!s.sessao);
  const playbackRate = velocidadeNaSessao(velocidadeEscolhida, emJam);
  useEffect(() => {
    // O ativo pode ainda ser null (o IFrame monta-se depois). Antes havia
    // aqui um `if (!p) return` que abortava o efeito inteiro — e como ele so
    // volta a correr quando a velocidade muda, o pedido do tom nunca chegava a
    // ser agendado na primeira faixa.
    try {
      ativoRef.current?.setPlaybackRate?.(playbackRate);
    } catch {}
    // O tom tem de ACOMPANHAR a velocidade. Sem isto o browser estica o tempo
    // para o manter, e a 0,5x um time-stretch tem de inventar metade do sinal
    // — sao esses os artefactos que se ouviam em camara lenta.
    //
    // Isto vive no processo principal porque os iframes sao de OUTRA ORIGEM
    // (e agora sao dois: o processo principal trata de ambos).
    //
    // O atraso da tempo ao iframe de trocar de <video> na mudanca de faixa.
    const t = setTimeout(() => { void window.duotoneDesktop?.naoEsticarOTempo?.(); }, 400);
    return () => clearTimeout(t);
  }, [playbackRate, track.sourceId]);

  return (
    <>
      <div id={hostA.current} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
      <div id={hostB.current} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
    </>
  );
}
