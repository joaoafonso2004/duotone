import { useEffect, useRef } from 'react';
import { acaoDaJanela } from '../lib/atalhosDaJanela';
import { usePlayer } from '../state/player';

/**
 * Ouve o teclado da janela do PC e executa os atalhos de `lib/atalhosDaJanela.ts`.
 *
 * **Na fase de CAPTURA**, e a engolir a tecla que usa. É por causa do Espaço:
 * depois de clicar num botão, o foco fica nele, e o react-native-web carrega
 * nesse botão quando se carrega no Espaço -- clicar em "Next" e depois no
 * Espaço para pausar saltava outra faixa. Apanhada antes de chegar ao botão, a
 * tecla faz só o que o atalho diz. O Enter continua a carregar em botões.
 *
 * **Com o foco dentro do iframe do YouTube a página não vê a tecla** (o mesmo
 * problema do F11, ver o modo limpo). Aí manda o player do YouTube, que também
 * pausa com o Espaço.
 */

/** A gravação de um atalho global (Definições) precisa das teclas todas. */
let pausados = false;
export function pausarAtalhosDaJanela(v: boolean): void { pausados = v; }

const SALTO_MS = 10_000;

function editavel(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function deslizador(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  return !!el?.getAttribute && el.getAttribute('role') === 'slider';
}

export function useAtalhosDaJanela(opcoes: { gostar: () => void; pesquisar: () => void }): void {
  // As funções mudam a cada render da casca; o ouvinte fica o mesmo.
  const ultimas = useRef(opcoes);
  ultimas.current = opcoes;

  useEffect(() => {
    const aoCarregar = (e: KeyboardEvent) => {
      if (pausados || e.defaultPrevented) return;
      const acao = acaoDaJanela({
        key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey,
        repetida: e.repeat, editavel: editavel(e.target), deslizador: deslizador(e.target),
      });
      if (!acao) return;
      e.preventDefault();
      e.stopPropagation();
      const p = usePlayer.getState();
      switch (acao) {
        case 'tocar-pausa': if (p.current) void p.togglePlay(); return;
        case 'seguinte': if (p.current) void p.next(); return;
        case 'anterior': if (p.current) void p.prev(); return;
        case 'avancar-10': if (p.current) void p.seekTo(Math.min(p.durationMs, p.positionMs + SALTO_MS)); return;
        case 'recuar-10': if (p.current) void p.seekTo(Math.max(0, p.positionMs - SALTO_MS)); return;
        case 'gostar': if (p.current) ultimas.current.gostar(); return;
        case 'pesquisar': ultimas.current.pesquisar(); return;
      }
    };
    window.addEventListener('keydown', aoCarregar, true);
    return () => window.removeEventListener('keydown', aoCarregar, true);
  }, []);
}
