import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { CHAVE_DO_IDIOMA, guardarEscolha, idiomaEscolhido, type Idioma } from './idioma';

/**
 * A escolha da língua nas Definições (15/11). No PC recarrega a janela, que é
 * a única forma de o que já está escrito mudar de língua; no iPhone vale a
 * partir da próxima vez que a app abre (a frase do efeito di-lo).
 */
export function escolherIdioma(idioma: Idioma): void {
  if (idioma === idiomaEscolhido()) return;
  guardarEscolha(idioma, (chave, valor) => AsyncStorage.setItem(chave, valor));
  if (Platform.OS === 'web') {
    try { (globalThis as { localStorage?: Storage }).localStorage?.setItem(CHAVE_DO_IDIOMA, idioma); } catch { /* sem armazenamento */ }
    try { (globalThis as { location?: Location }).location?.reload(); } catch { /* fora do browser */ }
  }
}
