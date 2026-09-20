import {StateIcon} from '../components/StateIcon';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import type { Track } from '../types';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { LIMIAR_ARRASTO_PX } from '../lib/reorder';
import { BrilhoInteligente, EstrelaInteligente } from '../components/BrilhoInteligente';
import { usePlayer } from '../state/player';
import { useSaved } from '../state/saved';
import type { DiscoveryContext } from '../lib/contextoDaDescoberta';
import type { OrigemDaFila } from '../lib/origemDaFila';
import { COR, ESP, FONT, LINHA_LISTA, RAIO, TIPO } from './tokens.web';
import { isShowTrackDurationSync } from '../lib/prefs';
import { capaComBarras, molduraSemBarras } from '../lib/modoLimpo';

/**
 * Largura da coluna de duracao, no cabecalho E na celula.
 *
 * Estava escrita duas vezes com o mesmo numero magico, e tinha de bater certo
 * nas duas. Eram 64, e "DURATION" nao cabia: o `colHead` e mono de 10px com
 * `letterSpacing` 1.5 (uns 60px de texto) mais 8+8 de padding, por isso o
 * cabecalho partia-se em "DURATI / ON".
 */
const LARGURA_DURACAO = 84;

const P = Pressable as any;

/** Referência estável: um Set novo a cada render fazia a tabela redesenhar. */
const EMPTY_KEYS: ReadonlySet<string> = new Set();

/**
 * A paleta antiga, agora derivada dos tokens (tokens.web.ts).
 *
 * As chaves ficam iguais para nao partir os ecras todos de uma vez — o que
 * muda sao os VALORES. Havia tres roxos diferentes a fazer de cor de marca e
 * o simbolo da app nao tem roxo nenhum: e prata fria sobre quase-preto. O
 * destaque passa a ser a luz.
 *
 * Ecras novos devem importar de `tokens.web.ts` diretamente; isto e a ponte.
 */
export const desktop = {
  bg: COR.fundo, panel: COR.painel, raised: COR.elevado, hover: COR.hover,
  border: COR.linha, text: COR.texto, muted: COR.textoMedio, dim: COR.textoFraco,
  accent: COR.metalClaro, accentSoft: 'rgba(233,234,238,.12)', danger: COR.erro,
};

export function IconButton({ name, label, onPress, active = false, danger = false, estrela = false, marca }: {
  name: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void; active?: boolean; danger?: boolean;
  /** Estrelinha ao canto. Só o shuffle a usa, para se distinguir o modo
   * inteligente do normal — sem ela os dois estados ligados eram iguais. */
  estrela?: boolean;
  /**
   * Um caracter no canto, para distinguir dois modos do MESMO botao.
   *
   * Existe pelo repeat: "repetir tudo" e "repetir esta" eram `repeat` e
   * `repeat-outline`, dois icones do Ionicons que a 18px sao praticamente
   * iguais -- o botao tinha dois estados e mostrava um. Um "1" no canto e o
   * que toda a gente ja percebe.
   */
  marca?: string;
}) {
  return <P className="control-btn-animate dt-premir" accessibilityLabel={label} onPress={onPress} style={({ hovered, pressed, focused }: any) => [
    ui.iconButton, (hovered || focused) && ui.iconButtonHover, pressed && ui.pressed, active && ui.active,
  ]}>
    <StateIcon name={name} size={19} color={danger ? desktop.danger : active ? desktop.accent : desktop.muted} />
    {marca ? <View style={ui.marcaDeModo}><Text style={ui.marcaDeModoTexto}>{marca}</Text></View> : null}
    {estrela ? <View style={{ position: 'absolute', top: 5, right: 5 }}>
      <EstrelaInteligente tamanho={6} />
    </View> : null}
  </P>;
}

export function Button({ children, onPress, icon, iconNode, secondary = false, danger = false, disabled = false, brilho = false, marcado = false }: {
  children: ReactNode; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap;
  /** Ícone à medida, para marcas que o Ionicons não tem — como o Spotify. */
  iconNode?: ReactNode;
  secondary?: boolean; danger?: boolean; disabled?: boolean;
  /** O gradiente com pontos a cintilar por trás do texto. Só o shuffle
   * inteligente o usa: é o que o distingue do shuffle normal ao lado. */
  brilho?: boolean;
  /** Ligado, mas sem ser a acção principal da página. É o que separa um
   * interruptor aceso de um botão primário — sem isto, um toggle activo tinha
   * de se pintar de primário e passava a competir com o `Play`. */
  marcado?: boolean;
}) {
  return <P className="btn-animate dt-premir" disabled={disabled} onPress={onPress} style={({ hovered, pressed, focused }: any) => [
    ui.button, secondary && ui.buttonSecondary, marcado && ui.buttonMarcado, danger && ui.buttonDanger, (hovered || focused) && ui.buttonHover,
    pressed && ui.pressed, disabled && ui.disabled,
    brilho && { overflow: 'hidden' as const },
  ]}>{brilho ? <BrilhoInteligente /> : null}{iconNode ?? (icon && <Ionicons name={icon} size={16} color={danger ? COR.erro : secondary ? COR.texto : COR.fundo} />)}<Text style={[ui.buttonText, secondary && ui.buttonTextSec, danger && ui.buttonTextDanger]}>{children}</Text></P>;
}

export const Field = React.forwardRef<any, React.ComponentProps<typeof TextInput> & { icon?: keyof typeof Ionicons.glyphMap }>(function Field(props, ref) {
  const { icon, style, onSubmitEditing, ...rest } = props;
  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      onSubmitEditing?.(e);
    }
    // Limpar com Escape, que e o que se carrega sem pensar num campo destes.
    if (e.key === 'Escape' && rest.value) {
      e.preventDefault?.();
      (rest as any).onChangeText?.('');
    }
  };
  // So nas lupas: um X num campo de mensagem nao quer dizer nada, e este
  // componente serve os dois. Aparece so quando ha o que limpar.
  const limpavel = icon === 'search' && !!rest.value && !!(rest as any).onChangeText;
  return <View style={ui.fieldWrap} {...{ className: 'dt-campo' }}>{icon && <Ionicons name={icon} size={18} color={desktop.dim} />}<TextInput
    ref={ref} placeholderTextColor={desktop.dim} selectionColor={desktop.accent} onSubmitEditing={onSubmitEditing} {...(rest as any)} onKeyDown={handleKeyDown} style={[ui.field, style]} />
    {limpavel && <P accessibilityRole="button" accessibilityLabel="Clear search"
      onPress={() => { (rest as any).onChangeText?.(''); (ref as any)?.current?.focus?.(); }}
      style={({ hovered }: any) => [ui.fieldLimpar, hovered && { backgroundColor: COR.hover }]}>
      <Ionicons name="close" size={14} color={desktop.dim} />
    </P>}</View>;
});

/**
 * Quem rolou a página, dito pelo `ContentScroll` ao `Page` que o contém.
 *
 * Por contexto e não por prop: os dois são irmãos na árvore (o `Page` desenha
 * o cabeçalho e recebe o scroll como filho), e passar isto à mão obrigava as
 * doze páginas a reencaminhar um estado que não é delas.
 */
const ContextoDoRolo = React.createContext<((rolado: boolean) => void) | null>(null);

export function Page({ title, subtitle, action, children }: { title: string; subtitle?: ReactNode; action?: ReactNode; children: ReactNode }) {
  // Ao rolar, o cabeçalho encolhe e o subtítulo sai, em vez de o título
  // desaparecer pelo topo (preview de 20/9). O conteúdo ganha o espaço.
  const [rolado, setRolado] = useState(false);
  return <View style={ui.page}>
    <View style={[ui.pageHeader, rolado && ui.pageHeaderCurto]}>
      <View style={{ flex: 1 }}>
        <Text style={ui.eyebrow}>DUOTONE</Text>
        <Text style={[ui.title, rolado && ui.tituloCurto]}>{title}</Text>
        {subtitle && <Text style={[ui.subtitle, rolado && ui.subtituloEscondido]}>{subtitle}</Text>}
      </View>
      {action}
    </View>
    <ContextoDoRolo.Provider value={setRolado}>{children}</ContextoDoRolo.Provider>
  </View>;
}

const posicoesDeScroll = new Map<string, number>();

/** Mantém a posição quando uma rota desktop desmonta para abrir o leitor. */
export function ContentScroll({ children, scrollKey }: { children: ReactNode; scrollKey?: string }) {
  const ref = useRef<any>(null);
  const dizerQueRolou = React.useContext(ContextoDoRolo);
  const rolado = useRef(false);
  const alturaVisivel = useRef(0);
  const restaurado = useRef(!scrollKey);
  useEffect(() => { restaurado.current = !scrollKey; }, [scrollKey]);
  const tentarRestaurar = (alturaConteudo: number) => {
    if (!scrollKey || restaurado.current) return;
    const y = posicoesDeScroll.get(scrollKey) ?? 0;
    // Espera pelo conteúdo real; restaurar enquanto só existe o spinner faz o
    // browser limitar a posição a zero e perder o sítio guardado.
    if (y > 0 && alturaConteudo < y + alturaVisivel.current) return;
    restaurado.current = true;
    requestAnimationFrame(() => ref.current?.scrollTo?.({ y, animated: false }));
  };
  return <ScrollView
    ref={ref}
    style={{ flex: 1 }}
    contentContainerStyle={ui.scrollContent}
    scrollEventThrottle={100}
    onLayout={(e) => { alturaVisivel.current = e.nativeEvent.layout.height; }}
    onContentSizeChange={(_w, h) => tentarRestaurar(h)}
    onScroll={(e) => {
      const y = e.nativeEvent.contentOffset.y;
      if (scrollKey) posicoesDeScroll.set(scrollKey, y);
      // Só quando MUDA: um `setState` por evento de scroll redesenhava a
      // página inteira a cada pixel.
      const agora = y > 8;
      if (agora !== rolado.current) { rolado.current = agora; dizerQueRolou?.(agora); }
    }}>
    {children}
  </ScrollView>;
}

export function Empty({ icon, title, body, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; action?: ReactNode }) {
  return <View style={ui.empty}><View style={ui.emptyIcon}><Ionicons name={icon} size={30} color={desktop.accent} /></View><Text style={ui.emptyTitle}>{title}</Text><Text style={ui.emptyBody}>{body}</Text>{action}</View>;
}

export function Loading() { return <View style={ui.loading}><ActivityIndicator color={desktop.accent} /><Text style={ui.loadingText}>Loading…</Text></View>; }

export function formatTime(seconds: number | null) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function Artwork({ track, size = 44 }: { track: Track; size?: number }) {
  // Sem `artworkUrl` há quase sempre capa na mesma: uma faixa do YouTube tem a
  // miniatura no próprio id. O quadrado vazio ficava para quem não tem nenhuma.
  const capa = track.artworkUrl
    ?? (track.source === 'youtube' && track.sourceId ? `https://i.ytimg.com/vi/${track.sourceId}/mqdefault.jpg` : null);
  if (!capa) return <View style={[ui.artFallback, { width: size, height: size }]}><Ionicons name="musical-note" size={Math.max(16, size * .35)} color={desktop.dim} /></View>;
  const quadro = { width: size, height: size, borderRadius: RAIO.ctrl, backgroundColor: COR.elevado };
  // As miniaturas 4:3 do YouTube (`hqdefault` e companhia) trazem o vídeo 16:9
  // lá dentro com duas faixas pretas, que num quadrado se viam por cima e por
  // baixo de cada capa. Amplia-se até o conteúdo encher o quadrado -- a mesma
  // conta do modo limpo. Num canal "- Topic" o que fica é a capa do álbum.
  if (capaComBarras(capa)) {
    const m = molduraSemBarras(size);
    return <View style={[quadro, { overflow: 'hidden' }]}>
      <Image source={{ uri: capa }} style={{ position: 'absolute', width: m.largura, height: m.altura, left: m.esquerda, top: m.topo }} />
    </View>;
  }
  return <Image source={{ uri: capa }} style={quadro} />;
}

/**
 * Prateleira horizontal de capas — a peca que faltava para o desktop ter as
 * recomendacoes que o telemovel ja tinha.
 *
 * A capa e o elemento; o texto e legenda. Numa lista de descoberta ninguem le
 * titulos em coluna, olha para as capas.
 */
/**
 * O carrossel de uma prateleira: setas, arrasto, e saber onde estamos.
 *
 * **A `ScrollView horizontal` sozinha nao chega num computador.** Ela rola,
 * mas o indicador esta escondido, a roda do rato rola a PAGINA (que e
 * vertical) e nao ha nada para agarrar — as faixas que nao cabem no ecra
 * ficavam simplesmente inalcancaveis com um rato. Daqui saem as duas maneiras
 * de la chegar: as setas, que se veem, e o arrasto, que se tenta.
 */
function useCarrossel() {
  const ref = useRef<any>(null);
  const [podeEsquerda, setPodeEsquerda] = useState(false);
  const [podeDireita, setPodeDireita] = useState(false);
  // Distingue um clique de um arrasto. Sem isto, arrastar a prateleira punha
  // uma musica a tocar quando se largasse em cima de um cartao.
  const arrastou = useRef(false);

  useEffect(() => {
    const bruto = ref.current;
    const el: HTMLElement | null = bruto?.getScrollableNode?.() ?? bruto ?? null;
    if (!el || typeof el.addEventListener !== 'function') return;

    const medir = () => {
      setPodeEsquerda(el.scrollLeft > 1);
      setPodeDireita(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    medir();

    let aArrastar = false;
    let xInicial = 0;
    let scrollInicial = 0;

    const carregou = (e: PointerEvent) => {
      if (e.button !== 0) return;
      aArrastar = true;
      // Limpar AQUI e nao ao largar: se o arrasto for interrompido (a janela
      // perde o foco, Escape), a flag ficava presa e comia o clique seguinte.
      arrastou.current = false;
      xInicial = e.clientX;
      scrollInicial = el.scrollLeft;
    };
    const moveu = (e: PointerEvent) => {
      if (!aArrastar) return;
      const dx = e.clientX - xInicial;
      if (!arrastou.current && Math.abs(dx) < LIMIAR_ARRASTO_PX) return;
      arrastou.current = true;
      el.scrollLeft = scrollInicial - dx;
    };
    const largou = () => { aArrastar = false; };
    // Na fase de CAPTURA, para chegar antes do React: um arrasto que acaba em
    // cima de um cartao nao pode contar como carregar nele.
    const clicou = (e: MouseEvent) => {
      if (!arrastou.current) return;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener('scroll', medir, { passive: true });
    el.addEventListener('pointerdown', carregou);
    window.addEventListener('pointermove', moveu);
    window.addEventListener('pointerup', largou);
    el.addEventListener('click', clicou, true);
    const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    observador?.observe(el);

    return () => {
      el.removeEventListener('scroll', medir);
      el.removeEventListener('pointerdown', carregou);
      window.removeEventListener('pointermove', moveu);
      window.removeEventListener('pointerup', largou);
      el.removeEventListener('click', clicou, true);
      observador?.disconnect();
    };
  }, []);

  const deslizar = (sentido: 1 | -1) => {
    const bruto = ref.current;
    const el: HTMLElement | null = bruto?.getScrollableNode?.() ?? bruto ?? null;
    if (!el) return;
    // Quase um ecra de cada vez, deixando um cartao a espreitar — e assim que
    // se percebe que a lista continua.
    const salto = Math.max(200, el.clientWidth - 168);
    const suave = typeof window !== 'undefined'
      && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    el.scrollBy({ left: sentido * salto, behavior: suave ? 'smooth' : 'auto' });
  };

  return { ref, podeEsquerda, podeDireita, deslizar, arrastou };
}

function SetaDaPrateleira({ sentido, activa, aoCarregar }: {
  sentido: 1 | -1; activa: boolean; aoCarregar: () => void;
}) {
  return <P
    accessibilityLabel={sentido === 1 ? 'Show more' : 'Show previous'}
    disabled={!activa}
    onPress={aoCarregar}
    style={({ hovered }: any) => [ui.shelfSeta, !activa && ui.shelfSetaInactiva, hovered && activa && ui.shelfSetaHover]}>
    <Ionicons name={sentido === 1 ? 'chevron-forward' : 'chevron-back'} size={15}
      color={activa ? COR.texto : COR.textoFraco} />
  </P>;
}

/**
 * Duas ou três vistas da mesma página, lado a lado ("Discover | Songs of the
 * day"). É o mesmo comprimido do telemóvel, com os tokens do PC.
 */
export function Separadores<T extends string>({ opcoes, valor, aoMudar }: {
  opcoes: readonly (readonly [T, string])[]; valor: T; aoMudar: (v: T) => void;
}) {
  // A pílula DESLIZA de um separador para o outro em vez de acender no novo e
  // apagar no velho. Para isso é preciso saber onde eles estão: cada um diz a
  // sua posição no `onLayout`, e a pílula é uma vista à parte por baixo deles.
  // Sem medidas ainda (primeira renderização), não se desenha nada -- uma
  // pílula em 0,0 a saltar para o sítio certo era pior do que não a ter.
  const [medidas, setMedidas] = useState<Record<string, { x: number; largura: number }>>({});
  const aqui = medidas[valor];
  return <View accessibilityRole={'tablist' as any} style={ui.separadores}>
    {aqui ? <View pointerEvents="none" {...{ className: 'dt-desliza' }}
      style={[ui.separadorPilula, { width: aqui.largura, transform: [{ translateX: aqui.x }] }]} /> : null}
    {opcoes.map(([v, rotulo]) => {
      const activo = v === valor;
      return <P key={v} accessibilityRole="tab" accessibilityState={{ selected: activo }} onPress={() => aoMudar(v)}
        onLayout={(e: any) => {
          const { x, width } = e.nativeEvent.layout;
          setMedidas((m) => (m[v]?.x === x && m[v]?.largura === width ? m : { ...m, [v]: { x, largura: width } }));
        }}
        style={({ hovered }: any) => [ui.separador, !activo && hovered && ui.separadorHover]}>
        <Text style={[ui.separadorTexto, activo && ui.separadorTextoActivo]}>{rotulo}</Text>
      </P>;
    })}
  </View>;
}

/** O lado mínimo de uma capa na grelha; o real estica para a linha acabar na borda. */
const CAPA_MINIMA_DA_GRELHA = 150;

export function Shelf({ titulo, nota, tracks, onPlay, onMore, selo, contexto, grelha }: {
  titulo: string; nota?: string; tracks: Track[];
  onPlay: (track: Track, fila: Track[], discoveryContext?: DiscoveryContext, origem?: OrigemDaFila) => void; onMore?: (track: Track, discoveryContext?: DiscoveryContext) => void;
  /** Uma etiqueta por cima de cada capa ("New to you"). Só onde é uma promessa cumprida. */
  selo?: string;
  contexto?: (track:Track)=>DiscoveryContext;
  /**
   * A prateleira principal em GRELHA, e não em carrossel: todas as faixas à
   * vista, em linhas de capas que enchem a largura.
   *
   * Uma página de descoberta vive de haver muito por onde escolher (o João, a
   * 18/9: "quero que os users tenham muita seleção disponível"), e num
   * carrossel quase tudo fica escondido atrás de uma seta. A 1920x1080 são nove
   * capas por linha. Mudar a forma da primeira prateleira é também o que diz
   * "isto aqui é outra coisa" -- a decisão que o telemóvel já tinha tomado com
   * a lista do `renderRecommendationSection`.
   */
  grelha?: boolean;
}) {
  const { ref, podeEsquerda, podeDireita, deslizar, arrastou } = useCarrossel();
  const [larguraDaGrelha, setLarguraDaGrelha] = useState(0);
  if (!tracks.length) return null;
  const rola = podeEsquerda || podeDireita;
  if (grelha) {
    // Quantas cabem com o lado mínimo, e depois o lado estica para a linha
    // acabar na borda -- sem sobra à direita a qualquer largura.
    const colunas = larguraDaGrelha > 0
      ? Math.max(2, Math.floor((larguraDaGrelha + ESP.lg) / (CAPA_MINIMA_DA_GRELHA + ESP.lg)))
      : 8;
    const lado = larguraDaGrelha > 0
      ? Math.floor((larguraDaGrelha - ESP.lg * (colunas - 1)) / colunas)
      : CAPA_MINIMA_DA_GRELHA;
    return <View style={{ marginBottom: ESP.xxl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.md, marginBottom: ESP.md }}>
        <Text style={ui.shelfTitle}>{titulo}</Text>
        {nota ? <Text style={ui.shelfNota}>{nota}</Text> : null}
      </View>
      <View style={ui.grelhaDeCapas} onLayout={(e) => setLarguraDaGrelha(e.nativeEvent.layout.width)}>
        {tracks.map((t) => (
          <P key={`${t.source}:${t.sourceId}`}
            onPress={() => onPlay(t, tracks, contexto?.(t), { tipo: 'prateleira', nome: titulo })}
            onContextMenu={((e: any) => { e.preventDefault(); onMore?.(t, contexto?.(t)); }) as any}
            style={({ hovered, pressed }: any) => [ui.shelfCard, { width: lado }, hovered && ui.shelfCardHover, pressed && ui.pressed]}>
            <View>
              <Artwork track={t} size={lado} />
              {selo ? <View style={ui.shelfSelo} pointerEvents="none"><Text style={ui.shelfSeloTexto}>{selo}</Text></View> : null}
            </View>
            <Text numberOfLines={1} style={ui.shelfCardTitle}>{tituloDaFaixa(t)}</Text>
            <Text numberOfLines={1} style={ui.shelfCardArtista}>{displayArtist(t)}</Text>
          </P>
        ))}
      </View>
    </View>;
  }
  return <View style={{ marginBottom: ESP.xxl }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.md, marginBottom: ESP.md }}>
      <Text style={ui.shelfTitle}>{titulo}</Text>
      {nota ? <Text style={ui.shelfNota}>{nota}</Text> : null}
      {/* As setas ficam ao pe do titulo e nao sobrepostas aos cartoes: por cima
          tapavam capas, e so aparecerem a passagem do rato e precisamente o que
          torna um carrossel dificil de descobrir. Ficam SEMPRE visiveis quando
          ha mais para ver, e apagadas na ponta onde ja nao da para andar. */}
      <View style={{ flex: 1 }} />
      {rola ? (
        <View style={{ flexDirection: 'row', gap: ESP.sm }}>
          <SetaDaPrateleira sentido={-1} activa={podeEsquerda} aoCarregar={() => deslizar(-1)} />
          <SetaDaPrateleira sentido={1} activa={podeDireita} aoCarregar={() => deslizar(1)} />
        </View>
      ) : null}
    </View>
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: ESP.lg, paddingRight: ESP.xxxl }}>
      {tracks.map((t) => (
        <P key={`${t.source}:${t.sourceId}`}
          onPress={() => { if (arrastou.current) return; onPlay(t, tracks, contexto?.(t), { tipo: 'prateleira', nome: titulo }); }}
          onContextMenu={((e: any) => { e.preventDefault(); onMore?.(t,contexto?.(t)); }) as any}
          style={({ hovered, pressed }: any) => [ui.shelfCard, hovered && ui.shelfCardHover, pressed && ui.pressed]}>
          <View>
            <Artwork track={t} size={148} />
            {selo ? <View style={ui.shelfSelo} pointerEvents="none"><Text style={ui.shelfSeloTexto}>{selo}</Text></View> : null}
          </View>
          <Text numberOfLines={1} style={ui.shelfCardTitle}>{tituloDaFaixa(t)}</Text>
          <Text numberOfLines={1} style={ui.shelfCardArtista}>{displayArtist(t)}</Text>
        </P>
      ))}
    </ScrollView>
  </View>;
}

/**
 * Uma prateleira de MISTURAS -- estilos, radios, decadas, playlists.
 *
 * O mesmo carrossel da `Shelf` aqui em cima, com as mesmas setas e o mesmo
 * arrasto: o que muda e o cartao. Uma mistura nao tem capa propria, por isso
 * leva o mosaico de quatro que o telemovel ja usa (ver o `renderPrateleiraDeMisturas`
 * no `SearchScreen`) -- uma capa so seria a de uma musica a fingir que
 * representa vinte e cinco.
 *
 * O clique ABRE, nao toca. Uma mistura e uma lista, e uma lista abre-se; o
 * `onPlay` fica para quem quiser tocar a coisa inteira a partir de dentro.
 */
export function PrateleiraDeMisturas({ titulo, nota, misturas, aoAbrir }: {
  titulo: string; nota?: string;
  misturas: readonly { id: string; nome: string; faixas: Track[] }[];
  aoAbrir: (mistura: { id: string; nome: string }) => void;
}) {
  const { ref, podeEsquerda, podeDireita, deslizar, arrastou } = useCarrossel();
  if (!misturas.length) return null;
  const rola = podeEsquerda || podeDireita;
  return <View style={{ marginBottom: ESP.xxl }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.md, marginBottom: ESP.md }}>
      <Text style={ui.shelfTitle}>{titulo}</Text>
      {nota ? <Text style={ui.shelfNota}>{nota}</Text> : null}
      <View style={{ flex: 1 }} />
      {rola ? (
        <View style={{ flexDirection: 'row', gap: ESP.sm }}>
          <SetaDaPrateleira sentido={-1} activa={podeEsquerda} aoCarregar={() => deslizar(-1)} />
          <SetaDaPrateleira sentido={1} activa={podeDireita} aoCarregar={() => deslizar(1)} />
        </View>
      ) : null}
    </View>
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: ESP.lg, paddingRight: ESP.xxxl }}>
      {misturas.map((m) => (
        <P key={m.id}
          onPress={() => { if (arrastou.current) return; aoAbrir(m); }}
          style={({ hovered, pressed }: any) => [ui.shelfCard, hovered && ui.shelfCardHover, pressed && ui.pressed]}>
          <View style={ui.mosaico}>
            {[0, 1, 2, 3].map((i) => {
              const capa = m.faixas[i]?.artworkUrl;
              return capa
                ? <Image key={i} source={{ uri: capa }} style={ui.mosaicoCelula} resizeMode="cover" />
                : <View key={i} style={ui.mosaicoCelula} />;
            })}
          </View>
          <Text numberOfLines={1} style={ui.shelfCardTitle}>{m.nome}</Text>
          <Text numberOfLines={1} style={ui.shelfCardArtista}>
            {m.faixas.length} {m.faixas.length === 1 ? 'song' : 'songs'}
          </Text>
        </P>
      ))}
    </ScrollView>
  </View>;
}

const LINHAS_INICIAIS = 200;
const PASSO_DE_LINHAS = 200;
const linhasVisiveisPorLista = new Map<string, number>();

export function TrackTable({ tracks, onPlay, onMore, empty, showSavedBadge = false, plain = false, listKey, contexto }: {
  tracks: Track[]; onPlay: (track: Track, discoveryContext?: DiscoveryContext) => void; onMore?: (track: Track, discoveryContext?: DiscoveryContext) => void; empty?: ReactNode;
  /** Marcar as que já estão na biblioteca. Só em listas que misturam
   * guardadas e não guardadas (pesquisa) — na tabela de Songs seria um
   * coração em todas as linhas. */
  showSavedBadge?: boolean;
  /** Lista aberta, sem o aspeto de uma caixa dentro da página. */
  plain?: boolean;
  /** Identidade persistente para não voltar às primeiras 200 linhas ao regressar. */
  listKey?: string;
  contexto?: (track:Track)=>DiscoveryContext;
}) {
  // Subscrito sempre (regras dos hooks); sem a badge o seletor devolve um
  // Set vazio estável, por isso a tabela não redesenha à toa.
  const savedKeys = useSaved((s) => (showSavedBadge ? s.keys : EMPTY_KEYS));
  const [limite, setLimite] = useState(() => listKey
    ? (linhasVisiveisPorLista.get(listKey) ?? LINHAS_INICIAIS)
    : LINHAS_INICIAIS);
  useEffect(() => {
    const guardado = listKey ? linhasVisiveisPorLista.get(listKey) : undefined;
    setLimite(guardado ?? LINHAS_INICIAIS);
  }, [listKey]);
  // A preferencia "Show track duration" das Definicoes so era respeitada no
  // telemovel (TrackRow); aqui a coluna aparecia sempre. Cache sincrono, como
  // no mobile: aplica-se na proxima renderizacao da tabela.
  const showTime = isShowTrackDurationSync();
  // A faixa que toca ganha a cor de destaque e as barrinhas no lugar do
  // número. Só o `current` interessa: ler a posição aqui redesenhava a lista
  // inteira a cada segundo.
  const atual = usePlayer((st) => st.current);
  if (!tracks.length) return <>{empty}</>;
  const artworkSize = plain ? 48 : 40;
  const visiveis = tracks.slice(0, limite);
  const mostrarMais = () => setLimite((atual) => {
    const seguinte = Math.min(tracks.length, atual + PASSO_DE_LINHAS);
    if (listKey) linhasVisiveisPorLista.set(listKey, seguinte);
    return seguinte;
  });
  return <View style={[ui.table, plain && ui.tablePlain]} {...{ className: 'dt-lista' }}><View style={[ui.tableHeader, plain && ui.tableHeaderPlain]}><Text numberOfLines={1} style={[ui.colHead, { width: 40 }]}>#</Text><Text numberOfLines={1} style={[ui.colHead, { flex: 1 }]}>Track</Text>{showTime && <Text numberOfLines={1} style={[ui.colHead, { width: LARGURA_DURACAO, textAlign: 'right' }]}>Duration</Text>}<View style={{ width: 42 }} /></View>
    {visiveis.map((track, index) => {
      const aTocar = !!atual && atual.source === track.source && atual.sourceId === track.sourceId;
      return <P key={`${track.source}:${track.sourceId}`} onPress={() => onPlay(track,contexto?.(track))}
      onContextMenu={((event: any) => { event.preventDefault(); onMore?.(track,contexto?.(track)); }) as any}
      {...{ className: 'dt-fila' }}
      style={({ hovered, pressed, focused }: any) => [ui.trackRow, plain && ui.trackRowPlain, (hovered || focused) && ui.trackHover, pressed && ui.pressed]}>
      {/* O número, o ▶ e as barrinhas ocupam o MESMO lugar: quem troca entre
          eles é o CSS (`dt-fila`), porque uma troca feita em JS obrigava a um
          estado de hover por linha -- duzentas linhas, duzentos estados. */}
      <View style={ui.celaDoNumero}>
        {aTocar ? (
          <View style={ui.barrasATocar} {...{ className: 'dt-barras' }}>
            <View style={ui.barraATocar} {...{ className: 'dt-barra' }} />
            <View style={ui.barraATocar} {...{ className: 'dt-barra' }} />
            <View style={ui.barraATocar} {...{ className: 'dt-barra' }} />
          </View>
        ) : <>
          <Text style={ui.trackIndex} {...{ className: 'dt-numero' }}>{index + 1}</Text>
          <View style={ui.setaDeTocar} pointerEvents="none" {...{ className: 'dt-toca' }}>
            <Ionicons name="play" size={13} color={COR.texto} />
          </View>
        </>}
      </View>
      <View style={[ui.trackTitleCell, { flex: 1 }]}>
        <Artwork track={track} size={artworkSize} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[ui.trackTitle, aTocar && ui.trackTitleATocar]}>{tituloDaFaixa(track)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <Text numberOfLines={1} style={ui.trackSource}>{displayArtist(track)}</Text>
            {savedKeys.has(`${track.source}:${track.sourceId}`) && <Ionicons name="heart" size={10} color={COR.texto} />}
            {contexto?<><Text style={ui.discoveryDot}>·</Text><Text numberOfLines={1} style={ui.discoveryReason}>{contexto(track).reason}</Text></>:null}
          </View>
        </View>
      </View>
      {showTime && <Text numberOfLines={1} style={[ui.trackMeta, { width: LARGURA_DURACAO, textAlign: 'right' }]}>{formatTime(track.durationSeconds)}</Text>}
      <View {...{ className: 'dt-mais' }}>
        <IconButton name="ellipsis-horizontal" label={`Actions for ${track.title}`} onPress={() => onMore?.(track,contexto?.(track))} />
      </View></P>;
    })}
    {visiveis.length < tracks.length && <View style={{ alignItems: 'center', paddingVertical: ESP.xl, gap: ESP.sm }}>
      <Text style={{ color: desktop.dim }}>{visiveis.length} of {tracks.length} tracks shown</Text>
      <Button secondary onPress={mostrarMais}>Show next {Math.min(PASSO_DE_LINHAS, tracks.length - visiveis.length)}</Button>
    </View>}
  </View>;
}

export function Dialog({ open, title, children, onClose, width = 460 }: { open: boolean; title: string; children: ReactNode; onClose: () => void; width?: number }) {
  useEffect(() => { if (!open) return; const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, [open, onClose]);
  if (!open) return null;
  return <View style={ui.dialogLayer} {...{ className: 'dt-veu' }}><P style={StyleSheet.absoluteFill} onPress={onClose} /><View style={[ui.dialog, { width, maxWidth: 'calc(100vw - 48px)' as any }]} {...{ className: 'dt-dialogo' }}><View style={ui.dialogHeader}><Text style={ui.dialogTitle}>{title}</Text><IconButton name="close" label="Close dialog" onPress={onClose} /></View>{children}</View></View>;
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  // O DesktopShell redesenha varias vezes por segundo enquanto a musica toca.
  // `onDone` chega como funcao inline, portanto inclui-lo nas dependencias
  // reiniciava o temporizador para sempre e o aviso nunca desaparecia.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => { const id = setTimeout(() => onDoneRef.current(), 3200); return () => clearTimeout(id); }, [message]);
  const lower = message.toLowerCase();
  const warning = /failed|could not|not found|unavailable|skipping|deleted/.test(lower);
  const information = /looking|checking|available/.test(lower);
  const icon = warning ? 'alert-circle' : information ? 'information-circle' : 'checkmark-circle';
  const colour = warning ? COR.aviso : information ? COR.metalClaro : COR.ok;
  return <View style={ui.toast} {...{ className: 'dt-aviso' }}><Ionicons name={icon} size={18} color={colour} /><Text style={ui.toastText}>{message}</Text></View>;
}

/**
 * Estilos dos componentes partilhados — fase 3 do redesenho.
 *
 * Todos os valores saem de tokens.web.ts. O que isto substitui, contado no
 * codigo antes de existir: seis raios diferentes so aqui, sete tamanhos de
 * letra, quatro pesos, e tres superficies marteladas fora da paleta
 * (#181820, #202029, rgba(16,16,22,.72)) mais um terceiro roxo (#7C5CE5).
 *
 * A familia da letra vai EXPLICITA em cada estilo de texto. Nao e por gosto:
 * o react-native-web impoe a stack dele a cada <Text> e ganha a declaracao do
 * body — foi por isso que a app passou a vida a renderizar em Segoe UI
 * enquanto o CSS pedia outra coisa.
 */
export const ui = StyleSheet.create({
  page: { flex: 1, minWidth: 0 },
  pageHeader: {
    minHeight: 128, paddingHorizontal: ESP.xxxl, paddingTop: ESP.xxl, paddingBottom: ESP.xl,
    flexDirection: 'row', alignItems: 'flex-end', gap: ESP.xl,
    // O react-native-web deixa passar as propriedades de transição do CSS; a
    // curva é a mesma do resto do PC (ver a `casca.web.tsx`).
    transitionProperty: 'min-height, padding-top, padding-bottom',
    transitionDuration: '180ms', transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)',
  } as any,
  pageHeaderCurto: { minHeight: 74, paddingTop: ESP.lg, paddingBottom: ESP.md },
  tituloCurto: { fontSize: 20 },
  subtituloEscondido: { opacity: 0, maxHeight: 0, marginTop: 0, overflow: 'hidden' } as any,
  // A sobrancelha usa a mono: e uma etiqueta, nao prosa.
  eyebrow: { ...TIPO.micro, color: COR.textoFraco, marginBottom: ESP.sm },
  title: { ...TIPO.display, color: COR.texto, lineHeight: 40 },
  subtitle: { ...TIPO.corpo, color: COR.textoMedio, marginTop: ESP.sm, lineHeight: 21 },
  scrollContent: { paddingHorizontal: ESP.xxxl, paddingBottom: ESP.xxxl },

  iconButton: { width: 34, height: 34, borderRadius: RAIO.cartao, alignItems: 'center', justifyContent: 'center' },
  iconButtonHover: { backgroundColor: COR.hover },
  active: { backgroundColor: COR.metalSuave },
  pressed: { opacity: .72, transform: [{ scale: .985 }] },
  disabled: { opacity: .42 },

  // O botao primario e LUZ, nao cor: e a tese da identidade aplicada ao
  // controlo mais visivel da interface.
  // `overflow: hidden` para o brilho do modo inteligente ser recortado por
  // este botao: ele estica-se pelo pai e nao tem forma propria.
  button: { minHeight: 38, overflow: 'hidden', paddingHorizontal: ESP.lg, borderRadius: RAIO.cartao, backgroundColor: COR.metalClaro, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ESP.sm, borderWidth: 1, borderColor: 'transparent' },
  buttonSecondary: { backgroundColor: 'transparent', borderColor: COR.linha },
  buttonMarcado: { backgroundColor: COR.metalSuave, borderColor: 'rgba(233,234,238,0.28)' },
  buttonDanger: { backgroundColor: 'rgba(190,95,98,.14)', borderColor: 'rgba(190,95,98,.45)' },
  buttonHover: { opacity: .88 },
  buttonText: { ...TIPO.corpo, fontWeight: '600' as any, color: COR.fundo },
  buttonTextSec: { color: COR.texto },
  buttonTextDanger: { color: COR.erro },

  fieldWrap: { height: 42, borderRadius: RAIO.cartao, borderWidth: 1, borderColor: COR.linha, backgroundColor: COR.elevado, flexDirection: 'row', alignItems: 'center', paddingHorizontal: ESP.md, gap: ESP.sm },
  field: { flex: 1, minWidth: 0, ...TIPO.corpo, color: COR.texto, outlineStyle: 'none' } as any,

  empty: { minHeight: 330, alignItems: 'center', justifyContent: 'center', padding: ESP.xxl },
  emptyIcon: { width: 60, height: 60, borderRadius: RAIO.superficie, backgroundColor: COR.elevado, borderWidth: 1, borderColor: COR.linhaSuave, alignItems: 'center', justifyContent: 'center', marginBottom: ESP.lg },
  emptyTitle: { ...TIPO.seccao, color: COR.texto, marginBottom: ESP.sm },
  emptyBody: { ...TIPO.legenda, color: COR.textoMedio, lineHeight: 19, maxWidth: 420, textAlign: 'center', marginBottom: ESP.lg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: ESP.md },
  loadingText: { ...TIPO.legenda, color: COR.textoMedio },

  table: { borderWidth: 1, borderColor: COR.linhaSuave, borderRadius: RAIO.cartao, overflow: 'hidden', backgroundColor: COR.painel },
  tablePlain: { borderWidth: 0, borderRadius: 0, backgroundColor: 'transparent', overflow: 'visible' },
  tableHeader: { height: 38, paddingHorizontal: ESP.md, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COR.linhaSuave },
  tableHeaderPlain: { paddingHorizontal: ESP.sm, borderTopWidth: 1, borderTopColor: COR.linhaSuave },
  // Redondo e discreto: e um atalho, nao um controlo do formulario.
  fieldLimpar: { width: 22, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  // A marca de modo (o "1" do repeat) vive no canto, como a estrelinha do
  // shuffle inteligente: mesma gramatica para a mesma ideia.
  marcaDeModo: { position: 'absolute', top: 3, right: 3, minWidth: 11, height: 11, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: COR.texto },
  marcaDeModoTexto: { fontFamily: FONT.mono, fontSize: 8, lineHeight: 11, fontWeight: '700' as any, color: COR.fundo },
  colHead: { ...TIPO.micro, color: COR.textoFraco, paddingHorizontal: ESP.sm },
  // Altura unica em toda a app. Havia 62, 52 e 38 conforme o ecra, o que se
  // lia como tres aplicacoes diferentes.
  trackRow: { minHeight: LINHA_LISTA, paddingHorizontal: ESP.md, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COR.linhaSuave },
  // Era 68: uma lista de músicas com linhas de altura de cartão. Com 56 cabem
  // mais três no ecrã e a coluna continua a respirar.
  trackRowPlain: { minHeight: 56, paddingHorizontal: ESP.sm, borderRadius: RAIO.cartao, borderBottomWidth: 0 },
  trackHover: { backgroundColor: COR.hover },
  trackIndex: { ...TIPO.numero, color: COR.textoFraco, textAlign: 'center' },
  /** O lugar onde o número, o ▶ e as barrinhas se sobrepõem. */
  celaDoNumero: { width: 40, alignItems: 'center', justifyContent: 'center' },
  setaDeTocar: { position: 'absolute', alignItems: 'center', justifyContent: 'center' } as any,
  barrasATocar: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14 },
  barraATocar: { width: 2, height: 4, borderRadius: 1, backgroundColor: COR.metalClaro },
  trackTitleATocar: { color: COR.metalClaro },
  trackTitleCell: { flexDirection: 'row', alignItems: 'center', gap: ESP.md, paddingHorizontal: ESP.sm, minWidth: 150 },
  trackTitle: { ...TIPO.corpo, color: COR.texto, fontWeight: '500' as any },
  trackSource: { ...TIPO.legenda, color: COR.textoMedio },
  discoveryDot: { ...TIPO.legenda, color: COR.textoFraco },
  discoveryReason: { ...TIPO.legenda, color: COR.textoFraco, flexShrink: 1 },
  trackMeta: { ...TIPO.legenda, color: COR.textoMedio, paddingHorizontal: ESP.sm },
  artFallback: { borderRadius: RAIO.ctrl, backgroundColor: COR.elevado, alignItems: 'center', justifyContent: 'center' },

  dialogLayer: { position: 'absolute', inset: 0, zIndex: 100, backgroundColor: 'rgba(3,3,4,.72)', alignItems: 'center', justifyContent: 'center' } as any,
  dialog: { padding: ESP.xl, borderRadius: RAIO.superficie, backgroundColor: COR.painel, borderWidth: 1, borderColor: COR.linha, boxShadow: '0 28px 90px rgba(0,0,0,.7)' } as any,
  dialogHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: ESP.lg },
  dialogTitle: { flex: 1, ...TIPO.seccao, color: COR.texto },

  shelfTitle: { ...TIPO.titulo, color: COR.texto },
  shelfNota: { ...TIPO.legenda, color: COR.textoFraco },
  shelfCard: { width: 148, borderRadius: RAIO.cartao, gap: 2 },
  // Antes era `opacity: .82`: passar o rato APAGAVA a capa. Agora aproxima-se
  // e acende, que é o que um cartão faz quando responde.
  shelfCardHover: { transform: [{ translateY: -3 }], filter: 'brightness(1.08)' } as any,

  /**
   * A lista da prateleira principal. Duas colunas em qualquer largura útil, e
   * a hierarquia é a da música: capa, título, artista, e por fim o motivo --
   * que fica à direita, apagado, porque é a última coisa que alguém lê.
   */
  grelhaDeCapas: { flexDirection: 'row', flexWrap: 'wrap', columnGap: ESP.lg, rowGap: ESP.xl } as any,
  // Sem borda e mais pequeno: cinco capas com uma etiqueta de contorno claro
  // liam-se como cinco autocolantes, e o que interessa na prateleira é a capa.
  shelfSelo: {
    position: 'absolute', top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: RAIO.ctrl, backgroundColor: 'rgba(6,6,8,0.62)',
  },
  shelfSeloTexto: { fontFamily: FONT.mono, fontSize: 8, letterSpacing: 1, textTransform: 'uppercase', color: COR.textoMedio },
  separadores: {
    flexDirection: 'row', alignSelf: 'flex-start', gap: 2, padding: 3, marginBottom: ESP.lg,
    borderRadius: RAIO.pilula, backgroundColor: COR.elevado, borderWidth: 1, borderColor: COR.linhaSuave,
  },
  separador: { minHeight: 30, justifyContent: 'center', paddingHorizontal: ESP.md, borderRadius: RAIO.pilula },
  separadorHover: { backgroundColor: COR.linhaSuave },
  separadorActivo: { backgroundColor: COR.hover },
  /** A pílula que anda por baixo dos separadores. Absoluta, para o texto não
   * se mexer enquanto ela atravessa. */
  separadorPilula: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: RAIO.pilula, backgroundColor: COR.hover } as any,
  separadorTexto: { ...TIPO.legenda, color: COR.textoMedio },
  separadorTextoActivo: { color: COR.texto, fontWeight: '600' as any },
  shelfSeta: {
    width: 26, height: 26, borderRadius: RAIO.pilula,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COR.elevado, borderWidth: 1, borderColor: COR.linha,
  },
  shelfSetaHover: { backgroundColor: COR.hover },
  // Apagada, mas continua la: uma seta que DESAPARECE na ponta faz as outras
  // saltarem de sitio, e a que sobra passa a estar onde estava a outra.
  shelfSetaInactiva: { opacity: .35 },
  // O mesmo mosaico do telemovel: quatro celulas de metade do lado, com o
  // fundo a fazer de celula vazia quando a mistura tem menos de quatro capas.
  mosaico: {
    width: 148, height: 148, flexDirection: 'row', flexWrap: 'wrap',
    borderRadius: RAIO.cartao, overflow: 'hidden', backgroundColor: COR.elevado,
  },
  mosaicoCelula: { width: '50%', height: '50%' },
  shelfCardTitle: { ...TIPO.corpo, color: COR.texto, fontWeight: '500' as any, marginTop: ESP.sm },
  shelfCardArtista: { ...TIPO.legenda, color: COR.textoMedio },

  toast: { position: 'absolute', right: ESP.xl, bottom: 110, zIndex: 110, minHeight: 42, paddingHorizontal: ESP.lg, borderRadius: RAIO.cartao, backgroundColor: COR.elevado, borderWidth: 1, borderColor: COR.linha, flexDirection: 'row', alignItems: 'center', gap: ESP.sm, boxShadow: '0 12px 34px rgba(0,0,0,.5)' } as any,
  toastText: { ...TIPO.legenda, color: COR.texto },
});
