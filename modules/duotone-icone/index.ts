import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type Modulo = {
  versao?: number;
  atual?: () => Promise<{ pode: boolean; nome: string | null }>;
  mudar?: (nome: string | null) => Promise<boolean>;
};

/**
 * O ícone da app à escolha (26/11, item 9 do plano; ver ios/DuotoneIconeModule.swift).
 * `null` fora do iPhone e num binário sem o módulo: aí a opção não aparece.
 */
export const iconeNativo: Modulo | null = Platform.OS === 'ios'
  ? requireOptionalNativeModule<Modulo>('DuotoneIcone')
  : null;
