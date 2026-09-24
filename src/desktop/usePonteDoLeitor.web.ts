import { useEffect, useRef } from 'react';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { usePlayer } from '../state/player';
import { useSaved } from '../state/saved';
import { useModoLimpo } from './ModoLimpo.web';

/**
 * A janela principal do PC a responder aos atalhos globais e ao mini leitor
 * (entrega 2 do docs/PLANO-OFFLINE-SOCIAL-DESCOBERTA-PC.md).
 *
 * - Os atalhos chegam do processo principal como um id de ação
 *   (electron/atalhos.cjs); "mostrar a janela" e "mini leitor" ficam lá.
 * - O mini leitor é um comando à distância: esta janela publica um resumo do
 *   que toca e executa os comandos que ele manda. A posição só vai com o mini
 *   aberto, e no máximo duas vezes por segundo.
 */

type Opcoes = { guardarAtual: () => void; abrirPesquisa: () => void };

/**
 * O mini leitor está aberto? O motor (YouTubePlayerView.web.tsx) pergunta-o
 * para ler a posição a cada segundo mesmo com a janela no tabuleiro -- a 5 s o
 * mini andava desviado da app.
 */
let miniAberto = false;
export function miniLeitorEstaAberto(): boolean { return miniAberto; }

const PASSO_DO_VOLUME = 10;
const SALTO_MS = 10_000;

export function usePonteDoLeitor(opcoes: Opcoes): void {
  const ultimas = useRef(opcoes);
  ultimas.current = opcoes;

  // Atalhos e comandos do mini: a mesma lista de gestos.
  useEffect(() => {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop : undefined;
    if (!ponte) return;
    const executar = (acao: string, ms?: number) => {
      const p = usePlayer.getState();
      switch (acao) {
        case 'tocar-pausa': void p.togglePlay(); return;
        case 'seguinte': void p.next(); return;
        case 'anterior': void p.prev(); return;
        case 'guardar': ultimas.current.guardarAtual(); return;
        case 'volume-mais': p.setVolume(Math.min(100, p.volume + PASSO_DO_VOLUME)); return;
        case 'volume-menos': p.setVolume(Math.max(0, p.volume - PASSO_DO_VOLUME)); return;
        case 'avancar-10': void p.seekTo(p.positionMs + SALTO_MS); return;
        case 'recuar-10': void p.seekTo(Math.max(0, p.positionMs - SALTO_MS)); return;
        case 'shuffle': p.toggleShuffle(); return;
        case 'repeat': p.cycleRepeat(); return;
        case 'pesquisar': ultimas.current.abrirPesquisa(); return;
        case 'procurar': if (typeof ms === 'number') void p.seekTo(ms); return;
        default:
      }
    };
    const sairAtalho = ponte.onAtalho?.((acao) => executar(acao));
    const sairMini = ponte.onComandoDoMiniLeitor?.((c) => executar(c.tipo, c.ms));
    return () => { sairAtalho?.(); sairMini?.(); };
  }, []);

  // O resumo para o mini leitor, só enquanto ele está aberto.
  useEffect(() => {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop : undefined;
    if (!ponte?.publicarNoMiniLeitor) return;
    let sairDoLeitor: (() => void) | null = null;
    let sairDasGuardadas: (() => void) | null = null;
    let ultimaPosicao = 0;
    const publicar = () => {
      const p = usePlayer.getState();
      const t = p.current;
      ultimaPosicao = Date.now();
      ponte.publicarNoMiniLeitor!({
        titulo: t ? tituloDaFaixa(t) : null,
        artista: t ? displayArtist(t) : null,
        capa: t ? (capaParaLista(t.artworkUrl) ?? (t.source === 'youtube' ? `https://i.ytimg.com/vi/${t.sourceId}/mqdefault.jpg` : null)) : null,
        aTocar: p.isPlaying,
        guardada: t ? useSaved.getState().isSaved(t) : false,
        posicaoMs: p.positionMs,
        duracaoMs: t?.durationSeconds ? t.durationSeconds * 1000 : p.durationMs,
      });
    };
    const ligar = (aberto: boolean) => {
      miniAberto = aberto;
      sairDoLeitor?.(); sairDasGuardadas?.();
      sairDoLeitor = null; sairDasGuardadas = null;
      if (!aberto) return;
      publicar();
      sairDoLeitor = usePlayer.subscribe((s, antes) => {
        const mudou = s.current !== antes.current || s.isPlaying !== antes.isPlaying || s.durationMs !== antes.durationMs;
        if (mudou || (s.positionMs !== antes.positionMs && Date.now() - ultimaPosicao >= 500)) publicar();
      });
      sairDasGuardadas = useSaved.subscribe((s, antes) => { if (s.keys !== antes.keys) publicar(); });
    };
    const sairDoAviso = ponte.onMiniLeitorAberto?.(ligar);
    void ponte.miniLeitorAberto?.().then(ligar).catch(() => {});
    return () => { sairDoAviso?.(); sairDoLeitor?.(); sairDasGuardadas?.(); };
  }, []);

  // O modo limpo (F11) tira o mini da frente.
  useEffect(() => {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop : undefined;
    if (!ponte?.miniLeitorNoModoLimpo) return;
    return useModoLimpo.subscribe((s, antes) => { if (s.aberto !== antes.aberto) ponte.miniLeitorNoModoLimpo!(s.aberto); });
  }, []);
}
