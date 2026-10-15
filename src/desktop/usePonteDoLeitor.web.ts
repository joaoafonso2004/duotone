import { useEffect, useRef } from 'react';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { trackKey } from '../lib/shuffle';
import { usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSaved } from '../state/saved';
import { useSeguirAmigo } from '../state/seguirAmigo';
import type { Track } from '../types';
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
/** Quantas das próximas vão para a lista do mini (o processo principal corta no mesmo número). */
const NA_LISTA_DO_MINI = 50;

function capaDoMini(t: Track): string | null {
  return capaParaLista(t.artworkUrl) ?? (t.source === 'youtube' ? `https://i.ytimg.com/vi/${t.sourceId}/mqdefault.jpg` : null);
}

/**
 * As próximas da lista do mini (12/10): as mesmas do painel da fila
 * (`useFilaDoLeitor`) -- as do amigo que se segue (só de ver), as da Jam, ou
 * as nossas, pela `upcomingQueue`.
 */
function proximasDoMini(): { faixas: Track[]; soDeVer: boolean } {
  const seguir = useSeguirAmigo.getState();
  if (seguir.seguindo) return { faixas: seguir.aSeguir, soDeVer: true };
  const jam = useOuvirJuntos.getState();
  if (jam.sessao) return { faixas: jam.fila.map((i) => i.track), soDeVer: false };
  return { faixas: usePlayer.getState().upcomingQueue().map((u) => u.track), soDeVer: false };
}

/**
 * Tocar uma das próximas escolhida no mini, como um clique no painel da fila.
 * O mini manda a chave e o lugar que viu; se a fila mudou entretanto, vale a
 * chave.
 */
function tocarDaFila(chave: string, posicao: number): void {
  const { faixas, soDeVer } = proximasDoMini();
  if (soDeVer) return;
  const noLugar = faixas[posicao];
  const alvo = noLugar && trackKey(noLugar) === chave ? noLugar : faixas.find((t) => trackKey(t) === chave);
  if (alvo) void usePlayer.getState().playTrack(alvo, usePlayer.getState().queue);
}

export function usePonteDoLeitor(opcoes: Opcoes): void {
  const ultimas = useRef(opcoes);
  ultimas.current = opcoes;

  // Atalhos e comandos do mini: a mesma lista de gestos.
  useEffect(() => {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop : undefined;
    if (!ponte) return;
    const executar = (acao: string, c?: ComandoDoMiniLeitor) => {
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
        case 'procurar': if (typeof c?.ms === 'number') void p.seekTo(c.ms); return;
        case 'tocar-da-fila': if (c?.chave && typeof c.posicao === 'number') tocarDaFila(c.chave, c.posicao); return;
        default:
      }
    };
    const sairAtalho = ponte.onAtalho?.((acao) => executar(acao));
    const sairMini = ponte.onComandoDoMiniLeitor?.((c) => executar(c.tipo, c));
    return () => { sairAtalho?.(); sairMini?.(); };
  }, []);

  // O resumo para o mini leitor, só enquanto ele está aberto.
  useEffect(() => {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop : undefined;
    if (!ponte?.publicarNoMiniLeitor) return;
    let saidas: (() => void)[] = [];
    let ultimaPosicao = 0;
    // A lista das próximas só se refaz quando a fila muda (a posição publica-se
    // duas vezes por segundo, e uma biblioteca baralhada tem milhares).
    let chaveDaFila: unknown[] = [];
    let fila: ResumoDoMiniLeitor['fila'] = [];
    let filaSoDeVer = false;
    const lerFila = () => {
      const p = usePlayer.getState();
      const j = useOuvirJuntos.getState();
      const g = useSeguirAmigo.getState();
      const chave = [p.queue, p.queueIndex, p.shuffle, p.shuffleOrder, !!j.sessao, j.fila, g.seguindo, g.aSeguir];
      if (chave.every((v, i) => v === chaveDaFila[i])) return;
      chaveDaFila = chave;
      const proximas = proximasDoMini();
      filaSoDeVer = proximas.soDeVer;
      fila = proximas.faixas.slice(0, NA_LISTA_DO_MINI).map((t) => ({
        titulo: tituloDaFaixa(t), artista: displayArtist(t), capa: capaDoMini(t), chave: trackKey(t),
      }));
    };
    const publicar = () => {
      const p = usePlayer.getState();
      const t = p.current;
      ultimaPosicao = Date.now();
      lerFila();
      ponte.publicarNoMiniLeitor!({
        titulo: t ? tituloDaFaixa(t) : null,
        artista: t ? displayArtist(t) : null,
        capa: t ? capaDoMini(t) : null,
        aTocar: p.isPlaying,
        guardada: t ? useSaved.getState().isSaved(t) : false,
        posicaoMs: p.positionMs,
        duracaoMs: t?.durationSeconds ? t.durationSeconds * 1000 : p.durationMs,
        fila,
        filaSoDeVer,
      });
    };
    const ligar = (aberto: boolean) => {
      miniAberto = aberto;
      saidas.forEach((sair) => sair());
      saidas = [];
      if (!aberto) return;
      publicar();
      saidas = [
        usePlayer.subscribe((s, antes) => {
          const mudou = s.current !== antes.current || s.isPlaying !== antes.isPlaying || s.durationMs !== antes.durationMs
            || s.queue !== antes.queue || s.queueIndex !== antes.queueIndex || s.shuffle !== antes.shuffle || s.shuffleOrder !== antes.shuffleOrder;
          if (mudou || (s.positionMs !== antes.positionMs && Date.now() - ultimaPosicao >= 500)) publicar();
        }),
        useSaved.subscribe((s, antes) => { if (s.keys !== antes.keys) publicar(); }),
        useOuvirJuntos.subscribe((s, antes) => { if (s.fila !== antes.fila || !!s.sessao !== !!antes.sessao) publicar(); }),
        useSeguirAmigo.subscribe((s, antes) => { if (s.aSeguir !== antes.aSeguir || s.seguindo !== antes.seguindo) publicar(); }),
      ];
    };
    const sairDoAviso = ponte.onMiniLeitorAberto?.(ligar);
    void ponte.miniLeitorAberto?.().then(ligar).catch(() => {});
    return () => { sairDoAviso?.(); saidas.forEach((sair) => sair()); };
  }, []);

  // O modo limpo (F11) tira o mini da frente.
  useEffect(() => {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop : undefined;
    if (!ponte?.miniLeitorNoModoLimpo) return;
    return useModoLimpo.subscribe((s, antes) => { if (s.aberto !== antes.aberto) ponte.miniLeitorNoModoLimpo!(s.aberto); });
  }, []);
}
