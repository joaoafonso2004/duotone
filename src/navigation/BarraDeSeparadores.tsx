import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Animated, InteractionManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { StateIcon } from '../components/StateIcon';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ESTADO, SEPARADOR_ACTIVO } from '../lib/movimento';
import { publicarSeparadores } from '../state/doca';
import { useNotifications } from '../state/notifications';
import { useTheme } from '../state/theme';
import { colors, ESCALA_MAXIMA } from '../theme';
import { pedirFluidez } from '../state/fluidez';
import { useAbertura } from '../state/abertura';
import { COMECAR_DEPOIS_MS, ENTRE_SEPARADORES_MS, proximoAMontar } from '../lib/separadoresAMontar';

const ICONES_DOS_SEPARADORES: Record<string, keyof typeof Ionicons.glyphMap> = {
  Search: 'home',
  Songs: 'musical-notes',
  Artists: 'people',
  Playlists: 'albums',
  Profile: 'person',
};

/**
 * O nome que se VÊ, quando não é o da rota (3/10, variante A de
 * `docs/barra-home-folhas.html`): a "Search" já era a página principal (os
 * amigos, o Jump back in, a Daily mix, as prateleiras), e passou a dizê-lo. A
 * rota continua `Search` -- é por esse nome que a app inteira navega até lá.
 */
const NOMES_DOS_SEPARADORES: Record<string, string> = { Search: 'Home' };

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
 *
 * Por isso, no separador onde já se está (3/10): na raiz, leva a lista ao
 * topo, como em todas as apps do iOS (o `tabPress` que o `useScrollToTop` dos
 * ecrãs ouve); dentro de um álbum ou de uma playlist, não faz nada, como
 * antes. Mudar de separador já não vibra: vibrar a cada navegação era ruído.
 *
 * ## Quem a desenha (3/10)
 *
 * A base de baixo passou a ser UMA peça de vidro com o mini-player
 * (`components/Doca.tsx`, variante A de `docs/base-e-barrinhas.html`). O vidro
 * fica por cima dos ecrãs e os botões por cima do vidro, por isso não podem
 * viver aqui dentro, debaixo dos ecrãs: o navegador só publica o estado e a
 * navegação, e a base desenha os `IconesDosSeparadores`.
 */
export function BarraDeSeparadores({ state, navigation }: MaterialTopTabBarProps) {
  React.useLayoutEffect(() => { publicarSeparadores({ state, navigation }); }, [state, navigation]);
  React.useEffect(() => () => publicarSeparadores(null), []);
  useMontarDepoisDaAbertura(state, navigation);
  return null;
}

/**
 * As secções que não estão à vista nem ao lado montam-se DEPOIS da abertura,
 * uma de cada vez (auditoria 4.2, 4/10; `lib/separadoresAMontar.ts`). Antes
 * montavam as cinco no arranque, com a abertura a correr.
 *
 * Começa outra vez se a abertura voltar à frente (não volta, mas o efeito não
 * o assume), e cada passo espera que as interações acabem: um deslize a meio
 * não leva uma página nova a montar por baixo do dedo.
 */
function useMontarDepoisDaAbertura(state: MaterialTopTabBarProps['state'], navigation: MaterialTopTabBarProps['navigation']) {
  const naAbertura = useAbertura((s) => s.aFrente);
  const estadoRef = React.useRef(state);
  estadoRef.current = state;
  const pedidos = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (naAbertura) return;
    let parado = false;
    let espera: ReturnType<typeof setTimeout> | undefined;
    let tarefa: { cancel(): void } | undefined;
    const seguinte = (ms: number) => {
      espera = setTimeout(() => {
        tarefa = InteractionManager.runAfterInteractions(() => {
          if (parado) return;
          const st = estadoRef.current;
          const nome = proximoAMontar(st.routes, st.index, pedidos.current);
          if (!nome) return;
          pedidos.current.add(nome);
          navigation.preload(nome);
          seguinte(ENTRE_SEPARADORES_MS);
        });
      }, ms);
    };
    seguinte(COMECAR_DEPOIS_MS);
    return () => { parado = true; clearTimeout(espera); tarefa?.cancel(); };
  }, [naAbertura, navigation]);
}

/** Os cinco botões, sem fundo: o vidro é da base. */
export function IconesDosSeparadores({ state, navigation }: Pick<MaterialTopTabBarProps, 'state' | 'navigation'>) {
  const hasNotification = useNotifications((s) => s.hasNotification);
  // O destino e não a cor animada: a navegação inteira não precisa de
  // redesenhar a cada passo da animação do tema.
  const theme = useTheme((s) => s.destino);

  return (
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
        const nome = NOMES_DOS_SEPARADORES[route.name] ?? route.name;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={{ selected: escolhido }}
            accessibilityLabel={nome}
            onPress={() => {
              pedirFluidez(500);
              // Dentro de uma pilha (um álbum aberto) não se emite: o
              // native-stack voltava à raiz com o `tabPress`.
              const pilha = route.state as { index?: number } | undefined;
              if (escolhido && (pilha?.index ?? 0) > 0) return;
              const evento = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!escolhido && !evento.defaultPrevented) navigation.navigate(route.name);
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
            <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.fixa} style={[styles.nome, { color: cor }]}>{nome}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', paddingTop: 8, paddingBottom: 6 },
  separador: { flex: 1, alignItems: 'center', gap: 3 },
  // Em minúsculas, como no iOS (3/10): as maiúsculas espaçadas do `micro`
  // liam-se como um painel de administração.
  nome: { fontSize: 11, fontWeight: '600', letterSpacing: 0.1 },
  ponto: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    // O vermelho da app (auditoria 2.4): era um #FF3B30 escrito à mão.
    backgroundColor: colors.danger,
  },
});
