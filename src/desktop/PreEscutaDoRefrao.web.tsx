import { useEffect } from 'react';
import { avisarInfo } from '../lib/avisoDeRemocao';
import { volumeParaOMotor } from '../lib/curvaDoVolume';
import { usePlayer } from '../state/player';
import { pararRefrao, refraoComecou, useRefrao } from '../state/refrao';

/** Quanto sobe a pré-escuta ao entrar, e quanto desce ao sair. */
const ENTRAR_MS = 400;
const SAIR_MS = 250;
/** Sem som ao fim disto (a rede, um vídeo que não carrega), desiste-se. */
const PRAZO_DO_SOM_MS = 10_000;

/** O IFrame do YouTube, à espera do script se ainda não houver leitor nenhum. */
function comOYouTube(f: () => void): () => void {
  if (window.YT?.Player) { f(); return () => {}; }
  let vivo = true;
  const anterior = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { anterior?.(); if (vivo) f(); };
  if (!document.querySelector('script[data-duotone-youtube]')) {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.dataset.duotoneYoutube = 'true';
    script.onerror = () => { if (vivo) pararRefrao(); };
    document.head.appendChild(script);
  }
  return () => { vivo = false; };
}

/** Leva o volume de um leitor a `para` em `ms`, por um relógio absoluto. */
function deslizarVolume(p: any, de: number, para: () => number, ms: number, depois?: () => void) {
  const inicio = Date.now();
  const andar = () => {
    const t = Math.min(1, (Date.now() - inicio) / ms);
    try { p?.setVolume?.(Math.round(de + (para() - de) * t)); } catch {}
    if (t < 1) setTimeout(andar, 40);
    else depois?.();
  };
  andar();
}

/**
 * O leitor da pré-escuta do PC (25/10, `state/refrao.ts`): um terceiro IFrame,
 * que nasce quando se carrega no auscultador e morre no fim dos 15 s. Não é o
 * de espera do crossfade, que tem a vida dele com a seguinte.
 *
 * Carrega calado, já no refrão, e só se ouve quando o YouTube diz que está a
 * tocar a partir daí -- é então que contam os 15 s e a outra baixa. O volume é
 * o da barra, na mesma curva. O anfitrião vai para o fim do `body`: o
 * equalizador do processo principal procura os frames do YouTube por ordem, e
 * o do leitor tem de continuar a ser o primeiro.
 */
export function PreEscutaDoRefrao() {
  const faixa = useRefrao((s) => s.faixa);
  const inicioS = useRefrao((s) => s.inicioS);
  const videoId = faixa?.sourceId ?? null;

  // O Esc pára a pré-escuta, como o mesmo auscultador. Não o come: um menu
  // ou um diálogo abertos fecham-se na mesma.
  useEffect(() => {
    if (!videoId) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') pararRefrao(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [videoId]);

  useEffect(() => {
    if (!videoId || inicioS == null) return;
    let vivo = true;
    let soou = false;
    let player: any = null;
    const anfitriao = document.createElement('div');
    anfitriao.style.cssText = 'position:fixed;left:-10px;top:-10px;width:1px;height:1px;opacity:0;pointer-events:none;';
    const host = document.createElement('div');
    anfitriao.appendChild(host);
    document.body.appendChild(anfitriao);
    const volumeDaBarra = () => volumeParaOMotor(usePlayer.getState().volume);

    const largarOYouTube = comOYouTube(() => {
      if (!vivo) return;
      player = new window.YT.Player(host, {
        host: 'https://www.youtube-nocookie.com',
        height: '1',
        width: '1',
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          playsinline: 1,
          start: Math.floor(inicioS),
          ...(window.location.protocol.startsWith('http') ? { origin: window.location.origin } : {}),
        },
        events: {
          onReady: (e: any) => {
            if (!vivo) return;
            try { e.target.mute(); e.target.setVolume(0); e.target.seekTo(inicioS, true); e.target.playVideo(); } catch {}
          },
          onStateChange: (e: any) => {
            if (!vivo) return;
            if (e.data === 0) { pararRefrao(); return; }
            if (soou || e.data !== 1) return;
            // O `start` vai ao fotograma-chave mais perto; se ele arrancou
            // muito antes do refrão, ainda calado, salta para lá.
            const onde = Number(e.target.getCurrentTime?.() ?? 0);
            if (onde < inicioS - 2) { try { e.target.seekTo(inicioS, true); } catch {} return; }
            soou = true;
            try { e.target.unMute(); } catch {}
            deslizarVolume(e.target, 0, volumeDaBarra, ENTRAR_MS);
            refraoComecou();
          },
          onError: () => {
            if (!vivo) return;
            avisarInfo('No preview for this song');
            pararRefrao();
          },
        },
      });
    });
    const prazo = setTimeout(() => { if (vivo && !soou) pararRefrao(); }, PRAZO_DO_SOM_MS);
    // A barra do volume mexe na pré-escuta também.
    const largarOVolume = usePlayer.subscribe((s, antes) => {
      if (soou && s.volume !== antes.volume) try { player?.setVolume?.(volumeParaOMotor(s.volume)); } catch {}
    });

    return () => {
      vivo = false;
      clearTimeout(prazo);
      largarOYouTube();
      largarOVolume();
      const p = player;
      const fim = () => { try { p?.destroy?.(); } catch {} anfitriao.remove(); };
      if (!p || !soou) { fim(); return; }
      let de = 0;
      try { de = Number(p.getVolume?.() ?? 0); } catch {}
      deslizarVolume(p, de, () => 0, SAIR_MS, fim);
    };
  }, [videoId, inicioS]);

  return null;
}
