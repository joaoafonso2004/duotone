import React, { createContext, useCallback, useContext, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { SondaDoEcra, type InstanciaDaSonda } from '../../modules/duotone-capa';

export type AncoraNoEcra = { x: number; y: number; width: number; height: number };
/** Entrega a âncora já no ecrã: na hora quando não há nada a medir, depois da medida quando há. */
type Ajustar = (a: AncoraNoEcra, feito: (a: AncoraNoEcra) => void) => void;

const identidade: Ajustar = (a, feito) => feito(a);
const Contexto = createContext<Ajustar>(identidade);

/** O provedor: quem está dentro de uma folha nativa recebe o ajuste dela. */
export const ProvedorDoReferencial = Contexto.Provider;

/**
 * Passa uma âncora medida pelo React Native para o ecrã de verdade (16/11).
 * Fora de uma folha nativa entrega-a igual, na hora; dentro da fila, soma-lhe
 * onde a folha está, para os menus (que abrem por cima de tudo) nascerem junto
 * ao botão.
 */
export const useAjustarAncora = (): Ajustar => useContext(Contexto);

/**
 * Para uma folha NATIVA (a fila). Dentro dela, o `measureInWindow` e o toque
 * contam a partir do topo da folha, e não do ecrã: os menus da fila e do Radio
 * abriam no cimo do ecrã (João, 16/11). Uma sonda no canto da folha é medida
 * duas vezes -- pelo React Native e pelo UIKit -- e a diferença é o que falta
 * somar. Num binário sem a sonda, ou sem a sonda desenhada, fica como era.
 *
 * Devolve a sonda (para pôr dentro da folha) e o ajuste.
 */
export function useReferencialDaFolha(): { sonda: React.ReactNode; ajustar: Ajustar } {
  const ref = useRef<InstanciaDaSonda>(null);
  const ajustar = useCallback<Ajustar>((a, feito) => {
    const s = ref.current;
    const vista = s?.getNativeRef?.();
    if (!s?.noEcra || !vista?.measureInWindow) { feito(a); return; }
    Promise.all([
      s.noEcra(),
      new Promise<{ x: number; y: number }>((r) => vista.measureInWindow!((x, y) => r({ x, y }))),
    ]).then(([real, doReact]) => {
      if (!Array.isArray(real) || real.length < 2 || !Number.isFinite(real[0]) || !Number.isFinite(real[1])) { feito(a); return; }
      feito({ ...a, x: a.x + (real[0]! - doReact.x), y: a.y + (real[1]! - doReact.y) });
    }, () => feito(a));
  }, []);
  const sonda = SondaDoEcra ? <SondaDoEcra ref={ref} pointerEvents="none" style={styles.sonda} /> : null;
  return { sonda, ajustar };
}

const styles = StyleSheet.create({
  sonda: { position: 'absolute', left: 0, top: 0, width: 1, height: 1 },
});
