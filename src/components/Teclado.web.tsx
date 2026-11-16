import React from 'react';
import { KeyboardAvoidingView } from 'react-native';

/**
 * No PC não há teclado a subir (16/11): o par do `Teclado.tsx` do iPhone, sem o
 * react-native-keyboard-controller (que é só nativo), para nada dele entrar no
 * pacote do PC.
 */
export function ProvedorDoTeclado({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export const EvitarTeclado = KeyboardAvoidingView;

export const temControladorDoTeclado = false;
