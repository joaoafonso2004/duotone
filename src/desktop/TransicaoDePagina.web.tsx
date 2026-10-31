import React, { useLayoutEffect, useRef } from 'react';
import { View } from 'react-native';
import { marcar } from './ui.web';

/**
 * A passagem entre páginas do PC (27/9, João: "a app deve parecer lightning
 * fast"; 30/9: "a única coisa smooth a mudar é a aba na esquerda").
 *
 * Duas metades, as duas em CSS (`pagina` e `a-sair`, na `casca.web.tsx`): a
 * página de agora ESBATE-SE enquanto a nova se prepara (`aSair`, o pendente
 * da transição do React que muda a rota) e a nova ENTRA a subir e a acender.
 * A de agora só se esbate -- sem transform, que faria dela o contentor dos
 * `fixed` que tenha dentro. Era um `Animated` de 260 ms: no react-native-web isso é JavaScript a
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
 *
 * **Chegar calada** (30/10): ao voltar, e ao chegar numa viagem (`viagem.web.ts`),
 * a página não repete a entrada -- nem ela, nem os blocos, cartões e linhas dela.
 * Voltar é regressar ao que já se viu, e na viagem quem entra é o retrato. A marca
 * (`data-chegada`) fica na página até à rota seguinte: o CSS que a lê é um
 * `animation: none`, e tirá-lo ao fim da viagem punha a animação a correr de novo
 * (a página piscava a zero e voltava a entrar, o "refresh" do João).
 */
export function TransicaoDePagina({ chave, aSair = false, volta = false, children }: {
  chave: string; aSair?: boolean; volta?: boolean; children: React.ReactNode;
}) {
  const ref = useRef<View>(null);
  const primeira = useRef(true);
  useLayoutEffect(() => {
    const no = ref.current as unknown as HTMLElement | null;
    if (!no?.style) return;
    if (volta || document.documentElement.hasAttribute('data-viagem')) no.setAttribute('data-chegada', 'calada');
    else no.removeAttribute('data-chegada');
    if (primeira.current) { primeira.current = false; return; }
    no.style.animation = 'none';
    void no.offsetHeight;
    no.style.animation = '';
  }, [chave]);
  return <View ref={ref} style={{ flex: 1, minHeight: 0 }} {...(aSair ? marcar('pagina', 'a-sair') : marcar('pagina'))}>
    {children}
  </View>;
}
