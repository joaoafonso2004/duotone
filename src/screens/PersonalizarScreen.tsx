import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { Grupo, Linha, LinhaInterruptor } from '../components/ListaAgrupada';
import { MenuFlutuante, type Ancora } from '../components/MenuFlutuante';
import type { PlayerAction } from '../components/PlayerActionsSheet';
import { Screen, useCabecalhoQueEncolhe } from '../components/Screen';
import {
  BOTOES_DO_LEITOR, ESTILOS_DA_CAPA, fonteDosTitulos, MAXIMO_DE_BOTOES, NOMES_DAS_SECOES, NOMES_DOS_BOTOES, TEMAS, veuDoLeitor,
  type Aparencia, type BotaoDoLeitor, type EstiloDaCapa, type SecaoDaHome,
} from '../lib/aparencia';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { FundoEmGradiente } from '../components/FundoEmGradiente';
import { hapticSelection } from '../lib/haptics';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAparencia, useTemaDaAparencia } from '../state/aparencia';
import { useCapaIOS } from '../state/capaIOS';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, radii, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Personalizar'>;

/** As escolhas que abrem um menu: os nomes e os valores, pela mesma ordem. */
const ESCOLHAS = {
  fundoApp: { rotulo: 'Background', icone: 'contrast-outline', nomes: ['Dark', 'OLED black'], valores: ['dark', 'oled'] },
  listas: { rotulo: 'Lists', icone: 'list-outline', nomes: ['Comfortable', 'Compact'], valores: ['comfortable', 'compact'] },
  titulos: { rotulo: 'Titles', icone: 'text-outline', nomes: ['Default', 'Serif', 'Mono'], valores: ['padrao', 'serif', 'mono'] },
  topo: { rotulo: 'Top', icone: 'albums-outline', nomes: ['Duotone', 'Playing from'], valores: ['marca', 'origem'] },
  titulo: { rotulo: 'Title', icone: 'reorder-three-outline', nomes: ['Centred', 'Left'], valores: ['centro', 'esquerda'] },
  barra: { rotulo: 'Progress bar', icone: 'remove-outline', nomes: ['Thin', 'Thick'], valores: ['fina', 'grossa'] },
  play: { rotulo: 'Play button', icone: 'play-circle-outline', nomes: ['Filled', 'Ring', 'Icon'], valores: ['cheio', 'anel', 'icone'] },
  fundoLeitor: {
    rotulo: 'Background', icone: 'image-outline',
    nomes: ['Blurred artwork', 'Artwork colour', 'Gradient', 'Black'], valores: ['capa', 'cor', 'gradiente', 'preto'],
  },
  brilho: { rotulo: 'Background brightness', icone: 'sunny-outline', nomes: ['Darker', 'Dark', 'Default', 'Light', 'Lighter'], valores: [10, 30, 50, 70, 90] },
  tamanhoDasLetras: { rotulo: 'Text size', icone: 'text-outline', nomes: ['Small', 'Medium', 'Large'], valores: ['p', 'm', 'g'] },
} as const;
type ChaveDeEscolha = keyof typeof ESCOLHAS;

const ICONES_DOS_BOTOES: Record<BotaoDoLeitor, keyof typeof Ionicons.glyphMap> = {
  fila: 'list-outline', visibilidade: 'eye-outline', eq: 'options-outline',
  aparelhos: 'desktop-outline', partilhar: 'share-outline', letras: 'chatbox-ellipses-outline',
};

/**
 * "Customise" (10/10, docs/PLANO-PERSONALIZACAO-IOS.md, fases 1 e 2): os temas
 * prontos e cada opção à mão, com o leitor em pequeno no topo a mudar com
 * elas. As escolhas são da store (`state/aparencia.ts`); o estilo da capa é o
 * das Definições (`state/capaIOS.ts`), e está nos dois sítios. O destaque
 * continua só nas Definições.
 */
export function PersonalizarScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const cab = useCabecalhoQueEncolhe();
  const ap = useAparencia(useShallow((s) => ({
    fundoApp: s.fundoApp, listas: s.listas, rotulos: s.rotulos, topo: s.topo, titulo: s.titulo, barra: s.barra,
    play: s.play, botoes: s.botoes, flutuar: s.flutuar, fundoLeitor: s.fundoLeitor, brilho: s.brilho,
    titulos: s.titulos, tamanhoDasLetras: s.tamanhoDasLetras, abrirNasLetras: s.abrirNasLetras,
    secoesDaHome: s.secoesDaHome, escondidasDaHome: s.escondidasDaHome,
  })));
  const capa = useCapaIOS((s) => s.style);
  const tema = useTemaDaAparencia();
  const { mudar, escolherTema, alternarBotao, alternarSecao, moverSecao } = useAparencia.getState();

  const [menu, setMenu] = useState<{ chave: ChaveDeEscolha; ancora: Ancora } | null>(null);
  const [menuDaCapa, setMenuDaCapa] = useState<Ancora | null>(null);
  const [menuDaSecao, setMenuDaSecao] = useState<{ secao: SecaoDaHome; ancora: Ancora } | null>(null);
  const abrir = (chave: ChaveDeEscolha) => (ancora: Ancora) => setMenu({ chave, ancora });
  const indiceDe = (chave: ChaveDeEscolha) => {
    const valores = ESCOLHAS[chave].valores as readonly (string | number)[];
    const atual = ap[chave] as string | number;
    if (chave === 'brilho') {
      // O mais perto (um brilho guardado à mão pode não ser um dos cinco).
      let melhor = 0;
      valores.forEach((v, i) => { if (Math.abs(Number(v) - Number(atual)) < Math.abs(Number(valores[melhor]) - Number(atual))) melhor = i; });
      return melhor;
    }
    return Math.max(0, valores.indexOf(atual));
  };
  const valorDe = (chave: ChaveDeEscolha) => ESCOLHAS[chave].nomes[indiceDe(chave)];
  const accoes: PlayerAction[] = menu
    ? ESCOLHAS[menu.chave].nomes.map((nome, i) => ({
      label: nome,
      icon: 'checkmark',
      escolhida: i === indiceDe(menu.chave),
      onPress: () => {
        hapticSelection();
        mudar(menu.chave as keyof Aparencia, ESCOLHAS[menu.chave].valores[i] as never);
        setMenu(null);
      },
    }))
    : [];
  const accoesDaCapa: PlayerAction[] = ESTILOS_DA_CAPA.map((e) => ({
    label: e.nome,
    icon: 'checkmark',
    escolhida: e.valor === capa,
    onPress: () => {
      useCapaIOS.getState().setStyle(e.valor);
      setMenuDaCapa(null);
    },
  }));
  // Uma secção da Home: mostrar ou esconder, e mudar de lugar. Sem arrastar:
  // as linhas competem com o deslizar da página (a regra das listas).
  const accoesDaSecao: PlayerAction[] = (() => {
    if (!menuDaSecao) return [];
    const { secao } = menuDaSecao;
    const i = ap.secoesDaHome.indexOf(secao);
    const escondida = ap.escondidasDaHome.includes(secao);
    const fazer = (f: () => void) => () => { hapticSelection(); f(); setMenuDaSecao(null); };
    return [
      { label: escondida ? 'Show on Home' : 'Hide from Home', icon: escondida ? 'eye-outline' : 'eye-off-outline', onPress: fazer(() => alternarSecao(secao)) },
      { label: 'Move to top', icon: 'arrow-up-circle-outline', disabled: i <= 0, onPress: fazer(() => moverSecao(secao, 'topo')), inicioDeGrupo: true },
      { label: 'Move up', icon: 'arrow-up', disabled: i <= 0, onPress: fazer(() => moverSecao(secao, 'cima')) },
      { label: 'Move down', icon: 'arrow-down', disabled: i >= ap.secoesDaHome.length - 1, onPress: fazer(() => moverSecao(secao, 'baixo')) },
    ];
  })();
  const nomeDaCapa = ESTILOS_DA_CAPA.find((e) => e.valor === capa)?.nome ?? null;
  const linha = (chave: ChaveDeEscolha) => (
    <Linha icone={ESCOLHAS[chave].icone} rotulo={ESCOLHAS[chave].rotulo} valor={valorDe(chave)} chevron aoTocar={abrir(chave)} />
  );
  const cheio = ap.botoes.length >= MAXIMO_DE_BOTOES;

  return (
    <Screen title="Customise" onBack={() => navigation.goBack()} encolhe={cab}>
      <MenuFlutuante visivel={!!menu} ancora={menu?.ancora ?? null} accoes={accoes} aoFechar={() => setMenu(null)} />
      <MenuFlutuante visivel={!!menuDaCapa} ancora={menuDaCapa} accoes={accoesDaCapa} aoFechar={() => setMenuDaCapa(null)} />
      <MenuFlutuante visivel={!!menuDaSecao} ancora={menuDaSecao?.ancora ?? null} accoes={accoesDaSecao} aoFechar={() => setMenuDaSecao(null)} />
      <Animated.ScrollView
        style={{ flex: 1 }}
        onScroll={cab.onScroll}
        scrollEventThrottle={cab.scrollEventThrottle}
        scrollIndicatorInsets={{ top: cab.espaco }}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: cab.espaco, paddingBottom: insets.bottom + 48, gap: spacing.xl }}
      >
        <PreviaDoLeitor ap={ap} capa={capa} />

        <View style={{ gap: spacing.sm }}>
          <Text accessibilityRole="header" style={styles.tituloDosTemas}>THEMES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {TEMAS.map((t) => (
              <Pressable
                key={t.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: tema === t.id }}
                onPress={() => { hapticSelection(); escolherTema(t.id); }}
                style={[styles.tema, tema === t.id && styles.temaEscolhido]}
              >
                <Text style={[styles.nomeDoTema, tema === t.id && { color: colors.text }]}>{t.nome}</Text>
              </Pressable>
            ))}
            <View accessibilityRole="radio" accessibilityState={{ selected: tema === 'custom' }}
              style={[styles.tema, tema === 'custom' && styles.temaEscolhido]}>
              <Text style={[styles.nomeDoTema, tema === 'custom' && { color: colors.text }]}>Custom</Text>
            </View>
          </ScrollView>
        </View>

        <Grupo titulo="App" rodape="The accent colour is in Settings → Appearance.">
          {linha('fundoApp')}
          {linha('listas')}
          {linha('titulos')}
          <LinhaInterruptor icone="pricetag-outline" rotulo="Tab bar labels" valor={ap.rotulos} aoMudar={(v) => mudar('rotulos', v)} />
        </Grupo>

        <Grupo titulo="Now Playing" rodape={capa === 'floating' && !ap.flutuar ? 'The 3D artwork stays still.' : null}>
          <Linha icone="square-outline" rotulo="Artwork" valor={nomeDaCapa} chevron aoTocar={setMenuDaCapa} />
          {linha('topo')}
          {linha('titulo')}
          {linha('barra')}
          {linha('play')}
          {capa === 'floating' ? (
            <LinhaInterruptor icone="cube-outline" rotulo="Float" valor={ap.flutuar} aoMudar={(v) => mudar('flutuar', v)} />
          ) : null}
          {linha('fundoLeitor')}
          {ap.fundoLeitor !== 'preto' ? linha('brilho') : null}
        </Grupo>

        <Grupo titulo="Lyrics" rodape={ap.abrirNasLetras ? 'Now Playing opens on the lyrics when the song has them.' : null}>
          {linha('tamanhoDasLetras')}
          <LinhaInterruptor icone="chatbox-ellipses-outline" rotulo="Open on lyrics" valor={ap.abrirNasLetras} aoMudar={(v) => mudar('abrirNasLetras', v)} />
        </Grupo>

        <Grupo titulo="Buttons below" rodape={`Up to ${MAXIMO_DE_BOTOES}, in the order you turn them on.`}>
          {BOTOES_DO_LEITOR.map((b) => (
            <LinhaInterruptor
              key={b}
              icone={ICONES_DOS_BOTOES[b]}
              rotulo={NOMES_DOS_BOTOES[b]}
              valor={ap.botoes.includes(b)}
              desativada={cheio && !ap.botoes.includes(b)}
              aoMudar={() => { hapticSelection(); alternarBotao(b); }}
            />
          ))}
        </Grupo>

        <Grupo titulo="Home" rodape="Tap a section to hide it or move it.">
          {ap.secoesDaHome.map((secao) => {
            const escondida = ap.escondidasDaHome.includes(secao);
            return (
              <Linha
                key={secao}
                icone={escondida ? 'eye-off-outline' : 'eye-outline'}
                rotulo={NOMES_DAS_SECOES[secao]}
                valor={escondida ? 'Hidden' : null}
                chevron
                aoTocar={(ancora) => setMenuDaSecao({ secao, ancora })}
              />
            );
          })}
        </Grupo>

        <Text style={styles.nota}>Saved on this iPhone.</Text>
      </Animated.ScrollView>
    </Screen>
  );
}

/**
 * O leitor em pequeno, a seguir as escolhas: o fundo, o topo, a capa, o título,
 * a barra, o botão play e os botões de baixo. Com a música que está a tocar, ou
 * um quadrado da cor do destaque.
 */
function PreviaDoLeitor({ ap, capa }: { ap: Aparencia; capa: EstiloDaCapa }) {
  const arte = usePlayer((s) => s.current?.artworkUrl ?? null);
  const titulo = usePlayer((s) => s.current?.title ?? null);
  const corDoTema = useTheme((s) => s.theme.color);
  const veu = veuDoLeitor(ap.brilho);
  const uri = arte ? capaParaLista(arte) : null;
  const aoCentro = ap.titulo === 'centro';
  const estiloDaCapa = capa === 'full' ? styles.previaCapaInteira
    : capa === 'floating' && ap.flutuar ? { transform: [{ perspective: 400 }, { rotateY: '12deg' }] } : null;
  return (
    <View style={styles.previa} accessibilityLabel="Preview of Now Playing" accessible>
      {ap.fundoLeitor === 'gradiente' ? <FundoEmGradiente uri={uri} animar />
        : ap.fundoLeitor === 'preto' || !uri ? <View style={[StyleSheet.absoluteFill, { backgroundColor: ap.fundoLeitor === 'preto' ? '#000' : '#1a1a22' }]} />
        : <Image source={{ uri }} style={StyleSheet.absoluteFill} blurRadius={ap.fundoLeitor === 'cor' ? 60 : 18} contentFit="cover" />}
      {ap.fundoLeitor !== 'preto' ? (
        <LinearGradient colors={['rgba(10,10,15,0.30)', 'rgba(10,10,15,0.72)', 'rgba(10,10,15,0.95)']} style={[StyleSheet.absoluteFill, { opacity: veu.opacidadeDoVeu }]} />
      ) : null}
      {veu.escurecer > 0 && ap.fundoLeitor !== 'preto' ? <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: veu.escurecer }]} /> : null}

      <View style={styles.previaTopo}>
        {ap.topo === 'origem' ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.previaOlho}>PLAYING FROM</Text>
            <Text style={styles.previaOrigem}>Liked Songs</Text>
          </View>
        ) : <Text style={styles.previaMarca}>DUOTONE</Text>}
      </View>
      <View style={styles.previaCapaArea}>
        {uri ? <Image source={{ uri }} style={[styles.previaCapa, estiloDaCapa]} contentFit="cover" />
          : <View style={[styles.previaCapa, estiloDaCapa, { backgroundColor: corDoTema }]} />}
      </View>
      <View style={[styles.previaTitulo, !aoCentro && { alignItems: 'flex-start' }]}>
        <Text numberOfLines={1} style={[styles.previaNome, fonteDosTitulos(ap.titulos)]}>{titulo ?? 'Song title'}</Text>
      </View>
      <View style={[styles.previaBarra, ap.barra === 'grossa' && { height: 6, borderRadius: 3 }]}>
        <View style={[styles.previaFeito, { backgroundColor: corDoTema }]} />
      </View>
      <View style={styles.previaControlos}>
        <Ionicons name="play-skip-back" size={16} color={colors.text} />
        <View style={[styles.previaPlay, ap.play === 'anel' && { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: corDoTema },
          ap.play === 'icone' && { backgroundColor: 'transparent' }]}>
          <Ionicons name="pause" size={ap.play === 'icone' ? 22 : 14} color={ap.play === 'cheio' ? colors.bg : colors.text} />
        </View>
        <Ionicons name="play-skip-forward" size={16} color={colors.text} />
      </View>
      <View style={styles.previaBotoes}>
        {ap.botoes.map((b) => <Ionicons key={b} name={ICONES_DOS_BOTOES[b]} size={13} color={colors.textSecondary} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tituloDosTemas: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, letterSpacing: 0.4, marginLeft: spacing.lg },
  tema: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: radii.pill, borderCurve: 'continuous',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  temaEscolhido: { backgroundColor: colors.surfacePressed, borderColor: colors.borderStrong },
  nomeDoTema: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  nota: { fontSize: 12, color: colors.textTertiary, textAlign: 'center' },
  previa: {
    alignSelf: 'center', width: 200, height: 360, borderRadius: 28, borderCurve: 'continuous', overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14,
  },
  previaTopo: { alignItems: 'center', height: 28, justifyContent: 'center' },
  previaMarca: { fontSize: 11, fontWeight: '600', letterSpacing: 2.2, color: colors.text },
  previaOlho: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, color: colors.textSecondary },
  previaOrigem: { fontSize: 11, fontWeight: '700', color: colors.text },
  previaCapaArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previaCapa: { width: 130, height: 130, borderRadius: 4 },
  // A pré-visualização tem 18 de margem de cada lado: a capa inteira come-as.
  previaCapaInteira: { width: 200, height: 160, borderRadius: 0, marginHorizontal: -18 },
  previaTitulo: { alignItems: 'center', marginBottom: 10 },
  previaNome: { fontSize: 14, fontWeight: '700', color: colors.text },
  previaBarra: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  previaFeito: { width: '40%', height: '100%' },
  previaControlos: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 12 },
  previaPlay: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  previaBotoes: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12, minHeight: 13 },
});
