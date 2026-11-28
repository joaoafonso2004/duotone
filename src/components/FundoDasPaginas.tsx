import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAparencia } from '../state/aparencia';
import { FundoDaMusica } from './FundoDaMusica';

/**
 * O fundo das páginas do iPhone: a imagem abstrata desfocada, a camada escura por
 * cima dela e a cor da música (a opção da Customise). As páginas são transparentes
 * e mostram isto.
 *
 * Vive no `RootNavigator`, por baixo das páginas, e é também o fundo da barra de
 * cima delas quando se rola (28/11, João: "deve estar opaco"; era um desfoque com
 * 72% de tinta, e via-se a lista por baixo). Na barra desenha-se do tamanho do
 * ecrã e preso a ele: é o mesmo fundo, só que tapa o que rola por baixo.
 *
 * O desfoque vem na PRÓPRIA imagem, calculado uma vez quando ela carrega. Era um
 * BlurView de ecrã inteiro por cima dela: um desfoque ao vivo que o iPhone
 * recalculava sempre que alguma coisa mexia no ecrã (a capa a flutuar, as listas
 * a deslizar), e que quase não se via -- está tapado a 88% pela camada preta. Com
 * o fundo OLED (10/10, personalização) não há imagem: preto puro.
 *
 * `imediato`: sem os aparecimentos (a imagem e a cor da música já estão à vista
 * no fundo de baixo; na barra entram já inteiras).
 */
export function FundoDasPaginas({ imediato = false }: { imediato?: boolean }) {
  const fundoApp = useAparencia((s) => s.fundoApp);
  return <>
    {fundoApp === 'dark' ? <Image
      source={require('../../assets/login_bg.png')}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      transition={imediato ? null : 300}
      blurRadius={12}
    /> : null}
    {/* Camada preta semi-transparente para alto contraste e legibilidade */}
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: fundoApp === 'oled' ? '#000' : 'rgba(6, 6, 8, 0.88)' }
      ]}
    />
    {/* A cor da capa que toca a lavar o topo das páginas (27/11, opção da Customise). */}
    <FundoDaMusica imediato={imediato} />
  </>;
}
