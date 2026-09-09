import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StateIcon } from '../components/StateIcon';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ESTADO, SEPARADOR_ACTIVO } from '../lib/movimento';
import { useNotifications } from '../state/notifications';
import { useTheme } from '../state/theme';
import { colors, type } from '../theme';
import { hapticSelection } from '../lib/haptics';

const ICONES_DOS_SEPARADORES: Record<string, keyof typeof Ionicons.glyphMap> = {
  Search: 'search',
  Songs: 'musical-notes',
  Artists: 'people',
  Playlists: 'albums',
  Profile: 'person',
};

const TAMANHO = 24;

/**
 * O separador escolhido levanta-se um bocadinho.
 *
 * O `StateIcon` ja dissolvia entre o contorno e o preenchido, o que diz QUAL
 * esta escolhido -- mas dizia-o sem nada acontecer: a mudanca chegava ao ecra
 * sem movimento nenhum, e por isso lia-se como uma troca de imagem.
 *
 * Uma escala pequena com mola resolve, e nao mexe em layout nenhum: o icone
 * ocupa sempre a mesma caixa, so e desenhado maior. Sem isto teria de se mexer
 * em `width`/`height`, que nao correm na UI thread e obrigariam a barra inteira
 * a refazer o layout a cada mudanca de pagina.
 */
function SeparadorActivo({ activo, tamanho, children }: {
  activo: boolean; tamanho: number; children: React.ReactNode;
}) {
  const reduzido = useReducedMotion();
  const levantado = React.useRef(new Animated.Value(activo ? 1 : 0)).current;

  React.useEffect(() => {
    if (reduzido) { levantado.setValue(activo ? 1 : 0); return; }
    const mola = Animated.spring(levantado, {
      toValue: activo ? 1 : 0,
      ...ESTADO,
      useNativeDriver: true,
    });
    mola.start();
    return () => mola.stop();
  }, [activo, reduzido, levantado]);

  return (
    <Animated.View
      style={{
        width: tamanho,
        height: tamanho,
        justifyContent: 'center',
        alignItems: 'center',
        transform: [{
          scale: levantado.interpolate({ inputRange: [0, 1], outputRange: [1, SEPARADOR_ACTIVO] }),
        }],
      }}
    >
      {children}
    </Animated.View>
  );
}


/**
 * A barra de baixo, escrita à mão.
 *
 * ## Porque deixou de ser a do `bottom-tabs`
 *
 * O `@react-navigation/bottom-tabs` não desliza, por desenho -- não há opção,
 * é uma decisão da biblioteca. Deslizar entre separadores obriga a um
 * navegador com paginador por baixo, e esse traz a barra dele: de cima, com
 * indicador que corre, nada parecido com esta.
 *
 * Por isso a barra passa a ser nossa. Não é um enfeite feito de raiz: é a
 * mesma que já existia -- o mesmo desfoque, o mesmo `SeparadorActivo` a
 * levantar o ícone escolhido, o mesmo ponto vermelho no perfil -- só que
 * escrita aqui em vez de configurada em opções. O que se ganha é o gesto; o
 * que se paga é este ficheiro.
 *
 * ## Um detalhe que não é evidente
 *
 * O `navigate` só se chama quando o separador MUDA. Chamá-lo no que já está
 * escolhido parece inofensivo e não é: nos separadores que têm uma pilha por
 * dentro -- Artists e Playlists -- volta à raiz, e quem estava a ver um álbum
 * perdia-o por ter carregado no separador onde já estava.
 */
export function BarraDeSeparadores({ state, navigation }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const hasNotification = useNotifications((s) => s.hasNotification);
  // O destino e não a cor animada: a navegação inteira não precisa de
  // redesenhar a cada passo da animação do tema.
  const theme = useTheme((s) => s.destino);

  return (
    <View style={[styles.barra, { paddingBottom: insets.bottom }]}>
      <BlurView tint="dark" intensity={50} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.tinta]} />
      <View style={styles.linha}>
        {/* O Social e uma seccao mas NAO tem botao: chega-se la a arrastar
            para la do Perfil, ou pelo botao das mensagens que ele ja tem.
            Seis icones apertavam os cinco que ja aqui estao.

            O escolhido compara-se pela CHAVE e nao pelo indice: depois de
            filtrar, o `i` desta lista deixa de bater certo com o
            `state.index`, que conta as rotas todas. */}
        {state.routes.filter((route) => route.name !== 'Social').map((route) => {
          const escolhido = state.routes[state.index]?.key === route.key;
          const cor = escolhido ? theme.color : colors.textTertiary;
          // O mapa dos ícones vive aqui e não nas opções de cada ecrã: passá-lo
          // por `options` obrigava a alargar os tipos do navegador ou a cinco
          // `as any`, e a barra é o único sítio que precisa de o saber.
          const icone = ICONES_DOS_SEPARADORES[route.name as keyof typeof ICONES_DOS_SEPARADORES] ?? 'ellipse';
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: escolhido }}
              accessibilityLabel={route.name}
              onPress={() => {
                if (escolhido) return;
                hapticSelection();
                navigation.navigate(route.name);
              }}
              style={styles.separador}
            >
              {/* Sem `rodar`: cinco separadores a girar de cada vez que se
                  muda de página seria uma feira. Basta o preenchido a
                  dissolver por cima do contorno, e o levantar. */}
              <SeparadorActivo activo={escolhido} tamanho={TAMANHO}>
                <StateIcon
                  name={(escolhido ? icone : `${icone}-outline`) as keyof typeof Ionicons.glyphMap}
                  size={TAMANHO}
                  color={cor}
                />
                {route.name === 'Profile' && hasNotification && <View style={styles.ponto} />}
              </SeparadorActivo>
              <Text numberOfLines={1} style={[styles.nome, { color: cor }]}>{route.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    overflow: 'hidden',
  },
  tinta: { backgroundColor: 'rgba(10,10,15,0.72)' },
  linha: { flexDirection: 'row', paddingTop: 8, paddingBottom: 6 },
  separador: { flex: 1, alignItems: 'center', gap: 3 },
  nome: { ...type.micro },
  ponto: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
});
