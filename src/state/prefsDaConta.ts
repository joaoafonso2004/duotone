import { useAtalhosDaLateral } from './atalhosDaLateral';
import { carregarGaveta, useGaveta } from './gaveta';

/**
 * As preferências da conta que vivem em memória voltam a ler-se do disco (28/11).
 *
 * Chamado pelo `prefsSync` (o `App.tsx` liga-o) em dois momentos: quando as da
 * conta anterior saem do aparelho (`DA_CONTA`, `lib/prefsFusao.ts`) e quando as da
 * conta nova chegam. Sem isto, os "Pinned" da conta principal ficavam na lateral
 * do PC de uma conta nova (o João, 28/11), e as que chegavam da conta só
 * apareciam no arranque seguinte.
 *
 * O resto das `DA_CONTA` lê-se quando é preciso (o questionário, o gosto, o resumo).
 */
export function reporOQueEDaConta(chaves: readonly string[]): void {
  if (chaves.includes('pref:atalhosDaLateral')) {
    // A lateral volta a carregar sozinha (`carregados` a false).
    useAtalhosDaLateral.getState().esquecer();
  }
  if (chaves.includes('pref:gaveta') && useGaveta.getState().carregada) {
    useGaveta.setState({ gaveta: null, carregada: false });
    void carregarGaveta();
  }
}
