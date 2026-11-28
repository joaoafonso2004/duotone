import React, { useEffect, useRef, useState, type ComponentType } from 'react';
import { CoracaoAnimado } from './components/CoracaoAnimado';
import { useCoracaoAoCarregar } from './hooks/useCoracaoAoCarregar';
import { COR, cssDasFontes, FONT, RAIO } from './desktop/tokens.web';

import { cssDasMolas } from './lib/molasEmCss';
import { cssDoHoverDoDisco, estiloDoDisco, estiloDoReflexo, rodarReflexo, SIMBOLO_DA_PAUSA, SIMBOLO_DO_PLAY } from './desktop/DiscoDeMetal.web';
import { useAtrasadoPelaOcultacao, useCapaQueSai } from './desktop/Ocultacao.web';
import { lerCelulasDaCapa } from './lib/celulasDaCapa';
import { corCaracteristica } from './lib/corDaCapa';
/**
 * A janela do mini leitor do PC (entrega 2b do
 * docs/PLANO-OFFLINE-SOCIAL-DESCOBERTA-PC.md; aprovado pela pré-visualização
 * de 24/9).
 *
 * É um comando à distância: a música toca na janela principal. Esta janela não
 * tem sessão, store nem Supabase -- o index.ts arranca-a EM VEZ da App quando o
 * endereço traz `?janela=mini`, e ela só conhece o resumo que recebe e os
 * comandos que manda (electron/preloadMini.cjs → electron/miniLeitor.cjs).
 *
 * Arrasta-se pela BARRINHA do topo e só por ela (era pela capa; o João
 * preferiu a barrinha a 24/9): no Windows uma zona de arrasto não recebe eventos
 * do rato, e com a janela toda a arrastar o hover deixava de existir.
 *
 * É DOM à mão e não React Native: precisa do `-webkit-app-region` para se
 * arrastar pela capa, e o `hovered` do RNW cai ao entrar num botão filho (ver
 * o CLAUDE.md) -- aqui o hover é CSS.
 *
 * **Fala a língua da janela principal** (20/10, revisão de qualidade Q6): as
 * cores, as letras e o metal saem de `desktop/tokens.web.ts`. Vinha com a
 * paleta do iPhone, na letra do sistema, e com a linha de progresso e o anel
 * do foco a roxo -- a única superfície do PC que ainda o tinha. As
 * formas, os tamanhos e as animações ficam como estavam.
 *
 * **Afinado** (25/11, a proposta A da `mini-leitor-maquete.html`, escolhida pelo
 * João): os mesmos tamanhos de janela, arrumados. O cartão leva a cor da capa
 * (`useCorDaCapa`, a troca ao mesmo passo que a Ocultação); título e artista
 * sempre, com o coração ao lado do título; os botões da janela numa tira em
 * cima, com a pega, longe dos controlos; o tempo nas pontas da barra; e com o
 * rato no "seguinte" o artista dá lugar à música que vem.
 */

/** A borda com o rato por cima e do cartão aberto: a linha do PC, acesa. */
const BORDA_ACESA = 'rgba(233,234,238,0.16)';

const CSS = `
/* Uma física (S1, 31/10): as molas do iPhone, como na janela principal. */
${cssDasMolas()}
/* A cor da capa (Afinado, 25/11): três números que se animam sozinhos, só no
   elemento que os usa (sem herança: nada mais se recalcula). Sem cor, o tom do
   fundo, e o degradê não se vê. */
@property --cr { syntax: '<number>'; inherits: false; initial-value: 20; }
@property --cg { syntax: '<number>'; inherits: false; initial-value: 20; }
@property --cb { syntax: '<number>'; inherits: false; initial-value: 26; }
/* A barra (25/9): recolhida é uma barra fina; com o rato por cima abre para o
   cartão, e ao sair volta a recolher. A JANELA não muda de tamanho (isso no
   Windows é aos solavancos): anima o cartão lá dentro, encostado ao lado de
   onde o ecrã acaba (a \`ancora\` que o processo principal manda). */
.palco { position: relative; width: 100%; height: 100%; }
/* .mini.cartao: a regra .mini (altura 100%) vem depois e ganhava. */
.mini.cartao { position: absolute; left: 0; right: 0; height: 44px; display: flex; align-items: center; gap: 10px;
  padding: 6px 8px 6px 6px;
  transition: height 260ms var(--dt-curva), padding 260ms var(--dt-curva), gap 260ms var(--dt-curva),
    background-color .2s, border-color .2s; }
.cartao.baixo { bottom: 0; } .cartao.cima { top: 0; }
.mini.cartao.aberto { height: 88px; padding: 18px 10px 8px; gap: 12px; border-color: ${BORDA_ACESA}; }
.cartao .capa { width: 32px; height: 32px; border-radius: ${RAIO.ctrl}px;
  transition: width 260ms var(--dt-curva), height 260ms var(--dt-curva), border-radius 260ms; }
.cartao.aberto .capa { width: 56px; height: 56px; border-radius: ${RAIO.cartao}px; box-shadow: 0 6px 18px rgba(0,0,0,0.45); }
.cartao .detalhe { max-height: 0; opacity: 0; overflow: hidden; transition: max-height 260ms var(--dt-curva), opacity 160ms; }
.cartao.aberto .detalhe { max-height: 40px; opacity: 1; transition-delay: 0s, 80ms; }
.cartao .extra { width: 0; opacity: 0; overflow: hidden; pointer-events: none;
  transition: width 260ms var(--dt-curva), opacity 160ms; }
.cartao.aberto .extra { width: 28px; opacity: 1; pointer-events: auto; }
.cartao .play { width: 30px; height: 30px; border-radius: 15px;
  transition: width 260ms var(--dt-curva), height 260ms var(--dt-curva), background .2s; }
.cartao.aberto .play { width: 40px; height: 40px; border-radius: 20px; }
.cartao .so-aberto { opacity: 0; pointer-events: none; transition: opacity 160ms; }
.cartao.aberto .so-aberto { opacity: 1; pointer-events: auto; transition-delay: 100ms; }
.cartao .so-fechado { transition: opacity 160ms; }
.cartao.aberto .so-fechado { opacity: 0; }
.cartao .sobre-a-capa { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
/* A lista das próximas (12/10): abre a partir do cartão (por baixo dele, ou
   por cima quando está encostado em baixo). A janela já cresceu de uma vez; o
   que anima é o recorte, como se a lista se desenrolasse do cartão. */
.lista { position: absolute; left: 0; right: 0; height: 280px; border-radius: ${RAIO.superficie}px; background: ${COR.hover};
  border: 1px solid ${BORDA_ACESA}; color: ${COR.texto}; overflow: hidden; display: flex; flex-direction: column;
  font-family: ${FONT.body}; user-select: none;
  opacity: 0; pointer-events: none;
  transition: clip-path 260ms var(--dt-curva), opacity 160ms; }
.lista.cima { clip-path: inset(0 0 100% 0 round 14px); }
.lista.baixo { clip-path: inset(100% 0 0 0 round 14px); }
.lista.aberta { clip-path: inset(0 0 0 0 round 14px); opacity: 1; pointer-events: auto; }
/* A etiqueta de uma secção, como no PC: mono, pequena, espaçada. */
.lista-titulo { font: 600 10px/14px ${FONT.mono}; letter-spacing: 1.1px; color: ${COR.textoFraco}; padding: 12px 12px 6px; }
.lista-linhas { flex: 1; overflow-y: auto; padding: 0 6px 6px; }
.lista-linhas::-webkit-scrollbar { width: 8px; }
.lista-linhas::-webkit-scrollbar-thumb { background: rgba(233,234,238,0.16); border-radius: 4px; border: 2px solid ${COR.hover}; }
.lista-linhas::-webkit-scrollbar-track { background: transparent; }
button.da-fila { width: 100%; justify-content: flex-start; gap: 10px; padding: 6px; border-radius: 8px; text-align: left; }
button.da-fila:disabled { cursor: default; }
button.da-fila:disabled:hover { background: none; }
.da-fila .capa { width: 32px; height: 32px; border-radius: ${RAIO.ctrl}px; object-fit: cover; }
.da-fila .textos { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.da-fila .titulo { font-size: 13px; font-weight: 500; }
.da-fila .artista { font-size: 12px; }
.lista-vazia { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 12px; color: ${COR.textoMedio}; }
.canto button.ligado { color: ${COR.texto}; background: ${COR.metalSuave}; }
.com-lista .pega { display: none; }
@media (prefers-reduced-motion: reduce) { .cartao, .cartao *, .lista { transition: none !important; } }
/* A pega do tamanho: no canto que MEXE (o oposto ao que está encostado ao
   ecrã). Arrastá-la amplia o mini todo na mesma proporção. */
.pega { position: absolute; width: 16px; height: 16px; z-index: 3; -webkit-app-region: no-drag;
  display: flex; align-items: center; justify-content: center; color: ${COR.textoFraco}; opacity: 0;
  transition: opacity 160ms; }
.pega:hover { color: ${COR.texto}; }
.cartao.aberto .pega, .mini.grande .pega { opacity: 1; transition-delay: 100ms; }
html, body, #root { margin: 0; height: 100%; background: transparent; overflow: hidden; }
* { box-sizing: border-box; }
#root > div { width: 100%; height: 100%; }
.mini { width: 100%; height: 100%; border-radius: ${RAIO.superficie}px; border: 1px solid ${COR.linha};
  --fundo: ${COR.elevado};
  background: linear-gradient(90deg, rgba(var(--cr), var(--cg), var(--cb), 0.32) 0%, rgba(var(--cr), var(--cg), var(--cb), 0.11) 46%, rgba(20,20,26,0) 82%), var(--fundo);
  transition: --cr 600ms var(--dt-curva), --cg 600ms var(--dt-curva), --cb 600ms var(--dt-curva);
  color: ${COR.texto}; font-family: ${FONT.body}; position: relative;
  overflow: hidden; user-select: none; }
.mini:hover, .mini.cartao.aberto { --fundo: ${COR.hover}; border-color: ${BORDA_ACESA}; }
.mini.com-cor:hover, .mini.com-cor.cartao.aberto { border-color: rgba(var(--cr), var(--cg), var(--cb), 0.4); }
/* O grande: a cor desce do topo, como o fundo do Now Playing. */
.mini.grande { background: linear-gradient(180deg, rgba(var(--cr), var(--cg), var(--cb), 0.46) 0%, rgba(var(--cr), var(--cg), var(--cb), 0.15) 58%, rgba(20,20,26,0) 100%), var(--fundo); }
button { -webkit-app-region: no-drag; background: none; border: none; color: inherit; font: inherit; padding: 0; cursor: pointer;
  display: flex; align-items: center; justify-content: center; border-radius: 16px; }
button:hover { background: rgba(233,234,238,0.08); }
/* O anel do foco é o da janela principal: o metal, não o roxo. */
button:focus-visible { outline: 2px solid ${COR.metalClaro}; outline-offset: 1px; }
/* A Ocultação: com menos movimento, a capa velha esbate-se (Ocultacao.web.ts). */
@media (prefers-reduced-motion: reduce) { [data-dt~="capa-sai"] { animation: dt-capa-sai 160ms linear both; } }
@keyframes dt-capa-sai { from { opacity: 1; } to { opacity: 0; } }
/* O play é o disco de metal da barra (C3, 1/11), com os mesmos valores (DiscoDeMetal.web.ts).
   O hover repete o metal: o button:hover de cima, mais fraco, tapava-o. */
[data-dt~="disco-metal"] { ${estiloDoDisco()} color: #111117; position: relative; }
[data-dt~="disco-metal"]:hover { ${estiloDoDisco()} }
${cssDoHoverDoDisco()}
[data-dt~="reflexo"] { ${estiloDoReflexo()} }
.icone-do-play { position: relative; z-index: 1; display: flex; }
.capa { border-radius: ${RAIO.cartao}px; background: ${COR.metalEscuro} center / cover no-repeat; flex-shrink: 0; }
/* Arrasta-se pela BARRINHA do topo (João, 24/9), e só por ela: no Windows uma
   zona de arrasto não recebe eventos do rato. Os botões do canto ficam por cima
   (são no-drag), e a pega fica ao centro da janela. */
.arrasto { position: absolute; top: 0; left: 0; right: 0; height: 18px; -webkit-app-region: drag;
  display: flex; align-items: center; justify-content: center; cursor: grab; z-index: 1; }
.arrasto::after { content: ''; width: 28px; height: 3px; border-radius: 2px; background: rgba(233,234,238,0.2); }
.mini:hover .arrasto::after { background: rgba(233,234,238,0.34); }
.titulo { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.artista { font-size: 12px; color: ${COR.textoMedio}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.so-hover { display: none; }
.mini:hover .so-hover { display: flex; }
.mini:hover .sem-hover { display: none; }
.linha { position: absolute; left: 10px; right: 10px; bottom: 0; height: 2px; border-radius: 1px; overflow: hidden; background: ${COR.linha}; }
.linha > div { height: 2px; background: ${COR.metalClaro}; }
.barra { -webkit-app-region: no-drag; height: 12px; display: flex; align-items: center; cursor: pointer; }
.barra > div { position: relative; height: 4px; width: 100%; border-radius: 2px; background: #353540; }
.barra > div > div { height: 4px; border-radius: 2px; background: ${COR.texto}; }
/* Os números em mono, como os tempos da barra do leitor. */
.tempo { font: 500 11px/14px ${FONT.mono}; color: ${COR.textoFraco}; font-variant-numeric: tabular-nums; white-space: nowrap; }
.controlos { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
/* Os botões da janela vivem na tira de cima, com a pega (Afinado): longe dos controlos. */
.canto { position: absolute; top: 0; right: 6px; height: 18px; align-items: center; gap: 2px; z-index: 2; }
.canto button { width: 18px; height: 18px; border-radius: 9px; color: ${COR.textoMedio}; opacity: 0.75; }
.canto button:hover { color: ${COR.texto}; opacity: 1; }
.canto svg { width: 13px; height: 13px; }
/* O texto do cartão: recolhido, "Título · Artista" numa linha; aberto, o título com
   o coração, o artista (ou a que vem) e o tempo nas pontas da barra. */
.linha1 { display: flex; align-items: center; gap: 5px; min-width: 0; }
.linha1 .titulo { flex: 0 1 auto; min-width: 0; }
.ponto { flex: 0 100 auto; min-width: 0; font-size: 12px; color: ${COR.textoMedio}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cartao.aberto .ponto { display: none; }
.cartao .coracao-do-titulo { display: none; flex-shrink: 0; }
.cartao.aberto .coracao-do-titulo { display: flex; }
/* O ⤢ só com o rato na capa (ou o foco lá): sempre por cima, tapava-a. */
.cartao.aberto .moldura > .sobre-a-capa { opacity: 0; }
.cartao.aberto .moldura:hover > .sobre-a-capa, .cartao.aberto .moldura:focus-within > .sobre-a-capa { opacity: 1; }
.coracao-do-titulo button { width: 22px; height: 22px; border-radius: 11px; color: ${COR.textoMedio}; }
.coracao-do-titulo button:hover { color: ${COR.texto}; }
.progresso { display: flex; align-items: center; gap: 6px; }
.progresso .tempo { font-size: 10px; }
.barra.fina > div { height: 3px; background: rgba(233,234,238,0.16); transition: height 150ms var(--dt-curva); }
.barra.fina > div > div { height: 100%; }
.barra.fina:hover > div { height: 5px; }
.moldura { position: relative; flex-shrink: 0; }
.moldura .so-hover { position: absolute; inset: 0; align-items: center; justify-content: center; }
.sobre-a-capa { width: 30px; height: 30px; border-radius: 15px; background: rgba(6,6,8,0.66); }
.sobre-a-capa:hover { background: rgba(6,6,8,0.88); }
`;

type Resumo = ResumoDoMiniLeitor;

const icone = {
  anterior: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>,
  seguinte: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>,
  tocar: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={SIMBOLO_DO_PLAY} /></svg>,
  pausa: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={SIMBOLO_DA_PAUSA} /></svg>,
  expandir: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>,
  encolher: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></svg>,
  esconder: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 14h8" /></svg>,
  abrir: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></svg>,
  fila: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h12M4 12h12M4 18h7" /><path d="M16 15v6l5-3z" fill="currentColor" stroke="none" /></svg>,
  fechar: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>,
};

/** O cartão mais a lista (os números do electron/miniLeitor.cjs, `TAMANHOS.comLista`). */
const ALTURA_DO_CARTAO = 88;
const ESPACO_DA_LISTA = 6;
const ALTURA_DA_LISTA = 280;
/** A lista fecha a animar, e só depois a janela volta ao tamanho do cartão. */
const DURACAO_DA_LISTA = 280;

/** A capa do mini leitor, com a Ocultação da barra (C2, 1/11). */
function CapaDoMini({ uri, sentido, style }: { uri: string | null; sentido: 1 | -1; style?: React.CSSProperties }) {
  const caixa = useRef<HTMLDivElement>(null);
  const ultimoSentido = useRef(sentido);
  ultimoSentido.current = sentido;
  const velha = useCapaQueSai(uri ?? '', uri, { caixa, capa: uri, sentido: () => ultimoSentido.current });
  return (
    <div ref={caixa} className="capa" style={{ ...style, ...(uri ? { backgroundImage: `url("${uri}")` } : null), position: 'relative', overflow: 'hidden' }}>
      {velha ? <div data-dt="capa-sai" style={{ position: 'absolute', inset: 0, background: `center / cover no-repeat url("${velha}")` }} /> : null}
    </div>
  );
}

/**
 * A cor da capa que se vê (Afinado, 25/11): a característica, a mesma conta da
 * sombra da Ocultação, ou a média quando não há uma. `null` sem capa ou enquanto
 * se lê: o cartão fica no tom de sempre.
 */
function useCorDaCapa(uri: string | null): [number, number, number] | null {
  const [cor, setCor] = useState<[number, number, number] | null>(null);
  useEffect(() => {
    if (!uri) { setCor(null); return undefined; }
    let vivo = true;
    void lerCelulasDaCapa(uri).then((celulas) => {
      if (!vivo || !celulas?.length) return;
      const n = celulas.length;
      const media = { r: celulas.reduce((s, c) => s + c.r, 0) / n, g: celulas.reduce((s, c) => s + c.g, 0) / n, b: celulas.reduce((s, c) => s + c.b, 0) / n };
      const base = corCaracteristica(celulas) ?? media;
      setCor([Math.round(base.r), Math.round(base.g), Math.round(base.b)]);
    }).catch(() => {});
    return () => { vivo = false; };
  }, [uri]);
  return cor;
}

/** O play do mini leitor: o disco de metal da barra. O laço roda quando o play muda, nunca ao abrir. */
function BotaoDePlay({ aTocar, estilo, aoCarregar }: { aTocar: boolean; estilo?: React.CSSProperties; aoCarregar: () => void }) {
  const reflexo = useRef<HTMLSpanElement>(null);
  const antes = useRef(aTocar);
  useEffect(() => {
    if (antes.current === aTocar) return;
    antes.current = aTocar;
    rodarReflexo(reflexo.current, aTocar);
  }, [aTocar]);
  return (
    <button className="play" data-dt="disco-metal" aria-label={aTocar ? 'Pause' : 'Play'} onClick={aoCarregar} style={estilo}>
      <span ref={reflexo} data-dt="reflexo" />
      <span className="icone-do-play">{aTocar ? icone.pausa : icone.tocar}</span>
    </button>
  );
}

function tempo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function MiniLeitor() {
  const ponte = window.duotoneMini;
  const [r, setR] = useState<Resumo | null>(null);
  const [expandido, setExpandido] = useState(false);
  /** A janela principal está à vista? O botão ao lado do X mostra-a ou esconde-a. */
  const [janelaVisivel, setJanelaVisivel] = useState(true);
  // A posição anda sozinha entre resumos (chegam a 2 Hz), para a barra não saltar.
  const [agora, setAgora] = useState(() => Date.now());
  const [recebidoEm, setRecebidoEm] = useState(() => Date.now());
  // A barra: aberta com o rato por cima, e de que lado da janela se encosta.
  const [aberto, setAberto] = useState(false);
  const [ancora, setAncora] = useState<'cima' | 'baixo'>('baixo');
  /** O lado do ecrã a que está encostado (a pega fica no outro). */
  const [lado, setLado] = useState<'esquerda' | 'direita'>('direita');
  /** O tamanho dado pela pega: tudo se desenha à escala 1 e é ampliado. */
  const [escala, setEscala] = useState(1);
  const aPegar = useRef(false);
  const pedido = useRef<number | null>(null);
  const cartaoRef = useRef<HTMLDivElement>(null);
  const ignorando = useRef<boolean | null>(null);
  const fecho = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A lista das próximas (12/10, João: escolher uma música sem dar Alt+Tab).
  // Abre no botão do canto e fecha quando o rato sai do mini, como o cartão.
  const [lista, setLista] = useState(false);
  const listaAberta = useRef(false);
  const listaRef = useRef<HTMLDivElement>(null);
  const fechoDaLista = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abrirLista = () => {
    if (fechoDaLista.current) { clearTimeout(fechoDaLista.current); fechoDaLista.current = null; }
    listaAberta.current = true;
    setLista(true);
    ponte?.lista?.(true);
  };
  const fecharLista = () => {
    if (!listaAberta.current) return;
    listaAberta.current = false;
    setLista(false);
    if (fechoDaLista.current) clearTimeout(fechoDaLista.current);
    fechoDaLista.current = setTimeout(() => { fechoDaLista.current = null; ponte?.lista?.(false); }, DURACAO_DA_LISTA);
  };
  const fecharListaRef = useRef(fecharLista);
  fecharListaRef.current = fecharLista;

  useEffect(() => {
    if (!ponte) return;
    const sair = ponte.onEstado((novo) => { setR(novo); setRecebidoEm(Date.now()); });
    const sairTamanho = ponte.onTamanho(setExpandido);
    const sairJanela = ponte.onJanela?.(setJanelaVisivel);
    const sairAncora = ponte.onAncora?.((v, h) => { setAncora(v); setLado(h); });
    const sairEscala = ponte.onEscala?.(setEscala);
    // Fechada pelo processo principal (o mini foi arrastado com ela aberta).
    const sairDaLista = ponte.onListaFechada?.(() => { listaAberta.current = false; setLista(false); });
    return () => { sair(); sairTamanho(); sairJanela?.(); sairAncora?.(); sairEscala?.(); sairDaLista?.(); };
  }, [ponte]);
  // O grande não tem lista (o processo principal fecha-a ao expandir).
  useEffect(() => {
    if (!expandido) return;
    if (fechoDaLista.current) { clearTimeout(fechoDaLista.current); fechoDaLista.current = null; }
    listaAberta.current = false;
    setLista(false);
  }, [expandido]);

  // O rato. Com a barra recolhida, a parte transparente da janela deixa passar
  // os cliques para o que está por baixo (`ignorarRato`), mas os MOVIMENTOS
  // continuam a chegar: é por eles que se sabe quando o rato entra na barra.
  useEffect(() => {
    const ignorar = (sim: boolean) => {
      if (ignorando.current === sim) return;
      ignorando.current = sim;
      ponte?.ignorarRato?.(sim);
    };
    if (expandido) { ignorar(false); return; }
    const recolher = (depois: number) => {
      if (aPegar.current) return;
      if (fecho.current) clearTimeout(fecho.current);
      fecho.current = setTimeout(() => { setAberto(false); fecharListaRef.current(); ignorar(true); }, depois);
    };
    let ultimoY = -1;
    const mover = (e: MouseEvent) => {
      ultimoY = e.clientY;
      const c = cartaoRef.current?.getBoundingClientRect();
      // Com a lista aberta, o cartão, a lista e o espaço entre os dois.
      const l = listaAberta.current ? listaRef.current?.getBoundingClientRect() : undefined;
      const caixa = c && l ? {
        left: Math.min(c.left, l.left), right: Math.max(c.right, l.right),
        top: Math.min(c.top, l.top), bottom: Math.max(c.bottom, l.bottom),
      } : c;
      const dentro = !!caixa && e.clientX >= caixa.left && e.clientX <= caixa.right && e.clientY >= caixa.top && e.clientY <= caixa.bottom;
      if (dentro) {
        if (fecho.current) { clearTimeout(fecho.current); fecho.current = null; }
        ignorar(false);
        setAberto(true);
      } else {
        ignorar(true);
        recolher(250);
      }
    };
    // Sair da janela recolhe. Quem diz que o rato saiu é o processo principal
    // (`onRato`): o `mouseleave` da página falhava numa janela sem foco, e a
    // barra ficava aberta de vez. Arrastar pela barrinha não conta como sair
    // (a janela anda com o rato). Sem essa ponte (uma versão antiga do
    // processo principal) fica o `mouseleave`, com mais tempo para a barrinha.
    const sairDaJanela = ponte?.onRato?.((dentro) => { if (!dentro) recolher(250); });
    const sair = () => recolher(ultimoY >= 0 && ultimoY < 18 ? 1500 : 250);
    document.addEventListener('mousemove', mover);
    if (!sairDaJanela) document.documentElement.addEventListener('mouseleave', sair);
    ignorar(true);
    return () => {
      document.removeEventListener('mousemove', mover);
      sairDaJanela?.();
      if (!sairDaJanela) document.documentElement.removeEventListener('mouseleave', sair);
      if (fecho.current) clearTimeout(fecho.current);
    };
  }, [expandido, ponte]);
  useEffect(() => {
    if (!r?.aTocar) return;
    const t = setInterval(() => setAgora(Date.now()), 250);
    return () => clearInterval(t);
  }, [r?.aTocar]);

  const mandar = (tipo: string, ms?: number) => ponte?.comando(ms === undefined ? { tipo } : { tipo, ms });
  // A cor troca quando a Ocultação tapa a capa, como o fundo da janela principal.
  const capaVista = useAtrasadoPelaOcultacao(r?.capa ?? null);
  const cor = useCorDaCapa(capaVista);
  const tinta = cor ? ({ '--cr': cor[0], '--cg': cor[1], '--cb': cor[2] } as React.CSSProperties) : undefined;
  // Com o rato no "seguinte", o artista dá lugar à música que vem.
  const [espreitar, setEspreitar] = useState(false);
  // O coração reage ao carregar (16/10, lib/coracaoAoCarregar.ts). A guarda
  // faz-se na janela principal e o estado volta pelo resumo: até lá (ou até
  // 1,5 s, se nada voltar) mostra-se o que se pediu.
  const coracaoAoCarregar = useCoracaoAoCarregar(!!r?.guardada, () => {
    mandar('guardar');
    return new Promise((fim) => setTimeout(fim, 1500));
  });
  const carregouNoCoracao = useRef(false);
  // A pega mexe no canto oposto ao que está encostado ao ecrã. No compacto o
  // cartão está encostado em baixo (ou em cima), e a pega vai ao lado de cima
  // (ou de baixo) DELE. A página só diz a fase; o rato lê-o o processo
  // principal, porque a janela muda debaixo dele.
  const pegaEmCima = ancora === 'baixo';
  const pegaAEsquerda = lado === 'direita';
  const pega = ponte?.pega ? (
    <div className="pega" aria-hidden="true"
      style={{
        [pegaEmCima ? 'top' : 'bottom']: 1, [pegaAEsquerda ? 'left' : 'right']: 1,
        cursor: pegaEmCima === pegaAEsquerda ? 'nwse-resize' : 'nesw-resize',
      }}
      onPointerDown={(e) => {
        e.preventDefault(); e.stopPropagation();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
        aPegar.current = true;
        ponte.pega?.('inicio');
      }}
      onPointerMove={() => {
        if (!aPegar.current || pedido.current !== null) return;
        pedido.current = requestAnimationFrame(() => { pedido.current = null; ponte.pega?.('mover'); });
      }}
      onPointerUp={(e) => {
        if (!aPegar.current) return;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
        aPegar.current = false;
        ponte.pega?.('fim');
      }}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
        style={{ transform: `scale(${pegaAEsquerda ? -1 : 1}, ${pegaEmCima ? -1 : 1})` }}>
        <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </div>
  ) : null;
  // O canto (esconder/fechar) sai do caminho quando a pega vai para o canto
  // de cima à direita.
  const cantoAfastado = pegaEmCima && !pegaAEsquerda;
  const escalado = (base: { w: number; h: number }, filho: React.ReactNode) => (
    <div style={{ width: base.w, height: base.h, transform: `scale(${escala})`, transformOrigin: '0 0' }}>{filho}</div>
  );
  const duracao = r?.duracaoMs ?? 0;
  const posicao = r ? Math.min(duracao || Infinity, r.posicaoMs + (r.aTocar ? Math.max(0, agora - recebidoEm) : 0)) : 0;
  const fracao = duracao > 0 ? Math.min(1, posicao / duracao) : 0;
  const procurar = (e: React.MouseEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    if (duracao > 0 && caixa.width > 0) mandar('procurar', ((e.clientX - caixa.left) / caixa.width) * duracao);
  };
  const tocarOuPausa = (
    <BotaoDePlay aTocar={!!r?.aTocar} aoCarregar={() => mandar('tocar-pausa')}
      estilo={{ width: expandido ? 48 : 40, height: expandido ? 48 : 40, borderRadius: expandido ? 24 : 20 }} />
  );
  const coracao = (tamanho = 30, icone = 16) => (
    <button aria-label={coracaoAoCarregar.mostrada ? 'Remove from Liked Songs' : 'Add to Liked Songs'} aria-pressed={coracaoAoCarregar.mostrada}
      onPointerDown={(e) => { if (e.button !== 0) return; carregouNoCoracao.current = true; coracaoAoCarregar.onPressIn(); }}
      onPointerLeave={() => { if (carregouNoCoracao.current) { carregouNoCoracao.current = false; coracaoAoCarregar.onPressOut(); } }}
      onClick={() => {
        // Pelo teclado não há "carregar": o clique faz as duas coisas.
        if (!carregouNoCoracao.current) coracaoAoCarregar.onPressIn();
        carregouNoCoracao.current = false;
        coracaoAoCarregar.onPress();
      }}
      style={{ width: tamanho, height: tamanho }}>
      <CoracaoAnimado guardada={coracaoAoCarregar.mostrada} pulso={coracaoAoCarregar.pulso} tamanho={icone} cor="currentColor" corCheio="currentColor" />
    </button>
  );

  // Abrir o Duotone e fechar: pequenos, no canto, só com o rato por cima.
  const canto = (
    <div className="canto so-hover" style={cantoAfastado ? { right: 24 } : undefined}>
      <button aria-label="Shrink" title="Shrink" onClick={() => mandar('encolher')}>{icone.encolher}</button>
      <button aria-label={janelaVisivel ? 'Hide Duotone' : 'Open Duotone'} title={janelaVisivel ? 'Hide Duotone' : 'Open Duotone'}
        onClick={() => mandar('alternar-duotone')}>{janelaVisivel ? icone.esconder : icone.abrir}</button>
      <button aria-label="Close mini player" onClick={() => mandar('fechar')}>{icone.fechar}</button>
    </div>
  );

  if (expandido) {
    return escalado({ w: 320, h: 400 }, (
      <div className={`mini grande${cor ? ' com-cor' : ''}`} style={{ ...tinta, padding: '24px 20px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="arrasto" />
        {pega}
        {canto}
        <CapaDoMini uri={r?.capa ?? null} sentido={r?.sentido ?? 1} style={{ width: 208, height: 208, alignSelf: 'center', boxShadow: '0 18px 40px rgba(0,0,0,0.5)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, marginTop: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="titulo" style={{ fontSize: 17, fontFamily: FONT.display, fontWeight: 700 }}>{r?.titulo ?? 'Nothing playing'}</div>
            <div className="artista" style={{ fontSize: 13 }}>{r?.artista ?? ''}</div>
          </div>
          <div className="coracao-do-titulo" style={{ display: 'flex' }}>{coracao(30, 18)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div className="barra fina" onClick={procurar} role="slider" aria-label="Seek"
            aria-valuemin={0} aria-valuemax={Math.round(duracao / 1000)} aria-valuenow={Math.round(posicao / 1000)}>
            <div><div style={{ width: `${fracao * 100}%` }} /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="tempo">{tempo(posicao)}</span>
            <span className="tempo">{tempo(duracao)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <button aria-label="Previous" onClick={() => mandar('anterior')} style={{ width: 34, height: 34 }}>{icone.anterior}</button>
          {tocarOuPausa}
          <button aria-label="Next" onClick={() => mandar('seguinte')} style={{ width: 34, height: 34 }}>{icone.seguinte}</button>
        </div>
      </div>
    ));
  }

  // A barra (25/9, pedido do João): recolhida mostra a capa pequena, o título
  // e o tocar/pausa; com o rato por cima abre para o cartão de sempre (a mesma
  // disposição, que NÃO muda com o rato -- decidido a 24/9 --, só aparecem o
  // coração, o anterior, o seguinte, o tempo e o canto).
  // O desenho fica preso ao lado da janela que NÃO se mexe quando a lista abre
  // (o de baixo, encostado em baixo): a janela cresce de uma vez para o outro
  // lado e o cartão fica onde estava, sem esperar que a página se redesenhe.
  // Sem a lista, o que sobra do desenho fica fora da janela.
  const fila = r?.fila ?? [];
  return (
    <div style={{
      position: 'fixed', left: 0, [ancora === 'baixo' ? 'bottom' : 'top']: 0,
      width: 360, height: ALTURA_DO_CARTAO + ESPACO_DA_LISTA + ALTURA_DA_LISTA,
      transform: `scale(${escala})`, transformOrigin: ancora === 'baixo' ? '0 100%' : '0 0',
    }}>
    <div className={`palco ${lista ? 'com-lista' : ''}`}>
      <div ref={listaRef} className={`lista ${ancora} ${lista ? 'aberta' : ''}`} aria-hidden={!lista}
        style={{ [ancora === 'baixo' ? 'bottom' : 'top']: ALTURA_DO_CARTAO + ESPACO_DA_LISTA }}>
        <div className="lista-titulo">UP NEXT</div>
        {fila.length ? (
          <div className="lista-linhas">
            {fila.map((f, i) => (
              <button key={`${f.chave}:${i}`} className="da-fila" tabIndex={lista ? 0 : -1} disabled={r?.filaSoDeVer}
                aria-label={`Play ${f.titulo ?? 'song'}`} onClick={() => ponte?.comando({ tipo: 'tocar-da-fila', chave: f.chave, posicao: i })}>
                {f.capa ? <img className="capa" src={f.capa} alt="" loading="lazy" decoding="async" draggable={false} /> : <div className="capa" />}
                <div className="textos">
                  <div className="titulo">{f.titulo ?? ''}</div>
                  <div className="artista">{f.artista ?? ''}</div>
                </div>
              </button>
            ))}
          </div>
        ) : <div className="lista-vazia">Nothing up next</div>}
      </div>
      <div ref={cartaoRef} className={`mini cartao ${ancora} ${aberto ? 'aberto' : ''}${cor ? ' com-cor' : ''}`} style={tinta}>
        {aberto ? <div className="arrasto" /> : null}
        {pega}
        <div className="canto so-aberto" style={{ display: 'flex', ...(cantoAfastado ? { right: 24 } : null) }}>
          {ponte?.lista ? (
            <button className={lista ? 'ligado' : undefined} aria-label={lista ? 'Hide queue' : 'Show queue'} title="Queue"
              aria-pressed={lista} onClick={() => (lista ? fecharLista() : abrirLista())}>{icone.fila}</button>
          ) : null}
          <button aria-label={janelaVisivel ? 'Hide Duotone' : 'Open Duotone'} title={janelaVisivel ? 'Hide Duotone' : 'Open Duotone'}
            onClick={() => mandar('alternar-duotone')}>{janelaVisivel ? icone.esconder : icone.abrir}</button>
          <button aria-label="Close mini player" onClick={() => mandar('fechar')}>{icone.fechar}</button>
        </div>
        <div className="moldura">
          <CapaDoMini uri={r?.capa ?? null} sentido={r?.sentido ?? 1} />
          <div className="sobre-a-capa so-aberto">
            <button className="sobre-a-capa" aria-label="Expand" onClick={() => mandar('expandir')}>{icone.expandir}</button>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div className="linha1">
            <span className="titulo">{r?.titulo ?? 'Nothing playing'}</span>
            {r?.artista ? <span className="ponto">· {r.artista}</span> : null}
            <span className="coracao-do-titulo">{coracao(22, 14)}</span>
          </div>
          <div className="detalhe" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div className="artista">{espreitar && fila[0]?.titulo ? `Up next · ${fila[0].titulo}` : (r?.artista ?? '')}</div>
            <div className="progresso">
              <span className="tempo">{tempo(posicao)}</span>
              <div className="barra fina" style={{ flex: 1 }} onClick={procurar} role="slider" aria-label="Seek"
                aria-valuemin={0} aria-valuemax={Math.round(duracao / 1000)} aria-valuenow={Math.round(posicao / 1000)}>
                <div><div style={{ width: `${fracao * 100}%` }} /></div>
              </div>
              <span className="tempo">{tempo(duracao)}</span>
            </div>
          </div>
        </div>
        <div className="controlos">
          <div className="extra"><button aria-label="Previous" onClick={() => mandar('anterior')} style={{ width: 28, height: 28 }}>{icone.anterior}</button></div>
          <BotaoDePlay aTocar={!!r?.aTocar} aoCarregar={() => mandar('tocar-pausa')} />
          <div className="extra"><button aria-label="Next" onClick={() => mandar('seguinte')} style={{ width: 28, height: 28 }}
            onMouseEnter={() => setEspreitar(true)} onMouseLeave={() => setEspreitar(false)} onBlur={() => setEspreitar(false)}>{icone.seguinte}</button></div>
        </div>
        <div className="linha so-fechado"><div style={{ width: `${fracao * 100}%` }} /></div>
      </div>
    </div>
    </div>
  );
}

function RaizDoMini() {
  return (
    <>
      <style>{cssDasFontes() + CSS}</style>
      <MiniLeitor />
    </>
  );
}

/** A raiz, se esta janela for o mini leitor (`?janela=mini` e a ponte dele); senão `null`. */
export function raizDaJanelaMini(): ComponentType | null {
  if (typeof window === 'undefined' || !window.duotoneMini) return null;
  try {
    if (new URLSearchParams(window.location.search).get('janela') !== 'mini') return null;
  } catch {
    return null;
  }
  return RaizDoMini;
}
