import React from 'react';
import { Image, Text, View } from 'react-native';
import { create } from 'zustand';
import { playlistsComAFaixa } from '../api/playlists';
import { eArrasto } from '../lib/arrastar';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import type { Track } from '../types';
import { COR, FONT, RAIO } from './tokens.web';

// Sem tipos instalados para o react-dom; só se usa o portal.
const { createPortal } = require('react-dom') as { createPortal: (filho: React.ReactNode, onde: Element) => React.ReactElement };

/** De onde veio a música: a lista (para reordenar nela) e a posição. */
export type OrigemDoArrasto = { lista?: string; indice?: number };

export type ArrastoAtivo = {
  faixa: Track;
  origem: OrigemDoArrasto;
  /** As playlists onde ela já está, quando a leitura chega (só se houver playlists na lateral). */
  playlistsComAFaixa: Set<string> | null;
};

/** O que aparece junto ao rato por cima de um destino, e se largar faz alguma coisa. */
export type PorCima = { texto: string; faz: boolean; linha?: { esquerda: number; direita: number; topo: number } };

export type Alvo = {
  /** Este destino serve para esta música? Os que servem acendem enquanto se arrasta. */
  aceita: (a: ArrastoAtivo) => boolean;
  porCima: (a: ArrastoAtivo, x: number, y: number, no: HTMLElement) => PorCima | null;
  aoLargar: (a: ArrastoAtivo, x: number, y: number, no: HTMLElement) => void;
  /** Uma lista: mostra a linha de inserção, e não acende a caixa toda. */
  insercao?: boolean;
  /** Quer saber em que playlists a música já está ("Already in …"). */
  querPlaylistsDaFaixa?: boolean;
  /**
   * Um LUGAR que abre com a música em cima (25/10, como as pastas do Finder):
   * as Playlists da lateral. Ao fim de `MOLA_MS` parado aqui, `abrir` muda de
   * página, e devolve como voltar -- o arrasto volta lá ao largar, ou ao
   * desistir, para quem estava a arrumar não perder o sítio.
   */
  mola?: { abrir: () => (() => void) | void };
};

/** Quanto tempo a música fica em cima de um lugar até ele abrir. */
export const MOLA_MS = 600;

/**
 * Arrastar uma música no PC (24/10, docs/arrastar-pc-maquete.html): pegar numa
 * linha de qualquer lista e largá-la na lateral (Liked Songs, uma playlist
 * fixada, um amigo), na fila, na barra do leitor, ou noutra posição da própria
 * playlist.
 *
 * Por eventos de ponteiro, e não pelo arrastar do HTML: foi tentado na fila e
 * abandonado (`FilaArrastavel.web.tsx`) -- a capa roubava o gesto e não dava
 * para mostrar nada enquanto se arrastava. Aqui o gesto é nosso: o fantasma
 * segue o rato e diz o que vai acontecer ANTES de largar.
 *
 * - Um clique continua a ser um clique: só passa a arrasto depois de
 *   `LIMIAR_DO_ARRASTO_PX`. Depois de largar, o `click` que o browser ainda
 *   manda é engolido (senão a linha punha a música a tocar).
 * - Os destinos registam-se com `refDoAlvo`; o de baixo do rato é o mais fundo
 *   que contém o elemento debaixo dele (`elementFromPoint`), por isso um
 *   diálogo por cima da lateral tapa-a, como se vê.
 * - Esc desiste, e o clique ao largar também é engolido.
 */
const alvos = new Map<string, { no: HTMLElement; alvo: Alvo }>();

/** Regista um destino pelo `ref` do elemento dele. `chave` única por destino no ecrã. */
export function refDoAlvo(chave: string, alvo: Alvo | null): (no: any) => void {
  return (no: any) => {
    if (no && alvo && typeof no.getBoundingClientRect === 'function') { alvos.set(chave, { no, alvo }); return; }
    // Deixou de ser destino (as Playlists, depois de a mola as abrir): sem realce.
    if (no && !alvo) no.removeAttribute?.('data-largar');
    alvos.delete(chave);
  };
}

type Estado = { ativo: ArrastoAtivo | null; x: number; y: number; porCima: PorCima | null };
export const useArrasto = create<Estado>(() => ({ ativo: null, x: 0, y: 0, porCima: null }));

let gesto: {
  faixa: Track; origem: OrigemDoArrasto; x0: number; y0: number; soVertical: boolean;
  ativo: ArrastoAtivo | null; cancelado: boolean; x: number; y: number;
  /** A leitura do "Already in …" já foi pedida neste arrasto. */
  pediuPlaylists: boolean;
  /** O lugar com a música em cima, a contar para abrir (ver `Alvo.mola`). */
  molaChave: string | null; molaTempo: ReturnType<typeof setTimeout> | null;
  /** Os lugares que este arrasto já abriu: não abrem outra vez. */
  molasAbertas: Set<string>;
  /** Como voltar para onde se estava, se uma mola abriu outra página. */
  voltar: (() => void) | null;
} | null = null;

/** O `onPointerDown` de quem se pode arrastar. `soVertical`: num carrossel, o lado é dele. */
export function comecarArrasto(e: any, faixa: Track, origem: OrigemDoArrasto = {}, opcoes?: { soVertical?: boolean }): void {
  const n = e?.nativeEvent ?? e;
  if (gesto || !n || n.button !== 0 || n.pointerType === 'touch') return;
  if ((n.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return;
  gesto = {
    faixa, origem, x0: n.clientX, y0: n.clientY, soVertical: !!opcoes?.soVertical, ativo: null, cancelado: false,
    x: n.clientX, y: n.clientY, pediuPlaylists: false, molaChave: null, molaTempo: null, molasAbertas: new Set(), voltar: null,
  };
  window.addEventListener('pointermove', mover, true);
  window.addEventListener('pointerup', largar, true);
  window.addEventListener('pointercancel', terminar, true);
  window.addEventListener('keydown', tecla, true);
  window.addEventListener('dragstart', semArrastoDoBrowser, true);
  window.addEventListener('blur', terminar);
}

function semArrastoDoBrowser(e: Event): void { e.preventDefault(); }

/** O destino debaixo do rato: o mais fundo que contém o que está lá. */
function alvoEm(x: number, y: number): { chave: string; no: HTMLElement; alvo: Alvo } | null {
  const el = typeof document !== 'undefined' ? document.elementFromPoint(x, y) : null;
  if (!el) return null;
  let melhor: { chave: string; no: HTMLElement; alvo: Alvo } | null = null;
  for (const [chave, r] of alvos) {
    if (!r.no.isConnected || !r.no.contains(el)) continue;
    if (!melhor || melhor.no.contains(r.no)) melhor = { chave, ...r };
  }
  return melhor;
}

function ativar(g: NonNullable<typeof gesto>): void {
  const ativo: ArrastoAtivo = { faixa: g.faixa, origem: g.origem, playlistsComAFaixa: null };
  g.ativo = ativo;
  document.body.setAttribute('data-arrastar', '');
  try { window.getSelection?.()?.removeAllRanges(); } catch {}
  for (const r of alvos.values()) {
    if (r.alvo.aceita(ativo) && !r.alvo.insercao) r.no.setAttribute('data-largar', 'pode');
  }
  pedirPlaylistsSePreciso(g);
}

/**
 * Uma leitura por arrasto, e só com playlists à vista (as fixadas na lateral,
 * ou os cartões das Playlists depois de a mola as abrir): é o "Already in …".
 */
function pedirPlaylistsSePreciso(g: NonNullable<typeof gesto>): void {
  const ativo = g.ativo;
  if (!ativo || g.pediuPlaylists) return;
  let quer = false;
  for (const r of alvos.values()) if (r.alvo.querPlaylistsDaFaixa && r.alvo.aceita(ativo)) { quer = true; break; }
  if (!quer) return;
  g.pediuPlaylists = true;
  void playlistsComAFaixa(g.faixa).then(({ ids }) => {
    if (gesto?.ativo !== ativo) return;
    ativo.playlistsComAFaixa = ids;
    atualizar(gesto.x, gesto.y);
  }).catch(() => {});
}

/** O tempo da mola acabou: o lugar abre (uma vez por arrasto). */
function abrirMola(chave: string): void {
  const g = gesto;
  if (!g?.ativo || g.cancelado || g.molaChave !== chave) return;
  g.molaChave = null;
  g.molaTempo = null;
  g.molasAbertas.add(chave);
  const r = alvos.get(chave);
  r?.no.removeAttribute('data-largar');
  const voltar = r?.alvo.mola?.abrir();
  if (typeof voltar === 'function' && !g.voltar) g.voltar = voltar;
  // A página nova monta numa transição: os cartões dela acendem quando chegam,
  // sem esperar que o rato se mexa.
  const ativo = g.ativo;
  for (const ms of [0, 250, 700]) setTimeout(() => { if (gesto?.ativo === ativo) atualizar(gesto.x, gesto.y); }, ms);
}

function atualizar(x: number, y: number): void {
  const g = gesto;
  if (!g?.ativo) return;
  g.x = x; g.y = y;
  const debaixo = alvoEm(x, y);
  let porCima: PorCima | null = null;
  for (const [chave, r] of alvos) {
    if (r.alvo.insercao || !r.alvo.aceita(g.ativo)) { r.no.removeAttribute('data-largar'); continue; }
    if (chave !== debaixo?.chave) r.no.setAttribute('data-largar', 'pode');
  }
  // A mola: parado em cima de um lugar que abre, conta-se o tempo; sair dele
  // (ou chegar a outro) recomeça a conta.
  const mola = debaixo && debaixo.alvo.mola && debaixo.alvo.aceita(g.ativo) && !g.molasAbertas.has(debaixo.chave) ? debaixo.chave : null;
  if (mola !== g.molaChave) {
    if (g.molaTempo) clearTimeout(g.molaTempo);
    g.molaChave = mola;
    g.molaTempo = mola ? setTimeout(() => abrirMola(mola), MOLA_MS) : null;
  }
  if (debaixo && debaixo.alvo.aceita(g.ativo)) {
    porCima = debaixo.alvo.porCima(g.ativo, x, y, debaixo.no);
    if (!debaixo.alvo.insercao) {
      debaixo.no.setAttribute('data-largar', debaixo.chave === g.molaChave ? 'mola' : porCima?.faz ? 'por-cima' : 'pode');
    }
  }
  pedirPlaylistsSePreciso(g);
  useArrasto.setState({ ativo: g.ativo, x, y, porCima });
}

function mover(e: PointerEvent): void {
  const g = gesto;
  if (!g || g.cancelado) return;
  if (!g.ativo) {
    const sim = eArrasto(e.clientX - g.x0, e.clientY - g.y0, g.soVertical);
    if (sim === null) return;
    if (sim === false) { terminar(); return; }
    ativar(g);
  }
  // Enquanto se arrasta, o rato não seleciona texto.
  e.preventDefault();
  atualizar(e.clientX, e.clientY);
}

function largar(e: PointerEvent): void {
  const g = gesto;
  if (!g) return;
  if (!g.ativo) { terminar(); return; }
  engolirClique();
  if (g.cancelado) { terminar(); return; }
  const debaixo = alvoEm(e.clientX, e.clientY);
  const porCima = debaixo && debaixo.alvo.aceita(g.ativo) ? debaixo.alvo.porCima(g.ativo, e.clientX, e.clientY, debaixo.no) : null;
  const ativo = g.ativo;
  // Uma mola abriu outra página: depois de largar, volta-se para onde se estava.
  const voltar = g.voltar;
  g.voltar = null;
  terminar();
  if (debaixo && porCima?.faz) debaixo.alvo.aoLargar(ativo, e.clientX, e.clientY, debaixo.no);
  voltar?.();
}

function tecla(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || !gesto?.ativo || gesto.cancelado) return;
  // O Escape é do arrasto: não fecha o diálogo de onde se pegou.
  e.preventDefault();
  e.stopPropagation();
  gesto.cancelado = true;
  if (gesto.molaTempo) clearTimeout(gesto.molaTempo);
  gesto.molaTempo = null;
  gesto.molaChave = null;
  limparVisuais();
  // Desistir também volta para onde se estava, como as pastas do Finder.
  const voltar = gesto.voltar;
  gesto.voltar = null;
  voltar?.();
}

/** O `click` que o browser manda depois de largar não pode tocar a música. */
function engolirClique(): void {
  const engolir = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
  window.addEventListener('click', engolir, true);
  setTimeout(() => window.removeEventListener('click', engolir, true), 0);
}

function limparVisuais(): void {
  document.body.removeAttribute('data-arrastar');
  for (const r of alvos.values()) r.no.removeAttribute('data-largar');
  useArrasto.setState({ ativo: null, porCima: null });
}

function terminar(): void {
  // Um arrasto que acaba sem largar (a janela perdeu o foco) também volta.
  const voltar = gesto?.voltar ?? null;
  if (gesto?.molaTempo) clearTimeout(gesto.molaTempo);
  window.removeEventListener('pointermove', mover, true);
  window.removeEventListener('pointerup', largar, true);
  window.removeEventListener('pointercancel', terminar, true);
  window.removeEventListener('keydown', tecla, true);
  window.removeEventListener('dragstart', semArrastoDoBrowser, true);
  window.removeEventListener('blur', terminar);
  if (gesto?.ativo) limparVisuais();
  gesto = null;
  voltar?.();
}

/** O fantasma junto ao rato e a linha de inserção. Montado uma vez, na casca. */
export function CamadaDoArrasto() {
  const { ativo, x, y, porCima } = useArrasto();
  if (!ativo || typeof document === 'undefined') return null;
  const t = ativo.faixa;
  const largura = typeof window !== 'undefined' ? window.innerWidth : 1280;
  return createPortal(<>
    {porCima?.linha ? <View pointerEvents="none" style={{
      position: 'fixed', zIndex: 400, left: porCima.linha.esquerda, width: Math.max(0, porCima.linha.direita - porCima.linha.esquerda),
      top: porCima.linha.topo - 1, height: 2, borderRadius: 1, backgroundColor: COR.texto, boxShadow: '0 0 0 3px rgba(233,234,238,0.12)',
    } as any} /> : null}
    <View pointerEvents="none" style={{
      position: 'fixed', zIndex: 401, left: Math.min(x + 14, largura - 320), top: y + 10, maxWidth: 300,
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingLeft: 7, paddingRight: 12,
      borderRadius: RAIO.cartao, backgroundColor: '#18181F', borderWidth: 1, borderColor: '#33333C', boxShadow: '0 14px 34px rgba(0,0,0,.55)',
    } as any}>
      {t.artworkUrl ? <Image source={{ uri: t.artworkUrl }} style={{ width: 34, height: 34, borderRadius: RAIO.ctrl, backgroundColor: COR.elevado }} />
        : <View style={{ width: 34, height: 34, borderRadius: RAIO.ctrl, backgroundColor: COR.elevado }} />}
      <View style={{ minWidth: 0, flexShrink: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 13, fontWeight: '600', color: COR.texto }}>{tituloDaFaixa(t)}</Text>
        <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 12, marginTop: 1, color: porCima?.faz ? COR.texto : COR.textoMedio }}>
          {porCima?.texto ?? displayArtist(t)}
        </Text>
      </View>
    </View>
  </>, document.body);
}
