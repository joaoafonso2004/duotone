import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import { useEffect } from 'react';
import { resolveYouTubeHls } from '../api/ytstream';
import { avisarInfo } from '../lib/avisoDeRemocao';
import { useConnectivity } from '../state/connectivity';
import { pararRefrao, refraoComecou, useRefrao } from '../state/refrao';

/** Quanto sobe a pré-escuta ao entrar, e quanto desce ao sair. */
const ENTRAR_MS = 400;
const SAIR_MS = 250;
/** Sem som ao fim disto (a rede, um vídeo que não carrega), desiste-se. */
const PRAZO_DO_SOM_MS = 12_000;

/** Leva o volume de um leitor a `para` em `ms`, por um relógio absoluto. */
function deslizarVolume(p: VideoPlayer, de: number, para: number, ms: number, depois?: () => void) {
  const inicio = Date.now();
  const andar = () => {
    const t = Math.min(1, (Date.now() - inicio) / ms);
    try { p.volume = de + (para - de) * t; } catch {}
    if (t < 1) setTimeout(andar, 40);
    else depois?.();
  };
  andar();
}

/**
 * O leitor da pré-escuta do iPhone (25/10, `state/refrao.ts`): um terceiro
 * motor, fora dos dois da reprodução, que nasce quando se toca no auscultador
 * e morre no fim dos 15 s.
 *
 * Toca o HLS do vídeo, sem descarregar nada: são 15 s de uma música que talvez
 * nunca se ouça inteira, e o ficheiro da Smart Cache é para as que se tocam.
 * Sem Now Playing (o ecrã bloqueado continua a ser da música de sempre) e sem
 * segundo plano: é uma coisa de quem está a olhar para o ecrã. Arranca calado
 * e só se ouve quando já está no refrão; é então que contam os 15 s e a outra
 * baixa (no `YouTubePlayerView`, por `seguirOAbafo`).
 */
export function PreEscutaDoRefrao() {
  const faixa = useRefrao((s) => s.faixa);
  const inicioS = useRefrao((s) => s.inicioS);
  const videoId = faixa?.sourceId ?? null;

  useEffect(() => {
    if (!videoId || inicioS == null) return;
    if (useConnectivity.getState().offline) {
      avisarInfo('Chorus preview needs a connection');
      pararRefrao();
      return;
    }
    let vivo = true;
    let soou = false;
    let player: VideoPlayer | null = null;
    const subscricoes: { remove(): void }[] = [];
    const desistir = (aviso: boolean) => {
      if (!vivo) return;
      if (aviso) avisarInfo('No preview for this song');
      pararRefrao();
    };

    void resolveYouTubeHls(videoId, 'saver').then((stream) => {
      if (!vivo) return;
      const p = createVideoPlayer({ uri: stream.url });
      player = p;
      p.showNowPlayingNotification = false;
      p.staysActiveInBackground = false;
      p.loop = false;
      p.volume = 0;
      p.timeUpdateEventInterval = 0.25;
      let pediu = false;
      subscricoes.push(p.addListener('statusChange', ({ status }) => {
        if (!vivo) return;
        if (status === 'error') { desistir(true); return; }
        if (status === 'readyToPlay' && !pediu) {
          pediu = true;
          p.currentTime = inicioS;
          p.play();
        }
      }));
      // Só se ouve com a posição já no refrão: o `currentTime` de um HLS
      // acabado de abrir pode ainda estar no 0.
      subscricoes.push(p.addListener('timeUpdate', ({ currentTime }) => {
        if (!vivo || soou || currentTime < inicioS - 2) return;
        soou = true;
        deslizarVolume(p, 0, 1, ENTRAR_MS);
        refraoComecou();
      }));
      subscricoes.push(p.addListener('playToEnd', () => { if (vivo) pararRefrao(); }));
    }).catch(() => desistir(true));
    const prazo = setTimeout(() => { if (!soou) desistir(false); }, PRAZO_DO_SOM_MS);

    return () => {
      vivo = false;
      clearTimeout(prazo);
      for (const s of subscricoes) s.remove();
      const p = player;
      if (!p) return;
      const fim = () => { try { p.pause(); p.release(); } catch {} };
      if (!soou) { fim(); return; }
      deslizarVolume(p, p.volume, 0, SAIR_MS, fim);
    };
  }, [videoId, inicioS]);

  return null;
}
