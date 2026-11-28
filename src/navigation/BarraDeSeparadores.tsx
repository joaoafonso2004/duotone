import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { StackActions } from '@react-navigation/native';
import { ICONES } from '../lib/icones';
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Animated, InteractionManager, Pressable, processColor, StyleSheet, Text, View } from 'react-native';
import { SeparadoresNativos } from '../../modules/duotone-separadores';
import { traduzir } from '../i18n';
import { registar } from '../lib/eventos';
import { eSaltoLongo, saltarSemDeslizar } from '../state/saltoDeSeparador';
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
import { useAparencia } from '../state/aparencia';
import { botaoEscolhido, rotasComBotao, selecaoDoVidro, SIMBOLOS_DOS_SEPARADORES, VIDRO_DA_BASE } from '../lib/vidroDaBase';

const ICONES_DOS_SEPARADORES: Record<string, keyof typeof Ionicons.glyphMap> = {
  Search: 'home',
  Songs: ICONES.gostadas,
  Artists: ICONES.artistas,
  Playlists: ICONES.playlists,
  Profile: ICONES.perfil,
};

/**
 * O nome que se VÊ, quando não é o da rota (3/10, variante A de
 * `docs/barra-home-folhas.html`): a "Search" já era a página principal (os
 * amigos, o Jump back in, a Daily mix, as prateleiras), e passou a dizê-lo. A
 * rota continua `Search` -- é por esse nome que a app inteira navega até lá.
 * O mesmo com as `Songs`: chamam-se "Liked Songs" como no PC (1/11, decisão do
 * João, pendente desde 5/10), e a rota não muda.
 */
const NOMES_DOS_SEPARADORES: Record<string, string> = { Search: 'Home', Songs: 'Liked Songs' };

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
 * O botão leva SEMPRE à página principal do separador (25/10, pedido do
 * João: "dentro de um artista, clicar no botão das playlists deve ir para a
 * página principal das playlists, em todas as abas"). Com páginas abertas por
 * cima (um artista, um álbum), a pilha dele volta à raiz -- no separador onde
 * se está, e também num outro para onde se vai. Até aqui, no separador onde já
 * se estava, não fazia nada (3/10). Deslizar entre separadores não mexe nas
 * pilhas: é o botão que quer dizer "a página principal".
 *
 * Já na raiz do separador onde se está, leva a lista ao topo, como em todas
 * as apps do iOS (o `tabPress` que o `useScrollToTop` dos ecrãs ouve). Mudar
 * de separador já não vibra: vibrar a cada navegação era ruído.
 *
 * ## Quem a desenha (3/10)
 *
 * A base de baixo passou a ser UMA peça de vidro com o mini-player
 * (`components/Doca.tsx`, variante A de `docs/base-e-barrinhas.html`). O vidro
 * fica por cima dos ecrãs e os botões por cima do vidro, por isso não podem
 * viver aqui dentro, debaixo dos ecrãs: o navegador só publica o estado e a
 * navegação, e a base desenha os `IconesDosSeparadores`.
 */
export function BarraDeSeparadores({ state, navigation, position }: MaterialTopTabBarProps) {
  React.useLayoutEffect(() => { publicarSeparadores({ state, navigation, position }); }, [state, navigation, position]);
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

type Rota = MaterialTopTabBarProps['state']['routes'][number];

/**
 * Carregar no botão de um separador (o da barra em JavaScript e o da barra do
 * sistema): a página principal dele, ou, já lá, a lista ao topo. Ver o cabeçalho.
 */
function carregarNoSeparador(state: MaterialTopTabBarProps['state'], navigation: MaterialTopTabBarProps['navigation'], route: Rota) {
  pedirFluidez(500);
  const escolhido = state.routes[state.index]?.key === route.key;
  // Páginas abertas por cima: a pilha deste separador volta à raiz (25/10).
  const pilha = route.state as { key?: string; index?: number } | undefined;
  const funda = (pilha?.index ?? 0) > 0;
  if (funda && pilha?.key) navigation.dispatch({ ...StackActions.popToTop(), target: pilha.key });
  if (escolhido) {
    // Já na raiz: a lista ao topo.
    if (!funda) navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    return;
  }
  const evento = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
  if (evento.defaultPrevented) return;
  // Mais de um separador de distância: troca sem deslizar pelas páginas do meio (28/11).
  if (eSaltoLongo(state.index, state.routes.findIndex((r) => r.key === route.key))) saltarSemDeslizar();
  navigation.navigate(route.name);
}

/** Há a barra do sistema neste binário (o módulo `duotone-separadores`, 28/11). */
export const temSeparadoresDoSistema = !!SeparadoresNativos;

/**
 * Os separadores na barra do sistema, com o Liquid Glass (28/11, as screenshots 1 a 3
 * do João): a `UITabBar` do iOS 26, com a lente de vidro que se segura e arrasta de
 * separador para separador. É a verdadeira (`modules/duotone-separadores`): a lente
 * não tem API pública, e a cápsula em JavaScript da 7.3.0 não lhe chegava.
 *
 * O pager continua: deslizar entre páginas muda o escolhido na barra. O Social não
 * tem botão: lá a barra fica sem escolhido. `aoMedir` recebe a altura da barra, com
 * o fundo do ecrã incluído.
 */
export function SeparadoresDoSistema({ state, navigation, altura, aoMedir }: Pick<MaterialTopTabBarProps, 'state' | 'navigation'> & {
  altura: number;
  aoMedir: (altura: number) => void;
}) {
  const rotulos = useAparencia((s) => s.rotulos);
  const opacidade = useAparencia((s) => s.opacidadeDoVidro);
  const desfocado = useAparencia((s) => s.desfocadoDoVidro);
  const hasNotification = useNotifications((s) => s.hasNotification);
  const theme = useTheme((s) => s.destino);
  const visiveis = rotasComBotao(state.routes);
  const chaves = visiveis.map((r) => `${r.key}:${r.name}`).join('|');
  const itens = React.useMemo(() => visiveis.map((r) => {
    const [simbolo, simboloEscolhido] = SIMBOLOS_DOS_SEPARADORES[r.name] ?? ['circle', 'circle.fill'];
    return { titulo: traduzir(NOMES_DOS_SEPARADORES[r.name] ?? r.name), simbolo, simboloEscolhido, ponto: r.name === 'Profile' && hasNotification };
    // As rotas mudam pela chave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [chaves, hasNotification]);
  const Nativa = SeparadoresNativos;
  if (!Nativa) return null;
  return (
    <Nativa
      // Antes de a barra se medir, uma altura qualquer: ela fica no fundo desta vista.
      style={{ height: altura > 0 ? altura : 100 }}
      itens={itens}
      escolhido={botaoEscolhido(state.routes, state.index)}
      comNomes={rotulos}
      corEscolhida={processColor(theme.color) as number | null}
      corOutros={processColor(colors.textTertiary) as number | null}
      opacidade={opacidade / 100}
      desfocado={desfocado / 100}
      onEscolher={(e) => { const r = visiveis[e.nativeEvent.indice]; if (r) carregarNoSeparador(state, navigation, r); }}
      onAltura={(e) => aoMedir(e.nativeEvent.altura)}
      // Como a barra está montada neste iPhone (28/11): só os eventos do João saem do aparelho.
      onDiagnostico={(e) => {
        const d = e.nativeEvent;
        registar('barra_do_sistema', { arvore: String(d.arvore).slice(0, 4000), capsula: String(d.capsula), limpa: !!d.limpa, altura: Number(d.altura) || 0 });
      }}
    />
  );
}

/** Os cinco botões, sem fundo: o vidro é da base. */
export function IconesDosSeparadores({ state, navigation }: Pick<MaterialTopTabBarProps, 'state' | 'navigation'>) {
  const rotulos = useAparencia((s) => s.rotulos);
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
            onPress={() => carregarNoSeparador(state, navigation, route)}
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
            {/* Sem rótulos (10/10, personalização): só os ícones; o nome fica no VoiceOver. */}
            {/* "Liked Songs" é o nome mais comprido (1/11): cabe a 11 pt num iPhone de
                375 pt, mas com a letra maior do sistema já cortava. Encolhe só até
                ao tamanho de base, nunca abaixo dos 11 pt. */}
            {rotulos ? <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.fixa} adjustsFontSizeToFit minimumFontScale={1 / ESCALA_MAXIMA.fixa} style={[styles.nome, { color: cor }]}>{nome}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A cápsula do separador escolhido no Liquid Glass (27/11, `lib/vidroDaBase.ts`):
 * lisa, clara, com um rebordo de um píxel, POR CIMA do vidro e não de vidro (vidro
 * sobre vidro funde-se e não se vê). Anda com o pager: a deslizar entre
 * separadores segue o dedo, e a tocar num, a página a passar leva-a. Na rota sem
 * botão (o Social, depois do Perfil) fica no Perfil e apaga-se.
 */
export function SelecaoDoVidro({ state, position, largura, altura }: {
  state: MaterialTopTabBarProps['state'];
  position: MaterialTopTabBarProps['position'] | undefined;
  largura: number;
  altura: number;
}) {
  const visiveis = state.routes.filter((r) => r.name !== 'Social');
  const s = selecaoDoVidro(largura, visiveis.length, altura);
  const chaves = state.routes.map((r) => r.key).join('|');
  const movimento = React.useMemo(() => {
    if (!s.coluna) return null;
    const ultimo = visiveis.length - 1;
    const xs = state.routes.map((r) => { const v = visiveis.findIndex((x) => x.key === r.key); return s.x(v >= 0 ? v : ultimo); });
    const vistas = state.routes.map((r) => (r.name === 'Social' ? 0 : 1));
    if (!position || state.routes.length < 2) {
      return { x: xs[state.index] ?? 0, opacidade: vistas[state.index] ?? 1 };
    }
    const inputRange = state.routes.map((_, i) => i);
    return {
      x: position.interpolate({ inputRange, outputRange: xs, extrapolate: 'clamp' }),
      opacidade: position.interpolate({ inputRange, outputRange: vistas, extrapolate: 'clamp' }),
    };
    // As rotas mudam pela chave; o índice só conta sem o `position`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, s.coluna, s.largura, chaves, position ? -1 : state.index]);
  if (!movimento) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.selecao, {
        top: s.topo, width: s.largura, height: s.altura, borderRadius: s.raio,
        opacity: movimento.opacidade, transform: [{ translateX: movimento.x }],
      }]}
    />
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', paddingTop: 8, paddingBottom: 6 },
  selecao: {
    position: 'absolute', left: 0, borderCurve: 'continuous',
    backgroundColor: VIDRO_DA_BASE.corDaSelecao,
    borderWidth: StyleSheet.hairlineWidth, borderColor: VIDRO_DA_BASE.rebordoDaSelecao,
  },
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
