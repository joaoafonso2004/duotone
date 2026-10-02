import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Text, View, type TextStyle } from 'react-native';
import { vaiEVolta } from '../lib/tituloQueRola';
import { marcar } from './ui.web';

/**
 * Uma linha que, quando não cabe, anda com o rato em cima para se ler toda
 * (2/10, o nome da música de um amigo na lateral). Parada leva reticências como
 * sempre; com o rato na linha do amigo vai até ao fim, pára e volta (`dt-rola`
 * no CSS da casca, que é quem sabe do hover). Daqui vem só a medida: quanto
 * anda e quanto demora (`vaiEVolta`), em variáveis CSS no próprio texto.
 *
 * Mede quando o texto muda e quando a caixa muda de tamanho (o `onLayout` do
 * RNW é um ResizeObserver).
 */
export function TextoQueRola({ texto, style }: { texto: string; style: TextStyle }) {
  const ref = useRef<any>(null);
  const caixa = useRef<any>(null);
  const [anda, setAnda] = useState(false);

  const medir = useCallback(() => {
    const el = ref.current as HTMLElement | null;
    const fora = caixa.current as HTMLElement | null;
    if (!el?.style || !fora) return;
    const v = vaiEVolta(el.scrollWidth, fora.clientWidth);
    if (v) {
      el.style.setProperty('--rola-distancia', `${-v.distancia}px`);
      el.style.setProperty('--rola-duracao', `${v.duracaoMs}ms`);
    }
    setAnda(!!v);
  }, []);
  useLayoutEffect(medir, [texto, medir]);

  return (
    <View ref={caixa} {...(anda ? marcar('rola-caixa') : {})} onLayout={medir} style={{ overflow: 'hidden' }}>
      <Text ref={ref} numberOfLines={1} {...(anda ? marcar('rola') : {})} style={style}>{texto}</Text>
    </View>
  );
}
