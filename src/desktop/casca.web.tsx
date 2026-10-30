import { closePlayerSmoothly, confirmaSwipe } from '../lib/closePlayer';
import { ICONES } from '../lib/icones';
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
import { styles } from './estilos.web';
import { COR, cssDasFontes, ESTADO, FONT, RAIO } from './tokens.web';
import { ANEL_DO_REFRAO, Artwork, comDica, formatTime, IconButton, ui, marcar, useProcurarAoLargar } from './ui.web';
import { PRE_ESCUTA_S } from '../lib/refrao';
import { TOM_CLARO, TOM_ESCURO } from '../lib/doisTons';
import { ligarBrilhoDoCursor } from './duotone.web';
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
    ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#30303b;border:3px solid transparent;border-radius:8px;background-clip:padding-box}
    ::-webkit-scrollbar-thumb:hover{background:#494857;border:3px solid transparent;background-clip:padding-box}
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
      transition: transform 0.15s cubic-bezier(0.25, 0.8, 0.25, 1);
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      pointer-events: none;
    }
    [data-dt~="calha"]:hover [data-dt~="pega"] {
      transform: translate(-50%, -50%) scale(1);
    }
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
    .np-fila-linha:hover .np-fila-tocar { opacity: 1; }
    .np-fila-pega, .np-fila-mais { opacity: 0; transition: opacity var(--dt-rapido) var(--dt-curva); display: flex; }
    .np-fila-linha:hover .np-fila-pega, .np-fila-linha:hover .np-fila-mais, .np-fila-pega-viva { opacity: 1; }
    .np-fila-mais { background: none; border: 0; padding: 6px; border-radius: ${RAIO.cartao}px; cursor: pointer; }
    .np-fila-mais:hover { background: ${ESTADO.hover}; }
    .np-fila-mais:focus-visible { opacity: 1; outline: 2px solid ${COR.texto}; }
    [data-dt~="painel-do-leitor"] { transition: transform 240ms cubic-bezier(.22,1,.36,1); will-change: transform; }
    /* O fundo do Now Playing: a capa nova entra por cima da anterior. */
    [data-dt~="np-fundo"]{ animation: dt-np-fundo 700ms ease both; }
    /* A cor da capa a encher a janela ao abrir o Now Playing (26/9). */
    [data-dt~="janela-cor"]{ animation: dt-np-fundo 450ms ease both; }
    /* E a sair (20/10, pedido do João: entrava devagar e saía num fotograma).
       A camada apaga-se e recua um nada, mais depressa do que entrou; a cor da
       capa apaga-se na janela quase ao passo com que acendeu, e a superfície
       volta ao fundo dela ao mesmo tempo (desktop/useSaida.web.ts tem o tempo
       total, 420 ms). A página de baixo, ou a nova, já está lá por baixo. */
    [data-dt~="np-a-sair"]{ animation: dt-np-sai 240ms var(--dt-curva) both; }
    @keyframes dt-np-sai{ from{ opacity:1; transform:none } to{ opacity:0; transform: scale(.985) } }
    [data-dt~="janela-cor"][data-dt~="a-apagar"]{ animation: dt-np-cor-sai 420ms ease both; }
    @keyframes dt-np-cor-sai{ from{ opacity:1 } to{ opacity:0 } }
    [data-dt~="main-a-voltar"]{ transition: background-color 420ms ease; }
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
      /* Mais curtos a 27/9: a app tem de parecer instantânea. */
      --dt-rapido: 110ms; --dt-normal: 150ms; --dt-lento: 220ms;
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

    /* A passagem entre páginas (27/9): 150 ms em CSS, que o compositor corre
       mesmo com a thread a montar a página nova (ver TransicaoDePagina). Com
       "backwards" e não "both": depois de entrar não fica nada preso -- um
       transform que ficasse fazia da página o contentor dos "fixed" dela. */
    /* 30/9: 150 ms e 6 px não se viam ("só a aba da esquerda é smooth"). A
       nova entra em 260 ms, a subir 14 px; a de agora esbate-se enquanto a
       nova se prepara (a-sair) -- só a opacidade, pela razão do "fixed". */
    [data-dt~="pagina"]{ animation: dt-pagina 260ms var(--dt-curva) backwards; }
    @keyframes dt-pagina{ from{ opacity:0; transform: translateY(14px); } to{ opacity:1; transform:none; } }
    [data-dt~="a-sair"]{ opacity:.35; transition: opacity 140ms ease-out; }
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
    /* O "Loading…" só aparece se a espera passar de um quarto de segundo:
       uma troca rápida não pisca um spinner. */
    [data-dt~="carregar"]{ animation: dt-aparecer 150ms ease 250ms backwards; }
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
    /* A que esta a tocar nao esconde as barrinhas nem mostra o numero. */
    [data-dt~="fila"] [data-dt~="barras"] [data-dt~="barra"]{ animation: dt-pular 900ms ease-in-out infinite; }
    [data-dt~="fila"] [data-dt~="barras"] [data-dt~="barra"]:nth-child(2){ animation-delay: 150ms }
    [data-dt~="fila"] [data-dt~="barras"] [data-dt~="barra"]:nth-child(3){ animation-delay: 300ms }
    /* Em pausa, as barras ficam quietas e baixas (27/9). */
    [data-dt~="fila"] [data-dt~="barras"][data-dt~="parado"] [data-dt~="barra"]{ animation: none; height: 4px; }
    @keyframes dt-pular{ 0%,100%{ height:4px } 50%{ height:13px } }

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
    [data-dt~="aviso-msg"]{ animation: dt-aviso-msg 380ms cubic-bezier(.2,.9,.25,1.05) both; }
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
    [data-largar="pode"]{ box-shadow: inset 0 0 0 1px rgba(233,234,238,.14); border-radius: ${RAIO.cartao}px; }
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
      animation: dt-fila-vira 460ms cubic-bezier(.5, 0, .75, 0) both; }
    @keyframes dt-fila-vira{
      0%{ opacity: 1; transform: perspective(900px) rotateX(0); max-height: 64px; }
      55%{ opacity: 0; transform: perspective(900px) rotateX(-88deg); max-height: 64px; min-height: 0; }
      100%{ opacity: 0; transform: perspective(900px) rotateX(-88deg); max-height: 0; min-height: 0; padding-top: 0; padding-bottom: 0; }
    }
    .np-fila-entra{ transform-origin: 50% 0; animation: dt-fila-entra 620ms var(--dt-curva) backwards; }
    @keyframes dt-fila-entra{ from{ opacity: 0; transform: perspective(900px) rotateX(88deg); } to{ opacity: 1; transform: none; } }
    /* O separador do grupo da Radio entra com a fila e apaga-se quando ela sai. */
    [data-dt~="grupo-radio"]{ animation: dt-linha 260ms var(--dt-curva) backwards; }
    [data-dt~="grupo-radio"][data-dt~="grupo-sai"]{ opacity: 0; transition: opacity 240ms var(--dt-curva); }
    /* O Radio ligado: os arcos respiram (quietos com a musica em pausa), e um
       anel abre-se quando a fila nova chega. */
    [data-dt~="radio-onda"]{ animation: dt-radio-onda 1.8s ease-in-out infinite; }
    [data-dt~="radio-onda"][data-dt~="radio-parado"]{ animation-play-state: paused; }
    @keyframes dt-radio-onda{ 50%{ opacity: .35; } }
    [data-dt~="radio-anel"]{ animation: dt-radio-anel 950ms ease-out both; }
    @keyframes dt-radio-anel{ from{ box-shadow: 0 0 0 0 rgba(233,234,238,.4); } to{ box-shadow: 0 0 0 14px rgba(233,234,238,0); } }

    /* Quem pediu menos movimento no Windows nao leva nada disto. O estado
       final e o mesmo: aqui so morre o caminho ate la. */
    @media (prefers-reduced-motion: reduce){
      [data-dt~="painel-do-leitor"] { transition: none !important; }
      #duotone-dica{ transition: none !important; transform: none !important; }
      [data-dt~="fila"], [data-dt~="dialogo"], [data-dt~="veu"], [data-dt~="aviso"],
      [data-dt~="menu-amigo"], [data-dt~="aviso-msg"],
      [data-dt~="pagina"], [data-dt~="pagina"] [data-dt~="cartao"], [data-dt~="carregar"],
      [data-dt~="fila"] [data-dt~="barras"] [data-dt~="barra"],
      .np-fila-sai, .np-fila-vira, .np-fila-entra, [data-dt~="grupo-radio"],
      [data-dt~="radio-onda"], [data-dt~="radio-anel"]{ animation: none !important; }
      [data-dt~="grupo-radio"][data-dt~="grupo-sai"]{ transition: none !important; }
      [data-dt~="premir"], [data-dt~="desliza"], [data-dt~="campo"], [data-dt~="fila"] [data-dt~="toca"],
      [data-dt~="fila"] [data-dt~="mais"], [data-dt~="fila"] [data-dt~="numero"],
      [data-dt~="cartao"], [data-dt~="coracaoDoCartao"], [data-dt~="a-sair"], [data-dt~="main-a-voltar"],
      [data-dt~="duo"] [data-dt~="duo-tom"], [data-dt~="brilho"]::after{ transition: none !important; }
      /* A sair do Now Playing: some logo, como antes (o tempo da saída corre na
         mesma, mas já invisível). */
      [data-dt~="np-a-sair"], [data-dt~="janela-cor"][data-dt~="a-apagar"]{ animation: none !important; opacity: 0 !important; }
      [data-dt~="cartao"]:hover{ transform: none !important; }
      [data-dt~="amigo"]:hover [data-dt~="rola"]{ animation: none !important; overflow: hidden !important; text-overflow: ellipsis !important; }
      [data-dt~="amigo"]:hover [data-dt~="rola-caixa"]{ -webkit-mask-image: none; mask-image: none; }
      [data-dt~="premir"]:active{ transform: none !important; }
    }
  `;
  document.head.appendChild(style);
  document.title = 'Duotone';
  ligarBrilhoDoCursor();
}

/** `comPainel`: a seta do painel da Queue e das Lyrics só existe com a app aberta (no login não há painel). */
export function TitleBar({ comPainel = false }: { comPainel?: boolean }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const bridge = window.duotoneDesktop;
    bridge?.isMaximized().then(setMaximized);
    return bridge?.onMaximizedChange(setMaximized);
  }, []);
  return <View style={styles.titleBar as any} onDoubleClick={() => window.duotoneDesktop?.toggleMaximize()}>
    <View style={styles.titleBrand}><Image source={require('../../assets/auth-logo.png')} style={{ width: 22, height: 22 }} resizeMode="contain" /><Text style={styles.titleText}>Duotone</Text></View>
    <View style={styles.dragRegion as any} />
    {comPainel ? <SetaDoPainel /> : null}
    <View style={styles.windowButtons as any}>
      <Pressable accessibilityLabel="Minimize" onPress={() => window.duotoneDesktop?.minimize()} style={({ hovered }) => [styles.windowButton, hovered && styles.windowButtonHover]}><Ionicons name="remove-outline" size={17} color={COR.textoMedio} /></Pressable>
      <Pressable accessibilityLabel={maximized ? 'Restore' : 'Maximize'} onPress={() => window.duotoneDesktop?.toggleMaximize()} style={({ hovered }) => [styles.windowButton, hovered && styles.windowButtonHover]}><Ionicons name={maximized ? 'copy-outline' : 'square-outline'} size={13} color={COR.textoMedio} /></Pressable>
      <Pressable accessibilityLabel="Close" onPress={() => window.duotoneDesktop?.close()} style={({ hovered }) => [styles.windowButton, hovered && styles.closeHover]}><Ionicons name="close-outline" size={20} color={COR.textoMedio} /></Pressable>
    </View>
  </View>;
}

export function Sidebar({ route, navigate, notify, voltar }: { route: Route; navigate: (route: Route) => void; notify: (texto: string) => void;
  /** O voltar da janela: uma música arrastada que abriu as Playlists volta por aqui (25/10). */
  voltar?: () => void }) {
  const session = useAuth((s) => s.session);
  const tema = useTheme((s) => s.theme);
  // Uma mistura abre-se a partir da Pesquisa: e ai que o separador tem de
  // ficar aceso, senao a barra dizia que se estava noutro sitio.
  const active = route.name === 'artist' ? 'artists'
    : route.name === 'mistura' ? 'search'
    : route.name === 'library-check' ? 'settings'
    : route.name === 'stats' || route.name === 'retrospetiva' ? 'profile'
    : route.name === 'voces-os-dois' ? 'social'
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
    }catch{notify('Could not load your Liked Songs.');}
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
    {/* Do tamanho do que tem: o espaço de baixo é dos atalhos. */}
    <ScrollView style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={styles.sidebarContent}>
      {realce?<View pointerEvents="none" {...marcar('desliza')}
        style={[styles.navRealce,{height:realce.altura,transform:[{translateY:realce.y}],backgroundColor:tema.soft}]}/>:null}
      {/* "LIBRARY" e não "DISCOVER" (5/10, auditoria N9): o que está por baixo é a biblioteca e os amigos. */}
      <Text style={styles.navLabel}>LIBRARY</Text>
      {PRIMARY.map((item) => <NavItem key={item.id} active={active === item.id} semFundo={!!realce} medicao={medicao} aoMedir={medir(item.id)} {...item} badge={item.id === 'social' && (naoLidasPorAmigo(socialReceived,socialSeen).size>0 || socialFriends.some(f=>f.status==='pending'&&!f.isSender))} onPress={() => navigate({ name: item.id })}
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
    <View style={styles.accountRow}>
      <Pressable accessibilityLabel="Profile" onPress={() => navigate({ name: 'profile' })} style={({ hovered }) => [styles.account, styles.accountPerfil, (hovered || active === 'profile') && styles.navHover]}>{avatarDisplay}<View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.accountName}>{name}</Text><Text numberOfLines={1} style={styles.accountEmail}>{session?.user.email}</Text></View></Pressable>
      <Pressable accessibilityLabel="Settings" onPress={() => navigate({ name: 'settings' })} style={({ hovered }) => [styles.accountDefinicoes, (hovered || active === 'settings') && styles.navHover]}><Ionicons name="settings-outline" size={17} color={active === 'settings' ? COR.texto : COR.textoMedio} /></Pressable>
    </View>
    <ProgressoDaImportacao />
    <AmigosNaLateral navigate={navigate} notify={notify} />
    {/* O espaço que sobrava por baixo: é do utilizador (26/9). */}
    <AtalhosNaLateral navigate={navigate} notify={notify} />
    {menuDasLiked ? <MenuDeContexto rato={menuDasLiked} rotulo="Options for Liked Songs"
      linhas={menuDasGostadas({ semRede }).map((l) => ({ id: l.id, rotulo: l.rotulo, icone: l.icone, motivo: l.motivo }))}
      aoEscolher={(id) => void tocarAsLiked(id)} aoFechar={() => setMenuDasLiked(null)} /> : null}
  </View>;
}

export function NavItem({ label, icon, active, badge, onPress, aoMenu, alvo = null, aoMedir, semFundo, medicao }: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; badge?: boolean; onPress: () => void;
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
  return <P ref={(n: any) => { ref.current = n; alvoRef(n); }} {...marcar('premir')} onPress={onPress}
    onContextMenu={(e: any) => { if (!aoMenu) return; e.preventDefault(); aoMenu(e); }}
    onLayout={(e: any) => aoMedir?.(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
    style={({ hovered, focused, pressed }: any) => [styles.navItem, (hovered || focused) && styles.navHover, active && !semFundo && { backgroundColor: theme.soft }, pressed && ui.pressed]}><Ionicons name={icon} size={19} color={active ? theme.color : COR.textoMedio} /><Text style={[styles.navText, active && styles.navTextActive, active && { color: theme.color }]}>{label}</Text>{badge && <BolinhaDeAviso />}</P>;
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
      label={volume === 0 ? 'Unmute' : 'Mute'} onPress={alternarSilencio} />
    <V role="slider" aria-label="Volume" aria-valuemin={0} aria-valuemax={100} aria-valuenow={volume}
      aria-valuetext={volume === 0 ? 'Muted' : `${volume}%`} tabIndex={0} onKeyDown={teclar}
      onMouseDown={startDragVolume} onTouchStart={startDragVolume} style={styles.volumeHit}>
      <V style={styles.volumeTrack}><V style={[styles.volumeFill, { width: `${volume}%` }]} {...marcar('cheio')} /></V><V {...marcar('pega')} style={{ left: `${volume}%` }} />
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
    current: s.current, closeGain: s.closeGain,
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
  if (!p.current) return null;

  // Largar uma música na barra põe-na a seguir à que toca (24/10).
  return <V ref={refDoAlvo('barra-do-leitor', p.current ? alvoDaBarra() : null)} style={[styles.player,{opacity:p.closeGain*Math.max(0.2,1-dragX/swipeWidth.current),transform:[{translateX:reducedMotion?0:dragX+(1-p.closeGain)*180}]}]}>
    {/* O motor: se rebentar, volta a montar sozinho e retoma a faixa. */}
    <BarreiraDeErros onde="leitor" discreta><YouTubePlayerView track={p.current} /></BarreiraDeErros>
    <View style={styles.playerTrack} {...dragClose.panHandlers} onLayout={e=>{swipeWidth.current=e.nativeEvent.layout.width;}}>
      <Pressable
        style={styles.playerTrackLink}
        onPress={() => {if(!swiping.current)irPara({ tipo: 'a-tocar' });}}
        {...({ onContextMenu: (e: any) => { if (!aoMenuDaFaixa) return; e.preventDefault(); aoMenuDaFaixa(); } } as any)}
      >
        <Artwork track={p.current} size={52} />
        {/* O título limpo e o artista, como em todas as listas: aqui ia o
            título cru do upload, sem artista nenhum. */}
        <View style={{ minWidth: 0, flexShrink: 1 }}>
          <Text numberOfLines={1} style={styles.playerTitle}>{tituloDaFaixa(p.current)}</Text>
          {/* Uma falha diz-se no lugar do artista, a 12 px, enquanto dura (16/10,
              W5, variante A de docs/ui-seguinte.html): era uma linha de 10 px
              à direita, cortada a meio e a competir com o volume. */}
          {p.error
            ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1, minWidth: 0 }} accessibilityRole="alert">
                <Ionicons name="alert-circle-outline" size={13} color={COR.aviso} />
                <Text numberOfLines={1} style={[styles.playerArtista, { color: COR.aviso, marginTop: 0, flexShrink: 1 }]}>{p.error}</Text>
              </View>
            : <Text numberOfLines={1} style={styles.playerArtista}>{displayArtist(p.current)}</Text>}
        </View>
      </Pressable>
      {/* As Faíscas a guardar e o Encolher a tirar, logo ao carregar (16/10). */}
      <View style={styles.playerSave}>
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
      </View>
    </View>
    <View style={styles.playerCenter}>
      <View style={styles.playerControls}>
        <IconButton name="shuffle" label={rotuloDoModo(modoDeShuffle(p.shuffle, p.shuffleInteligente))} active={p.shuffle} estrela={p.shuffleInteligente} onPress={p.toggleShuffle} />
        <IconButton name="play-skip-back" label="Previous" atalho="Ctrl+←" onPress={p.prev} />
        {p.showRewindButton && <IconButton name="play-back" label="Rewind 15 seconds" onPress={() => p.seekTo(Math.max(0, usePlayer.getState().positionMs - 15000))} />}
        <Pressable {...comDica(p.isPlaying ? 'Pause' : 'Play', 'Space')} accessibilityRole="button" accessibilityLabel={p.isPlaying ? 'Pause' : 'Play'} onPress={p.togglePlay} style={({ hovered, pressed }) => [styles.playButton, hovered && { transform: [{ scale: 1.05 }] }, pressed && { transform: [{ scale: .97 }] }]}><Ionicons name={p.buffering ? 'hourglass-outline' : p.isPlaying ? 'pause' : 'play'} size={19} color="#111117" /></Pressable>
        <IconButton name="play-skip-forward" label="Next" atalho="Ctrl+→" onPress={p.next} />
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
      <SeguirNaBarra />
      {/* Quem vê o que está a tocar, ao lado do botão que abre o Jam. */}
      <IndicadorDeVisibilidade discordLigado={discordLigado} onJam={onJam} onAviso={onAviso} />
      <IconButton name={jam ? ICONES.jam : `${ICONES.jam}-outline`} label={jam ? 'Manage Jam' : 'Start a Jam'} active={!!jam} onPress={onJam} />
      <BarraDoVolume />
      <IconButton name="close" label="Close player" onPress={()=>void closePlayerSmoothly()} />
    </View>
  </V>;
}
