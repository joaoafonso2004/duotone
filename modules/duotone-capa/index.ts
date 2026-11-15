import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';
import type { SaltoDaCapa } from '../../src/lib/recuoNoEcra';

type Props = ViewProps & { salto?: SaltoDaCapa | null };

/**
 * A vista que corre o recuo do skip no Core Animation (ver
 * ios/DuotoneCapaModule.swift). `null` fora do iPhone e num binário sem o
 * módulo (anterior a 15/11): aí o recuo fica no motor do React Native, como era.
 */
export const RecuoNativo: ComponentType<Props> | null =
  Platform.OS === 'ios' && requireOptionalNativeModule('DuotoneCapa')
    ? requireNativeView<Props>('DuotoneCapa')
    : null;
