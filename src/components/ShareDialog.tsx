import React from 'react';
import { Text } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { spacing, type } from '../theme';

export interface ShareDialogProps { visible:boolean; title:string; onClose:()=>void; children:React.ReactNode }

export function ShareDialog({visible,title,onClose,children}:ShareDialogProps) {
  return <BottomSheet visible={visible} onClose={onClose}>
    <Text style={[type.title,{marginBottom:spacing.md}]}>{title}</Text>
    {children}
  </BottomSheet>;
}
