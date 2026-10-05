import React from 'react';
import { FlatList, ScrollView, View, type FlatListProps, type ScrollViewProps } from 'react-native';
import { Dialog } from '../desktop/ui.web';
import { useNotificationOverlay } from '../hooks/useNotificationOverlay';
import type { DetentesDaFolha } from '../state/folhasNativas';
const { createPortal } = require('react-dom') as { createPortal: (child: React.ReactNode, container: Element) => React.ReactElement };

/**
 * A folha no PC é um DIÁLOGO de desktop (5/10, auditoria de consistência T4):
 * ao centro, com X, Escape e clique fora. O `BottomSheet.tsx` corria igual no
 * PC e desenhava a folha do iPhone a toda a largura da janela -- o "Share" do
 * chat ficava preso, e o "Add to playlist" do chat era uma folha de telemóvel.
 * Quem usa a folha não muda nada: as mesmas props e os mesmos filhos.
 */
interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  gestureBlocked?: boolean;
  bloqueioRef?: React.RefObject<boolean>;
  nativa?: boolean;
  detentes?: DetentesDaFolha;
  /** O título vai para a barra do diálogo, ao lado do X. */
  titulo?: string;
}

export const FOLHAS_NATIVAS = false;

export function BottomSheet({ visible, onClose, children, titulo }: Props) {
  useNotificationOverlay(visible, onClose);
  if (!visible || typeof document === 'undefined') return null;
  // Num portal: dentro de uma página ou de um painel, o `fixed` ficava preso
  // ao contentor com transform mais próximo.
  return createPortal(
    <View style={{ position: 'fixed', inset: 0, zIndex: 10000 } as any}>
      <Dialog open title={titulo ?? ''} onClose={onClose} width={520}>
        <View style={{ maxHeight: 'calc(100dvh - 160px)', minHeight: 0, flexShrink: 1 } as any}>{children}</View>
      </Dialog>
    </View>,
    document.body,
  );
}

/** Sem gesto de arrastar para fechar no PC: é um `ScrollView` normal. */
export function BottomSheetScrollView(props: ScrollViewProps) {
  return <ScrollView keyboardShouldPersistTaps="handled" {...props} />;
}

export function BottomSheetFlatList<T>({ ref, dismissScrollEnabled: _ignorar, ...props }: FlatListProps<T> & { ref?: React.Ref<FlatList<T>>; dismissScrollEnabled?: boolean }) {
  return <FlatList {...props} ref={ref} />;
}

export function BottomSheetGestureGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
