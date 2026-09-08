import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArtworkCollage } from './ArtworkCollage';
import { lerCelulasDaCapa } from '../lib/celulasDaCapa';
import { semOpacidade, veuDaCapa } from '../lib/corDaCapa';
import { colors, radii, spacing, type } from '../theme';

/**
 * A cabeça de uma playlist: capa grande, nome grande, e uma linha que diz o que
 * ela é.
 *
 * ## O que estava mal
 *
 * O ecrã usava o cabeçalho genérico do `Screen` -- um título numa linha e um
 * subtítulo pequeno. É o mesmo das Definições e da Biblioteca, e é a coisa
 * certa lá: aqueles ecrãs não têm uma imagem que os identifique. Uma playlist
 * tem, e não a mostrar é deitar fora a única coisa que distingue esta das
 * outras vinte antes de se ler uma palavra.
 *
 * ## Porque é que isto não é um estilo novo
 *
 * Não há aqui uma peça inventada. A capa é o `ArtworkCollage`, o mesmo mosaico
 * de quatro que a grelha já usa; o véu de cor sai do `lerCelulasDaCapa` mais o
 * `veuDaCapa`, que é EXACTAMENTE o que o `ProfileHero` já faz com a capa do
 * perfil; e o tamanho do nome é o `type.largeTitle` que os outros ecrãs usam
 * nos seus títulos. O que muda é o arranjo, não o vocabulário.
 *
 * ## O véu é um véu
 *
 * Opacidade baixa, e por cima um degradé que morre no fundo da app. Uma capa
 * escura ou sem cor não produz véu nenhum e o cabeçalho fica como sempre
 * esteve -- que é melhor do que inventar-lhe um tom que ela não tem. A
 * garantia de contraste vem de dentro do `veuDaCapa`.
 */
export function CabecalhoDaPlaylist({
  nome,
  artworks,
  faixas,
  duracaoSegundos,
  accoes,
}: {
  nome: string;
  artworks: string[];
  faixas: number;
  /** A soma das durações, ou null quando não se sabem todas. */
  duracaoSegundos: number | null;
  /** A fila de botões -- play, shuffle, o resto. Vem de fora porque o que se
   *  pode fazer a uma playlist não é assunto de um cabeçalho. */
  accoes?: React.ReactNode;
}) {
  const { width: W } = useWindowDimensions();
  // A capa cresce com o ecrã mas não passa de 240: acima disso empurra o nome
  // e a fila de botões para fora, e a página deixa de se ver de uma vez.
  const lado = Math.min(240, Math.round(W * 0.52));

  const [veu, setVeu] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    const primeira = artworks[0];
    if (!primeira) { setVeu(null); return; }
    void lerCelulasDaCapa(primeira).then((celulas) => { if (vivo) setVeu(veuDaCapa(celulas)); });
    return () => { vivo = false; };
  }, [artworks[0]]);

  return (
    <View style={styles.caixa}>
      {veu ? (
        <LinearGradient
          colors={[veu, semOpacidade(veu)]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}

      <View style={styles.capa}>
        <ArtworkCollage artworks={artworks} size={lado} />
      </View>

      {/* Duas linhas, e o nome é a maior coisa da página. */}
      <Text numberOfLines={2} style={styles.nome}>{nome}</Text>
      <Text style={styles.meta}>{linhaDeMeta(faixas, duracaoSegundos)}</Text>

      {accoes ? <View style={styles.accoes}>{accoes}</View> : null}
    </View>
  );
}

/**
 * "24 músicas · 1 h 32 min".
 *
 * A duração só entra quando se sabe: uma soma feita com metade das faixas sem
 * duração seria um número errado a fingir precisão. E o singular conta --
 * "1 músicas" é o género de coisa que faz uma app parecer feita à pressa.
 */
export function linhaDeMeta(faixas: number, segundos: number | null): string {
  const contagem = `${faixas} ${faixas === 1 ? 'song' : 'songs'}`;
  if (!segundos || segundos <= 0) return contagem;
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${contagem} · ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${contagem} · ${horas} h${resto ? ` ${resto} min` : ''}`;
}

const styles = StyleSheet.create({
  caixa: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
    overflow: 'hidden',
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
  },
  capa: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    // A sombra é o que descola a capa do véu que tem por trás. Sem ela, com
    // uma capa da mesma família de cor do véu, as duas fundem-se.
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  nome: {
    ...type.largeTitle,
    textAlign: 'center',
  },
  meta: {
    ...type.caption,
    color: colors.textSecondary,
  },
  accoes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
});
