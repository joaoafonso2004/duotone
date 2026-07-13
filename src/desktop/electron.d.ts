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
      showContextMenu(items: { id: string; label: string; enabled?: boolean }[]): void;
      onContextMenuSelection(listener: (id: string) => void): () => void;
    };
  }
}
