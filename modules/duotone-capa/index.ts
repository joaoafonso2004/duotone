import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType, Ref } from 'react';
import { Platform, type ViewProps } from 'react-native';
import type { SaltoDaCapa } from '../../src/lib/recuoNoEcra';

type Props = ViewProps & { salto?: SaltoDaCapa | null };

const nativo = Platform.OS === 'ios'
  ? requireOptionalNativeModule<{ ViewPrototypes?: Record<string, unknown> }>('DuotoneCapa')
  : null;

/**
 * A vista que corre o recuo do skip no Core Animation (ver
 * ios/DuotoneCapaModule.swift). `null` fora do iPhone e num binário sem o
 * módulo (anterior a 15/11): aí o recuo fica no motor do React Native, como era.
 */
export const RecuoNativo: ComponentType<Props> | null = nativo ? requireNativeView<Props>('DuotoneCapa') : null;

/** O que a sonda faz: a posição dela no ecrã, em pontos, pelo UIKit. */
export type InstanciaDaSonda = {
  noEcra?: () => Promise<number[]>;
  getNativeRef?: () => { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
};

/**
 * Uma vista vazia que se mede no ecrã (16/11). `null` fora do iPhone e num
 * binário sem ela: aí as âncoras ficam como o React Native as mede.
 */
export const SondaDoEcra: ComponentType<ViewProps & { ref?: Ref<InstanciaDaSonda> }> | null =
  nativo?.ViewPrototypes?.DuotoneCapa_DuotoneSondaView
    ? requireNativeView<ViewProps>('DuotoneCapa', 'DuotoneSondaView')
    : null;
