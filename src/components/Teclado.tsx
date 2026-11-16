import React from 'react';
import { KeyboardAvoidingView as KeyboardAvoidingViewDoRN } from 'react-native';

/**
 * O teclado do iPhone pelo react-native-keyboard-controller (16/11, pedido do
 * João). O `KeyboardAvoidingView` dele anda com o teclado fotograma a
 * fotograma (o do React Native só sabe onde o teclado acaba, e a caixa de
 * escrever da conversa chegava antes ou depois dele), e acompanha o fechar
 * interativo, a arrastar a conversa para baixo.
 *
 * Um módulo nativo só chega com uma build nova (CLAUDE.md): um binário sem ele
 * (ou sem o Reanimated, de que ele precisa) carrega este JavaScript e fica com o
 * do React Native, sem rebentar. No PC é o par `Teclado.web.tsx`.
 */
type Controlador = {
  KeyboardProvider: React.ComponentType<{ children: React.ReactNode }>;
  KeyboardAvoidingView: typeof KeyboardAvoidingViewDoRN;
};

let controlador: Controlador | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  controlador = require('react-native-keyboard-controller') as Controlador;
} catch {
  controlador = null;
}

/** Por cima da app inteira, uma vez (App.tsx). Sem o módulo, não faz nada. */
export function ProvedorDoTeclado({ children }: { children: React.ReactNode }) {
  const Provedor = controlador?.KeyboardProvider;
  return Provedor ? <Provedor>{children}</Provedor> : <>{children}</>;
}

/** O `KeyboardAvoidingView` que anda com o teclado (as mesmas props do do React Native). */
export const EvitarTeclado: typeof KeyboardAvoidingViewDoRN = controlador?.KeyboardAvoidingView ?? KeyboardAvoidingViewDoRN;

/** Se o binário tem o controlador (para o diagnóstico e os testes). */
export const temControladorDoTeclado = !!controlador;
