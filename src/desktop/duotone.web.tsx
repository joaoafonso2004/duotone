import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { capaComBarras } from '../lib/modoLimpo';
import { posicaoNoCartao, SEM_BARRAS } from '../lib/doisTons';
import { COR } from './tokens.web';
import { marcar } from './ui.web';

/**
 * A capa a dois tons (30/10, base do "PC elevado"): em repouso a imagem fica
 * entre dois tons (o do preto e o do branco, `--duo-baixo` e `--duo-alto`); ao
 * passar o rato no cartão (ou no próprio quadro) a cor volta devagar. Uma capa
 * `viva` nunca perde a cor: é a que está a tocar, ou a que já ouviste.
 *
 * São duas imagens iguais (a cores, por baixo; a cinzentos, por cima, que o CSS
 * multiplica e aclara). O browser descodifica uma só. Mesmo assim cada quadro
 * leva um filtro e uma mistura: serve para prateleiras e grelhas, nunca para uma
 * linha por faixa (centenas de filtros ao mesmo tempo pesam).
 *
 * `brilho`: o reflexo de metal que segue o cursor, sobre o quadro (para o
 * cartão inteiro, `marcar('cartao', 'brilho')` no próprio cartão). As regras
 * `duo*` e `brilho` estão na `casca.web.tsx`, onde o `marcar` as procura.
 */
const MARCAS = {
  base: marcar('duo'),
  viva: marcar('duo', 'duo-viva'),
  brilho: marcar('duo', 'brilho'),
  vivaBrilho: marcar('duo', 'duo-viva', 'brilho'),
};
const COBRE = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' } as const;

export function CapaDuotone({ uri, viva = false, brilho = false, style }: {
  uri: string | null | undefined; viva?: boolean; brilho?: boolean; style?: any;
}) {
  const marcas = viva ? (brilho ? MARCAS.vivaBrilho : MARCAS.viva) : (brilho ? MARCAS.brilho : MARCAS.base);
  const quadro = [{ width: '100%', aspectRatio: 1, backgroundColor: COR.elevado, overflow: 'hidden' }, style];
  if (!uri) return <View {...marcas} style={quadro as any} />;
  // Com as barras do YouTube, a imagem sai do quadro pelos lados e por cima/baixo
  // (o `overflow` corta): ver `SEM_BARRAS`.
  const imagem = capaComBarras(uri) ? { position: 'absolute' as const, ...SEM_BARRAS } : StyleSheet.absoluteFill;
  return <View {...marcas} style={quadro as any}>
    <Image source={{ uri }} style={imagem as any} />
    <View {...marcar('duo-tom')} aria-hidden pointerEvents="none" style={COBRE}>
      <View {...marcar('duo-tom-img')} style={COBRE}><Image source={{ uri }} style={imagem as any} /></View>
      <View {...marcar('duo-sombra')} style={StyleSheet.absoluteFill} />
    </View>
  </View>;
}

let brilhoLigado = false;

/**
 * O brilho de metal segue o rato (`--mx`, `--my` no cartão). UM ouvinte no
 * documento, e no máximo uma escrita por fotograma, só no cartão onde está o
 * rato: o custo não cresce com os cartões. Com "menos movimento" o brilho fica
 * parado ao centro (a regra `brilho` da casca trata do resto). Uma vez só, na
 * vida da janela: quem a chamar duas vezes não liga dois.
 */
export function ligarBrilhoDoCursor(): void {
  if (brilhoLigado || typeof document === 'undefined') return;
  brilhoLigado = true;
  let quadro = 0;
  let ultimo: { el: HTMLElement; x: number; y: number } | null = null;
  const pintar = () => {
    quadro = 0;
    if (!ultimo?.el.isConnected) return;
    const p = posicaoNoCartao(ultimo.el.getBoundingClientRect(), ultimo.x, ultimo.y);
    ultimo.el.style.setProperty('--mx', p.mx);
    ultimo.el.style.setProperty('--my', p.my);
  };
  document.addEventListener('mousemove', (e) => {
    const alvo = (e.target as Element | null)?.closest?.('[data-dt~="brilho"]') as HTMLElement | null;
    if (!alvo || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    ultimo = { el: alvo, x: e.clientX, y: e.clientY };
    if (!quadro) quadro = requestAnimationFrame(pintar);
  }, { passive: true });
}
