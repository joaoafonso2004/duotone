/**
 * O par do iPhone do `SocialPc.web.tsx` (22/11, a B4 do PC): o iPhone NÃO muda. O
 * `SocialHub` partilhado só chama estas peças nos ramos web; aqui ficam vazias, e o
 * diálogo é o `SocialModal` de sempre.
 */
import React from 'react';
import { View } from 'react-native';
import { SocialModal } from './socialUI';
import type { CabecalhoDaConversaProps, CampoDeEscreverProps, DialogoDoSocialProps, LayoutDaConversaProps } from './socialPcTipos';

export function DialogoDoSocial({ visible, title, onClose, children }: DialogoDoSocialProps) {
  return <SocialModal visible={visible} title={title} onClose={onClose}>{children}</SocialModal>;
}

export function CabecalhoDaConversaPc(_: CabecalhoDaConversaProps): React.ReactElement | null {
  return null;
}

export function CampoDeEscreverPc(_: CampoDeEscreverProps): React.ReactElement | null {
  return null;
}

export function LayoutDaConversa({ children }: LayoutDaConversaProps) {
  return <>{children}</>;
}

export function EntradaDaMensagem({ children }: { tipo: 'minha' | 'dele' | 'cascata' | null; atraso?: number; children: React.ReactNode }) {
  return <>{children}</>;
}

export function MascaraDaConversa({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, minHeight: 0 }}>{children}</View>;
}
