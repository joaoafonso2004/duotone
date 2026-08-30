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
       * Falhar aqui nao estraga o som: sem grafo, o video toca na mesma. */
      aplicarEqualizador?: (ganhos: number[]) => Promise<{ ok: boolean; porque?: string }>;
      showContextMenu(items: { id: string; label: string; enabled?: boolean }[]): void;
      onContextMenuSelection(listener: (id: string) => void): () => void;
    };
  }
}
