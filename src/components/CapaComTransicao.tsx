import React, { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { RECUO } from '../lib/transicaoDaCapa';

/**
 * A capa grande do leitor, a cruzar da música anterior para a nova.
 *
 * UMA instância para todas as faixas (2/10), e não uma por faixa: era uma
 * por faixa (a `key` no PlayerRoot), e a nova tinha de voltar a carregar a
 * capa ANTERIOR numa vista nova para cruzar por cima dela. Entre o desmontar de
 * uma e o desenhar da outra a face ficava vazia -- preta, durante 130 ms no
 * vídeo do João --, a anterior reaparecia e só então entrava a nova: era o
 * "encrava ao trocar de música".
 *
 * Agora a fonte muda na MESMA imagem: o expo-image deixa a que está à vista
 * até a nova estar pronta (só a limpa com um `recyclingKey` novo, que aqui não
 * há) e cruza as duas no lado nativo (`transition`). Nunca há um fotograma sem
 * capa, e quem destapa a nova é a própria imagem, quando a tem.
 *
 * A primeira capa (abrir o leitor) entra sem cruzamento: não há de onde partir,
 * e a face vazia a desvanecer a meio da abertura lia-se como um atraso.
 */
export function CapaComTransicao({ uri, onError }: { uri: string; onError: () => void }) {
  const [mostrou, setMostrou] = useState(false);
  return (
    <Image
      source={{ uri }}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      // A mesma cache do prefetch das capas grandes (state/capasGrandes.ts).
      cachePolicy="memory-disk"
      transition={mostrou ? { duration: RECUO.cruzarMs, effect: 'cross-dissolve' } : null}
      onDisplay={() => { if (!mostrou) setMostrou(true); }}
      onError={onError}
    />
  );
}
