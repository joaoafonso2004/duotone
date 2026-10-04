import { createContext, useEffect } from 'react';

/**
 * Verdade dentro de um `Modal` do React Native (o chat, o modo carro, as
 * boas-vindas, uma folha antiga...).
 *
 * Uma folha nativa (`state/folhasNativas.ts`) é apresentada pelo stack de
 * raiz, e o react-native-screens, antes de apresentar, FECHA o que encontrar
 * apresentado por outros (`RNSScreenStack.mm`, `setModalViewControllers`): o
 * chat fechava-se debaixo do dedo. Dentro de um destes, o `BottomSheet` usa o
 * `Modal` de sempre.
 */
export const DentroDeUmModal = createContext(false);

/**
 * Quantos `Modal` do React Native estão à vista agora, seja quem for o dono.
 * Uma folha aberta por quem está FORA deles (o leitor, enquanto o modo carro
 * está aberto) também os fecharia: nesse momento a folha usa o `Modal`.
 */
let modaisAbertos = 0;
export function haModalDoRNAberto(): boolean {
  return modaisAbertos > 0;
}
export function useModalDoRNAberto(visivel: boolean): void {
  useEffect(() => {
    if (!visivel) return;
    modaisAbertos += 1;
    return () => { modaisAbertos -= 1; };
  }, [visivel]);
}
