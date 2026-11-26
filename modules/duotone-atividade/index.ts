import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { EstadoDaAtividade } from '../../src/lib/atividadeAoVivo';

type Modulo = {
  versao?: number;
  permitida?: () => boolean;
  mostrar?: (estado: EstadoDaAtividade) => Promise<boolean>;
  acabar?: () => Promise<void>;
};

/**
 * A Live Activity do Duotone (26/11, item 8 do plano; ver ios/DuotoneAtividadeModule.swift).
 * `null` fora do iPhone e num binário sem o módulo (anterior a esta build): aí
 * não há atividade, e nada mais muda.
 */
export const atividadeNativa: Modulo | null = Platform.OS === 'ios'
  ? requireOptionalNativeModule<Modulo>('DuotoneAtividade')
  : null;
