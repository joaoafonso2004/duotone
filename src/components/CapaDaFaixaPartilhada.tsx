import React, { useState } from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { colors } from '../theme';
import type { Track } from '../types';

/**
 * A capa de uma música partilhada na conversa (iPhone). O PC tem a sua
 * (`CapaDaFaixaPartilhada.web.tsx`, 30/10): a dois tons até a música ser tua.
 * Aqui fica o que sempre houve: a capa, ou uma nota musical.
 *
 * As `capas` vêm por ordem (`capasDaFaixaPartilhada`, 11/11): quando uma não
 * carrega, passa-se à seguinte, e a nota só aparece quando nenhuma serviu.
 * Antes havia uma só, e um endereço que não carregava deixava o quadrado
 * vazio para sempre.
 */
export function CapaDaFaixaPartilhada({ capas, estilo, estiloVazio }: { faixa: Track; capas: string[]; estilo: any; estiloVazio: any }) {
  // Lembra-se de que lista falhou, e não só do número: outra música no mesmo
  // sítio (uma lista que se recicla) recomeça da primeira.
  const chave = capas.join(' ');
  const [falhas, setFalhas] = useState<{ chave: string; n: number }>({ chave, n: 0 });
  const n = falhas.chave === chave ? falhas.n : 0;
  const capa = capas[n];
  return capa ? (
    <Image
      key={capa}
      source={{ uri: capa }}
      style={estilo}
      contentFit="cover"
      onError={() => setFalhas({ chave, n: n + 1 })}
    />
  ) : (
    <View style={estiloVazio}>
      <Ionicons name="musical-notes" size={15} color={colors.textTertiary} />
    </View>
  );
}

/** A etiqueta por cima do título: só no PC. */
export function EtiquetaDaFaixaPartilhada(_props: { faixa: Track }): React.ReactElement | null {
  return null;
}
