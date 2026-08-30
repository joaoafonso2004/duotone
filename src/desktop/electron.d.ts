export {};

declare module 'react-native' {
  interface PressableStateCallbackType {
    hovered: boolean;
    focused: boolean;
  }
  interface ViewProps {
    onDoubleClick?: () => void;
    onContextMenu?: (event: unknown) => void;
  }
}

declare global {
  interface Window {
    duotoneDesktop?: {
      platform: string;
      minimize(): void;
      toggleMaximize(): void;
      close(): void;
      isMaximized(): Promise<boolean>;
      onMaximizedChange(listener: (maximized: boolean) => void): () => void;
      /** Aplica os ganhos do equalizador dentro do frame do YouTube.
       * Falhar aqui nao estraga o som: sem grafo, o video toca na mesma.
       * A `compensacao` e o multiplicador de amplitude que impede a curva de
       * cortar a onda — calculada no `lib/equalizer.ts`. */
      aplicarEqualizador?: (
        ajuste: { ganhos: number[]; compensacao: number },
      ) => Promise<{ ok: boolean; porque?: string }>;
      /** Faz o tom acompanhar a velocidade em vez de o browser esticar o
       * tempo — e o time-stretch que estraga a camara lenta. */
      naoEsticarOTempo?: () => Promise<{ ok: boolean; antes?: boolean; agora?: boolean }>;
      showContextMenu(items: { id: string; label: string; enabled?: boolean }[]): void;
      onContextMenuSelection(listener: (id: string) => void): () => void;
    };
  }
}
