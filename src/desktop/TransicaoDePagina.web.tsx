import React, { useLayoutEffect, useRef } from 'react';
import { View } from 'react-native';
import { marcar } from './ui.web';

/**
 * A passagem entre páginas do PC (27/9, João: "a app deve parecer lightning
 * fast"). Era um `Animated` de 260 ms: no react-native-web isso é JavaScript a
 * escrever estilos fotograma a fotograma, na MESMA thread que está a montar a
 * página nova -- por isso começava tarde e engasgava, e a página parecia
 * aparecer do nada. Agora é uma animação CSS (`pagina`, na `casca.web.tsx`):
 * 150 ms, e o compositor corre-a mesmo com a thread ocupada.
 *
 * Recomeça a cada página nova sem remontar nada: tira-se a animação, força-se
 * um reflow e devolve-se. No `useLayoutEffect`, antes de o browser pintar, para
 * a página nova nunca aparecer um fotograma inteira antes de entrar. Remontar
 * (uma `key`) deitava fora o scroll e o estado de uma página que só mudou de
 * playlist.
 */
export function TransicaoDePagina({ chave, children }: { chave: string; children: React.ReactNode }) {
  const ref = useRef<View>(null);
  const primeira = useRef(true);
  useLayoutEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    const no = ref.current as unknown as HTMLElement | null;
    if (!no?.style) return;
    no.style.animation = 'none';
    void no.offsetHeight;
    no.style.animation = '';
  }, [chave]);
  return <View ref={ref} style={{ flex: 1, minHeight: 0 }} {...marcar('pagina')}>{children}</View>;
}
