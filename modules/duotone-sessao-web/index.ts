import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type Modulo = {
  versao?: number;
  esquecerSpotify?: () => Promise<number>;
};

/**
 * Sair da conta do Spotify no iPhone (26/11; ver ios/DuotoneSessaoWebModule.swift).
 * `null` fora do iPhone e num binário sem o módulo: aí o "Use another account" não aparece.
 */
export const sessaoWebNativa: Modulo | null = Platform.OS === 'ios'
  ? requireOptionalNativeModule<Modulo>('DuotoneSessaoWeb')
  : null;
