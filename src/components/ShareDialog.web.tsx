import React from 'react';
import { View } from 'react-native';
import { Dialog } from '../desktop/ui.web';
import { useNotificationOverlay } from '../hooks/useNotificationOverlay';
import type { ShareDialogProps } from './ShareDialog';
const { createPortal } = require('react-dom') as { createPortal:(child:React.ReactNode,container:Element)=>React.ReactElement };

/** Portal sobre a janela inteira, com X, Escape e clique no exterior. */
export function ShareDialog({visible,title,onClose,children}:ShareDialogProps) {
  useNotificationOverlay(visible,onClose);
  if(!visible||typeof document==='undefined')return null;
  return createPortal(<View style={{position:'fixed',inset:0,zIndex:10000} as any}>
    <Dialog open title={title} onClose={onClose} width={520}>
      <View style={{maxHeight:'calc(100dvh - 160px)',minHeight:0,flexShrink:1} as any}>{children}</View>
    </Dialog>
  </View>,document.body);
}
