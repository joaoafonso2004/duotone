import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType, Ref } from 'react';
import { Platform, type ViewProps } from 'react-native';

/** O que a vista faz (ver ios/DuotoneVoltaModule.swift). */
export type InstanciaDaVolta = {
  /** Começa o pop interativo da pilha: a página de trás volta à janela, por baixo. */
  comecar?: () => Promise<boolean>;
  /** Acaba-o: `true` deixa a página onde está, `false` tira-a (sem animação). */
  acabar?: (cancelada: boolean) => Promise<boolean>;
};

const nativo = Platform.OS === 'ios'
  ? requireOptionalNativeModule<{ versao?: number }>('DuotoneVolta')
  : null;

/**
 * A vista que segura a página de trás enquanto a da frente encolhe com o dedo
 * (26/11, item 7 do plano). `null` fora do iPhone e num binário sem o módulo
 * (anterior a esta build): aí as páginas voltam pelo deslizar da borda, como antes.
 */
export const VistaDaVolta: ComponentType<ViewProps & { ref?: Ref<InstanciaDaVolta> }> | null =
  nativo ? requireNativeView<ViewProps>('DuotoneVolta') : null;
