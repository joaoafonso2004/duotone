import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * O coração reage ao CARREGAR (16/10, `lib/coracaoAoCarregar.ts`).
 *
 * Ao carregar, o coração passa a mostrar o estado novo e anima (`pulso`); ao
 * largar corre o `alternar` de sempre. Enquanto a guarda não chega à store (as
 * que esperam pelo servidor, como o `alternarGuardada`), mostra-se o que se
 * pediu; quando chega, ou quando o `alternar` acaba, volta a mostrar-se a
 * verdade -- e se falhou, ela é o estado de antes.
 *
 * Um toque que não chega a ser toque (virou scroll, o rato saiu) não larga:
 * o `onPressOut` vem sem `onPress`, e o coração volta atrás, também animado.
 */
export function useCoracaoAoCarregar(guardada: boolean, alternar: () => unknown) {
  const [pedida, setPedida] = useState<boolean | null>(null);
  const [pulso, setPulso] = useState(0);
  const pedidaRef = useRef<boolean | null>(null);
  const largou = useRef(false);
  const mostrada = pedida ?? guardada;

  const pedir = useCallback((valor: boolean | null) => {
    pedidaRef.current = valor;
    setPedida(valor);
  }, []);

  // A store chegou ao que se pediu: deixa de haver diferença.
  useEffect(() => {
    if (pedida !== null && pedida === guardada) pedir(null);
  }, [guardada, pedida, pedir]);

  const onPressIn = useCallback(() => {
    largou.current = false;
    pedir(!mostrada);
    setPulso((n) => n + 1);
  }, [mostrada, pedir]);

  const onPress = useCallback(() => {
    largou.current = true;
    let resultado: unknown;
    try { resultado = alternar(); } catch { /* quem chama trata o erro */ }
    // Acabou (bem, mal, ou nem começou -- sem rede, a meio de outra): o que
    // se mostra volta a ser o que a store diz.
    void Promise.resolve(resultado).catch(() => {}).finally(() => pedir(null));
  }, [alternar, pedir]);

  const onPressOut = useCallback(() => {
    // O `onPress` vem logo a seguir ao `onPressOut`, no mesmo toque.
    setTimeout(() => {
      if (largou.current || pedidaRef.current === null) return;
      pedir(null);
      setPulso((n) => n + 1);
    }, 60);
  }, [pedir]);

  return { mostrada, pulso, onPressIn, onPress, onPressOut };
}
