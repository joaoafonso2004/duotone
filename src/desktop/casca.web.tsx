import { closePlayerSmoothly, confirmaSwipe } from '../lib/closePlayer';
import { FriendAvatar } from '../components/FriendAvatar';
import { getPublicProfiles } from '../api/profiles';
import { useSocial } from '../state/social';
import { naoLidasPorAmigo } from '../lib/social';
import { useReducedMotion } from '../hooks/useReducedMotion';
/**
 * A casca da janela: barra de título, barra lateral e barra do leitor.
 *
 * O CSS do documento também vive aqui — as fontes são embutidas
 * (`assets/fonts`) e registadas em `@font-face`, nunca por CDN: a app tem de
 * abrir igual sem rede. E a família vai EXPLÍCITA em cada estilo de texto,
 * porque o react-native-web impõe a stack dele a cada `<Text>`.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { YouTubePlayerView } from '../components/YouTubePlayerView';
import { BarreiraDeErros } from '../components/BarreiraDeErros';
import { modoDeShuffle, rotuloDoModo } from '../lib/smartShuffle';
import { useAuth } from '../state/auth';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { usePlayer } from '../state/player';
import { useShallow } from 'zustand/react/shallow';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { useTheme } from '../state/theme';
import { styles } from './estilos.web';
import { COR, FONT, FONTES } from './tokens.web';
import { Artwork, desktop, formatTime, IconButton, ui, marcar, useProcurarAoLargar } from './ui.web';
import { PRIMARY, type Route } from './rotas';
import { IndicadorDeVisibilidade } from './IndicadorDeVisibilidade.web';
import { AmigosNaLateral } from './AmigosNaLateral.web';
import { AtalhosNaLateral } from './AtalhosNaLateral.web';
import { ProgressoDaImportacao } from './ProgressoDaImportacao.web';

const P = Pressable as any;
const V = View as any;

export function injectDesktopDocumentStyles() {
  if (document.getElementById('duotone-desktop-css')) return;

  // As fontes sao embutidas (assets/fonts) e registadas aqui. O `require` de
  // um asset devolve formas diferentes conforme a plataforma e a versao do
  // Metro — string, objeto com `uri`, ou modulo com `default` — por isso
  // normaliza-se em vez de assumir.
  const uri = (m: any): string =>
    typeof m === 'string' ? m : m?.uri || m?.default?.uri || m?.default || '';

  const face = (familia: string, mod: any, alcance: string) =>
    `@font-face{font-family:'${familia}';font-style:normal;font-weight:100 900;` +
    `font-display:swap;src:url(${uri(mod)}) format('woff2');unicode-range:${alcance};}`;

  const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

  const fontes = document.createElement('style');
  fontes.id = 'duotone-fonts';
  fontes.textContent = [
    face('Archivo', FONTES.archivo.latin, LATIN),
    face('Archivo', FONTES.archivo.latinExt, LATIN_EXT),
    face('Public Sans', FONTES.publicSans.latin, LATIN),
    face('Public Sans', FONTES.publicSans.latinExt, LATIN_EXT),
    face('JetBrains Mono', FONTES.jetbrainsMono.latin, LATIN),
    face('JetBrains Mono', FONTES.jetbrainsMono.latinExt, LATIN_EXT),
  ].join('');
  document.head.appendChild(fontes);

  const style = document.createElement('style');
  style.id = 'duotone-desktop-css';
  style.textContent = `
    html,body,#root{width:100%;height:100%;margin:0;overflow:hidden;background:#060608}
    *{box-sizing:border-box}
    /* Declarar no body NAO chega: o react-native-web poe a stack dele em cada
       <Text>. Por isso os estilos usam FONT.* explicitamente (ver tokens).
       Isto so trata do que nao passa por componentes RN. */
    body{font-family:${FONT.body};-webkit-font-smoothing:antialiased}
    input,textarea,button{font-family:${FONT.body}}
    /* NAO por uma regra global aqui.
       Uma regra como '#root div, #root span' tem especificidade 2 e ganha aos
       proprios componentes — impedia os estilos de escolherem a sua fonte, e
       a sobrancelha em mono saia em Public Sans. A familia vai EXPLICITA em
       cada estilo de texto (ver TIPO em tokens.web.ts). */
    ::selection{background:rgba(233,234,238,.24)} ::-webkit-scrollbar{width:11px;height:11px}
    ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#30303b;border:3px solid transparent;border-radius:8px;background-clip:padding-box}
    ::-webkit-scrollbar-thumb:hover{background:#494857;border:3px solid transparent;background-clip:padding-box}
    [data-focusable="true"]:focus-visible{outline:2px solid var(--accent-color, #E9EAEE)!important;outline-offset:-2px}
    [data-dt~="calha"] { position: relative; }
    [data-dt~="calha"]:hover [data-dt~="cheio"] { background: var(--accent-color, #E9EAEE)!important; }
    [data-dt~="pega"] {
      position: absolute;
      top: 50%;
      width: 12px;
      height: 12px;
      border-radius: 6px;
      background-color: #FFF;
      transform: translate(-50%, -50%) scale(0);
      transition: transform 0.15s cubic-bezier(0.25, 0.8, 0.25, 1);
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      pointer-events: none;
    }
    [data-dt~="calha"]:hover [data-dt~="pega"] {
      transform: translate(-50%, -50%) scale(1);
    }
    /* Aqui vivia o "vidro": um backdrop-filter de 28px na superficie inteira.
       Nunca chegou a correr (vinha por className, que o RNW deita fora), e
       quando passou a correr, na 3.7.1, a app ficou pesada -- um
       backdrop-filter do tamanho da janela refaz-se a cada pintura, e esta
       janela tem sempre alguma coisa a mexer. Nao faz falta: o que esta por
       tras e o wallpaper, que ja leva um blur ESTATICO no proprio estilo da
       imagem (backgroundImage, em estilos.web.ts), calculado uma vez. O blur
       da imagem subiu de 8 para 16 px para o que se ve atraves do painel
       ficar onde estava. E a mesma decisao que o iPhone ja tinha tomado --
       ver "Aquecimento e bateria" no CLAUDE.md. */
    /* O cintilar do modo inteligente.
       Em CSS e nao com o Animated do React Native: sob react-native-web o
       Animated nao mexeu nos pontos -- medido no browser, a opacidade ficava
       presa no valor inicial e forcar o valor a mao FICAVA, ou seja nao havia
       nada a animar por cima. No telemovel o Animated corre bem e e o que la
       fica; aqui manda o CSS. */
    /* As particulas do modo inteligente atravessam da direita para a
       esquerda. A camada tem o dobro da largura e leva o campo duas vezes,
       por isso deslizar -50% cai num sitio onde a imagem e igual e o ciclo
       nao se ve. */
    @keyframes duotone-atravessar {
      from { transform: translateX(0); }
      to   { transform: translateX(-50%); }
    }
    @keyframes duotone-respirar {
      0%, 100% { opacity: .35; }
      50%      { opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      /* Quem pediu menos movimento nao leva pontos a piscar. O seletor apanha
         qualquer elemento com este keyframe, porque o react-native-web nao
         deixa passar classes nossas. */
      *[style*="duotone-atravessar"], *[style*="duotone-respirar"] { animation: none !important; opacity: .5 !important; }
    }
    /* A bolinha das mensagens por ler (BolinhaDeAviso). Cresce e acende devagar,
       em vez de piscar: chama o olho sem ser um alarme. Com menos movimento a
       bolinha nem recebe a animacao -- decide-o o proprio componente. */
    @keyframes duotone-aviso-respirar {
      0%, 100% { transform: scale(.85); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
      50%      { transform: scale(1.2);  box-shadow: 0 0 8px 3px rgba(239, 68, 68, .6); }
    }
    @keyframes pulse {
      0% { opacity: 0.6; }
      50% { opacity: 1; }
      100% { opacity: 0.6; }
    }
    /* Aqui viviam as regras .btn-animate, .control-btn-animate e
       .nav-item-animate. Sairam a 20/9: nunca chegaram a aplicar-se, porque o
       className nao passa em componentes RN (ver o marca, no ui.web.tsx), e o
       que faziam esta agora no [data-dt~="premir"] -- sem o brilho roxo que
       uma delas ainda trazia da identidade antiga. */

    /* A fila do Now Playing e um <div> e nao um Pressable por causa do
       arrastar-para-reordenar (a API de drag do DOM nao passa pelo RNW). O
       hover fica em CSS pela mesma razao. */
    .np-fila-linha { transition: background-color .18s; }
    .np-fila-linha:hover { background-color: ${COR.hover}; }
    .np-fila-linha:active { cursor: grabbing; }
    /* A capa da linha mostra o ▶ ao passar o rato; a pega e o "…" aparecem. */
    .np-fila-capa { position: relative; flex: none; border-radius: 5px; overflow: hidden; }
    .np-fila-tocar { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,.5); opacity: 0; transition: opacity var(--dt-rapido) var(--dt-curva); }
    .np-fila-linha:hover .np-fila-tocar { opacity: 1; }
    .np-fila-pega, .np-fila-mais { opacity: 0; transition: opacity var(--dt-rapido) var(--dt-curva); display: flex; }
    .np-fila-linha:hover .np-fila-pega, .np-fila-linha:hover .np-fila-mais, .np-fila-pega-viva { opacity: 1; }
    .np-fila-mais { background: none; border: 0; padding: 6px; border-radius: 6px; cursor: pointer; }
    .np-fila-mais:hover { background: ${COR.hover}; }
    .np-fila-mais:focus-visible { opacity: 1; outline: 2px solid ${COR.texto}; }
    /* O fundo do Now Playing: a capa nova entra por cima da anterior. */
    [data-dt~="np-fundo"]{ animation: dt-np-fundo 700ms ease both; }
    /* A cor da capa a encher a janela ao abrir o Now Playing (26/9). */
    [data-dt~="janela-cor"]{ animation: dt-np-fundo 450ms ease both; }
    @keyframes dt-np-fundo{ from{ opacity:0 } to{ opacity:1 } }
    /* A troca de música no Now Playing (26/9): a capa nova entra por cima da
       que sai, e o título vem logo atrás. */
    [data-dt~="np-capa-entra"]{ animation: dt-np-capa-entra 460ms cubic-bezier(.2,.8,.2,1) both; }
    @keyframes dt-np-capa-entra{ from{ opacity:0; transform: scale(.975) } to{ opacity:1; transform: none } }
    [data-dt~="np-capa-sai"]{ animation: dt-np-capa-sai 600ms ease both; }
    @keyframes dt-np-capa-sai{ from{ opacity:1 } to{ opacity:0 } }
    [data-dt~="np-texto-entra"]{ animation: dt-np-texto-entra 380ms cubic-bezier(.2,.8,.2,1) 90ms both; }
    @keyframes dt-np-texto-entra{ from{ opacity:0; transform: translateY(6px) } to{ opacity:1; transform: none } }

    /* =====================================================================
       O MOVIMENTO DO PC (20/9)

       Em CSS e nao no Animated, pela razao de sempre neste ficheiro: sob o
       react-native-web o Animated nao mexe em transicoes de layout, e uma
       classe global apanha milhares de linhas sem um listener por componente.

       Tres tempos e UMA curva, para tudo parecer a mesma app:
         120 ms  o que responde ao dedo (carregar, passar o rato)
         180 ms  o que entra (linhas, dialogos, titulos)
         260 ms  o que atravessa o ecra (paginas, avisos)

       As regras ficam sempre com dois seletores ([data-dt~="fila"] [data-dt~="mais"]) e nunca
       com um: o react-native-web tambem escreve classes de uma so, e num
       empate ganha quem vier depois na folha -- que nao esta na nossa mao.
       ===================================================================== */
    :root{
      --dt-curva: cubic-bezier(.22, 1, .36, 1);
      --dt-rapido: 120ms; --dt-normal: 180ms; --dt-lento: 260ms;
    }

    /* Carregar num botao encolhe-o 3%. */
    [data-dt~="premir"]{ transition: transform var(--dt-rapido) var(--dt-curva),
      background-color var(--dt-rapido) var(--dt-curva),
      border-color var(--dt-rapido) var(--dt-curva),
      box-shadow var(--dt-normal) var(--dt-curva); }
    [data-dt~="premir"]:active{ transform: scale(.97); }

    /* As linhas de uma lista entram umas atras das outras -- so as primeiras:
       escalonar duzentas seria uma lista a montar-se durante dois segundos. */
    /* Só as PRIMEIRAS. A regra apanhava todas, e uma biblioteca de milhares
       de faixas arrancava com milhares de animacoes no mesmo fotograma -- para
       nada, porque da decima segunda para baixo ninguem as ve. */
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(-n+12),
    [data-dt~="fila"]:first-child{ animation: dt-linha var(--dt-normal) var(--dt-curva) both; }
    @keyframes dt-linha{ from{ opacity:0; transform: translateY(6px); } to{ opacity:1; transform:none; } }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(2){ animation-delay: 15ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(3){ animation-delay: 30ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(4){ animation-delay: 45ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(5){ animation-delay: 60ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(6){ animation-delay: 75ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(7){ animation-delay: 90ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(8){ animation-delay: 105ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(9){ animation-delay: 120ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(10){ animation-delay: 135ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(n+11){ animation-delay: 150ms }

    /* Na linha onde esta o rato: o numero da lugar ao play, e o "..." aparece. */
    [data-dt~="fila"] [data-dt~="numero"]{ transition: opacity var(--dt-rapido) var(--dt-curva); }
    [data-dt~="fila"] [data-dt~="toca"]{ opacity:0; transform: scale(.82);
      transition: opacity var(--dt-rapido) var(--dt-curva), transform var(--dt-rapido) var(--dt-curva); }
    [data-dt~="fila"] [data-dt~="mais"]{ opacity:0; transition: opacity var(--dt-rapido) var(--dt-curva); }
    [data-dt~="fila"]:hover [data-dt~="numero"], [data-dt~="fila"]:focus-within [data-dt~="numero"]{ opacity:0; }
    [data-dt~="fila"]:hover [data-dt~="toca"], [data-dt~="fila"]:focus-within [data-dt~="toca"]{ opacity:1; transform:none; }
    [data-dt~="fila"]:hover [data-dt~="mais"], [data-dt~="fila"]:focus-within [data-dt~="mais"]{ opacity:1; }
    /* A linha acende pelo CSS e não só pelo \`hovered\` do RNW: o rato em cima
       do artista ou do "..." (Pressables dentro dela) fazia-a apagar-se. */
    [data-dt~="lista"] [data-dt~="fila"]:hover{ background-color: ${COR.hover}; }
    /* O artista de uma linha é um link para a página dele. */
    [data-dt~="fila"] [data-dt~="artista"]{ transition: color var(--dt-rapido) var(--dt-curva); cursor: pointer; }
    [data-dt~="fila"] [data-dt~="artista"]:hover{ color: ${COR.texto}; text-decoration: underline; }
    /* Os amigos na lateral (AmigosNaLateral.web.tsx): a linha acende e o ▶
       aparece pelo CSS -- o hover do RNW caía com o rato no próprio ▶. */
    [data-dt~="amigo"]{ transition: background-color var(--dt-rapido) var(--dt-curva); cursor: pointer; }
    [data-dt~="amigo"]:hover{ background-color: ${COR.hover}; }
    [data-dt~="amigo-ouvir"]{ opacity: 0; transition: opacity var(--dt-rapido) var(--dt-curva), transform var(--dt-rapido) var(--dt-curva); }
    [data-dt~="amigo"]:hover [data-dt~="amigo-ouvir"], [data-dt~="amigo-ouvir"]:focus-visible{ opacity: 1; }
    [data-dt~="amigo-ouvir"]:hover{ transform: scale(1.08); }
    /* Os atalhos fixados (26/9): o × só com o rato na linha. */
    [data-dt~="atalho"]{ transition: background-color var(--dt-rapido) var(--dt-curva); cursor: pointer; }
    [data-dt~="atalho"]:hover{ background-color: ${COR.hover}; }
    [data-dt~="atalho-tirar"]{ opacity: 0; transition: opacity var(--dt-rapido) var(--dt-curva), background-color var(--dt-rapido) var(--dt-curva); }
    [data-dt~="atalho"]:hover [data-dt~="atalho-tirar"], [data-dt~="atalho-tirar"]:focus-visible{ opacity: 1; }
    [data-dt~="atalho-tirar"]:hover{ background-color: rgba(233,234,238,0.10); }
    /* A que esta a tocar nao esconde as barrinhas nem mostra o numero. */
    [data-dt~="fila"] [data-dt~="barras"] [data-dt~="barra"]{ animation: dt-pular 900ms ease-in-out infinite; }
    [data-dt~="fila"] [data-dt~="barras"] [data-dt~="barra"]:nth-child(2){ animation-delay: 150ms }
    [data-dt~="fila"] [data-dt~="barras"] [data-dt~="barra"]:nth-child(3){ animation-delay: 300ms }
    @keyframes dt-pular{ 0%,100%{ height:4px } 50%{ height:13px } }

    /* Dialogos: o veu escurece e a caixa cresce a partir do centro. */
    [data-dt~="veu"]{ animation: dt-aparecer var(--dt-normal) var(--dt-curva) both; }
    @keyframes dt-aparecer{ from{ opacity:0 } to{ opacity:1 } }
    [data-dt~="dialogo"]{ animation: dt-dialogo var(--dt-normal) var(--dt-curva) both; }
    @keyframes dt-dialogo{ from{ opacity:0; transform: translateY(8px) scale(.97); } to{ opacity:1; transform:none; } }

    /* O aviso sobe do fundo. */
    [data-dt~="aviso"]{ animation: dt-subir var(--dt-lento) var(--dt-curva) both; }
    @keyframes dt-subir{ from{ opacity:0; transform: translateY(120%); } to{ opacity:1; transform:none; } }

    /* O campo de pesquisa acende uma borda e um halo -- sem cor nova. */
    [data-dt~="campo"]{ transition: border-color var(--dt-normal) var(--dt-curva),
      box-shadow var(--dt-normal) var(--dt-curva), background-color var(--dt-normal) var(--dt-curva); }
    [data-dt~="campo"]:focus-within{ border-color: rgba(233,234,238,.30);
      box-shadow: 0 0 0 3px rgba(233,234,238,.08); background-color: ${COR.hover}; }

    /* Os cartoes das grelhas (artistas, playlists) levantam-se e acendem --
       nunca apagam. O hover vivia no "hovered" do react-native-web, que CAI ao
       entrar num filho que tambem e Pressable (o "contain" do useHover -- ver
       o coracao dos artistas): com o rato no coracao, o cartao descia outra
       vez. O ":hover" do CSS e hierarquico e nao tem isso. */
    [data-dt~="cartao"]{ transition: transform var(--dt-rapido) var(--dt-curva),
                         filter var(--dt-rapido) var(--dt-curva); }
    [data-dt~="cartao"]:hover, [data-dt~="cartao"]:focus-visible{
      transform: translateY(-3px); filter: brightness(1.08); }

    /* O coracao de favoritar um artista: so com o rato no cartao, e SEMPRE em
       quem ja e favorito (o "fixo"). Um coracao apagado em cada um dos
       setecentos cartoes era ruido. */
    [data-dt~="coracaoDoCartao"]{ opacity:0; transition: opacity var(--dt-rapido) var(--dt-curva); }
    [data-dt~="cartao"]:hover [data-dt~="coracaoDoCartao"],
    [data-dt~="cartao"]:focus-within [data-dt~="coracaoDoCartao"],
    [data-dt~="coracaoDoCartao"][data-dt~="fixo"]{ opacity:1; }

    /* A pilula dos separadores e o realce da barra lateral deslizam. */
    [data-dt~="desliza"]{ transition: transform var(--dt-normal) var(--dt-curva),
                          width var(--dt-normal) var(--dt-curva),
                          height var(--dt-normal) var(--dt-curva); }

    /* Guardar: o coracao bate uma vez e abre um anel. */
    [data-dt~="coracao"]{ animation: dt-bater 420ms var(--dt-curva); }
    @keyframes dt-bater{ 0%{ transform: scale(.6) } 45%{ transform: scale(1.28) } 70%{ transform: scale(.94) } 100%{ transform:none } }

    /* Quem pediu menos movimento no Windows nao leva nada disto. O estado
       final e o mesmo: aqui so morre o caminho ate la. */
    @media (prefers-reduced-motion: reduce){
      [data-dt~="fila"], [data-dt~="dialogo"], [data-dt~="veu"], [data-dt~="aviso"], [data-dt~="coracao"],
      [data-dt~="fila"] [data-dt~="barras"] [data-dt~="barra"]{ animation: none !important; }
      [data-dt~="premir"], [data-dt~="desliza"], [data-dt~="campo"], [data-dt~="fila"] [data-dt~="toca"],
      [data-dt~="fila"] [data-dt~="mais"], [data-dt~="fila"] [data-dt~="numero"],
      [data-dt~="cartao"], [data-dt~="coracaoDoCartao"]{ transition: none !important; }
      [data-dt~="cartao"]:hover{ transform: none !important; }
      [data-dt~="premir"]:active{ transform: none !important; }
    }
  `;
  document.head.appendChild(style);
  document.title = 'Duotone';
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const bridge = window.duotoneDesktop;
    bridge?.isMaximized().then(setMaximized);
    return bridge?.onMaximizedChange(setMaximized);
  }, []);
  return <View style={styles.titleBar as any} onDoubleClick={() => window.duotoneDesktop?.toggleMaximize()}>
    <View style={styles.titleBrand}><Image source={require('../../assets/auth-logo.png')} style={{ width: 22, height: 22 }} resizeMode="contain" /><Text style={styles.titleText}>Duotone</Text></View>
    <View style={styles.dragRegion as any} />
    <View style={styles.windowButtons as any}>
      <Pressable accessibilityLabel="Minimize" onPress={() => window.duotoneDesktop?.minimize()} style={({ hovered }) => [styles.windowButton, hovered && styles.windowButtonHover]}><Ionicons name="remove-outline" size={17} color={desktop.muted} /></Pressable>
      <Pressable accessibilityLabel={maximized ? 'Restore' : 'Maximize'} onPress={() => window.duotoneDesktop?.toggleMaximize()} style={({ hovered }) => [styles.windowButton, hovered && styles.windowButtonHover]}><Ionicons name={maximized ? 'copy-outline' : 'square-outline'} size={13} color={desktop.muted} /></Pressable>
      <Pressable accessibilityLabel="Close" onPress={() => window.duotoneDesktop?.close()} style={({ hovered }) => [styles.windowButton, hovered && styles.closeHover]}><Ionicons name="close-outline" size={20} color={desktop.muted} /></Pressable>
    </View>
  </View>;
}

export function Sidebar({ route, navigate }: { route: Route; navigate: (route: Route) => void }) {
  const session = useAuth((s) => s.session);
  const tema = useTheme((s) => s.theme);
  // Uma mistura abre-se a partir da Pesquisa: e ai que o separador tem de
  // ficar aceso, senao a barra dizia que se estava noutro sitio.
  const active = route.name === 'artist' ? 'artists'
    : route.name === 'mistura' ? 'search'
    : route.name === 'library-check' ? 'settings'
    : route.name === 'playlist' || route.name === 'import' ? 'playlists' : route.name;

  const [name,setName]=useState('Profile');
  const [publicAvatar,setPublicAvatar]=useState<string|null>(null);
  const profileVersion=useSocial(s=>s.profileVersion);
  const socialReceived=useSocial(s=>s.received);
  const socialSeen=useSocial(s=>s.seen);
  const socialFriends=useSocial(s=>s.friends);
  useEffect(()=>{
    let active=true;
    if(!session)return;
    const refresh=()=>getPublicProfiles([session.user.id]).then(([p])=>{if(active&&p){setName(p.name);setPublicAvatar(p.avatar_url);}}).catch(()=>{});
    void refresh();
    return()=>{active=false;};
  },[session?.user.id,profileVersion]);
  const avatarDisplay=<FriendAvatar avatarUrl={publicAvatar} name={name} size={31}/>;

  // O realce ATRAVESSA de um separador para o outro em vez de acender no novo
  // e apagar no velho (preview de 20/9). Para isso é preciso saber onde eles
  // estão: cada um diz a sua posição no `onLayout`. Enquanto não disser, o
  // próprio item pinta-se -- um realce em 0,0 a saltar para o sítio certo era
  // pior do que não o ter.
  const [lugares,setLugares]=useState<Record<string,{y:number;altura:number}>>({});
  const medir=(id:string)=>(y:number,altura:number)=>setLugares((m)=>(
    m[id]?.y===y&&m[id]?.altura===altura?m:{...m,[id]:{y,altura}}));
  const realce=lugares[active as string];
  // O `onLayout` do react-native-web só dispara quando o item muda de TAMANHO
  // (é um ResizeObserver), e não quando muda de SÍTIO. Uma fonte que chega
  // depois empurra os itens uns pixéis e o realce ficava onde estava --
  // descentrado do texto, e com o hover a desenhar uma segunda caixa ao lado
  // (João, 24/9). Volta-se a medir quando as fontes acabam de carregar, quando
  // a janela muda de tamanho e quando muda o separador ativo.
  const [medicao,setMedicao]=useState(0);
  useEffect(()=>{
    const outraVez=()=>setMedicao((n)=>n+1);
    const fontes:any=typeof document!=='undefined'?(document as any).fonts:null;
    fontes?.addEventListener?.('loadingdone',outraVez);
    void fontes?.ready?.then?.(outraVez);
    window.addEventListener('resize',outraVez);
    return()=>{fontes?.removeEventListener?.('loadingdone',outraVez);window.removeEventListener('resize',outraVez);};
  },[]);
  useEffect(()=>{setMedicao((n)=>n+1);},[active]);

  return <View style={styles.sidebar}>
    {/* Do tamanho do que tem: o espaço de baixo é dos atalhos. */}
    <ScrollView style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={styles.sidebarContent}>
      {realce?<View pointerEvents="none" {...marcar('desliza')}
        style={[styles.navRealce,{height:realce.altura,transform:[{translateY:realce.y}],backgroundColor:tema.soft}]}/>:null}
      <Text style={styles.navLabel}>DISCOVER</Text>
      {PRIMARY.map((item) => <NavItem key={item.id} active={active === item.id} semFundo={!!realce} medicao={medicao} aoMedir={medir(item.id)} {...item} badge={item.id === 'social' && (naoLidasPorAmigo(socialReceived,socialSeen).size>0 || socialFriends.some(f=>f.status==='pending'&&!f.isSender))} onPress={() => navigate({ name: item.id })} />)}
    </ScrollView>
    {/* O perfil é a linha com a tua cara (o item "Profile" repetia-a) e as
        Definições são a roda dentada nela (26/9, decidido com o João). */}
    <View style={styles.accountRow}>
      <Pressable accessibilityLabel="Profile" onPress={() => navigate({ name: 'profile' })} style={({ hovered }) => [styles.account, styles.accountPerfil, (hovered || active === 'profile') && styles.navHover]}>{avatarDisplay}<View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.accountName}>{name}</Text><Text numberOfLines={1} style={styles.accountEmail}>{session?.user.email}</Text></View></Pressable>
      <Pressable accessibilityLabel="Settings" onPress={() => navigate({ name: 'settings' })} style={({ hovered }) => [styles.accountDefinicoes, (hovered || active === 'settings') && styles.navHover]}><Ionicons name="settings-outline" size={17} color={active === 'settings' ? desktop.text : desktop.muted} /></Pressable>
    </View>
    <ProgressoDaImportacao />
    <AmigosNaLateral navigate={navigate} />
    {/* O espaço que sobrava por baixo: é do utilizador (26/9). */}
    <AtalhosNaLateral navigate={navigate} />
  </View>;
}

export function NavItem({ label, icon, active, badge, onPress, aoMedir, semFundo, medicao }: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; badge?: boolean; onPress: () => void;
  /** Muda para pedir outra medição (ver `medicao` na barra lateral). */
  medicao?: number;
  /** Onde é que este item está, para o realce saber para onde atravessar. */
  aoMedir?: (y: number, altura: number) => void;
  /** O realce já cobre este item: não se pinta duas vezes. */
  semFundo?: boolean }) {
  const theme = useTheme((s) => s.theme);
  const P = Pressable as any;
  // No react-native-web a ref é o elemento do DOM: o `offsetTop` é relativo
  // ao mesmo pai onde o realce (absoluto) se posiciona.
  const ref = useRef<any>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && typeof el.offsetTop === 'number') aoMedir?.(el.offsetTop, el.offsetHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicao]);
  return <P ref={ref} {...marcar('premir')} onPress={onPress}
    onLayout={(e: any) => aoMedir?.(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
    style={({ hovered, focused, pressed }: any) => [styles.navItem, (hovered || focused) && styles.navHover, active && !semFundo && { backgroundColor: theme.soft }, pressed && ui.pressed]}><Ionicons name={icon} size={19} color={active ? theme.color : desktop.muted} /><Text style={[styles.navText, active && styles.navTextActive, active && { color: theme.color }]}>{label}</Text>{badge && <BolinhaDeAviso />}</P>;
}

/**
 * A bolinha das mensagens por ler. Respira, em tamanho e em brilho, porque
 * parada passava despercebida: os amigos do João não davam pelas mensagens
 * (14/9). O keyframe vive no CSS global desta casca, como os outros -- o
 * `Animated` não mexe em nada sob o react-native-web. Com menos movimento fica
 * parada, mas com o brilho: tem de continuar a ver-se.
 */
function BolinhaDeAviso() {
  const quieto = useReducedMotion();
  return <View accessibilityLabel="Unread" style={[
    { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 4 },
    (quieto
      ? { boxShadow: '0 0 6px 2px rgba(239, 68, 68, 0.5)' }
      : {
        animationName: 'duotone-aviso-respirar', animationDuration: '2.4s',
        animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite',
      }) as any,
  ]} />;
}

/**
 * A barra de progresso do leitor, e a única parte dele que lê a posição.
 * Arrastar só procura ao largar -- ver `useProcurarAoLargar`.
 */
function BarraDeProgresso() {
  const positionMs = usePlayer((s) => s.positionMs);
  const durationMs = usePlayer((s) => s.durationMs);
  const { arrasto, comecar } = useProcurarAoLargar();
  const ratio = arrasto ?? (durationMs ? Math.min(1, positionMs / durationMs) : 0);
  return <View style={styles.progressRow}>
    <Text style={styles.timeText}>{formatTime(arrasto !== null ? (arrasto * durationMs) / 1000 : positionMs / 1000)}</Text>
    <P onMouseDown={comecar} onTouchStart={comecar} style={styles.progressHit} {...marcar('calha')}><V style={styles.progressTrack}><V style={[styles.progressFill, { width: `${ratio * 100}%` }]} {...marcar('cheio')} /></V><V {...marcar('pega')} style={{ left: `${ratio * 100}%` }} /></P>
    <Text style={styles.timeText}>{formatTime(durationMs / 1000)}</Text>
  </View>;
}

export function PlayerBar({ currentIsSaved, toggleSaveCurrent, onJam, discordLigado = false, onAviso }: {
  currentIsSaved: boolean; toggleSaveCurrent: () => void; onJam: () => void;
  /** O Discord está a publicar -- quem sabe é a casca, que tem a preferência. */
  discordLigado?: boolean;
  onAviso?: (mensagem: string) => void;
}) {
  // Só o que a barra desenha, e NUNCA a posição: o `usePlayer()` sem seletor
  // redesenhava a barra inteira a cada `_setProgress` (auditoria de 17/9, §1.5).
  // A posição vive na `BarraDeProgresso`, que é a única que precisa dela.
  const p = usePlayer(useShallow((s) => ({
    current: s.current, closeGain: s.closeGain, volume: s.volume, setVolume: s.setVolume,
    shuffle: s.shuffle, shuffleInteligente: s.shuffleInteligente, toggleShuffle: s.toggleShuffle,
    prev: s.prev, next: s.next, showRewindButton: s.showRewindButton, isPlaying: s.isPlaying,
    buffering: s.buffering, togglePlay: s.togglePlay, repeatMode: s.repeatMode,
    cycleRepeat: s.cycleRepeat, error: s.error, seekTo: s.seekTo,
  })));
  const jam = useOuvirJuntos((s) => s.sessao);
  const [dragX,setDragX]=useState(0);
  const swipeWidth=useRef(360),swiping=useRef(false);
  const reducedMotion=useReducedMotion();
  useEffect(()=>{setDragX(0);},[p.current]);
  const dragClose = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e,g)=>!usePlayer.getState().closing&&g.dx>14&&g.dx>Math.abs(g.dy)*1.5,
    onPanResponderGrant:()=>{swiping.current=true;},
    onPanResponderMove:(_e,g)=>setDragX(Math.max(0,g.dx)),
    onPanResponderRelease: (_e,g)=>{if(confirmaSwipe(g.dx,g.dy,g.vx,swipeWidth.current))void closePlayerSmoothly().then(()=>setDragX(0));else setDragX(0);setTimeout(()=>{swiping.current=false;},200);},
    onPanResponderTerminate:()=>{setDragX(0);swiping.current=false;},
  })).current;
  const volumeAudivel = useRef(80);
  if (p.volume > 0) volumeAudivel.current = p.volume;
  const alternarSilencio = () => {
    p.setVolume(p.volume > 0 ? 0 : volumeAudivel.current || 80);
  };
  if (!p.current) return null;

  const startDragVolume = (mouseDownEvent: any) => {
    mouseDownEvent.preventDefault();
    const target = mouseDownEvent.currentTarget;
    const update = (moveEvent: any) => {
      const rect = target.getBoundingClientRect();
      const clientX = moveEvent.clientX ?? moveEvent.touches?.[0]?.clientX;
      if (clientX === undefined) return;
      const pct = Math.min(100, Math.max(0, Math.round(((clientX - rect.left) / rect.width) * 100)));
      p.setVolume(pct);
    };
    update(mouseDownEvent);
    const stop = () => {
      window.removeEventListener('mousemove', update);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', update);
      window.removeEventListener('touchend', stop);
    };
    window.addEventListener('mousemove', update);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchmove', update);
    window.addEventListener('touchend', stop);
  };

  return <V style={[styles.player,{opacity:p.closeGain*Math.max(0.2,1-dragX/swipeWidth.current),transform:[{translateX:reducedMotion?0:dragX+(1-p.closeGain)*180}]}]}>
    {/* O motor: se rebentar, volta a montar sozinho e retoma a faixa. */}
    <BarreiraDeErros onde="leitor" discreta><YouTubePlayerView track={p.current} /></BarreiraDeErros>
    <View style={styles.playerTrack} {...dragClose.panHandlers} onLayout={e=>{swipeWidth.current=e.nativeEvent.layout.width;}}>
      <Pressable
        style={styles.playerTrackLink}
        onPress={() => {if(!swiping.current)window.dispatchEvent(new CustomEvent('duotone:navigate', { detail: { name: 'now-playing' } }));}}
      >
        <Artwork track={p.current} size={52} />
        {/* O título limpo e o artista, como em todas as listas: aqui ia o
            título cru do upload, sem artista nenhum. */}
        <View style={{ minWidth: 0, flexShrink: 1 }}>
          <Text numberOfLines={1} style={styles.playerTitle}>{tituloDaFaixa(p.current)}</Text>
          <Text numberOfLines={1} style={styles.playerArtista}>{displayArtist(p.current)}</Text>
        </View>
      </Pressable>
      {/* A classe só existe quando está guardada: é a entrada dela que faz o
          coração bater uma vez. Sai quando se desguarda, e volta a entrar na
          próxima -- sem estado nenhum a mais. */}
      <View style={styles.playerSave} {...(currentIsSaved ? marcar('coracao') : {})}>
        <IconButton
          name={currentIsSaved ? 'heart' : 'heart-outline'}
          label={currentIsSaved ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
          onPress={toggleSaveCurrent}
          active={currentIsSaved}
        />
      </View>
    </View>
    <View style={styles.playerCenter}>
      <View style={styles.playerControls}>
        <IconButton name="shuffle" label={rotuloDoModo(modoDeShuffle(p.shuffle, p.shuffleInteligente))} active={p.shuffle} estrela={p.shuffleInteligente} onPress={p.toggleShuffle} />
        <IconButton name="play-skip-back" label="Previous" onPress={p.prev} />
        {p.showRewindButton && <IconButton name="play-back" label="Rewind 15 seconds" onPress={() => p.seekTo(Math.max(0, usePlayer.getState().positionMs - 15000))} />}
        <Pressable accessibilityLabel={p.isPlaying ? 'Pause' : 'Play'} onPress={p.togglePlay} style={({ hovered, pressed }) => [styles.playButton, hovered && { transform: [{ scale: 1.05 }] }, pressed && { transform: [{ scale: .97 }] }]}><Ionicons name={p.buffering ? 'hourglass-outline' : p.isPlaying ? 'pause' : 'play'} size={19} color="#111117" /></Pressable>
        <IconButton name="play-skip-forward" label="Next" onPress={p.next} />
        {/* O icone e o MESMO nos dois modos: o `repeat` e o `repeat-outline`
            do Ionicons sao praticamente iguais a este tamanho, e o botao
            ficava com dois estados a mostrar um. Quem os separa e o "1". */}
        <IconButton
          name="repeat"
          label={p.repeatMode === 'one' ? 'Repeat this track' : p.repeatMode === 'all' ? 'Repeat queue' : 'Repeat off'}
          active={p.repeatMode !== 'off'}
          marca={p.repeatMode === 'one' ? '1' : undefined}
          onPress={p.cycleRepeat}
        />
      </View>
      <BarraDeProgresso />
    </View>
    <View style={styles.playerRight}>
      {p.error && <Text numberOfLines={1} style={styles.playerError}>{p.error}</Text>}
      {/* Quem vê o que está a tocar, ao lado do botão que abre o Jam. */}
      <IndicadorDeVisibilidade discordLigado={discordLigado} onJam={onJam} onAviso={onAviso} />
      <IconButton name={jam ? 'people' : 'people-outline'} label={jam ? 'Manage Jam' : 'Start a Jam'} active={!!jam} onPress={onJam} />
      <V style={styles.volumeRow} {...marcar('calha')}><Ionicons name={p.volume === 0 ? 'volume-mute-outline' : p.volume < 35 ? 'volume-low-outline' : p.volume < 70 ? 'volume-medium-outline' : 'volume-high-outline'} size={18} color={desktop.muted} onPress={alternarSilencio} accessibilityRole="button" accessibilityLabel={p.volume === 0 ? 'Unmute' : 'Mute'} style={{ cursor: 'pointer', transition: 'color 0.2s' } as any} /><P onMouseDown={startDragVolume} onTouchStart={startDragVolume} style={styles.volumeHit}><V style={styles.volumeTrack}><V style={[styles.volumeFill, { width: `${p.volume}%` }]} {...marcar('cheio')} /></V><V {...marcar('pega')} style={{ left: `${p.volume}%` }} /></P></V>
      <IconButton name="close" label="Close player" onPress={()=>void closePlayerSmoothly()} />
    </View>
  </V>;
}
