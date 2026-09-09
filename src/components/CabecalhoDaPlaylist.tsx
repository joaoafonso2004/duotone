import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { ArtworkCollage } from './ArtworkCollage';
import { colors, radii, spacing, type } from '../theme';

/**
 * A cabeça de uma playlist -- ou de um artista: capa grande, nome grande, e uma
 * linha que diz o que aquilo é.
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
 * de quatro que a grelha já usa, e o tamanho do nome é o `type.largeTitle` que
 * os outros ecrãs usam nos seus títulos. O que muda é o arranjo.
 *
 * ## O véu de cor saiu
 *
 * Havia por trás disto um degradé tirado da capa (`lerCelulasDaCapa` +
 * `veuDaCapa`, como o `ProfileHero` ainda faz). Saiu a pedido: dentro de uma
 * playlist a cor não dizia nada sobre ela, dizia sobre a primeira capa que lhe
 * calhou, e mudava de tom cada vez que a ordem mudava. Levou consigo uma
 * leitura de imagem por playlist aberta.
 *
 * A sombra da capa ficou. Nasceu para a descolar do véu, mas continua a fazer
 * falta sem ele: é o que separa uma capa escura do fundo escuro da app.
 *
 * ## `artista`
 *
 * Uma só diferença: a imagem é redonda e é UMA, não um mosaico de quatro. Um
 * artista tem cara, uma playlist é um saco de coisas -- e um mosaico de quatro
 * capas para representar uma pessoa lê-se como um erro. Todo o resto (o
 * tamanho, o nome, a linha de meta, a fila de acções) é partilhado de
 * propósito, que é o que faz a página do artista parecer a de uma playlist.
 */
export function CabecalhoDaPlaylist({
  nome,
  artworks,
  faixas,
  duracaoSegundos,
  accoes,
  artista = false,
}: {
  /** Uma imagem redonda em vez do mosaico. Ver o cabeçalho. */
  artista?: boolean;
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

  return (
    <View style={styles.caixa}>
      <View style={[styles.capa, artista && { borderRadius: lado / 2 }]}>
        {artista && artworks[0] ? <Image source={{ uri: artworks[0] }} style={{ width: lado, height: lado }} contentFit="cover" />
          : <ArtworkCollage artworks={artworks} size={lado} />}
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
