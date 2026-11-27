import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image as ImagemRN, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { EscolherIconeDaApp } from '../components/EscolherIconeDaApp';
import { temLiquidGlass, Vidro } from '../components/Vidro';
import { comAlfa } from '../lib/doca';
import type { Track } from '../types';
import { Grupo, Linha, LinhaInterruptor } from '../components/ListaAgrupada';
import { MenuFlutuante, type Ancora } from '../components/MenuFlutuante';
import type { PlayerAction } from '../components/PlayerActionsSheet';
import { PromptSheet } from '../components/PromptSheet';
import { avisarFeito, avisarRemocao } from '../lib/avisoDeRemocao';
import { chaveDoAspeto, MAXIMO_DE_PRESETS, MAXIMO_DO_NOME, nomeDoPreset, nomeSugerido } from '../lib/presetsDaAparencia';
import { usePresetsDaAparencia } from '../state/presetsDaAparencia';
import { medirNoEcra } from '../state/vooDoQuadrado';
import { Screen, useCabecalhoQueEncolhe } from '../components/Screen';
import {
  BOTOES_DO_LEITOR, degradesDoPoster, emCinzento, ESTILOS_DA_CAPA, fonteDosTitulos, MAXIMO_DE_BOTOES, NOMES_DAS_SECOES, NOMES_DOS_BOTOES, TEMAS, veuDoLeitor,
  type Aparencia, type BotaoDoLeitor, type EstiloDaCapa, type SecaoDaHome,
} from '../lib/aparencia';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { tituloNoLeitor } from '../lib/artistName';
import { FundoEmGradiente } from '../components/FundoEmGradiente';
import { useCorDoAmbiente } from '../hooks/useCorDoAmbiente';
import { useFotoDoPoster } from '../hooks/useFotoDoPoster';
import { fotoPequena } from '../lib/fotosDoPoster';
import { hapticSelection } from '../lib/haptics';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { COR_DO_ICONE_NO_METAL, NoMetal } from '../components/DiscoDeMetal';
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
  play: { rotulo: 'Play button', icone: 'play-circle-outline', nomes: ['Metal', 'Filled', 'Ring', 'Icon'], valores: ['metal', 'cheio', 'anel', 'icone'] },
  controlos: { rotulo: 'Controls', icone: 'color-palette-outline', nomes: ['Accent colour', 'White'], valores: ['destaque', 'branco'] },
  posterImagem: { rotulo: 'Poster image', icone: 'person-outline', nomes: ['Artist photos', 'Artwork'], valores: ['artista', 'capa'] },
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
  partilhar: 'share-outline', letras: 'chatbox-ellipses-outline',
  temporizador: 'moon-outline', radio: 'radio-outline', playlist: 'albums-outline',
  descarregar: 'arrow-down-circle-outline', carro: 'car-sport-outline',
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
    play: s.play, metalNoPlay: s.metalNoPlay, controlos: s.controlos, posterImagem: s.posterImagem, posterMono: s.posterMono, botoes: s.botoes, flutuar: s.flutuar, fundoLeitor: s.fundoLeitor, brilho: s.brilho,
    titulos: s.titulos, tamanhoDasLetras: s.tamanhoDasLetras, abrirNasLetras: s.abrirNasLetras, molaNaLetra: s.molaNaLetra,
    vidro: s.vidro, fundoDaMusica: s.fundoDaMusica,
    secoesDaHome: s.secoesDaHome, escondidasDaHome: s.escondidasDaHome,
  })));
  const capa = useCapaIOS((s) => s.style);
  // A pré-visualização ao vivo (27/11): acende o ecrã a que a última opção mexida diz
  // respeito, e à direita mostra a Home ou a Playlist (as listas). Vê-se pela
  // aparência que mudou, e não por cada linha: assim apanha também os temas e os presets.
  const [foco, setFoco] = useState<EcraDaPrevia>('np');
  const [direita, setDireita] = useState<'home' | 'lista'>('home');
  const anterior = useRef(ap);
  useEffect(() => {
    const mudou = (Object.keys(ap) as (keyof typeof ap)[]).find((k) => ap[k] !== anterior.current[k]);
    anterior.current = ap;
    const f = mudou ? ecraDaOpcao(mudou) : null;
    if (f) { setFoco(f); if (f !== 'np') setDireita(f); }
  }, [ap]);
  const capaAntes = useRef(capa);
  useEffect(() => { if (capaAntes.current !== capa) { capaAntes.current = capa; setFoco('np'); } }, [capa]);
  const tema = useTemaDaAparencia();
  const { mudar, escolherTema, alternarBotao, alternarSecao, moverSecao } = useAparencia.getState();

  // Os presets (26/11, `lib/presetsDaAparencia.ts`): o aspeto de agora com um nome.
  const presets = usePresetsDaAparencia((s) => s.presets);
  useEffect(() => { void usePresetsDaAparencia.getState().carregar(); }, []);
  const aspeto = useAparencia((s) => chaveDoAspeto(s, capa));
  const emUso = presets.find((p) => chaveDoAspeto(p.aparencia, p.capa) === aspeto)?.id ?? null;
  const cheioDePresets = presets.length >= MAXIMO_DE_PRESETS;
  /** A caixa do nome: um preset novo (`id` null) ou mudar o nome de um. */
  const [nomear, setNomear] = useState<{ id: string | null; inicial: string } | null>(null);
  const [menuDoPreset, setMenuDoPreset] = useState<{ id: string; ancora: Ancora | null } | null>(null);
  /** O que o menu de um preset faz depois de fechar (a caixa do nome é outro Modal). */
  const depoisDoMenu = useRef<(() => void) | null>(null);
  /**
   * Cada preset mede-se pela sua vista, e não pelo `currentTarget` do toque longo
   * (27/11, depois da 7.2.8: segurar fechava a app). O toque longo chega por um
   * temporizador com o evento do toque, e o React já lhe pôs o `currentTarget` a
   * null: o `measureInWindow` de null rebentava.
   */
  const vistasDosPresets = useRef(new Map<string, View>());
  const segurarPreset = (id: string) => () => {
    hapticSelection();
    void medirNoEcra(vistasDosPresets.current.get(id) ?? null).then((ancora) => setMenuDoPreset({ id, ancora }));
  };
  const accoesDoPreset: PlayerAction[] = (() => {
    const p = menuDoPreset ? presets.find((x) => x.id === menuDoPreset.id) : undefined;
    if (!p) return [];
    const { atualizar, apagar } = usePresetsDaAparencia.getState();
    const fechar = (depois?: () => void) => { depoisDoMenu.current = depois ?? null; setMenuDoPreset(null); };
    return [
      { label: 'Rename', icon: 'pencil-outline', onPress: () => fechar(() => setNomear({ id: p.id, inicial: p.nome })) },
      {
        label: 'Update to current look', icon: 'refresh-outline', disabled: emUso === p.id,
        onPress: () => fechar(() => { atualizar(p.id); avisarFeito('Preset updated', p.nome); }),
      },
      {
        label: 'Delete preset', icon: 'trash-outline', destructive: true, inicioDeGrupo: true,
        onPress: () => fechar(() => {
          const repor = apagar(p.id);
          if (repor) avisarRemocao({ texto: 'Preset deleted', detalhe: p.nome, desfazer: repor });
        }),
      },
    ];
  })();

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
    <Screen title="Customise" onBack={() => navigation.goBack()} encolhe={cab}
      // Presa por baixo do título (27/11): as opções rolam por baixo dela.
      fixo={<PreviaAoVivo ap={ap} capa={capa} foco={foco} direita={direita}
        aoEscolher={(e) => { hapticSelection(); setDireita(e); setFoco(e); }} />}>
      <MenuFlutuante visivel={!!menu} ancora={menu?.ancora ?? null} accoes={accoes} aoFechar={() => setMenu(null)} />
      <MenuFlutuante visivel={!!menuDaCapa} ancora={menuDaCapa} accoes={accoesDaCapa} aoFechar={() => setMenuDaCapa(null)} />
      <MenuFlutuante visivel={!!menuDaSecao} ancora={menuDaSecao?.ancora ?? null} accoes={accoesDaSecao} aoFechar={() => setMenuDaSecao(null)} />
      <MenuFlutuante
        visivel={!!menuDoPreset}
        ancora={menuDoPreset?.ancora ?? null}
        titulo={presets.find((p) => p.id === menuDoPreset?.id)?.nome}
        accoes={accoesDoPreset}
        aoFechar={() => setMenuDoPreset(null)}
        aoFechado={() => { const f = depoisDoMenu.current; depoisDoMenu.current = null; f?.(); }}
      />
      <PromptSheet
        visible={!!nomear}
        title={nomear?.id ? 'Rename preset' : 'Save preset'}
        placeholder="Name"
        initialValue={nomear?.inicial}
        submitLabel={nomear?.id ? 'Rename' : 'Save'}
        onClose={() => setNomear(null)}
        onSubmit={(nome) => {
          const { guardarAtual, renomear } = usePresetsDaAparencia.getState();
          if (nomear?.id) renomear(nomear.id, nome);
          else { guardarAtual(nome); avisarFeito('Preset saved', nomeDoPreset(nome)); }
          setNomear(null);
        }}
      />
      <Animated.ScrollView
        style={{ flex: 1 }}
        onScroll={cab.onScroll}
        scrollEventThrottle={cab.scrollEventThrottle}
        scrollIndicatorInsets={{ top: cab.espaco }}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: cab.espaco, paddingBottom: insets.bottom + 48, gap: spacing.xl }}
      >
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
            {/* Os presets guardados: tocar põe o aspeto, segurar abre o menu. */}
            {presets.map((p) => (
              <Pressable
                key={p.id}
                ref={(v) => { if (v) vistasDosPresets.current.set(p.id, v); else vistasDosPresets.current.delete(p.id); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: emUso === p.id }}
                accessibilityHint="Hold for options"
                onPress={() => { hapticSelection(); usePresetsDaAparencia.getState().aplicar(p.id); }}
                onLongPress={segurarPreset(p.id)}
                delayLongPress={350}
                style={[styles.tema, styles.temaComIcone, emUso === p.id && styles.temaEscolhido]}
              >
                <Ionicons name="bookmark" size={12} color={emUso === p.id ? colors.text : colors.textTertiary} />
                <Text numberOfLines={1} style={[styles.nomeDoTema, emUso === p.id && { color: colors.text }]}>{p.nome}</Text>
              </Pressable>
            ))}
            {tema === 'custom' && !emUso ? (
              <View accessibilityRole="radio" accessibilityState={{ selected: true }} style={[styles.tema, styles.temaEscolhido]}>
                <Text style={[styles.nomeDoTema, { color: colors.text }]}>Custom</Text>
              </View>
            ) : null}
            {!emUso && !cheioDePresets ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save as preset"
                onPress={() => { hapticSelection(); setNomear({ id: null, inicial: nomeSugerido(presets) }); }}
                style={({ pressed }) => [styles.tema, styles.temaComIcone, styles.temaNovo, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="add" size={15} color={colors.textSecondary} />
                <Text style={styles.nomeDoTema}>Save</Text>
              </Pressable>
            ) : null}
          </ScrollView>
          <Text style={styles.notaDosTemas}>
            {presets.length ? 'Save the look you have now. Hold a preset to rename, update or delete it.' : 'Save the look you have now as a preset.'}
          </Text>
        </View>

        <Grupo titulo="App" rodape={[
          ap.fundoDaMusica ? "The artwork's colour washes the top of each page, and changes with the music." : null,
          'The accent colour is in Settings → Appearance.',
        ]}>
          {/* O Liquid Glass do iOS 26 (27/11): só aparece onde o vidro existe. */}
          {temLiquidGlass ? (
            <LinhaInterruptor icone="water-outline" rotulo="Liquid Glass" valor={ap.vidro} aoMudar={(v) => mudar('vidro', v)} />
          ) : null}
          <LinhaInterruptor icone="color-fill-outline" rotulo="Background follows the song" valor={ap.fundoDaMusica} aoMudar={(v) => mudar('fundoDaMusica', v)} />
          {linha('fundoApp')}
          {linha('listas')}
          {linha('titulos')}
          <LinhaInterruptor icone="pricetag-outline" rotulo="Tab bar labels" valor={ap.rotulos} aoMudar={(v) => mudar('rotulos', v)} />
        </Grupo>

        {/* O ícone da app (26/11, item 9 do plano): só com o módulo na build. */}
        <EscolherIconeDaApp />

        <Grupo titulo="Now Playing" rodape={capa === 'poster' ? (ap.posterImagem === 'artista'
          ? 'A different photo of the artist for each song, while there are photos. Without them, the artwork.'
          : 'The artwork is the background and fades into its own colour.')
          : capa === 'floating' && !ap.flutuar ? 'The 3D artwork stays still.' : null}>
          <Linha icone="square-outline" rotulo="Artwork" valor={nomeDaCapa} chevron aoTocar={setMenuDaCapa} />
          {capa === 'poster' ? linha('posterImagem') : null}
          {capa === 'poster' ? (
            <LinhaInterruptor icone="film-outline" rotulo="Black and white" valor={ap.posterMono} aoMudar={(v) => mudar('posterMono', v)} />
          ) : null}
          {linha('topo')}
          {linha('titulo')}
          {linha('barra')}
          {linha('play')}
          {linha('controlos')}
          {capa === 'floating' ? (
            <LinhaInterruptor icone="cube-outline" rotulo="Float" valor={ap.flutuar} aoMudar={(v) => mudar('flutuar', v)} />
          ) : null}
          {/* Com o Poster o fundo é a capa: o fundo e o brilho não se aplicam. */}
          {capa !== 'poster' ? linha('fundoLeitor') : null}
          {capa !== 'poster' && ap.fundoLeitor !== 'preto' ? linha('brilho') : null}
        </Grupo>

        <Grupo titulo="Lyrics" rodape={ap.abrirNasLetras ? 'Now Playing opens on the lyrics when the song has them.' : null}>
          {linha('tamanhoDasLetras')}
          <LinhaInterruptor icone="chatbox-ellipses-outline" rotulo="Open on lyrics" valor={ap.abrirNasLetras} aoMudar={(v) => mudar('abrirNasLetras', v)} />
          {/* A letra com mola (25/11, item 4 do plano): quem a lê é o `LyricsView`. */}
          <LinhaInterruptor icone="water-outline" rotulo="Flowing lyrics" valor={ap.molaNaLetra} aoMudar={(v) => mudar('molaNaLetra', v)} />
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
function PreviaDoLeitor({ ap, capa, faixa }: { ap: Aparencia; capa: EstiloDaCapa; faixa: Track | null }) {
  const arte = faixa?.artworkUrl ?? null;
  // O título limpo, como o leitor o mostra (o cru é o do vídeo: "Artista - Música ...").
  // A faixa vem da pré-visualização ao vivo: a que toca, ou uma das seguintes ("Next song").
  const titulo = faixa ? tituloNoLeitor(faixa) : null;
  const corDoTema = useTheme((s) => s.theme.color);
  const corDosControlos = ap.controlos === 'branco' ? colors.text : corDoTema;
  const veu = veuDoLeitor(ap.brilho);
  const uri = arte ? capaParaLista(arte) : null;
  const poster = capa === 'poster';
  // A mesma foto que o leitor vai mostrar para esta música (a escolha fica guardada).
  const foto = useFotoDoPoster(poster && ap.posterImagem === 'artista' ? faixa : null);
  const imagemDoPoster = foto ?? uri;
  const tomLido = useCorDoAmbiente(poster ? (foto ? fotoPequena(foto) : uri) : null) ?? colors.bg;
  const tom = ap.posterMono ? emCinzento(tomLido) : tomLido;
  const aoCentro = ap.titulo === 'centro';
  // A capa 3D em pequeno é uma inclinação 2D, e não uma rotação 3D a sério (11/10):
  // no iPhone a metade que roda para trás ficava atrás do fundo desfocado, que
  // é irmão dela, e via-se só meia pré-visualização. Uma transformação afim não
  // tem profundidade, e não há plano que a corte.
  const estiloDaCapa = capa === 'full' ? styles.previaCapaInteira
    : capa === 'floating' ? styles.previaCapaFlutuante : null;
  return (
    <View style={styles.previa} accessibilityLabel="Preview of Now Playing" accessible>
      {poster ? <PosterEmPequeno uri={imagemDoPoster} tom={tom} mono={ap.posterMono} /> : <>
      {ap.fundoLeitor === 'gradiente' ? <FundoEmGradiente uri={uri} animar />
        : ap.fundoLeitor === 'preto' || !uri ? <View style={[StyleSheet.absoluteFill, { backgroundColor: ap.fundoLeitor === 'preto' ? '#000' : '#1a1a22' }]} />
        : <Image source={{ uri }} style={StyleSheet.absoluteFill} blurRadius={ap.fundoLeitor === 'cor' ? 60 : 18} contentFit="cover" />}
      {ap.fundoLeitor !== 'preto' ? (
        <LinearGradient colors={['rgba(6,6,8,0.30)', 'rgba(6,6,8,0.72)', 'rgba(6,6,8,0.95)']} style={[StyleSheet.absoluteFill, { opacity: veu.opacidadeDoVeu }]} />
      ) : null}
      {veu.escurecer > 0 && ap.fundoLeitor !== 'preto' ? <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: veu.escurecer }]} /> : null}
      </>}

      <View style={styles.previaTopo}>
        {ap.topo === 'origem' ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.previaOlho}>PLAYING FROM</Text>
            <Text style={styles.previaOrigem}>Liked Songs</Text>
          </View>
        ) : <Text style={styles.previaMarca}>DUOTONE</Text>}
      </View>
      <View style={styles.previaCapaArea}>
        {poster ? null : uri ? <Image source={{ uri }} style={[styles.previaCapa, estiloDaCapa]} contentFit="cover" />
          : <View style={[styles.previaCapa, estiloDaCapa, { backgroundColor: corDoTema }]} />}
      </View>
      <View style={[styles.previaTitulo, !aoCentro && { alignItems: 'flex-start' }]}>
        <Text numberOfLines={1} style={[styles.previaNome, fonteDosTitulos(ap.titulos)]}>{titulo ?? 'Song title'}</Text>
      </View>
      <View style={[styles.previaBarra, ap.barra === 'grossa' && { height: 6, borderRadius: 3 }]}>
        <View style={styles.previaFeito} />
      </View>
      <View style={styles.previaControlos}>
        <Ionicons name="play-skip-back" size={16} color={colors.text} />
        <View style={[styles.previaPlay, ap.play === 'anel' && { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: corDosControlos },
          (ap.play === 'icone' || ap.play === 'metal') && { backgroundColor: 'transparent' }]}>
          {/* O metal (23/11): o mesmo disco do leitor, parado (na prévia não toca nada). */}
          <NoMetal ligado={ap.play === 'metal'} lado={34} aTocar>
            <Ionicons name="pause" size={ap.play === 'icone' ? 22 : 14}
              color={ap.play === 'cheio' ? colors.bg : ap.play === 'metal' ? COR_DO_ICONE_NO_METAL : colors.text} />
          </NoMetal>
        </View>
        <Ionicons name="play-skip-forward" size={16} color={colors.text} />
      </View>
      <View style={styles.previaBotoes}>
        {ap.botoes.map((b) => <Ionicons key={b} name={ICONES_DOS_BOTOES[b]} size={13} color={colors.textSecondary} />)}
      </View>
    </View>
  );
}

type EcraDaPrevia = 'np' | 'home' | 'lista';

/** Que ecrã mostra o que uma opção muda (null: nenhum, como o tamanho da letra das músicas). */
function ecraDaOpcao(k: keyof Aparencia): EcraDaPrevia | null {
  if (k === 'listas') return 'lista';
  if (k === 'fundoApp' || k === 'rotulos' || k === 'vidro' || k === 'fundoDaMusica' || k === 'secoesDaHome' || k === 'escondidasDaHome') return 'home';
  if (k === 'tamanhoDasLetras' || k === 'abrirNasLetras' || k === 'molaNaLetra') return null;
  return 'np';
}

/**
 * A app ao vivo, presa em cima da Customise (27/11, `docs/personalizar-ao-vivo-maquete.html`,
 * aprovada pelo João). Dois ecrãs lado a lado: o Now Playing e a Home ou a Playlist,
 * desenhados com as escolhas de agora e a música que toca. Acende-se o que a última
 * opção mexeu. "Next song" passa pelas próximas da fila (`upcomingQueue`) só aqui,
 * sem mudar a música: é para ver a cor seguir a capa.
 */
function PreviaAoVivo({ ap, capa, foco, direita, aoEscolher }: {
  ap: Aparencia; capa: EstiloDaCapa; foco: EcraDaPrevia; direita: 'home' | 'lista'; aoEscolher: (e: 'home' | 'lista') => void;
}) {
  const atual = usePlayer((s) => s.current);
  const [indice, setIndice] = useState(0);
  const chaveDaAtual = atual ? `${atual.source}:${atual.sourceId}` : '';
  const faixas = useMemo(() => {
    const seguintes = usePlayer.getState().upcomingQueue().slice(0, 4).map((p) => p.track);
    return [atual, ...seguintes].filter((t): t is Track => !!t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- muda com a música que toca
  }, [chaveDaAtual]);
  useEffect(() => { setIndice(0); }, [chaveDaAtual]);
  const faixa = faixas.length ? faixas[indice % faixas.length]! : null;
  const chip = (rotulo: string, ligado: boolean, aoTocar: () => void, desligado = false) => (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: ligado, disabled: desligado }} disabled={desligado}
      onPress={aoTocar} hitSlop={6} style={[styles.chipDaPrevia, ligado && styles.chipDaPreviaLigado, desligado && { opacity: 0.4 }]}>
      <Text style={[styles.textoDoChip, ligado && { color: colors.bg }]}>{rotulo}</Text>
    </Pressable>
  );
  return (
    <View style={styles.aoVivo}>
      <View style={styles.molduras}>
        <MolduraDaPrevia acesa={foco === 'np'}><PreviaDoLeitor ap={ap} capa={capa} faixa={faixa} /></MolduraDaPrevia>
        <MolduraDaPrevia acesa={foco !== 'np'}><PreviaDaApp ap={ap} ecra={direita} faixa={faixa} faixas={faixas} /></MolduraDaPrevia>
      </View>
      <View style={styles.chipsDaPrevia}>
        {chip('Home', direita === 'home', () => aoEscolher('home'))}
        {chip('Playlist', direita === 'lista', () => aoEscolher('lista'))}
        {chip('Next song ›', false, () => { hapticSelection(); setIndice((i) => i + 1); }, faixas.length < 2)}
      </View>
    </View>
  );
}

/** Um ecrã de 200 × 360 a três quartos (150 × 270), com o anel que diz qual mudou. */
function MolduraDaPrevia({ acesa, children }: { acesa: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.moldura, acesa && styles.molduraAcesa]}>
      <View style={styles.dentroDaMoldura}>{children}</View>
    </View>
  );
}

/**
 * A Home ou a Playlist em pequeno: o fundo da app (escuro, OLED, e a cor da música),
 * o título com a letra escolhida, as capas da fila, as linhas confortáveis ou
 * compactas, e a base com o mini leitor e os separadores (com ou sem nomes, e com o
 * Liquid Glass quando está ligado e existe).
 */
function PreviaDaApp({ ap, ecra, faixa, faixas }: { ap: Aparencia; ecra: 'home' | 'lista'; faixa: Track | null; faixas: Track[] }) {
  const uri = faixa?.artworkUrl ? capaParaLista(faixa.artworkUrl) : null;
  const corDaMusica = useCorDoAmbiente(ap.fundoDaMusica ? uri : null);
  const corDoTema = useTheme((s) => s.theme.color);
  const capas = faixas.length ? faixas : [];
  const capaDe = (i: number) => {
    const t = capas.length ? capas[i % capas.length] : null;
    return t?.artworkUrl ? capaParaLista(t.artworkUrl) : null;
  };
  const quadrado = (i: number, lado: number, raio: number) => {
    const u = capaDe(i);
    return u ? <Image key={i} source={{ uri: u }} style={{ width: lado, height: lado, borderRadius: raio }} contentFit="cover" />
      : <View key={i} style={{ width: lado, height: lado, borderRadius: raio, backgroundColor: colors.surfaceHigh }} />;
  };
  const compacta = ap.listas === 'compact';
  const vidro = ap.vidro && temLiquidGlass;
  return (
    <View style={[styles.previa, styles.previaDaApp]} accessible accessibilityLabel={ecra === 'home' ? 'Preview of Home' : 'Preview of a playlist'}>
      {ap.fundoApp === 'dark' ? (
        <Image source={require('../../assets/login_bg.png')} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={12} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: ap.fundoApp === 'oled' ? '#000' : 'rgba(6,6,8,0.88)' }]} />
      {corDaMusica ? (
        <LinearGradient colors={[comAlfa(corDaMusica, 0.55), comAlfa(corDaMusica, 0.22), comAlfa(corDaMusica, 0)]}
          locations={[0, 0.28, 0.6]} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={styles.appCorpo}>
        <Text numberOfLines={1} style={[styles.appTitulo, fonteDosTitulos(ap.titulos)]}>{ecra === 'home' ? 'Home' : 'Liked Songs'}</Text>
        {ecra === 'home' ? (
          <>
            <Text style={styles.appSeccao}>Jump back in</Text>
            <View style={styles.prateleira}>{[1, 2, 3].map((i) => quadrado(i, 50, 6))}</View>
            <Text style={styles.appSeccao}>Made for you</Text>
            <View style={styles.prateleira}>{[2, 3, 4].map((i) => quadrado(i, 50, 6))}</View>
          </>
        ) : (
          [0, 1, 2, 3, 4, 5, 6].map((i) => {
            const t = capas.length ? capas[i % capas.length] : null;
            return (
              <View key={i} style={[styles.appLinha, { height: compacta ? 30 : 36 }]}>
                {quadrado(i, compacta ? 20 : 24, 3)}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={styles.appLinhaTitulo}>{t ? tituloNoLeitor(t) : 'Song title'}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
      {/* A base: com o Liquid Glass, um cartão de vidro a flutuar; sem ele, o vidro escuro de sempre. */}
      <View style={[styles.appBase, vidro && styles.appBaseFlutuante]}>
        {vidro ? <Vidro style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} /> : <View style={[StyleSheet.absoluteFill, styles.appBaseEscura]} />}
        <View style={styles.appMini}>
          {quadrado(0, 22, 4)}
          <Text numberOfLines={1} style={[styles.appLinhaTitulo, { flex: 1 }]}>{faixa ? tituloNoLeitor(faixa) : 'Song title'}</Text>
          <Ionicons name="pause" size={13} color={colors.text} />
        </View>
        <View style={styles.appSeparadores}>
          {(['home', 'heart', 'mic', 'albums', 'person'] as const).map((icone, i) => (
            <View key={icone} style={styles.appSeparador}>
              <Ionicons name={i === (ecra === 'home' ? 0 : 1) ? icone : (`${icone}-outline` as any)} size={14}
                color={i === (ecra === 'home' ? 0 : 1) ? corDoTema : colors.textSecondary} />
              {ap.rotulos ? <View style={[styles.appRotulo, { backgroundColor: i === (ecra === 'home' ? 0 : 1) ? corDoTema : colors.textTertiary }]} /> : null}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** O Poster em pequeno: a imagem até ao título, a dissolver-se na cor dela (`FundoDoPoster`). */
function PosterEmPequeno({ uri, tom, mono }: { uri: string | null; tom: string; mono: boolean }) {
  const d = degradesDoPoster(tom);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tom }]}>
      {uri ? <Image source={{ uri }} style={styles.previaPoster} contentFit="cover" /> : null}
      {mono && uri ? <View style={[styles.previaPoster, styles.semCor]} /> : null}
      <LinearGradient colors={d.topo.cores} locations={d.topo.paragens} style={styles.previaPoster} />
      <LinearGradient colors={d.baixo.cores} locations={d.baixo.paragens} style={styles.previaPoster} />
      {mono ? <ImagemRN source={require('../../assets/grao-do-poster.png')} resizeMode="repeat" style={styles.previaPoster} /> : null}
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
  temaComIcone: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 220 },
  // O "Save": tracejado, para se ler como uma ação e não como mais um tema.
  temaNovo: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: colors.borderStrong },
  notaDosTemas: { fontSize: 12, color: colors.textTertiary, marginLeft: spacing.lg, marginRight: spacing.lg },
  nomeDoTema: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  nota: { fontSize: 12, color: colors.textTertiary, textAlign: 'center' },
  previa: {
    alignSelf: 'center', width: 200, height: 360, borderRadius: 28, borderCurve: 'continuous', overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14,
  },
  // A pré-visualização ao vivo (27/11): dois ecrãs a 3/4, e os chips por baixo.
  aoVivo: { paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm, backgroundColor: colors.bg },
  molduras: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  moldura: {
    width: 150, height: 270, borderRadius: 22, borderCurve: 'continuous', overflow: 'hidden',
    borderWidth: 1.5, borderColor: colors.border,
  },
  molduraAcesa: { borderColor: colors.text },
  // O ecrã de 200 × 360 encolhido a 3/4 à volta do centro: fica certo nos 150 × 270.
  dentroDaMoldura: { position: 'absolute', left: -25, top: -45, width: 200, height: 360, transform: [{ scale: 0.75 }] },
  chipsDaPrevia: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  chipDaPrevia: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, borderCurve: 'continuous',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  chipDaPreviaLigado: { backgroundColor: colors.text, borderColor: colors.text },
  textoDoChip: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  previaDaApp: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, borderWidth: 0 },
  appCorpo: { paddingTop: 22, paddingHorizontal: 12, gap: 4 },
  appTitulo: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 4 },
  appSeccao: { fontSize: 11, fontWeight: '700', color: colors.text, marginTop: 6 },
  prateleira: { flexDirection: 'row', gap: 7, marginTop: 4 },
  appLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appLinhaTitulo: { fontSize: 11, fontWeight: '600', color: colors.text },
  appBase: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 74, overflow: 'hidden',
    borderTopLeftRadius: 14, borderTopRightRadius: 14, borderCurve: 'continuous',
  },
  appBaseFlutuante: { left: 6, right: 6, bottom: 6, height: 68, borderRadius: 18 },
  appBaseEscura: { backgroundColor: 'rgba(20,20,26,0.94)' },
  appMini: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 9, paddingTop: 7, height: 34 },
  appSeparadores: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', height: 34, paddingBottom: 4 },
  appSeparador: { alignItems: 'center', gap: 3 },
  // O nome por baixo do ícone, a risco: a 3/4 um texto de 11 já não se lia.
  appRotulo: { width: 12, height: 2, borderRadius: 1 },
  previaTopo: { alignItems: 'center', height: 28, justifyContent: 'center' },
  previaMarca: { fontSize: 11, fontWeight: '600', letterSpacing: 2.2, color: colors.text },
  previaOlho: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, color: colors.textSecondary },
  previaOrigem: { fontSize: 11, fontWeight: '700', color: colors.text },
  previaCapaArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previaCapa: { width: 130, height: 130, borderRadius: 4 },
  previaCapaFlutuante: { borderRadius: 2, transform: [{ skewY: '-5deg' }, { scaleX: 0.94 }] },
  // A pré-visualização tem 18 de margem de cada lado: a capa inteira come-as.
  previaCapaInteira: { width: 200, height: 160, borderRadius: 0, marginHorizontal: -18 },
  previaTitulo: { alignItems: 'center', marginBottom: 10 },
  previaNome: { fontSize: 14, fontWeight: '700', color: colors.text },
  previaBarra: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  // Branca, como a do leitor (ProgressBar): a cor do destaque não lhe chega.
  previaFeito: { width: '40%', height: '100%', backgroundColor: colors.text },
  // Até ao título, como no leitor (alturaDoPoster).
  previaPoster: { position: 'absolute', top: 0, left: 0, right: 0, height: 262 },
  semCor: { backgroundColor: '#808080', mixBlendMode: 'saturation' },
  previaControlos: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 12 },
  previaPlay: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  previaBotoes: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12, minHeight: 13 },
});
