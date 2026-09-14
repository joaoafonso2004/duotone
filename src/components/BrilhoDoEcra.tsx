import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { usePlayer } from '../state/player';
import { BrilhoInteligente } from './BrilhoInteligente';

/**
 * O brilho do Smart Shuffle nos ecrãs do iPhone, parado quando não se vê.
 *
 * As páginas ficam todas montadas (os separadores têm `lazy: false`, e um ecrã
 * de pilha fica por baixo do seguinte), e o brilho andava em ciclo no botão de
 * uma página noutro separador, ou por baixo do leitor aberto. Parado, retoma de
 * onde ficou quando a página volta a estar à vista.
 *
 * Separado do `BrilhoInteligente` porque esse também corre no PC, fora de
 * qualquer navegador do react-navigation, onde o `useIsFocused` rebentava.
 */
export function BrilhoDoEcra() {
  const focado = useIsFocused();
  const leitorAberto = usePlayer((s) => s.expanded);
  return <BrilhoInteligente ativo={focado && !leitorAberto} />;
}
