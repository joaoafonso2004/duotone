import { useSaidaDaBarra } from './saidaDaBarra.web';
import { closePlayerSmoothly, confirmaSwipe } from '../lib/closePlayer';
import { ICONES } from '../lib/icones';
import { FriendAvatar } from '../components/FriendAvatar';
import { getPublicProfiles } from '../api/profiles';
import { useSocial } from '../state/social';
import { naoLidasPorAmigo } from '../lib/social';
import { menosMovimentoAgora, useReducedMotion } from '../hooks/useReducedMotion';
/**
 * A casca da janela: barra de título, barra lateral e barra do leitor.
 *
 * O CSS do documento também vive aqui — as fontes são embutidas
 * (`assets/fonts`) e registadas em `@font-face`, nunca por CDN: a app tem de
 * abrir igual sem rede. E a família vai EXPLÍCITA em cada estilo de texto,
 * porque o react-native-web impõe a stack dele a cada `<Text>`.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
// O motor do PC (motorDeAudio.web.tsx): no Electron é o YouTubePlayerView de sempre;
// na casca Tauri, o motor só de áudio com o IFrame de recurso.
import { MotorDoPc } from './motorDeAudio.web';
import { BarreiraDeErros } from '../components/BarreiraDeErros';
import { modoDeShuffle, rotuloDoModo } from '../lib/smartShuffle';
import { useAuth } from '../state/auth';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSeguirAmigo } from '../state/seguirAmigo';
import { usePlayer } from '../state/player';
import { getLikedSongs } from '../api/library';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import { menuDasGostadas } from '../lib/menuDaMistura';
import { useConnectivity } from '../state/connectivity';
import { MenuDeContexto, pontoDoEvento, type PontoNoEcra } from './MenuDeContexto.web';
import { MOLA_MS, refDoAlvo, type Alvo } from './Arrastar.web';
import { alvoDaBarra, alvoDasGostadas, alvoQueAbreAsPlaylists } from './alvosDeLargar.web';
import { criarRoda, volumeComARoda } from '../lib/rodaDoRato';
import { useShallow } from 'zustand/react/shallow';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { useTheme } from '../state/theme';
import { ALTURA_DA_BARRA_DA_JANELA, styles } from './estilos.web';
import { BarraDoOutroAparelho, BotaoDoOutroAparelho } from './OutroAparelho.web';
import { COR, cssDasFontes, ESP, ESTADO, FONT, RAIO } from './tokens.web';
import { useLateralRecolhida } from './estadoDasBarras.web';
import { ANEL_DO_REFRAO, Artwork, comDica, formatTime, IconButton, ui, marcar, useProcurarAoLargar } from './ui.web';
import { PRE_ESCUTA_S } from '../lib/refrao';
import { TOM_CLARO, TOM_ESCURO } from '../lib/doisTons';
import { ligarBrilhoDoCursor } from './duotone.web';
import { IconeJam, IconePlayPause, IconeRepeat, IconeShuffle, IconeVolume } from './IconesDeEstado.web';
import { cssDoHoverDoDisco, estiloDoDisco, estiloDoReflexo, rodarReflexo } from './DiscoDeMetal.web';
import { useCapaQueSai } from './Ocultacao.web';
import { sentidoDaOcultacao } from '../lib/ocultacao';
import type { Track } from '../types';
import { comCatalogo, useCatalogoDeFaixas } from '../state/catalogoDeFaixas';
import { estadoDoShuffle } from '../lib/estadoDosIcones';
import { usePontoNaBarra } from '../state/refrao';
import { dentesDaTecla, valorDaProcura } from '../lib/acessibilidadeDoPc';
import { PRIMARY, type Route } from './rotas';
import { IndicadorDeVisibilidade } from './IndicadorDeVisibilidade.web';
import { AmigosNaLateral } from './AmigosNaLateral.web';
import { AtalhosNaLateral } from './AtalhosNaLateral.web';
import { ProgressoDaImportacao } from './ProgressoDaImportacao.web';
import { useDestinos } from '../navigation/destinos';
import { SetaDoPainel } from './PainelDoLeitor.web';
import { CoracaoAnimado } from '../components/CoracaoAnimado';
import { useCoracaoAoCarregar } from '../hooks/useCoracaoAoCarregar';

import { avisarErro } from '../lib/avisoDeRemocao';
import { cssDasMolas } from '../lib/molasEmCss';
import { INCLINACAO_DO_CARREGAMENTO, LUZ_DO_CARREGAMENTO_MS, OPACIDADE_DO_CARREGAMENTO } from '../lib/luz';
const P = Pressable as any;
const V = View as any;

export function injectDesktopDocumentStyles() {
  if (document.getElementById('duotone-desktop-css')) return;

  // As fontes sao embutidas (assets/fonts); as @font-face vivem nos tokens,
  // porque a janela do mini leitor tambem precisa delas (20/10).
  const fontes = document.createElement('style');
  fontes.id = 'duotone-fonts';
  fontes.textContent = cssDasFontes();
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
    /* A barra de rolar só aparece com o rato por cima do que rola (9/11): parada,
       a da lateral lia-se como mais um fio entre a lateral e a página. */
    ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:transparent;border:3px solid transparent;border-radius:8px;background-clip:padding-box}
    *:hover::-webkit-scrollbar-thumb{background:#30303b;border:3px solid transparent;background-clip:padding-box}
    ::-webkit-scrollbar-thumb:hover{background:#494857;border:3px solid transparent;background-clip:padding-box}
    /* A página desvanece nos últimos 40 px antes do leitor (9/11): era um fio
       por cima da barra que a separava. O fundo da página (48 px) deixa a última
       linha subir acima disto. */
    [data-dt~="rolo-da-pagina"]{ -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 40px), transparent); mask-image: linear-gradient(180deg, #000 calc(100% - 40px), transparent); }
    /* A área da página corta pelos lados e por baixo, mas deixa passar
       ${ALTURA_DA_BARRA_DA_JANELA} px por cima (15/11): é por onde a página do artista sobe
       para debaixo da barra da janela, com a foto até ao limite (o João: "o
       chapéu fica cortado"). Era um overflow: hidden, que cortava os quatro lados. */
    [data-dt~="conteudo-da-pagina"]{ clip-path: inset(-${ALTURA_DA_BARRA_DA_JANELA}px calc(-1 * var(--dt-painel-encostado, 0px)) 0 0); }
    /* E pela direita, a largura do painel encostado (23/11, PainelDoLeitor.web.tsx): o
       fundo da página (a cor do artista, a lavagem da playlist e a das Liked Songs) passa
       por trás dele, que é transparente. Só as camadas marcadas esticam; o resto da página
       acaba onde o painel começa. */
    [data-dt~="fundo-da-pagina"]{ right: calc(-1 * var(--dt-painel-encostado, 0px)) !important; }
    /* O anel do foco do teclado, no metal. Era [data-focusable="true"], que o
       react-native-web 0.21 ja nao escreve: a regra nao apanhava nada e via-se
       o anel do browser (medido a 20/10 na pagina de ensaio). Os sliders tem o
       seu, mais afastado (ver em baixo).
       POR FORA, com 2 px de folga (20/10, B3): por dentro e na cor do tema, no
       botao principal (que e de metal) o anel era da cor do proprio botao e nao
       se via. As linhas das listas ficam por dentro: encostam aos lados do
       scroll, que cortava o anel. */
    [tabindex]:not([tabindex="-1"]):not([role="slider"]):focus-visible{outline:2px solid var(--accent-color, #E9EAEE)!important;outline-offset:2px}
    [data-dt~="fila"][tabindex]:not([tabindex="-1"]):focus-visible{outline-offset:-2px}
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
      transition: transform var(--dt-normal) var(--dt-curva);
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      pointer-events: none;
    }
    [data-dt~="calha"]:hover [data-dt~="pega"] {
      transform: translate(-50%, -50%) scale(1);
    }
    /* O volume e uma cunha (4/11): a calha cresce de 2 px a esquerda para
       6 px a direita. Era igual a barra da musica -- a mesma calha, o mesmo
       cheio, a mesma pega -- e so o icone ao lado as distinguia; a forma diz
       "volume" sozinha e acompanha o que o som faz. O recorte apanha a calha
       E o cheio de uma vez (um clip-path recorta a subarvore), por isso a
       parte cheia ja nasce com a forma certa e nao precisa de a repetir. */
    [data-dt~="cunha"]{ clip-path: polygon(0 37.5%, 100% 12.5%, 100% 87.5%, 0 62.5%); }
    /* A risca do refrao (25/10, so com a opcao ligada): dois pixeis meio
       apagados; com o rato na barra acende e diz "Chorus". */
    [data-dt~="marca-do-refrao"]{ position: absolute; top: 50%; width: 2px; height: 8px; border-radius: 1px;
      transform: translate(-50%, -50%); background-color: rgba(233,234,238,.42); pointer-events: none;
      transition: background-color var(--dt-rapido) var(--dt-curva); }
    [data-dt~="marca-rotulo"]{ position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
      opacity: 0; transition: opacity var(--dt-rapido) var(--dt-curva); white-space: nowrap; }
    [data-dt~="calha"]:hover [data-dt~="marca-do-refrao"]{ background-color: rgba(233,234,238,.85); }
    [data-dt~="calha"]:hover [data-dt~="marca-rotulo"]{ opacity: 1; }
    /* Os sliders com o foco do teclado (20/10): o anel, e a pega e o cheio
       acesos como no hover -- sem eles nao se via o que as setas mexiam. O
       arrasto nao foca (o mousedown faz preventDefault), por isso isto e so
       do teclado. */
    [role="slider"]:focus-visible{ outline: 2px solid var(--accent-color, #E9EAEE); outline-offset: 4px; border-radius: ${RAIO.ctrl}px; }
    [role="slider"]:focus-visible [data-dt~="pega"]{ transform: translate(-50%, -50%) scale(1); }
    [role="slider"]:focus-visible [data-dt~="cheio"]{ background: var(--accent-color, #E9EAEE)!important; }
    /* O dialogo recebe o foco ao abrir (para o leitor de ecra ler o titulo);
       o anel e dos controlos la dentro, nao da caixa. */
    [data-dt~="dialogo"]:focus{ outline: none; }
    /* A legenda dos botoes de icone (desktop/useDicas.web.ts). Uma so, no body. */
    #duotone-dica{ position: fixed; left: 0; top: 0; z-index: 2147483000; pointer-events: none;
      max-width: 280px; padding: 5px 8px; border-radius: ${RAIO.ctrl}px;
      background: ${COR.elevado}; border: 1px solid ${COR.linha}; color: ${COR.texto};
      font: 500 12px/16px ${FONT.body}; white-space: nowrap; box-shadow: 0 8px 24px rgba(0,0,0,.45);
      visibility: hidden; opacity: 0; transform: translateY(2px);
      transition: opacity 120ms var(--dt-curva), transform 120ms var(--dt-curva); }
    #duotone-dica[data-lado="baixo"]{ transform: translateY(-2px); }
    #duotone-dica[data-visivel]{ visibility: visible; opacity: 1; transform: none; }
    #duotone-dica kbd{ font: 400 11px/16px ${FONT.mono}; color: ${COR.textoFraco}; margin-left: 8px; }
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
    .np-fila-capa { position: relative; flex: none; border-radius: ${RAIO.ctrl}px; overflow: hidden; }
    .np-fila-tocar { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,.5); opacity: 0; transition: opacity var(--dt-rapido) var(--dt-curva); }
    .np-fila-linha:hover .np-fila-tocar, .np-fila-linha:focus-visible .np-fila-tocar { opacity: 1; }
    .np-fila-pega, .np-fila-mais { opacity: 0; transition: opacity var(--dt-rapido) var(--dt-curva); display: flex; }
    .np-fila-linha:hover .np-fila-pega, .np-fila-linha:hover .np-fila-mais, .np-fila-pega-viva { opacity: 1; }
    /* Com o teclado (A5, 31/10): a linha com o foco mostra o mesmo que com o rato, e o anel fica por dentro. */
    .np-fila-linha:focus-visible .np-fila-pega, .np-fila-linha:focus-visible .np-fila-mais { opacity: 1; }
    .np-fila-linha[tabindex]:focus-visible { outline-offset: -2px; }
    .np-fila-mais { background: none; border: 0; padding: 6px; border-radius: ${RAIO.cartao}px; cursor: pointer; }
    .np-fila-mais:hover { background: ${ESTADO.hover}; }
    .np-fila-mais:focus-visible { opacity: 1; outline: 2px solid ${COR.texto}; }
    /* O número e a duração (25/11, a proposta A da maquete do cartão): o número dá lugar
       à pega e a duração ao "…", no mesmo sítio, para a linha não mexer ao passar o rato. */
    .np-fila-num { position: relative; flex: none; width: 22px; display: flex; align-items: center; justify-content: flex-end; }
    .np-fila-num > .np-fila-pega { position: absolute; inset: 0; align-items: center; justify-content: flex-end; }
    .np-fila-num > div { transition: opacity var(--dt-rapido) var(--dt-curva); }
    /* O About (25/11, a proposta A da maquete do cartão): duas colunas quando ele próprio tem
       largura (o cartão do Now Playing), uma no painel de 340 px. Por container query: decide
       antes de desenhar, sem medir e saltar. */
    [data-dt~="sobre"] { container-type: inline-size; }
    @container (min-width: 620px) {
      [data-dt~="sobre-colunas"] { flex-direction: row !important; gap: 44px !important; }
      [data-dt~="sobre-artista"] { width: 300px; flex: none !important; }
      [data-dt~="sobre-retrato"] { height: 336px !important; }
      [data-dt~="sobre-nome"] { font-size: 34px !important; line-height: 38px !important; }
    }
    /* Só quando há pega (num Jam não se arrasta, e o número fica). */
    .np-fila-linha:hover .np-fila-num:has(.np-fila-pega) > div, .np-fila-linha:focus-visible .np-fila-num:has(.np-fila-pega) > div,
    .np-fila-num:has(.np-fila-pega-viva) > div { opacity: 0; }
    .np-fila-fim { position: relative; flex: none; min-width: 44px; display: flex; align-items: center; justify-content: flex-end; }
    .np-fila-fim > div { transition: opacity var(--dt-rapido) var(--dt-curva); }
    .np-fila-fim > .np-fila-mais { position: absolute; right: -4px; top: 50%; transform: translateY(-50%); }
    .np-fila-linha:hover .np-fila-fim > div, .np-fila-linha:focus-visible .np-fila-fim > div { opacity: 0; }
    /* O painel da direita (23/11, a maquete "Painel e leitor a abrir"). Encostado, o lugar
       dele (a width) cresce com a curva de entrada e a página encolhe com ele; a fechar, 90 ms
       depois de a fila se apagar. Só muda a largura do painel: o fundo da página por trás dele
       (--dt-painel-encostado) fica fixo durante a animação. Por cima da página (janela
       estreita) desliza pelo transform. O conteúdo entra lá dentro depois do lugar, e apaga-se
       com o Now Playing. */
    [data-dt~="painel-do-leitor"] { transition: transform 240ms var(--dt-curva); will-change: transform; }
    [data-dt~="painel-do-leitor"][data-encostado]{ transition: width 300ms var(--dt-travar) 90ms; }
    [data-dt~="painel-do-leitor"][data-encostado][data-aberto]{ transition: width 460ms var(--dt-entrada); }
    [data-dt~="painel-dentro"]{ position: absolute; top: 0; right: 0; bottom: 0; width: var(--dt-painel, 340px); max-width: 100%;
      display: flex; flex-direction: column; opacity: 0; transform: translateX(28px); visibility: hidden;
      transition: opacity 120ms var(--dt-sair), transform 160ms var(--dt-sair), visibility 0s linear 160ms; }
    [data-dt~="painel-dentro"][data-visivel]{ opacity: 1; transform: none; visibility: visible;
      transition: opacity 260ms var(--dt-entrada) 90ms, transform 460ms var(--dt-entrada) 60ms, visibility 0s; }
    [data-dt~="painel-dentro"][data-visivel][data-escondido]{ opacity: 0; transform: scale(.985); visibility: hidden;
      transition: opacity 180ms var(--dt-sair), transform 260ms var(--dt-travar), visibility 0s linear 260ms; }
    /* As barras ajustaveis (31/10, desktop/SeparadorDeLargura.web.tsx): a pega e uma tira de 6 px
       POR DENTRO do bordo da lateral e do painel; o fio acende-se com o rato, o foco do teclado e o
       arrasto. Durante o arrasto o cursor e de arrasto em todo o lado, nada se seleciona, e o painel
       nao anima (so a largura muda, e tem de a seguir o rato). */
    [data-dt~="separador"]{ position: absolute; top: 0; bottom: 0; width: 6px; z-index: 40; cursor: col-resize;
      touch-action: none; background: transparent; outline: none; }
    [data-dt~="separador"]::after{ content: ''; position: absolute; top: 0; bottom: 0; width: 2px; background: transparent;
      transition: background-color var(--dt-rapido) var(--dt-curva); }
    [data-dt~="separador"][data-lado="direita"]::after{ right: 0; }
    [data-dt~="separador"][data-lado="esquerda"]::after{ left: 0; }
    [data-dt~="separador"]:hover::after, [data-dt~="separador"]:focus-visible::after, [data-dt~="separador"][data-a-arrastar]::after{
      background: rgba(233,234,238,.46); }
    html[data-a-redimensionar], html[data-a-redimensionar] *{ cursor: col-resize !important; user-select: none !important; }
    /* A pega deitada entre os amigos e os atalhos (20/11, SeparadorDosAmigos.web.tsx): a mesma tira
       de 6 px, no fundo da caixa dos amigos, com o fio ao meio dela e alinhado com as linhas. */
    [data-dt~="separador"][data-lado="baixo"]{ top: auto; left: 0; right: 0; bottom: 0; width: auto; height: 6px; cursor: row-resize; }
    [data-dt~="separador"][data-lado="baixo"]::after{ top: auto; bottom: 2px; left: ${ESP.md}px; right: ${ESP.md}px; width: auto; height: 2px; border-radius: 1px; }
    html[data-a-redimensionar="altura"], html[data-a-redimensionar="altura"] *{ cursor: row-resize !important; }
    html[data-a-redimensionar] [data-dt~="painel-do-leitor"]{ transition: none !important; }
    /* O fundo do Now Playing: a capa nova entra por cima da anterior. */
    [data-dt~="np-fundo"]{ animation: dt-np-fundo var(--dt-compasso, 700ms) var(--dt-curva) both; }
    /* A cor da capa a encher a janela ao abrir o Now Playing (26/9). */
    [data-dt~="janela-cor"]{ animation: dt-np-fundo 450ms var(--dt-curva) both; }
    /* E a sair (20/10, pedido do João: entrava devagar e saía num fotograma).
       A camada apaga-se e recua um nada, mais depressa do que entrou; a cor da
       capa apaga-se na janela quase ao passo com que acendeu, e a superfície
       volta ao fundo dela ao mesmo tempo (desktop/useSaida.web.ts tem o tempo
       total, 420 ms). A página de baixo, ou a nova, já está lá por baixo. */
    [data-dt~="np-a-sair"]{ animation: dt-np-sai 240ms var(--dt-curva) both; }
    /* E a entrar (23/11, a maquete "Painel e leitor a abrir"; o João: "dá pop out"): a capa voa
       da barra (desktop/vooDaCapa.web.ts) e a verdadeira fica escondida enquanto a cópia voa; a
       página de baixo recua e esconde-se (continua montada); o topo, os ícones e a fila sobem em
       escada logo atrás da capa. A fechar, a página volta a crescer para o sítio. */
    html[data-capa-a-voar] [data-dt~="capa-do-leitor"]{ opacity: 0; }
    [data-dt~="pagina-sob-o-leitor"]{ transform-origin: 50% 30%;
      transition: opacity 300ms var(--dt-entrada) 80ms, transform 420ms var(--dt-entrada) 80ms, visibility 0s; }
    [data-dt~="pagina-sob-o-leitor"][data-dt~="escondida"]{ opacity: 0; transform: scale(.975); visibility: hidden;
      transition: opacity 180ms var(--dt-sair), transform 260ms var(--dt-travar), visibility 0s linear 260ms; }
    [data-dt~="np-camada"] [data-dt~="np-sobe"]{ animation: dt-np-sobe 460ms var(--dt-entrada) 200ms both; }
    [data-dt~="np-camada"] [data-dt~="np-sobe-2"]{ animation-delay: 245ms; }
    [data-dt~="np-camada"] [data-dt~="np-sobe-3"]{ animation-delay: 290ms; }
    @keyframes dt-np-sobe{ from{ opacity: 0; transform: translateY(10px); } to{ opacity: 1; transform: none; } }
    @keyframes dt-np-sai{ from{ opacity:1; transform:none } to{ opacity:0; transform: scale(.985) } }
    [data-dt~="janela-cor"][data-dt~="a-apagar"]{ animation: dt-np-cor-sai 420ms var(--dt-curva) both; }
    @keyframes dt-np-cor-sai{ from{ opacity:1 } to{ opacity:0 } }
    [data-dt~="main-a-voltar"]{ transition: background-color 420ms var(--dt-curva); }
    @keyframes dt-np-fundo{ from{ opacity:0 } to{ opacity:1 } }
    /* A troca de música no Now Playing (26/9): a capa nova entra por cima da
       que sai, e o título vem logo atrás. */
    /* A Ocultação (C2, 1/11): a capa velha fica inteira até o disco a tapar
       (Ocultacao.web.ts). Com menos movimento não há disco, e ela esbate-se. */
    @media (prefers-reduced-motion: reduce){ [data-dt~="capa-sai"]{ animation: dt-capa-sai 160ms linear both; } }
    @keyframes dt-capa-sai{ from{ opacity:1 } to{ opacity:0 } }
    [data-dt~="np-texto-entra"]{ animation: dt-np-texto-entra 380ms var(--dt-curva) 90ms both; }
    @keyframes dt-np-texto-entra{ from{ opacity:0; transform: translateY(6px) } to{ opacity:1; transform: none } }
    /* A capa em 3D (5/11, "3D cover", desligada de origem; CapaMetal3D.web.tsx).
       A caixa é 3D a sério (preserve-3d), e quem a move é o JavaScript, com as
       molas da app: aqui não há transições. Desde 7/11 as arestas são a capa,
       como no iPhone (a faixa da borda espelhada, com o véu do iPhone, ambos
       postos pelo componente), e o brilho que corre por elas é o JavaScript a
       mexer só a posição e a opacidade do ponto quente (eram metal escovado). */
    [data-dt~="m3-palco"]{ position: relative; display: grid; place-items: center; }
    [data-dt~="m3-chao"], [data-dt~="m3-caixa"]{ grid-area: 1 / 1; position: relative; }
    [data-dt~="m3-chao"]{ pointer-events: none; }
    [data-dt~="m3-sombra"]{ position: absolute; border-radius: 50%; background: radial-gradient(closest-side, rgba(0,0,0,1), rgba(0,0,0,.55) 45%, rgba(0,0,0,0)); }
    [data-dt~="m3-caixa"]{ transform-style: preserve-3d; will-change: transform; cursor: grab; user-select: none; touch-action: pan-y; outline: none; }
    [data-dt~="m3-caixa"] img{ -webkit-user-drag: none; }
    [data-dt~="m3-face"]{ position: absolute; inset: 0; overflow: hidden; border-radius: 2px; background: #16161d; backface-visibility: hidden; }
    [data-dt~="m3-verso-capa"]{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .6; transform: scale(1.12); }
    [data-dt~="m3-lado"]{ position: absolute; overflow: hidden; backface-visibility: hidden; background: #16161d; }
    [data-dt~="m3-esq"], [data-dt~="m3-dir"], [data-dt~="m3-cima"], [data-dt~="m3-baixo"]{ isolation: isolate; }
    [data-dt~="m3-tira"], [data-dt~="m3-veu"]{ position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
    [data-dt~="m3-vivo"]{ position: absolute; inset: 0; width: 100%; height: 100%; display: block; opacity: 0; }
    [data-dt~="m3-fio"], [data-dt~="m3-labio"], [data-dt~="m3-lustro"]{ position: absolute; overflow: hidden; pointer-events: none; z-index: 1; }
    [data-dt~="m3-lustro"]{ inset: 0; }
    [data-dt~="m3-fio"] i, [data-dt~="m3-labio"] i, [data-dt~="m3-lustro"] i{ position: absolute; display: block; opacity: 0; will-change: transform, opacity; }

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
    /* Uma física (S1, 31/10): as molas do iPhone em linear(), e a --dt-curva
       e a --dt-mola de sempre passam a ser a forma da ENTRADA e do SOLTAR
       (lib/molasEmCss.ts). As durações da coreografia ficam as de antes. */
    ${cssDasMolas()}
    :root{
      /* Mais curtos a 27/9: a app tem de parecer instantânea. */
      --dt-rapido: 110ms; --dt-normal: 150ms; --dt-lento: 220ms;
    }

    /* Carregar num botao encolhe-o 3%: entra com o PREMIR e volta com o
       SOLTAR, como o mesmo botão no iPhone (S1). */
    [data-dt~="premir"]{ transition: transform var(--dt-soltar-ms) var(--dt-soltar),
      background-color var(--dt-rapido) var(--dt-curva),
      border-color var(--dt-rapido) var(--dt-curva),
      box-shadow var(--dt-normal) var(--dt-curva); }
    [data-dt~="premir"]:active{ transform: scale(.97); transition: transform var(--dt-premir-ms) var(--dt-premir),
      background-color var(--dt-rapido) var(--dt-curva), border-color var(--dt-rapido) var(--dt-curva),
      box-shadow var(--dt-normal) var(--dt-curva); }
    /* O play é um disco de metal escovado (C3, 1/11): o metal, o laço de luz que
       roda na pausa e no play (DiscoDeMetal.web.ts), e o ícone por cima. */
    [data-dt~="disco-metal"]{ ${estiloDoDisco()} }
    /* No hover só acende: crescer redesenhava o símbolo noutro sítio (1/11). */
    ${cssDoHoverDoDisco()}
    [data-dt~="reflexo"]{ ${estiloDoReflexo()} }

    /* As linhas de uma lista entram umas atras das outras -- so as primeiras:
       escalonar duzentas seria uma lista a montar-se durante dois segundos. */
    /* Só as PRIMEIRAS. A regra apanhava todas, e uma biblioteca de milhares
       de faixas arrancava com milhares de animacoes no mesmo fotograma -- para
       nada, porque da decima segunda para baixo ninguem as ve. */
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(-n+12),
    [data-dt~="fila"]:first-child{ animation: dt-linha var(--dt-normal) var(--dt-curva) both; }
    @keyframes dt-linha{ from{ opacity:0; transform: translateY(6px); } to{ opacity:1; transform:none; } }
    /* Numa tabela com janela (7/11) as linhas montam-se a rolar: só as que abriram a lista (entra) fazem a cascata. */
    [data-dt~="lista"][data-dt~="janela"] [data-dt~="fila"]:not([data-dt~="entra"]){ animation: none; }

    /* A passagem entre páginas (27/9): 150 ms em CSS, que o compositor corre
       mesmo com a thread a montar a página nova (ver TransicaoDePagina). Com
       "backwards" e não "both": depois de entrar não fica nada preso -- um
       transform que ficasse fazia da página o contentor dos "fixed" dela. */
    /* 30/9: 150 ms e 6 px não se viam ("só a aba da esquerda é smooth"). A
       nova entra em 260 ms, a subir 14 px; a de agora esbate-se enquanto a
       nova se prepara (a-sair) -- só a opacidade, pela razão do "fixed". */
    [data-dt~="pagina"]{ animation: dt-pagina 260ms var(--dt-curva) backwards; }
    @keyframes dt-pagina{ from{ opacity:0; transform: translateY(14px); } to{ opacity:1; transform:none; } }
    [data-dt~="a-sair"]{ opacity:.35; transition: opacity 140ms var(--dt-curva); }
    /* Os cartões das grelhas e das prateleiras entram em cascata curta, os
       doze primeiros. "backwards" pela mesma razão: o hover manda no transform. */
    [data-dt~="pagina"] [data-dt~="cartao"]:nth-child(-n+12){ animation: dt-linha 160ms var(--dt-curva) backwards; }
    [data-dt~="pagina"] [data-dt~="cartao"]:nth-child(2){ animation-delay: 12ms }
    [data-dt~="pagina"] [data-dt~="cartao"]:nth-child(3){ animation-delay: 24ms }
    [data-dt~="pagina"] [data-dt~="cartao"]:nth-child(4){ animation-delay: 36ms }
    [data-dt~="pagina"] [data-dt~="cartao"]:nth-child(5){ animation-delay: 48ms }
    [data-dt~="pagina"] [data-dt~="cartao"]:nth-child(6){ animation-delay: 60ms }
    [data-dt~="pagina"] [data-dt~="cartao"]:nth-child(7){ animation-delay: 72ms }
    [data-dt~="pagina"] [data-dt~="cartao"]:nth-child(8){ animation-delay: 84ms }
    [data-dt~="pagina"] [data-dt~="cartao"]:nth-child(9){ animation-delay: 96ms }
    [data-dt~="pagina"] [data-dt~="cartao"]:nth-child(10){ animation-delay: 108ms }
    [data-dt~="pagina"] [data-dt~="cartao"]:nth-child(11){ animation-delay: 120ms }
    [data-dt~="pagina"] [data-dt~="cartao"]:nth-child(12){ animation-delay: 132ms }
    /* Uma só luz a carregar (C10, 1/11): as formas do que vem, em metal escuro, só
       aparecem se a espera passar de um quarto de segundo (uma troca rápida não
       pisca nada). Todas partilham o MESMO gradiente, preso à janela: cada forma
       mostra o seu bocado da mesma banda, e lê-se uma luz só a passar pela região;
       o fundo não acende. Aos 4 s o Carregando tira o "carregando" e a luz pára. */
    [data-dt~="formas"]{ animation: dt-aparecer 150ms var(--dt-curva) 250ms backwards; }
    [data-dt~="forma"]{ background-color: ${COR.elevado}; }
    [data-dt~="carregando"] [data-dt~="forma"]{
      background-image: linear-gradient(${INCLINACAO_DO_CARREGAMENTO}deg, transparent 42%, rgba(233,234,238,${OPACIDADE_DO_CARREGAMENTO}) 50%, transparent 58%);
      background-size: 220vw 100%; background-attachment: fixed;
      animation: dt-luz-unica ${LUZ_DO_CARREGAMENTO_MS}ms ease-in-out infinite; }
    @keyframes dt-luz-unica{ from{ background-position: 10vw 0; } to{ background-position: -130vw 0; } }
    /* A linha da letra acende inteira quando chega a vez dela (LinhaDaLetra.web.tsx). */
    [data-dt~="linha-da-letra"]{ transition: color 220ms var(--dt-curva), opacity 220ms var(--dt-curva); }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(2){ animation-delay: 10ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(3){ animation-delay: 20ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(4){ animation-delay: 30ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(5){ animation-delay: 40ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(6){ animation-delay: 50ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(7){ animation-delay: 60ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(8){ animation-delay: 70ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(9){ animation-delay: 80ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(10){ animation-delay: 90ms }
    [data-dt~="lista"] [data-dt~="fila"]:nth-child(n+11){ animation-delay: 100ms }

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
    /* A que esta a tocar nao esconde as barrinhas nem mostra o numero. Andam no andamento da
       musica quando ele se sabe (S3, CompassoNoCss), e nos 900 ms de sempre quando nao. O
       atraso e uma parte da volta: sem isso, a 180 BPM as duas de um tempo andavam quase juntas. */
    /* Aos saltos, como um medidor de nível (22/11): quatro alturas por volta e nada no meio.
       Deslizar redesenhava a janela a cada fotograma enquanto houvesse música (a GPU do
       WebView2 a ~5 % do PC, medido na 7.0.0); aos saltos, o compositor só desenha 4 vezes
       por volta de cada barra. */
    [data-dt~="fila"] [data-dt~="barras"] [data-dt~="barra"]{ animation: dt-pular var(--dt-barra-1, 900ms) step-end infinite; }
    [data-dt~="fila"] [data-dt~="barras"] [data-dt~="barra"]:nth-child(2){ animation-duration: var(--dt-barra-2, 900ms); animation-delay: calc(var(--dt-barra-2, 900ms) / 6); }
    [data-dt~="fila"] [data-dt~="barras"] [data-dt~="barra"]:nth-child(3){ animation-duration: var(--dt-barra-3, 900ms); animation-delay: calc(var(--dt-barra-3, 900ms) / 3); }
    /* Em pausa, as barras ficam quietas e baixas (27/9). */
    [data-dt~="fila"] [data-dt~="barras"][data-dt~="parado"] [data-dt~="barra"]{ animation: none; height: 4px; }
    @keyframes dt-pular{ 0%{ height:4px } 25%{ height:9px } 50%{ height:13px } 75%{ height:7px } 100%{ height:4px } }

    /* Dialogos: o veu escurece e a caixa cresce a partir do centro. */
    [data-dt~="veu"]{ animation: dt-aparecer var(--dt-normal) var(--dt-curva) both; }
    @keyframes dt-aparecer{ from{ opacity:0 } to{ opacity:1 } }
    [data-dt~="dialogo"]{ animation: dt-dialogo var(--dt-normal) var(--dt-curva) both; }
    @keyframes dt-dialogo{ from{ opacity:0; transform: translateY(8px) scale(.97); } to{ opacity:1; transform:none; } }

    /* O menu de um amigo (botão direito, 2/10): abre a partir do rato. */
    [data-dt~="menu-amigo"]{ animation: dt-menu 150ms var(--dt-curva) both; }
    @keyframes dt-menu{ from{ opacity:0; transform: scale(.96) translateY(-4px); } to{ opacity:1; transform:none; } }
    [data-dt~="menu-linha"]{ transition: background-color var(--dt-rapido) var(--dt-curva); cursor: pointer; outline: none; }
    [data-dt~="menu-linha"]:hover, [data-dt~="menu-linha"]:focus-visible{ background-color: rgba(233,234,238,.07); }

    /* O nome da musica de um amigo que nao cabe anda com o rato em cima, para
       se ler todo (2/10): vai ate ao fim, para, e volta. A distancia e o tempo
       vem medidos (TextoQueRola, vaiEVolta). Desvanece so a direita: e por ai
       que o resto entra. */
    [data-dt~="rola-caixa"]{ overflow: hidden; }
    [data-dt~="amigo"]:hover [data-dt~="rola-caixa"]{
      -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 12px), transparent);
              mask-image: linear-gradient(90deg, #000 calc(100% - 12px), transparent); }
    [data-dt~="amigo"]:hover [data-dt~="rola"]{ overflow: visible !important; text-overflow: clip !important;
      animation: dt-rola var(--rola-duracao, 3s) ease-in-out 350ms infinite alternate; }
    @keyframes dt-rola{ 0%, 12%{ transform: none; } 88%, 100%{ transform: translateX(var(--rola-distancia, 0px)); } }

    /* O aviso de uma mensagem nova desce do topo (2/10). */
    [data-dt~="aviso-msg"]{ animation: dt-aviso-msg var(--dt-estado-ms) var(--dt-estado) both; }
    @keyframes dt-aviso-msg{ from{ opacity:0; transform: translateY(-24px) scale(.98); } to{ opacity:1; transform:none; } }

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
    [data-dt~="cartao"]:hover, [data-dt~="cartao"]:focus-visible,
    [data-dt~="cartao"][data-dt~="com-menu"]{
      transform: translateY(-3px); filter: brightness(1.08); }

    /* Arrastar uma música (24/10, desktop/Arrastar.web.tsx): enquanto se
       arrasta não se seleciona texto e o rato diz que se segura alguma coisa;
       os destinos que servem ganham uma aresta, e o de baixo do rato acende.
       Os atributos põe-nos o arrasto direto no DOM (não são marcas). */
    body[data-arrastar], body[data-arrastar] *{ cursor: grabbing !important; user-select: none !important; }
    [data-largar]{ transition: background-color var(--dt-rapido) var(--dt-curva), box-shadow var(--dt-rapido) var(--dt-curva); }
    /* O Íman (C5, 1/11): o destino mais próximo acende à medida que a música se
       aproxima. O arrasto escreve a --perto (0 a 1) só nele, um fotograma por movimento. */
    [data-largar="pode"]{ box-shadow: inset 0 0 0 1px rgba(233,234,238,calc(.14 + .31 * var(--perto, 0))), 0 0 calc(22px * var(--perto, 0)) rgba(233,234,238,calc(.16 * var(--perto, 0)));
      background-color: rgba(233,234,238,calc(.1 * var(--perto, 0))); border-radius: ${RAIO.cartao}px; }
    /* A música levanta-se como uma placa de metal, e a linha de onde saiu apaga-se. */
    [data-dt~="placa"]{ animation: dt-placa var(--dt-premir-ms) var(--dt-premir) both; }
    @keyframes dt-placa{ from{ transform: scale(1); } to{ transform: scale(1.04); } }
    [data-a-arrastar]{ opacity: .35; }
    [data-largar="por-cima"]{ background-color: rgba(233,234,238,.12) !important; box-shadow: inset 0 0 0 1px rgba(233,234,238,.28); border-radius: ${RAIO.cartao}px; }
    /* A mola (25/10): parada em cima das Playlists, a música enche o item da
       esquerda para a direita durante o tempo que falta para ele abrir. */
    [data-largar="mola"]{ box-shadow: inset 0 0 0 1px rgba(233,234,238,.28); border-radius: ${RAIO.cartao}px;
      background-image: linear-gradient(rgba(233,234,238,.14), rgba(233,234,238,.14)); background-repeat: no-repeat;
      background-size: 0% 100%; animation: dt-mola ${MOLA_MS}ms linear forwards; }
    @keyframes dt-mola { to { background-size: 100% 100%; } }
    @media (prefers-reduced-motion: reduce) { [data-largar="mola"]{ background-size: 100% 100%; } }

    /* O auscultador do refrao primeiro (25/10, ui.web.tsx): so com o rato no
       cartao, e sempre enquanto e a pre-escuta dele. A preparar, respira; a
       soar, o anel conta os 15 s. */
    [data-dt~="refrao"]{ opacity:0; transform: scale(.88); cursor: pointer;
      transition: opacity var(--dt-rapido) var(--dt-curva), transform var(--dt-rapido) var(--dt-curva),
                  background-color var(--dt-rapido) var(--dt-curva); }
    [data-dt~="cartao"]:hover [data-dt~="refrao"], [data-dt~="cartao"]:focus-within [data-dt~="refrao"],
    [data-dt~="refrao"][data-dt~="refrao-meu"]{ opacity:1; transform:none; }
    [data-dt~="refrao"]:hover{ background-color: rgba(6,6,8,0.86) !important; transform: scale(1.06); }
    [data-dt~="refrao-meu"]:not([data-dt~="refrao-a-soar"]){ animation: dt-refrao-respira 900ms ease-in-out infinite alternate; }
    @keyframes dt-refrao-respira { from { opacity: 1; } to { opacity: .55; } }
    [data-dt~="refrao-anel"] circle{ stroke-dashoffset: 0; animation: dt-refrao-anel ${PRE_ESCUTA_S}s linear forwards; }
    @keyframes dt-refrao-anel { to { stroke-dashoffset: ${ANEL_DO_REFRAO}; } }
    @media (prefers-reduced-motion: reduce) {
      [data-dt~="refrao-meu"]{ animation: none !important; }
      [data-dt~="refrao-anel"] circle{ animation: none !important; }
    }

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

    /* Guardar: o coracao anima-se a si proprio (components/CoracaoAnimado.web.tsx). */

    /* A capa a dois tons (30/10, desktop/duotone.web.tsx): em repouso a imagem
       fica entre os dois tons, e a cor volta com o rato no cartao (ou no proprio
       quadro). Por cima da imagem a cores, a mesma a cinzentos, multiplicada
       pelo tom claro e aclarada pelo escuro. O desvanecer e so de opacidade. */
    :root{ --duo-baixo: ${TOM_ESCURO}; --duo-alto: ${TOM_CLARO}; }
    [data-dt~="duo"]{ position: relative; overflow: hidden; isolation: isolate; }
    [data-dt~="duo"] [data-dt~="duo-tom"]{ background: var(--duo-alto); isolation: isolate;
      transition: opacity 550ms var(--dt-curva); }
    [data-dt~="duo"] [data-dt~="duo-tom-img"]{ filter: grayscale(1) contrast(1.12) brightness(1.04); mix-blend-mode: multiply; }
    [data-dt~="duo"] [data-dt~="duo-sombra"]{ background: var(--duo-baixo); mix-blend-mode: lighten; }
    [data-dt~="cartao"]:hover [data-dt~="duo-tom"], [data-dt~="cartao"]:focus-within [data-dt~="duo-tom"],
    [data-dt~="duo"]:hover [data-dt~="duo-tom"], [data-dt~="duo"][data-dt~="duo-viva"] [data-dt~="duo-tom"]{ opacity: 0; }

    /* O brilho de metal que segue o cursor (30/10): luz, nao cor. A posicao
       (--mx, --my) escreve-a o ouvinte unico de duotone.web.tsx; sem ela, ao
       centro. */
    [data-dt~="brilho"]{ position: relative; }
    [data-dt~="brilho"]::after{ content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
      z-index: 5; opacity: 0; transition: opacity 350ms var(--dt-curva);
      background: radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,.16), transparent 62%); }
    [data-dt~="brilho"]:hover::after{ opacity: 1; }

    /* A foto e a cor da pagina de um artista, FORA do rolo (22/11, BibliotecaPages.web.tsx):
       sobem com ele 1 px por 1 px pela linha do tempo do rolo (scroll-timeline), no
       compositor e sem JavaScript. Nao e movimento automatico: com "menos movimento"
       continua, senao a foto ficava parada com a pagina a rolar por cima. */
    [data-dt~="pagina-do-artista"]{ timeline-scope: --rolo-do-artista; }
    [data-dt~="pagina-do-artista"] [data-dt~="rolo-da-pagina"]{ scroll-timeline: --rolo-do-artista y; }
    [data-dt~="fundo-do-artista"]{ animation: dt-fundo-do-artista linear both; animation-timeline: --rolo-do-artista;
      animation-range: 0px var(--dt-altura-do-fundo); }
    @keyframes dt-fundo-do-artista{ to{ transform: translateY(calc(-1 * var(--dt-altura-do-fundo))); } }

    /* O vinil por tras do retrato de um artista (30/10, passo 4, desktop/RetratosDosArtistas.web.tsx):
       sai para o lado e roda devagar com o rato no cartao. So transform, e
       so um por cartao. */
    [data-dt~="vinil"]{ transition: transform 800ms var(--dt-curva); }
    [data-dt~="cartao"]:hover [data-dt~="vinil"], [data-dt~="cartao"]:focus-within [data-dt~="vinil"]{ transform: translateX(38%) rotate(120deg); }

    /* A entrada por blocos (30/10, da maquete): cada bloco de uma pagina (uma prateleira)
       entra a subir e a acender, um a seguir ao outro. So opacidade e transform, e com
       "menos movimento" nao anda. O atraso vem da posicao entre os irmaos. */
    @keyframes dt-bloco{ from{ opacity: 0; transform: translateY(16px); } to{ opacity: 1; transform: none; } }
    [data-dt~="bloco"]{ animation: dt-bloco 640ms var(--dt-curva) both; }
    [data-dt~="bloco"]:nth-child(2){ animation-delay: 60ms; }
    [data-dt~="bloco"]:nth-child(3){ animation-delay: 120ms; }
    [data-dt~="bloco"]:nth-child(4){ animation-delay: 180ms; }
    [data-dt~="bloco"]:nth-child(5){ animation-delay: 240ms; }
    [data-dt~="bloco"]:nth-child(6){ animation-delay: 300ms; }
    [data-dt~="bloco"]:nth-child(n+7){ animation-delay: 360ms; }
    /* Mudar de secção nas Definições (24/11, a lista "Refinar o PC"): o cartão novo sobe
       8 px e acende, mais curto do que os blocos de uma página; o que sai não espera. */
    @keyframes dt-seccao{ from{ opacity: 0; transform: translateY(8px); } to{ opacity: 1; transform: none; } }
    [data-dt~="seccao-entra"]{ animation: dt-seccao 320ms var(--dt-curva) both; }
    /* As prateleiras param no começo de um cartão (24/11, a mesma lista): as setas e o
       largar de um arrasto já o fazem (useCarrossel, ui.web.tsx); isto é para o rolar do
       trackpad e da roda. O atributo põe-no o useCarrossel. */
    [data-carrossel]{ scroll-snap-type: x mandatory; }
    [data-carrossel] > div > *{ scroll-snap-align: start; }

    /* A decada (30/10): o numero e so contorno, e enche-se com o rato no cartao. */
    [data-dt~="decada-nome"]{ transition: color 500ms var(--dt-curva), -webkit-text-stroke-color 500ms var(--dt-curva); }
    [data-dt~="cartao"]:hover [data-dt~="decada-nome"], [data-dt~="cartao"]:focus-within [data-dt~="decada-nome"]{ color: ${COR.texto}; -webkit-text-stroke-color: ${COR.texto}; }

    /* O play que sobe no canto de um cartao (30/10): aparece com o rato no cartao ou com o foco la dentro. */
    [data-dt~="play-cartao"]{ opacity: 0; transform: translateY(8px) scale(.92);
      transition: opacity var(--dt-rapido) var(--dt-curva), transform var(--dt-normal) var(--dt-curva); }
    [data-dt~="cartao"]:hover [data-dt~="play-cartao"], [data-dt~="cartao"]:focus-within [data-dt~="play-cartao"]{ opacity: 1; transform: none; }

    /* O mosaico de uma playlist abre-se (8/11, a maquete das Playlists de 30/10,
       paginas/comum.web.tsx). Desde 24/11 (a maquete "Hover dos Albums e das
       Playlists"), com o rato no cartao os quadros soltam-se como capas separadas: a
       moldura escura apaga-se (a cor da playlist, por tras, aparece nos intervalos),
       cada quadro sai 5 px do centro com os seus cantos e a sua sombra, um a seguir ao
       outro (30 ms; a fechar, juntos), e a imagem cresce 5 % dentro dele. Ate ai saiam
       2,5 px e a moldura cortava-os pelas bordas: lia-se como as linhas a engrossar. Os
       cantos de fora de cada quadro sao os da moldura, por isso ela ja nao corta. No
       cabecalho da playlist (que nao e um cartao) fica parado. */
    [data-dt~="mosaico"]{ overflow: visible !important;
      transition: background-color 400ms var(--dt-curva), border-color 400ms var(--dt-curva), box-shadow 400ms var(--dt-curva); }
    [data-dt~="cartao"]:hover [data-dt~="mosaico"]{ background-color: transparent !important; border-color: transparent !important; box-shadow: none !important; }
    [data-dt~="mosaico-quadro"]{ transition: transform 600ms var(--dt-curva), border-radius 600ms var(--dt-curva), box-shadow 600ms var(--dt-curva); }
    [data-dt~="mq-te"]{ border-radius: 13px 0 0 0; }
    [data-dt~="mq-td"]{ border-radius: 0 13px 0 0; }
    [data-dt~="mq-be"]{ border-radius: 0 0 0 13px; }
    [data-dt~="mq-bd"]{ border-radius: 0 0 13px 0; }
    [data-dt~="mq-e"]{ border-radius: 13px 0 0 13px; }
    [data-dt~="mq-d"]{ border-radius: 0 13px 13px 0; }
    [data-dt~="mosaico-img"]{ transition: transform 800ms var(--dt-curva); }
    [data-dt~="cartao"]:hover [data-dt~="mosaico-quadro"]{ box-shadow: 0 10px 22px rgba(0,0,0,.45); }
    [data-dt~="cartao"]:hover [data-dt~="mq-te"]{ transform: translate(-5px, -5px); border-radius: 13px 8px 8px 8px; }
    [data-dt~="cartao"]:hover [data-dt~="mq-td"]{ transform: translate(5px, -5px); border-radius: 8px 13px 8px 8px; transition-delay: 30ms; }
    [data-dt~="cartao"]:hover [data-dt~="mq-be"]{ transform: translate(-5px, 5px); border-radius: 8px 8px 8px 13px; transition-delay: 60ms; }
    [data-dt~="cartao"]:hover [data-dt~="mq-bd"]{ transform: translate(5px, 5px); border-radius: 8px 8px 13px 8px; transition-delay: 90ms; }
    [data-dt~="cartao"]:hover [data-dt~="mq-e"]{ transform: translateX(-5px); border-radius: 13px 8px 8px 13px; }
    [data-dt~="cartao"]:hover [data-dt~="mq-d"]{ transform: translateX(5px); border-radius: 8px 13px 13px 8px; transition-delay: 30ms; }
    [data-dt~="cartao"]:hover [data-dt~="mosaico-img"]{ transform: scale(1.05); }
    /* A pasta dos Albums abre-se (24/11, a mesma maquete, a "Separar"): as capas
       afastam-se na diagonal em que estao, abrem o angulo e ficam opacas. Os dois
       lugares vem no style de cada uma (--rodar, --dx...), de lib/albunsGuardados.ts.
       So transform e opacidade. */
    [data-dt~="pasta-capa"]{ opacity: var(--opacidade); transform: translate(0px, 0px) rotate(var(--rodar));
      transition: transform 600ms var(--dt-curva), opacity 400ms var(--dt-curva); }
    [data-dt~="cartao"]:hover [data-dt~="pasta-capa"], [data-dt~="cartao"]:focus-visible [data-dt~="pasta-capa"]{
      opacity: 1; transform: translate(var(--dx), var(--dy)) rotate(var(--rodar-aberta)); }
    /* A cor da playlist por tras do cartao (a "aura" da maquete): so opacidade. */
    [data-dt~="cartao-aura"]{ opacity: 0; transition: opacity 600ms var(--dt-curva); }
    [data-dt~="cartao"]:hover [data-dt~="cartao-aura"], [data-dt~="cartao"]:focus-within [data-dt~="cartao-aura"]{ opacity: .85; }
    @media (prefers-reduced-motion: reduce){
      [data-dt~="cartao"]:hover [data-dt~="mosaico-quadro"], [data-dt~="cartao"]:hover [data-dt~="mosaico-img"]{ transform: none; }
      [data-dt~="cartao"]:hover [data-dt~="pasta-capa"], [data-dt~="cartao"]:focus-visible [data-dt~="pasta-capa"]{ transform: translate(0px, 0px) rotate(var(--rodar)); }
    }
    /* A cor da playlist no topo da pagina dela chega depois de ler a capa: entra
       devagar, em vez de aparecer de repente (so opacidade). */
    [data-dt~="lavagem-da-playlist"]{ animation: dt-lavagem 600ms var(--dt-curva) both; }
    @keyframes dt-lavagem { from { opacity: 0; } to { opacity: 1; } }
    /* As lavagens desfazem-se nos lados e em cima (9/11): sem a moldura, a borda
       reta da cor (a da playlist, o cinzento das Liked Songs) lia-se como um fio
       entre a lateral e a página, e outro por baixo da faixa da janela. */
    /* A barra das escolhidas (9/11) entra como as placas, por cima do leitor. */
    [data-dt~="barra-das-escolhidas"]{ animation: dt-placa var(--dt-premir-ms) var(--dt-premir) both; }
    [data-dt~="lavagem"], [data-dt~="lavagem-da-playlist"]{
      -webkit-mask-image: linear-gradient(90deg, transparent, #000 160px, #000 calc(100% - 160px), transparent), linear-gradient(180deg, transparent, #000 56px);
      -webkit-mask-composite: source-in;
      mask-image: linear-gradient(90deg, transparent, #000 160px, #000 calc(100% - 160px), transparent), linear-gradient(180deg, transparent, #000 56px);
      mask-composite: intersect;
    }

    /* O Social (30/10, passo 7, components/SocialOverview.web.tsx). Um amigo a
       ouvir: as barrinhas mexem-se, e o "Listen along" aparece com o rato no
       cartao (ou com o foco la dentro, para o teclado o encontrar). A linha de
       uma conversa acende com o rato. So opacidade, transform e fundo. */
    /* Aos saltos, como as barras da fila (22/11): 4 desenhos por segundo, e não 60. */
    [data-dt~="eq"] > *{ transform-origin: bottom; animation: dt-eq 1s step-end infinite; }
    [data-dt~="eq"] > *:nth-child(2){ animation-delay: 250ms; }
    [data-dt~="eq"] > *:nth-child(3){ animation-delay: 500ms; }
    @keyframes dt-eq{ 0%{ transform: scaleY(.3); } 25%{ transform: scaleY(.7); } 50%{ transform: scaleY(1); } 75%{ transform: scaleY(.55); } 100%{ transform: scaleY(.3); } }
    /* O cartão de quem ouve e o "Listen along" ao passar saíram a 22/11 (a B4): quem ouve
       é a linha dos amigos da lateral (\`ouvinte\`, mais abaixo). */
    [data-dt~="conversa"]{ transition: background-color var(--dt-rapido) var(--dt-curva); }
    [data-dt~="conversa"]:hover{ background-color: rgba(233,234,238,.05); }

    /* A fila a sair e a entrar (30/10, passo 1 do PC elevado). Clear: as linhas
       saem em cascata (o atraso de cada uma vai inline, atrasoDaLinha). A Radio
       a trocar a fila: as linhas viram e saem enquanto ela procura, e as novas
       entram a virar. Transform e opacidade, e a altura a fechar (as linhas tem
       min-height inline, por isso fecha-se tambem). Sem cliques enquanto saem. */
    .np-fila-sai{ pointer-events: none; overflow: hidden; animation: dt-fila-sai 460ms var(--dt-curva) both; }
    @keyframes dt-fila-sai{
      0%{ opacity: 1; transform: none; max-height: 64px; }
      50%{ opacity: 0; transform: translateX(52px) scale(.97); max-height: 64px; min-height: 0; }
      100%{ opacity: 0; transform: translateX(52px); max-height: 0; min-height: 0; padding-top: 0; padding-bottom: 0; }
    }
    .np-fila-vira{ pointer-events: none; overflow: hidden; transform-origin: 50% 0;
      animation: dt-fila-vira 460ms var(--dt-sair) both; }
    @keyframes dt-fila-vira{
      0%{ opacity: 1; transform: perspective(900px) rotateX(0); max-height: 64px; }
      55%{ opacity: 0; transform: perspective(900px) rotateX(-88deg); max-height: 64px; min-height: 0; }
      100%{ opacity: 0; transform: perspective(900px) rotateX(-88deg); max-height: 0; min-height: 0; padding-top: 0; padding-bottom: 0; }
    }
    .np-fila-entra{ transform-origin: 50% 0; animation: dt-fila-entra 620ms var(--dt-curva) backwards; }
    @keyframes dt-fila-entra{ from{ opacity: 0; transform: perspective(900px) rotateX(88deg); } to{ opacity: 1; transform: none; } }
    /* O Radio ligado: os arcos respiram (quietos com a musica em pausa), e um
       anel abre-se quando a fila nova chega. */
    [data-dt~="radio-onda"]{ animation: dt-radio-onda 1.8s ease-in-out infinite; }
    [data-dt~="radio-onda"][data-dt~="radio-parado"]{ animation-play-state: paused; }
    @keyframes dt-radio-onda{ 50%{ opacity: .35; } }
    [data-dt~="radio-anel"]{ animation: dt-radio-anel 950ms var(--dt-curva) both; }
    @keyframes dt-radio-anel{ from{ box-shadow: 0 0 0 0 rgba(233,234,238,.4); } to{ box-shadow: 0 0 0 14px rgba(233,234,238,0); } }
    /* O atalho para a faixa que toca (30/10, TrackTable): sobe de leve ao aparecer. */
    [data-dt~="salto-atual"]{ animation: dt-linha 220ms var(--dt-curva) backwards; }

    /* A viagem partilhada (30/10, desktop/viagem.web.ts): o mosaico de uma playlist voa da
       grelha para o cabeçalho da página. A raiz é a lateral e a barra, que não mudam. */
    ::view-transition-group(portrait){ animation-duration: var(--dt-entrada-ms); animation-timing-function: var(--dt-entrada); }
    ::view-transition-old(portrait), ::view-transition-new(portrait){ height: 100%; object-fit: cover; }
    ::view-transition-old(root), ::view-transition-new(root){ animation-duration: 220ms; }
    /* A Passagem de luz (C6, 1/11, desktop/Luz.web.ts): só a página troca. A de agora sai depressa,
       e a nova sobe 8 px com a mola ENTRADA. O nome só existe durante a viagem, porque um
       view-transition-name faz da página um contexto de empilhamento. O corte é para os 8 px
       não passarem por cima da barra do leitor enquanto ela sobe. */
    html[data-viagem] [data-dt~="pagina-da-janela"]{ view-transition-name: dt-pagina; }
    ::view-transition-group(dt-pagina){ overflow: clip; }
    ::view-transition-old(dt-pagina){ animation: dt-vt-sai var(--dt-sair-ms) var(--dt-sair) both; }
    ::view-transition-new(dt-pagina){ animation: dt-vt-entra var(--dt-entrada-ms) var(--dt-entrada) both; }
    @keyframes dt-vt-sai{ to{ opacity:0; } }
    @keyframes dt-vt-entra{ from{ opacity:0; transform: translateY(8px); } }
    /* A página que chega calada (30/10, o "refresh" ao voltar): a volta e a viagem não repetem a
       entrada. A marca fica na página enquanto ela está no ecrã (TransicaoDePagina) e NÃO sai com a
       viagem: tirar um "animation: none" põe a animação a correr de novo, e a página piscava a
       zero e entrava outra vez logo a seguir ao fim da viagem. */
    [data-dt~="pagina"][data-chegada="calada"],
    [data-dt~="pagina"][data-chegada="calada"] [data-dt~="bloco"],
    [data-dt~="pagina"][data-chegada="calada"] [data-dt~="cartao"],
    [data-dt~="pagina"][data-chegada="calada"] [data-dt~="fila"]{ animation: none !important; }
    @media (prefers-reduced-motion: reduce){
      ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*){ animation: none !important; }
    }

    /* Os ícones da barra do leitor que mudam de estado (30/10, passo 8,
       desktop/IconesDeEstado.web.tsx): cada um com a sua animação, só de
       movimento e opacidade e de traços que se desenham (pathLength 1). A mola
       é a da maquete. O primeiro desenho não anima: só as mudanças (data-anima). */
    [data-dt~="ie"]{ position: relative; display: inline-grid; place-items: center; pointer-events: none; flex: none;
      transition: color var(--dt-rapido) var(--dt-curva); }
    [data-dt~="ie"] svg{ width: 100%; height: 100%; display: block; overflow: visible; }
    [data-dt~="ie-ponto"]{ position: absolute; bottom: -3px; left: 50%; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%;
      background: currentColor; transform: scale(0); transition: transform 450ms var(--dt-mola); }
    [data-dt~="ie"]:not([data-s="off"]) [data-dt~="ie-ponto"]{ transform: scale(1); }
    /* shuffle: as duas setas desenham-se, uma a seguir à outra */
    [data-dt~="ie-linha"]{ stroke-dasharray: 1; stroke-dashoffset: 0; }
    [data-dt~="ie-shuffle"][data-anima] [data-dt~="ie-linha"]{ animation: dt-ie-desenha 500ms var(--dt-curva) both; }
    [data-dt~="ie-shuffle"][data-anima] [data-dt~="ie-linha2"]{ animation-delay: 120ms; }
    @keyframes dt-ie-desenha{ from{ stroke-dashoffset: 1; } to{ stroke-dashoffset: 0; } }
    /* repeat: gira sempre mais uma volta (o valor da rotação sobe no estilo), e o "1" salta para dentro */
    [data-dt~="ie-repeat"] svg{ transition: transform 750ms var(--dt-mola); }
    [data-dt~="ie-um"]{ position: absolute; left: 50%; top: 50%; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; border-radius: 50%;
      background: ${COR.texto}; color: ${COR.fundo}; font: 800 8px/11px ${FONT.body}; text-align: center;
      transform: scale(0); transition: transform 500ms var(--dt-mola); }
    [data-dt~="ie-repeat"][data-s="one"] [data-dt~="ie-um"]{ transform: scale(1); }
    /* play / pause: o ícone que sai roda um quarto de volta e encolhe, o que entra vem do outro lado */
    [data-dt~="ie-i1"], [data-dt~="ie-i2"]{ position: absolute; inset: 0; display: grid; place-items: center;
      transition: transform 500ms var(--dt-mola), opacity 200ms var(--dt-curva); }
    [data-dt~="ie-play"][data-s="playing"] [data-dt~="ie-i1"]{ opacity: 0; transform: rotate(-90deg) scale(.35); }
    [data-dt~="ie-play"][data-s="paused"] [data-dt~="ie-i2"]{ opacity: 0; transform: rotate(90deg) scale(.35); }
    /* volume: os arcos desenham-se um a um; sem som, um traço corta o altifalante */
    [data-dt~="ie-arco"], [data-dt~="ie-corte"]{ stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset 400ms var(--dt-curva); }
    [data-dt~="ie-arco2"]{ transition-delay: 120ms; }
    [data-dt~="ie-volume"]:not([data-s="mudo"]) [data-dt~="ie-arco1"],
    [data-dt~="ie-volume"][data-s="alto"] [data-dt~="ie-arco2"],
    [data-dt~="ie-volume"][data-s="mudo"] [data-dt~="ie-corte"]{ stroke-dashoffset: 0; }
    [data-dt~="ie-volume"][data-s="mudo"] [data-dt~="ie-arco"]{ transition-delay: 0ms; }
    /* Jam: ligada, abrem-se ondas à volta dos auscultadores, uma depois da outra */
    [data-dt~="ie-jam"]::before, [data-dt~="ie-jam"]::after{ content: ''; position: absolute; inset: -4px; border-radius: 50%;
      border: 1.5px solid rgba(233,234,238,.55); opacity: 0; pointer-events: none; }
    [data-dt~="ie-jam"][data-s="on"]::before{ animation: dt-ie-onda 2400ms ease-out infinite; }
    [data-dt~="ie-jam"][data-s="on"]::after{ animation: dt-ie-onda 2400ms ease-out 1200ms infinite; }
    @keyframes dt-ie-onda{ from{ opacity: .9; transform: scale(.7); } to{ opacity: 0; transform: scale(1.6); } }

    /* A primeira música abre espaço sem um salto. O nó mantém-se nos skips;
       o recorte só dura a entrada, para depois deixar passar os efeitos dos botões.
       Desde 23/11 (a maquete "Painel e leitor a abrir") a barra sobe da borda da janela ao
       passo do lugar, sem o acender de 12 px, e a capa com o título, os botões e os ícones
       acendem em escada. */
    [data-dt~="entrada-da-barra"] { display: grid; grid-template-rows: 1fr; flex-shrink: 0; animation: dt-barra-entra 460ms var(--dt-entrada) backwards; }
    [data-dt~="entrada-da-barra"] > div { min-height: 0; }
    @keyframes dt-barra-entra {
      from { grid-template-rows: 0fr; opacity: .3; overflow: hidden; }
      to { grid-template-rows: 1fr; opacity: 1; overflow: hidden; }
    }
    [data-dt~="entrada-da-barra"] [data-dt~="barra-e"]{ animation: dt-barra-e 300ms var(--dt-entrada) 80ms backwards; }
    [data-dt~="entrada-da-barra"] [data-dt~="barra-e-2"]{ animation-delay: 130ms; }
    [data-dt~="entrada-da-barra"] [data-dt~="barra-e-3"]{ animation-delay: 180ms; }
    @keyframes dt-barra-e { from { opacity: 0; } to { opacity: 1; } }
    /* Fechar pelo botão ou pelo menu (23/11): a barra desce para fora da janela e a página
       desce com ela, num só movimento, no tempo do som a apagar-se (o closeGain, 300 ms).
       Arrastar para a direita continua a fechar para a direita (o dragX). */
    [data-dt~="entrada-da-barra"][data-fechar] { animation: dt-barra-fecha 300ms var(--dt-travar) both; }
    @keyframes dt-barra-fecha {
      from { grid-template-rows: 1fr; opacity: 1; overflow: hidden; }
      to { grid-template-rows: 0fr; opacity: .3; overflow: hidden; }
    }
    /* A troca de música na barra (23/11): o título e o artista saem para cima e os novos
       sobem de baixo; a voltar à anterior, ao contrário. A capa faz a Ocultação ao lado. */
    [data-dt~="texto-entra"]{ animation: dt-texto-sobe 420ms var(--dt-entrada) both; }
    [data-dt~="texto-entra"][data-dt~="recua"]{ animation-name: dt-texto-desce; }
    [data-dt~="texto-sai"]{ pointer-events: none; animation: dt-texto-sai-sobe var(--dt-sair-ms) var(--dt-sair) both; }
    [data-dt~="texto-sai"][data-dt~="recua"]{ animation-name: dt-texto-sai-desce; }
    @keyframes dt-texto-sobe { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @keyframes dt-texto-desce { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
    @keyframes dt-texto-sai-sobe { to { opacity: 0; transform: translateY(-10px); } }
    @keyframes dt-texto-sai-desce { to { opacity: 0; transform: translateY(10px); } }
    /* E a saída (22/11): a barra já desvaneceu (o closeGain); o lugar dela fecha-se
       com a mesma curva, e a página desce sem um salto. */
    [data-dt~="saida-da-barra"] { flex-shrink: 0; overflow: hidden; pointer-events: none;
      animation: dt-barra-sai 320ms var(--dt-curva) both; }
    @keyframes dt-barra-sai { from { height: var(--dt-altura-da-barra); } to { height: 0; } }
    /* As saídas (22/11, antes da 7.0.0): tudo o que entra também sai, com a curva de
       sair (160 ms, a acelerar). Quem sai fica montado esse tempo (desktop/Saida.web.tsx)
       e não apanha o rato. Os menus deixam uma cópia a desvanecer (desktop/fantasma.web.ts),
       e lá dentro nada mais mexe. */
    [data-dt~="a-sair"]{ pointer-events: none !important; }
    [data-dt~="veu"][data-dt~="a-sair"]{ animation: dt-desaparecer var(--dt-sair-ms) var(--dt-sair) both; }
    [data-dt~="dialogo"][data-dt~="a-sair"]{ animation: dt-dialogo-sai var(--dt-sair-ms) var(--dt-sair) both; }
    [data-dt~="aviso"][data-dt~="a-sair"], [data-dt~="barra-da-selecao"][data-dt~="a-sair"]{
      animation: dt-descer var(--dt-sair-ms) var(--dt-sair) both; }
    [data-fantasma], [data-fantasma] *{ animation: none !important; transition: none !important; }
    @keyframes dt-desaparecer{ from{ opacity: 1; } to{ opacity: 0; } }
    @keyframes dt-dialogo-sai{ from{ opacity: 1; transform: none; } to{ opacity: 0; transform: translateY(4px) scale(.98); } }
    @keyframes dt-descer{ from{ opacity: 1; transform: none; } to{ opacity: 0; transform: translateY(40%); } }
    [data-dt~="aviso-msg"][data-dt~="a-sair"]{ animation: dt-aviso-msg-sai var(--dt-sair-ms) var(--dt-sair) both; }
    @keyframes dt-aviso-msg-sai{ from{ opacity: 1; transform: none; } to{ opacity: 0; transform: translateY(-16px) scale(.98); } }
    /* O que aparece no meio de uma lista (uma opção que só existe com outra ligada,
       desktop/Revelar.web.tsx): abre o lugar e fecha-o, e o resto desce e sobe com ele. */
    [data-dt~="revelar"]{ display: grid; grid-template-rows: 1fr; }
    [data-dt~="revelar"] > div{ min-height: 0; overflow: hidden; }
    [data-dt~="revelar"][data-dt~="a-entrar"]{ animation: dt-revelar 240ms var(--dt-curva) both; }
    [data-dt~="revelar"][data-dt~="a-sair"]{ animation: dt-revelar 200ms var(--dt-sair) reverse both; }
    @keyframes dt-revelar{ from{ grid-template-rows: 0fr; opacity: 0; } to{ grid-template-rows: 1fr; opacity: 1; } }

    /* O Social do PC (22/11, a B4 de .claude/planos/PLANO-SOCIAL-B4.md). */
    /* Quem ouve: o Listen along aparece com o rato, como na lateral; a seguir, fica. */
    [data-dt~="ouvinte"]{ transition: background-color var(--dt-rapido) var(--dt-curva); }
    [data-dt~="ouvinte"]:hover, [data-dt~="ouvinte"]:focus-within{ background-color: ${ESTADO.hover}; }
    [data-dt~="ouvinte-play"]{ opacity: 0; transition: opacity var(--dt-rapido) var(--dt-curva), transform var(--dt-rapido) var(--dt-curva); }
    [data-dt~="ouvinte"]:hover [data-dt~="ouvinte-play"], [data-dt~="ouvinte-play"]:focus-visible, [data-dt~="ouvinte-play"][data-dt~="a-seguir"]{ opacity: 1; }
    [data-dt~="ouvinte-play"]:hover{ transform: scale(1.08); }
    /* Um ícone que troca roda com a mola ESTADO (▶ e ×, ♪ e ↑), como o giro do play/pause. */
    [data-dt~="vira"]{ transition: transform var(--dt-estado-ms) var(--dt-estado); }
    [data-dt~="a-seguir"] > [data-dt~="vira"], [data-dt~="com-texto"] > [data-dt~="vira"]{ transform: rotate(360deg); }
    /* O contador das por ler entra com a mola SOLTAR. */
    [data-dt~="contador"]{ animation: dt-contador var(--dt-soltar-ms) var(--dt-soltar) both; }
    @keyframes dt-contador{ from{ opacity: 0; transform: scale(.3); } to{ opacity: 1; transform: none; } }
    /* Trocar de conversa: a nova sobe 10 px com a ENTRADA. */
    [data-dt~="conversa-entra"]{ animation: dt-conversa-entra var(--dt-entrada-ms) var(--dt-entrada) both; }
    @keyframes dt-conversa-entra{ from{ opacity: 0; transform: translateY(10px); } to{ opacity: 1; transform: none; } }
    /* O painel do amigo: a conversa abre lugar em 460 ms; o painel entra 140 ms depois, e sai com a curva de sair. */
    [data-dt~="conversa-com-painel"]{ transition: padding-right 460ms var(--dt-entrada); }
    [data-dt~="conversa-com-painel"][data-dt~="com-painel"]{ padding-right: calc(var(--dt-painel-amigo, 220px) + ${ESP.xl}px); }
    html[data-a-redimensionar] [data-dt~="conversa-com-painel"]{ transition: none; }
    [data-dt~="painel-amigo"]{ animation: dt-painel-amigo 320ms var(--dt-entrada) 140ms both; }
    [data-dt~="painel-amigo"][data-dt~="a-sair"]{ animation: dt-painel-amigo-sai 190ms var(--dt-sair) both; }
    @keyframes dt-painel-amigo{ from{ opacity: 0; transform: translateX(28px); } to{ opacity: 1; transform: none; } }
    @keyframes dt-painel-amigo-sai{ from{ opacity: 1; transform: none; } to{ opacity: 0; transform: translateX(16px); } }
    /* As mensagens esbatem-se nos 28 px de cima. */
    [data-dt~="mascara-da-conversa"]{ -webkit-mask-image: linear-gradient(180deg, transparent, #000 28px); mask-image: linear-gradient(180deg, transparent, #000 28px); }
    /* Mandar: a linha abre-se (as de cima sobem a deslizar) e o balão sobe do campo com a SOLTAR.
       Receber: chega 8 px e a 0,98 com a ENTRADA. Abrir: as de baixo em cascata. */
    [data-dt~="msg-minha"], [data-dt~="msg-dele"]{ display: grid; grid-template-rows: 1fr; }
    [data-dt~="msg-minha"] > div, [data-dt~="msg-dele"] > div{ min-height: 0; overflow: hidden; }
    [data-dt~="msg-minha"]{ animation: dt-msg-abre 420ms var(--dt-entrada) both; }
    [data-dt~="msg-minha"] > div{ transform-origin: 100% 100%; animation: dt-msg-sobe var(--dt-soltar-ms) var(--dt-soltar) both; }
    [data-dt~="msg-dele"]{ animation: dt-msg-abre 300ms var(--dt-entrada) both; }
    [data-dt~="msg-dele"] > div{ transform-origin: 0 100%; animation: dt-msg-chega var(--dt-entrada-ms) var(--dt-entrada) both; }
    [data-dt~="msg-cascata"] > div{ animation: dt-msg-cascata var(--dt-entrada-ms) var(--dt-entrada) both; }
    @keyframes dt-msg-abre{ from{ grid-template-rows: 0fr; } to{ grid-template-rows: 1fr; } }
    @keyframes dt-msg-sobe{ from{ opacity: 0; transform: translateY(26px) scale(.94); } to{ opacity: 1; transform: none; } }
    @keyframes dt-msg-chega{ from{ opacity: 0; transform: translateY(8px) scale(.98); } to{ opacity: 1; transform: none; } }
    @keyframes dt-msg-cascata{ from{ opacity: 0; transform: translateY(10px); } to{ opacity: 1; transform: none; } }

    /* Quem pediu menos movimento no Windows nao leva nada disto. O estado
       final e o mesmo: aqui so morre o caminho ate la. */
    @media (prefers-reduced-motion: reduce){
      [data-dt~="painel-do-leitor"] { transition: none !important; }
      [data-dt~="a-sair"]{ animation: none !important; opacity: 0 !important; }
      [data-dt~="revelar"]{ animation: none !important; }
      [data-dt~="separador"]::after{ transition: none !important; }
      #duotone-dica{ transition: none !important; transform: none !important; }
      [data-dt~="entrada-da-barra"], [data-dt~="saida-da-barra"],
      [data-dt~="fila"], [data-dt~="dialogo"], [data-dt~="veu"], [data-dt~="aviso"],
      [data-dt~="menu-amigo"], [data-dt~="aviso-msg"],
      [data-dt~="pagina"], [data-dt~="pagina"] [data-dt~="cartao"], [data-dt~="formas"],
      [data-dt~="carregando"] [data-dt~="forma"], [data-dt~="placa"],
      [data-dt~="fila"] [data-dt~="barras"] [data-dt~="barra"],
      .np-fila-sai, .np-fila-vira, .np-fila-entra,
      [data-dt~="radio-onda"], [data-dt~="radio-anel"], [data-dt~="salto-atual"],
      [data-dt~="ie-shuffle"][data-anima] [data-dt~="ie-linha"], [data-dt~="ie-jam"]::before, [data-dt~="ie-jam"]::after{ animation: none !important; }
      /* Com menos movimento, as formas sem luz (uma banda parada lia-se como um risco). */
      [data-dt~="carregando"] [data-dt~="forma"]{ background-image: none !important; }
      [data-dt~="linha-da-letra"]{ transition: none !important; }
      [data-dt~="premir"], [data-dt~="desliza"], [data-dt~="campo"], [data-dt~="fila"] [data-dt~="toca"],
      [data-dt~="fila"] [data-dt~="mais"], [data-dt~="fila"] [data-dt~="numero"],
      [data-dt~="cartao"], [data-dt~="coracaoDoCartao"], [data-dt~="a-sair"], [data-dt~="main-a-voltar"],
      [data-dt~="duo"] [data-dt~="duo-tom"], [data-dt~="brilho"]::after,
      [data-dt~="ie"], [data-dt~="ie-ponto"], [data-dt~="ie-repeat"] svg, [data-dt~="ie-um"], [data-dt~="ie-i1"], [data-dt~="ie-i2"],
      [data-dt~="ie-arco"], [data-dt~="ie-corte"]{ transition: none !important; }
      /* A sair do Now Playing: some logo, como antes (o tempo da saída corre na
         mesma, mas já invisível). */
      [data-dt~="np-a-sair"], [data-dt~="janela-cor"][data-dt~="a-apagar"]{ animation: none !important; opacity: 0 !important; }
      [data-dt~="cartao"]:hover{ transform: none !important; }
      [data-dt~="amigo"]:hover [data-dt~="rola"]{ animation: none !important; overflow: hidden !important; text-overflow: ellipsis !important; }
      [data-dt~="amigo"]:hover [data-dt~="rola-caixa"]{ -webkit-mask-image: none; mask-image: none; }
      [data-dt~="premir"]:active{ transform: none !important; }
      /* O Social (B4, 22/11): os estados ficam, o caminho não. */
      [data-dt~="contador"], [data-dt~="conversa-entra"], [data-dt~="painel-amigo"], [data-dt~="msg-minha"], [data-dt~="msg-minha"] > div,
      [data-dt~="msg-dele"], [data-dt~="msg-dele"] > div, [data-dt~="msg-cascata"] > div{ animation: none !important; }
      [data-dt~="vira"], [data-dt~="conversa-com-painel"], [data-dt~="ouvinte"], [data-dt~="ouvinte-play"]{ transition: none !important; }
      /* O painel e o Now Playing a abrir (23/11): o lugar e a página mudam logo, sem caminho. */
      [data-dt~="painel-dentro"], [data-dt~="pagina-sob-o-leitor"]{ transition: none !important; }
      [data-dt~="np-camada"] [data-dt~="np-sobe"]{ animation: none !important; }
      [data-dt~="barra-e"], [data-dt~="texto-entra"], [data-dt~="texto-sai"], [data-dt~="seccao-entra"]{ animation: none !important; }
      [data-dt~="texto-sai"]{ opacity: 0 !important; }
    }
  `;
  document.head.appendChild(style);
  document.title = 'Duotone';
  ligarBrilhoDoCursor();
}

/** `comPainel`: a seta do painel da Queue e das Lyrics só existe com a app aberta (no login não há painel). */
/**
 * A marca da janela no topo da lateral (9/11): saiu da barra de título, que na app
 * passou a ser só a faixa por cima da página. Arrasta a janela e o duplo clique
 * maximiza, como a barra de onde veio. Recolhida, fica só o símbolo.
 */
export function MarcaDaJanela({ compacta = false }: { compacta?: boolean }) {
  return <View style={[styles.marcaDaJanela, compacta && { paddingLeft: 0, justifyContent: 'center' }] as any}
    onDoubleClick={() => window.duotoneDesktop?.toggleMaximize()}>
    <Image source={require('../../assets/auth-logo.png')} style={{ width: 22, height: 22 }} resizeMode="contain" />
    {compacta ? null : <Text style={styles.titleText}>Duotone</Text>}
  </View>;
}

export function TitleBar({ comPainel = false, semMarca = false }: { comPainel?: boolean;
  /** Na app a marca está no topo da lateral (`MarcaDaJanela`); no login fica aqui. */
  semMarca?: boolean }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const bridge = window.duotoneDesktop;
    bridge?.isMaximized().then(setMaximized);
    return bridge?.onMaximizedChange(setMaximized);
  }, []);
  return <View style={styles.titleBar as any} onDoubleClick={() => window.duotoneDesktop?.toggleMaximize()}>
    {semMarca ? null : <View style={styles.titleBrand}><Image source={require('../../assets/auth-logo.png')} style={{ width: 22, height: 22 }} resizeMode="contain" /><Text style={styles.titleText}>Duotone</Text></View>}
    <View style={styles.dragRegion as any} />
    {comPainel ? <SetaDoPainel /> : null}
    <View style={styles.windowButtons as any}>
      <Pressable accessibilityLabel="Minimize" onPress={() => window.duotoneDesktop?.minimize()} style={({ hovered }) => [styles.windowButton, hovered && styles.windowButtonHover]}><Ionicons name="remove-outline" size={17} color={COR.textoMedio} /></Pressable>
      <Pressable accessibilityLabel={maximized ? 'Restore' : 'Maximize'} onPress={() => window.duotoneDesktop?.toggleMaximize()} style={({ hovered }) => [styles.windowButton, hovered && styles.windowButtonHover]}><Ionicons name={maximized ? 'copy-outline' : 'square-outline'} size={13} color={COR.textoMedio} /></Pressable>
      <Pressable accessibilityLabel="Close" onPress={() => window.duotoneDesktop?.close()} style={({ hovered }) => [styles.windowButton, hovered && styles.closeHover]}><Ionicons name="close-outline" size={20} color={COR.textoMedio} /></Pressable>
    </View>
  </View>;
}

export function Sidebar({ route, navigate, notify, voltar, leitorAberto = false }: { route: Route; navigate: (route: Route) => void; notify: (texto: string) => void;
  /** O voltar da janela: uma música arrastada que abriu as Playlists volta por aqui (25/10). */
  voltar?: () => void;
  /**
   * O Now Playing está aberto por cima da página (8/11): nenhuma entrada fica acesa.
   * Ficava a de onde se veio ("Social" aceso com o leitor à frente), e a lateral
   * dizia que se estava num sítio que não se via.
   */
  leitorAberto?: boolean }) {
  const session = useAuth((s) => s.session);
  // Arrastada para menos de metade do caminho, a lateral recolhe numa régua só de ícones (31/10).
  const compacta = useLateralRecolhida();
  const tema = useTheme((s) => s.theme);
  // Uma mistura abre-se a partir da Pesquisa: e ai que o separador tem de
  // ficar aceso, senao a barra dizia que se estava noutro sitio.
  const active: string | null = leitorAberto ? null
    : route.name === 'artist' ? 'artists'
    : route.name === 'mistura' ? 'search'
    : route.name === 'library-check' ? 'settings'
    : route.name === 'stats' || route.name === 'retrospetiva' ? 'profile'
    : route.name === 'voces-os-dois' ? 'social'
    : route.name === 'playlist' || route.name === 'import' || route.name === 'albuns' ? 'playlists' : route.name;

  const [name,setName]=useState('Profile');
  // O @ da conta (30/10): por baixo do nome, em vez do email. É do mesmo perfil
  // público que já se lê para o nome (cache, sem pedido novo).
  const [username,setUsername]=useState<string|null>(null);
  const [publicAvatar,setPublicAvatar]=useState<string|null>(null);
  const profileVersion=useSocial(s=>s.profileVersion);
  const socialReceived=useSocial(s=>s.received);
  const socialSeen=useSocial(s=>s.seen);
  const socialFriends=useSocial(s=>s.friends);
  useEffect(()=>{
    let active=true;
    if(!session)return;
    const refresh=()=>getPublicProfiles([session.user.id]).then(([p])=>{if(active&&p){setName(p.name);setUsername(p.username||null);setPublicAvatar(p.avatar_url);}}).catch(()=>{});
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
  // O botão direito nas Liked Songs (24/10, lib/menuDaMistura.ts): tocar ou
  // baralhar a biblioteca sem abrir a página. Os outros itens são só lugares.
  const [menuDasLiked,setMenuDasLiked]=useState<PontoNoEcra|null>(null);
  const semRede=useConnectivity((s)=>s.offline);
  const tocarAsLiked=async(id:string)=>{
    try{
      const faixas=await lerFaixas(getLikedSongs);
      if(!faixas.length)return;
      const leitor=usePlayer.getState();
      const origem={tipo:'guardadas' as const,nome:'Liked Songs'};
      if(id==='baralhar')await leitor.playShuffled(faixas,leitor.shuffleInteligente,origem);
      else await leitor.tocarLista(faixas,leitor.shuffle,leitor.shuffleInteligente,origem);
    }catch{avisarErro("Couldn't load your Liked Songs.");}
  };
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

  // `flex: 1` e `minHeight: 0`: a lateral tem a altura da janela, e não a do
  // que tem dentro. Sem isto (uma View do RNW não encolhe), com muitos atalhos
  // a lista "Pinned" crescia para lá do fundo, cortada, e o scroll dela nunca
  // chegava a existir -- os de baixo não se alcançavam (João, 20/10).
  return <View style={[styles.sidebar, { flex: 1, minHeight: 0 }]}>
    <MarcaDaJanela compacta={compacta} />
    {/* Do tamanho do que tem: o espaço de baixo é dos atalhos. */}
    <ScrollView style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={styles.sidebarContent}>
      {realce?<View pointerEvents="none" {...marcar('desliza')}
        style={[styles.navRealce,{height:realce.altura,transform:[{translateY:realce.y}],backgroundColor:tema.soft}]}/>:null}
      {/* "LIBRARY" e não "DISCOVER" (5/10, auditoria N9): o que está por baixo é a biblioteca e os amigos. */}
      {compacta ? null : <Text style={styles.navLabel}>LIBRARY</Text>}
      {PRIMARY.map((item) => <NavItem key={item.id} compacta={compacta} active={active === item.id} semFundo={!!realce} medicao={medicao} aoMedir={medir(item.id)} {...item} badge={item.id === 'social' && (naoLidasPorAmigo(socialReceived,socialSeen).size>0 || socialFriends.some(f=>f.status==='pending'&&!f.isSender))} onPress={() => navigate({ name: item.id })}
        aoMenu={item.id === 'songs' ? (e) => setMenuDasLiked(pontoDoEvento(e)) : undefined}
        alvo={item.id === 'songs' ? alvoDasGostadas()
          // Segurar uma música nas Playlists abre a página (25/10); largada
          // num cartão (ou desistindo), volta-se para onde se estava.
          : item.id === 'playlists' && route.name !== 'playlists' ? alvoQueAbreAsPlaylists(() => {
            navigate({ name: 'playlists' });
            return voltar;
          })
          : null} />)}
    </ScrollView>
    {/* O perfil é a linha com a tua cara (o item "Profile" repetia-a) e as
        Definições são a roda dentada nela (26/9, decidido com o João). */}
    {/* Na régua (31/10) a conta é só a cara, e a roda dentada fica por baixo dela. */}
    <View style={[styles.accountRow, compacta && { flexDirection: 'column', paddingRight: 0, paddingVertical: ESP.sm }]}>
      <Pressable accessibilityLabel="Profile" {...(compacta ? comDica(name, undefined) : {})} onPress={() => navigate({ name: 'profile' })} style={({ hovered }) => [styles.account, styles.accountPerfil, compacta && { flex: 0, width: 48, minHeight: 48, marginLeft: 0, paddingHorizontal: 0, justifyContent: 'center' }, (hovered || active === 'profile') && styles.navHover]}>{avatarDisplay}{compacta ? null : <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.accountName}>{name}</Text><Text numberOfLines={1} style={styles.accountEmail}>{username?`@${username}`:session?.user.email}</Text></View>}</Pressable>
      <Pressable accessibilityLabel="Settings" {...(compacta ? comDica('Settings', undefined) : {})} onPress={() => navigate({ name: 'settings' })} style={({ hovered }) => [styles.accountDefinicoes, (hovered || active === 'settings') && styles.navHover]}><Ionicons name="settings-outline" size={17} color={active === 'settings' ? COR.texto : COR.textoMedio} /></Pressable>
    </View>
    {compacta ? null : <ProgressoDaImportacao />}
    {/* A zona que os amigos e os atalhos dividem (20/11): os amigos vão até `--dt-amigos` dela
        e rolam daí para a frente, e a pega entre os dois muda a divisão (SeparadorDosAmigos). */}
    <View style={{ flex: 1, minHeight: 0 }}>
    <AmigosNaLateral navigate={navigate} notify={notify} compacta={compacta} />
    {/* O espaço que sobrava por baixo: é do utilizador (26/9). */}
    <AtalhosNaLateral navigate={navigate} notify={notify} compacta={compacta} />
    </View>
    {menuDasLiked ? <MenuDeContexto rato={menuDasLiked} rotulo="Options for Liked Songs"
      linhas={menuDasGostadas({ semRede }).map((l) => ({ id: l.id, rotulo: l.rotulo, icone: l.icone, motivo: l.motivo }))}
      aoEscolher={(id) => void tocarAsLiked(id)} aoFechar={() => setMenuDasLiked(null)} /> : null}
  </View>;
}

export function NavItem({ id, label, icon, active, badge, onPress, aoMenu, alvo = null, aoMedir, semFundo, medicao, compacta = false }: { id?: string; label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; badge?: boolean; onPress: () => void;
  /** Na régua de ícones (31/10): sem o nome, com ele numa legenda, e o ícone ao meio. */
  compacta?: boolean;
  /** Largar uma música arrastada aqui (24/10): as Liked Songs. */
  alvo?: Alvo | null;
  /** O botão direito, nos itens que são uma coisa e não só um lugar (as Liked Songs). */
  aoMenu?: (e: any) => void;
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
  const alvoRef = refDoAlvo(`nav:${label}`, alvo);
  return <P ref={(n: any) => { ref.current = n; alvoRef(n); }} {...(compacta ? comDica(label, undefined, 'premir', ...(id ? [`nav-${id}`] : [])) : marcar('premir', ...(id ? [`nav-${id}`] : [])))} accessibilityLabel={compacta ? label : undefined} onPress={onPress}
    onContextMenu={(e: any) => { if (!aoMenu) return; e.preventDefault(); aoMenu(e); }}
    onLayout={(e: any) => aoMedir?.(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
    style={({ hovered, focused, pressed }: any) => [styles.navItem, compacta && { justifyContent: 'center', paddingHorizontal: 0, gap: 0 }, (hovered || focused) && styles.navHover, active && !semFundo && { backgroundColor: theme.soft }, pressed && ui.pressed]}><Ionicons name={icon} size={19} color={active ? theme.color : COR.textoMedio} />{compacta ? null : <Text numberOfLines={1} style={[styles.navText, active && styles.navTextActive, active && { color: theme.color }]}>{label}</Text>}{badge && (compacta ? <View style={{ position: 'absolute', top: 7, right: 9 }}><BolinhaDeAviso /></View> : <BolinhaDeAviso />)}</P>;
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
  // A risca do refrão (25/10): só com "Chorus on the progress bar" ligada.
  const refraoS = usePontoNaBarra(usePlayer((s) => s.current), true);
  const { arrasto, comecar, rodar, teclar } = useProcurarAoLargar();
  const ratio = arrasto ?? (durationMs ? Math.min(1, positionMs / durationMs) : 0);
  const mostradoS = (arrasto !== null ? Math.round(arrasto * durationMs) : positionMs) / 1000;
  // Um slider a sério (20/10, Q3): as setas andam 5 s (com Shift, 10), o Home
  // volta ao início, e o leitor de ecrã diz onde se está. Era um botão sem
  // nome: o rato e a roda chegavam lá, o teclado não. As setas fora da barra
  // continuam a ser o atalho da janela (10 s): ele não mexe num `slider`.
  return <V style={styles.progressRow} onWheel={rodar}>
    <Text style={styles.timeText}>{formatTime(mostradoS)}</Text>
    <V role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(durationMs / 1000)}
      aria-valuenow={Math.round(mostradoS)} aria-valuetext={valorDaProcura(mostradoS, durationMs / 1000)} tabIndex={0}
      onKeyDown={teclar} onMouseDown={comecar} onTouchStart={comecar} style={styles.progressHit} {...marcar('calha')}>
      <V style={styles.progressTrack}><V style={[styles.progressFill, { width: `${ratio * 100}%` }]} {...marcar('cheio')} /></V>
      {refraoS != null && durationMs > 0 ? <V {...marcar('marca-do-refrao')} aria-hidden style={{ left: `${Math.min(100, (refraoS * 1000 / durationMs) * 100)}%` }}><Text {...marcar('marca-rotulo')} style={styles.marcaDoRefraoRotulo}>Chorus</Text></V> : null}
      <V {...marcar('pega')} style={{ left: `${ratio * 100}%` }} />
    </V>
    <Text style={styles.timeText}>{formatTime(durationMs / 1000)}</Text>
  </V>;
}

/**
 * O volume (20/10, Q3): o mesmo slider da velocidade e do EQ, com as setas de
 * 5 em 5 (Shift, 10), Page Up/Down de 30, Home a zero e End no máximo; o
 * arrasto e a roda do rato ficam como estavam. Saiu da `PlayerBar` para ela não
 * redesenhar a barra inteira a cada mudança de volume (como a posição).
 */
function BarraDoVolume() {
  const volume = usePlayer((s) => s.volume);
  const volumeAudivel = useRef(80);
  if (volume > 0) volumeAudivel.current = volume;
  // A roda do rato no volume (10/10): 5 por dente, para cima é mais.
  const rodaDoVolume = useRef(criarRoda()).current;
  const rodarVolume = (e: any) => {
    const dentes = rodaDoVolume(e.deltaY ?? e.nativeEvent?.deltaY, e.deltaMode ?? e.nativeEvent?.deltaMode);
    if (dentes) usePlayer.getState().setVolume(volumeComARoda(usePlayer.getState().volume, dentes));
  };
  const alternarSilencio = () => {
    const p = usePlayer.getState();
    p.setVolume(p.volume > 0 ? 0 : volumeAudivel.current || 80);
  };
  const teclar = (e: any) => {
    const t = dentesDaTecla(e.key, !!e.shiftKey);
    if (t === null) return;
    e.preventDefault?.();
    const p = usePlayer.getState();
    p.setVolume(t === 'inicio' ? 0 : t === 'fim' ? 100 : volumeComARoda(p.volume, t));
  };
  const startDragVolume = (mouseDownEvent: any) => {
    mouseDownEvent.preventDefault();
    const target = mouseDownEvent.currentTarget;
    const update = (moveEvent: any) => {
      const rect = target.getBoundingClientRect();
      const clientX = moveEvent.clientX ?? moveEvent.touches?.[0]?.clientX;
      if (clientX === undefined) return;
      const pct = Math.min(100, Math.max(0, Math.round(((clientX - rect.left) / rect.width) * 100)));
      usePlayer.getState().setVolume(pct);
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
  return <V style={styles.volumeRow} onWheel={rodarVolume} {...marcar('calha')}>
    <IconButton name={volume === 0 ? 'volume-mute-outline' : volume < 35 ? 'volume-low-outline' : volume < 70 ? 'volume-medium-outline' : 'volume-high-outline'}
      label={volume === 0 ? 'Unmute' : 'Mute'} onPress={alternarSilencio} desenho={(cor) => <IconeVolume volume={volume} cor={cor} />} />
    <V role="slider" aria-label="Volume" aria-valuemin={0} aria-valuemax={100} aria-valuenow={volume}
      aria-valuetext={volume === 0 ? 'Muted' : `${volume}%`} tabIndex={0} onKeyDown={teclar}
      onMouseDown={startDragVolume} onTouchStart={startDragVolume} style={styles.volumeHit}>
      <V style={styles.volumeTrack} {...marcar('cunha')}><V style={[styles.volumeFill, { width: `${volume}%` }]} {...marcar('cheio')} /></V><V {...marcar('pega')} style={{ left: `${volume}%` }} />
    </V>
  </V>;
}

/**
 * "With X ×" ao lado do botão do Jam (27/9, "Listen along",
 * state/seguirAmigo.ts): seguir alguém é um modo -- o leitor deixa de obedecer
 * à tua fila --, e sem isto lia-se como a app a escolher músicas sozinha. O ×
 * deixa de o seguir. Quando é ele que sai, diz-se uns segundos.
 */
function SeguirNaBarra() {
  const seguindo = useSeguirAmigo((s) => s.seguindo);
  const aviso = useSeguirAmigo((s) => s.aviso);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => useSeguirAmigo.getState().limparAviso(), 6000);
    return () => clearTimeout(t);
  }, [aviso]);
  if (!seguindo) {
    return aviso ? <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 11, color: COR.textoMedio, maxWidth: 200, marginRight: 8 }}>{aviso}</Text> : null;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Listening along with ${seguindo.nome}. Leave`}
      onPress={() => useSeguirAmigo.getState().parar(null)}
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 200, marginRight: 8,
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
        borderColor: COR.linha, backgroundColor: hovered ? COR.hover : COR.metalSuave,
      })}
    >
      <Ionicons name="headset" size={13} color={COR.texto} />
      <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 12, fontWeight: '600', color: COR.texto, flexShrink: 1 }}>With {seguindo.nome}</Text>
      <Ionicons name="close" size={13} color={COR.textoMedio} />
    </Pressable>
  );
}

/**
 * A capa da barra, com a Ocultação (C2, 1/11): a velha fica por cima da nova até
 * a sombra da música que vem a tapar.
 */
function CapaDaBarra({ faixa }: { faixa: Track }) {
  const caixa = useRef<any>(null);
  const velha = useCapaQueSai(`${faixa.source}:${faixa.sourceId}`, faixa, {
    caixa, capa: faixa.artworkUrl, sentido: () => sentidoDaOcultacao(usePlayer.getState().saltoDaFaixa, Date.now()),
  });
  return (
    <View ref={caixa} style={{ width: 52, height: 52, borderRadius: RAIO.ctrl, overflow: 'hidden' }}>
      <Artwork track={faixa} size={52} />
      {velha ? <View {...marcar('capa-sai')} style={{ position: 'absolute', left: 0, top: 0 }}><Artwork track={velha} size={52} /></View> : null}
    </View>
  );
}

/**
 * O título e o artista da barra a trocar de música (23/11, a maquete): o texto velho sai
 * para cima e o novo sobe de baixo; a voltar à anterior, ao contrário (o mesmo sentido da
 * Ocultação da capa). O velho fica montado o tempo de sair, por cima, sem apanhar o rato.
 * Ao aparecer a barra não mexe: aí acende com ela (`barra-e`).
 */
function TextoQueTroca({ chave, children }: { chave: string; children: React.ReactNode }) {
  const [chaveVista, setChaveVista] = useState(chave);
  const [saindo, setSaindo] = useState<{ chave: string; no: React.ReactNode } | null>(null);
  const [recua, setRecua] = useState(false);
  const ultimo = useRef<React.ReactNode>(children);
  if (chaveVista !== chave) {
    setChaveVista(chave);
    setRecua(sentidoDaOcultacao(usePlayer.getState().saltoDaFaixa, Date.now()) < 0);
    setSaindo(menosMovimentoAgora() ? null : { chave: chaveVista, no: ultimo.current });
  }
  useEffect(() => { ultimo.current = children; });
  useEffect(() => {
    if (!saindo) return;
    const t = setTimeout(() => setSaindo(null), 240);
    return () => clearTimeout(t);
  }, [saindo]);
  return <View style={{ minWidth: 0, flexShrink: 1, position: 'relative' }}>
    {saindo ? <View key={`sai:${saindo.chave}`} aria-hidden {...marcar('texto-sai', recua ? 'recua' : '')}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, minWidth: 0 }}>{saindo.no}</View> : null}
    <View key={`entra:${chave}`} {...(saindo ? marcar('texto-entra', recua ? 'recua' : '') : {})} style={{ minWidth: 0 }}>{children}</View>
  </View>;
}

export function PlayerBar({ currentIsSaved, toggleSaveCurrent, onJam, discordLigado = false, onAviso, aoMenuDaFaixa }: {
  currentIsSaved: boolean; toggleSaveCurrent: () => void; onJam: () => void;
  /** O botão direito na música que toca (24/10): o menu dela, com o "Open Now Playing". */
  aoMenuDaFaixa?: () => void;
  /** O Discord está a publicar -- quem sabe é a casca, que tem a preferência. */
  discordLigado?: boolean;
  onAviso?: (mensagem: string) => void;
}) {
  // Abrir o Now Playing é navegar como outra coisa qualquer (fica no histórico).
  const { irPara } = useDestinos();
  // O coração reage ao carregar (16/10, lib/coracaoAoCarregar.ts).
  const coracao = useCoracaoAoCarregar(currentIsSaved, toggleSaveCurrent);
  // Só o que a barra desenha, e NUNCA a posição: o `usePlayer()` sem seletor
  // redesenhava a barra inteira a cada `_setProgress` (auditoria de 17/9, §1.5).
  // A posição vive na `BarraDeProgresso`, que é a única que precisa dela.
  const p = usePlayer(useShallow((s) => ({
    current: s.current, closeGain: s.closeGain, closing: s.closing,
    shuffle: s.shuffle, shuffleInteligente: s.shuffleInteligente, toggleShuffle: s.toggleShuffle,
    prev: s.prev, next: s.next, showRewindButton: s.showRewindButton, isPlaying: s.isPlaying,
    togglePlay: s.togglePlay, repeatMode: s.repeatMode,
    cycleRepeat: s.cycleRepeat, error: s.error, seekTo: s.seekTo,
  })));
  const jam = useOuvirJuntos((s) => s.sessao);
  // A saída da barra (22/11): quando a música sai, o lugar dela fecha-se em vez de
  // desaparecer num fotograma (desktop/saidaDaBarra.web.tsx).
  const { ref: barraRef, espaco: saidaDaBarra } = useSaidaDaBarra(p.current);
  // A música como se MOSTRA: a mesma do Now Playing e do painel, com o catálogo
  // (1/11). A barra mostrava a crua e o Now Playing a do catálogo, e quando o
  // catálogo a corrigia pareciam duas músicas. O motor continua a receber a crua.
  const versaoDoCatalogo = useCatalogoDeFaixas((s) => s.versao);
  const mostrada = useMemo(() => (p.current ? comCatalogo(p.current) : null), [p.current, versaoDoCatalogo]);
  // O laço do disco roda quando o play muda (C3), e não ao montar: parado, nunca roda.
  const reflexo = useRef<any>(null);
  const tocavaAntes = useRef(p.isPlaying);
  useEffect(() => {
    if (tocavaAntes.current === p.isPlaying) return;
    tocavaAntes.current = p.isPlaying;
    rodarReflexo(reflexo.current, p.isPlaying);
  }, [p.isPlaying]);
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
  // Sem nada a tocar aqui, a barra é a do outro aparelho, se houver um a tocar (1/11).
  if (!p.current) return <>{saidaDaBarra}<BarraDoOutroAparelho /></>;

  // Largar uma música na barra põe-na a seguir à que toca (24/10).
  // Fechar sem arrastar (o botão, o menu): desce com o lugar, pelo CSS. A arrastar para a
  // direita continua a ir para a direita e a apagar-se com o som.
  const fechaParaBaixo = p.closing && dragX === 0 && !reducedMotion;
  return <div data-dt="entrada-da-barra" ref={barraRef} data-fechar={fechaParaBaixo ? '' : undefined}><div>
    <V ref={refDoAlvo('barra-do-leitor', p.current ? alvoDaBarra() : null)} style={[styles.player,fechaParaBaixo?null:{opacity:p.closeGain*Math.max(0.2,1-dragX/swipeWidth.current),transform:[{translateX:reducedMotion?0:dragX+(1-p.closeGain)*180}]}]}>
    {/* O motor: se rebentar, volta a montar sozinho e retoma a faixa. */}
    <BarreiraDeErros onde="leitor" discreta><MotorDoPc track={p.current} /></BarreiraDeErros>
    <View style={styles.playerTrack} {...marcar('barra-e')} {...dragClose.panHandlers} onLayout={e=>{swipeWidth.current=e.nativeEvent.layout.width;}}>
      <Pressable
        style={styles.playerTrackLink}
        onPress={() => {if(!swiping.current)irPara({ tipo: 'a-tocar' });}}
        {...({ onContextMenu: (e: any) => { if (!aoMenuDaFaixa) return; e.preventDefault(); aoMenuDaFaixa(); } } as any)}
      >
        {/* O destino da Órbita a tocar a seguir (31/10). */}
        <View nativeID="alvo-seguinte"><CapaDaBarra faixa={mostrada ?? p.current} /></View>
        {/* O título limpo e o artista, como em todas as listas: aqui ia o
            título cru do upload, sem artista nenhum. */}
        <TextoQueTroca chave={`${p.current.source}:${p.current.sourceId}`}>
          <Text numberOfLines={1} style={styles.playerTitle}>{tituloDaFaixa(mostrada ?? p.current)}</Text>
          {/* Uma falha diz-se no lugar do artista, a 12 px, enquanto dura (16/10,
              W5, variante A de docs/ui-seguinte.html): era uma linha de 10 px
              à direita, cortada a meio e a competir com o volume. */}
          {p.error
            ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1, minWidth: 0 }} accessibilityRole="alert">
                <Ionicons name="alert-circle-outline" size={13} color={COR.aviso} />
                <Text numberOfLines={1} style={[styles.playerArtista, { color: COR.aviso, marginTop: 0, flexShrink: 1 }]}>{p.error}</Text>
              </View>
            : <Text numberOfLines={1} style={styles.playerArtista}>{displayArtist(mostrada ?? p.current)}</Text>}
        </TextoQueTroca>
      </Pressable>
    </View>
    <View style={styles.playerCenter} {...marcar('barra-e', 'barra-e-2')}>
      <View style={styles.playerControls}>
        <IconButton name="shuffle" label={rotuloDoModo(modoDeShuffle(p.shuffle, p.shuffleInteligente))} active={p.shuffle} estrela={p.shuffleInteligente} onPress={p.toggleShuffle}
          desenho={(cor) => <IconeShuffle estado={estadoDoShuffle(p.shuffle, p.shuffleInteligente)} cor={cor} />} />
        <IconButton name="play-skip-back" label="Previous" atalho="Ctrl+←" onPress={p.prev} />
        {p.showRewindButton && <IconButton name="play-back" label="Rewind 15 seconds" onPress={() => p.seekTo(Math.max(0, usePlayer.getState().positionMs - 15000))} />}
        <Pressable {...comDica(p.isPlaying ? 'Pause' : 'Play', 'Space')} accessibilityRole="button" accessibilityLabel={p.isPlaying ? 'Pause' : 'Play'} onPress={p.togglePlay} {...marcar('disco-metal')} style={({ pressed }) => [styles.playButton, pressed && { transform: [{ scale: .97 }] }]}><View ref={reflexo} {...marcar('reflexo')} /><View style={{ zIndex: 1 }}><IconePlayPause tocando={p.isPlaying} /></View></Pressable>
        <IconButton name="play-skip-forward" label="Next" atalho="Ctrl+→" onPress={p.next} />
        {/* O icone e o MESMO nos dois modos: o `repeat` e o `repeat-outline`
            do Ionicons sao praticamente iguais a este tamanho, e o botao
            ficava com dois estados a mostrar um. Quem os separa e o "1". */}
        <IconButton
          name="repeat"
          label={p.repeatMode === 'one' ? 'Repeat this track' : p.repeatMode === 'all' ? 'Repeat queue' : 'Repeat off'}
          active={p.repeatMode !== 'off'}
          onPress={p.cycleRepeat}
          desenho={(cor) => <IconeRepeat modo={p.repeatMode} cor={cor} />}
        />
      </View>
      <BarraDeProgresso />
    </View>
    <View style={styles.playerRight} {...marcar('barra-e', 'barra-e-3')}>
      <SeguirNaBarra />
      {/* O coração é o primeiro dos ícones da direita (30/10, a escolha do João: ao lado do
          título não lhe agradava): tudo o que é "desta música" junto, e o centro só com o que
          toca. As Faíscas a guardar e o Encolher a tirar, logo ao carregar (16/10). */}
      <IconButton
        name={coracao.mostrada ? 'heart' : 'heart-outline'}
        label={coracao.mostrada ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
        atalho="Ctrl+L"
        onPressIn={coracao.onPressIn}
        onPress={coracao.onPress}
        onPressOut={coracao.onPressOut}
        active={coracao.mostrada}
        desenho={(cor) => <CoracaoAnimado guardada={coracao.mostrada} pulso={coracao.pulso} tamanho={19} cor={cor} corCheio={cor} />}
      />
      {/* Quem vê o que está a tocar, ao lado do botão que abre o Jam. */}
      <IndicadorDeVisibilidade discordLigado={discordLigado} onJam={onJam} onAviso={onAviso} />
      <IconButton name={jam ? ICONES.jam : `${ICONES.jam}-outline`} label={jam ? 'Manage Jam' : 'Start a Jam'} active={!!jam} onPress={onJam}
        desenho={(cor) => <IconeJam ligada={!!jam} cor={cor} />} />
      {/* O outro aparelho a tocar (1/11): o nome dele, aceso, abre o cartão. */}
      <BotaoDoOutroAparelho />
      <BarraDoVolume />
      <IconButton name="close" label="Close player" onPress={()=>void closePlayerSmoothly()} />
    </View>
    </V>
  </div></div>;
}
