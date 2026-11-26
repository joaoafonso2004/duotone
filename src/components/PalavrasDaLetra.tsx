import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { palavrasAcesas, proximaPalavraEm, type PalavraDaLetra } from '../lib/lyricsParser';
import { usePlayer } from '../state/player';

/**
 * A linha cantada, palavra a palavra (26/11, item 23 do plano,
 * `docs/maquetes-da-lista-2026-11-25.html#m23`): só nas letras que trazem o tempo de
 * cada palavra. Cada palavra acende INTEIRA quando é cantada (não há luz a avançar
 * dentro dela); as de trás ficam acesas, as da frente apagadas.
 *
 * O motor não avisa a posição a cada palavra (às vezes de segundo a segundo), por
 * isso o relógio é o da faixa (`positionMs` no instante `positionAt`, à velocidade
 * dela) e o próximo desenho marca-se para o prazo da palavra seguinte. Nunca um
 * `setInterval`. Só a linha cantada monta isto: as outras são texto, como sempre.
 */
export function PalavrasDaLetra({ palavras }: { palavras: readonly PalavraDaLetra[] }) {
  const relogio = usePlayer(useShallow((s) => ({
    pos: s.positionMs, em: s.positionAt, aTocar: s.isPlaying, taxa: s.playbackRate || 1,
  })));
  const [tique, redesenhar] = useState(0);
  const agora = relogio.pos + (relogio.aTocar ? Math.max(0, Date.now() - relogio.em) * relogio.taxa : 0);
  const acesas = palavrasAcesas(palavras, agora);

  useEffect(() => {
    if (!relogio.aTocar) return undefined;
    const falta = proximaPalavraEm(palavras, agora);
    if (falta === null) return undefined;
    const t = setTimeout(() => redesenhar((n) => n + 1), Math.max(16, falta / Math.max(0.25, relogio.taxa)));
    return () => clearTimeout(t);
    // O prazo refaz-se a cada palavra, a cada aviso do motor e a cada tique (um que
    // dispare um pouco cedo não deixa o relógio parado).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acesas, relogio, palavras, tique]);

  return <>{palavras.map((p, i) => <Text key={i} style={i < acesas ? null : styles.apagada}>{p.text}</Text>)}</>;
}

const styles = StyleSheet.create({
  // A mesma luz das linhas que não se cantam (40 %).
  apagada: { color: 'rgba(255,255,255,0.4)' },
});
