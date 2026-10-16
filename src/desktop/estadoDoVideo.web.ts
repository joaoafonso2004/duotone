import { create } from 'zustand';

/**
 * O vídeo no Now Playing do PC (16/10, `lib/videoNoLeitor.ts`): a escolha
 * (por aparelho, no localStorage), o palco onde o vídeo se põe (o quadrado da
 * capa, enquanto o Now Playing está aberto e não mostra a letra) e se o vídeo
 * está mesmo à vista agora (quem o diz é o motor, `YouTubePlayerView.web.tsx`).
 */
const CHAVE = 'duotone:video-no-leitor';

function lerLigado(): boolean {
  try { return window.localStorage.getItem(CHAVE) === '1'; } catch { return false; }
}

/** Só onde o Chromium muda um iframe de sítio sem o recarregar (o Electron 44 sim). */
export const podeMostrarVideo = (): boolean =>
  typeof Element !== 'undefined' && typeof (Element.prototype as any).moveBefore === 'function';

type Estado = {
  ligado: boolean;
  palco: HTMLElement | null;
  aMostrar: boolean;
  alternar: () => void;
  definirPalco: (palco: HTMLElement | null) => void;
};

export const useVideoNoLeitor = create<Estado>((set, get) => ({
  ligado: lerLigado(),
  palco: null,
  aMostrar: false,
  alternar: () => {
    const ligado = !get().ligado;
    try { window.localStorage.setItem(CHAVE, ligado ? '1' : '0'); } catch { /* fica só nesta sessão */ }
    set({ ligado });
  },
  definirPalco: (palco) => { if (get().palco !== palco) set({ palco }); },
}));
