import { Asset } from 'expo-asset';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { capaDeRecurso, capaGrandeDaFaixa } from '../lib/capaGrande';
import { displayArtist, tituloNoLeitor } from '../lib/artistName';
import {
  COR_DO_FUNDO, COR_DO_VEU, encherCaixa, geometriaDoCartao, nomeDoFicheiroDaStory, partirTitulo,
  TAMANHO_DA_STORY, VEU_DO_CARTAO,
} from '../lib/cartaoDaStory';
import { useCartaoDaStory } from '../state/cartaoDaStory';
import type { Track } from '../types';
import { recorteDaCapa } from './glitch/renderer.web';
import { COR, ESP, FONT, TIPO } from './tokens.web';
import { Button, Dialog, Loading } from './ui.web';

/** A miniatura cinzenta que o YouTube devolve quando não há `maxresdefault`. */
const LARGURA_DO_CINZENTO = 120;

function carregar(src: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rejeitar) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolver(img);
    img.onerror = () => rejeitar(new Error('imagem'));
    img.src = src;
  });
}

/** A maior capa que houver: a maxres, e se não existir a de recurso. */
async function capaDaFaixa(faixa: Track): Promise<HTMLImageElement | null> {
  const candidatas = [capaGrandeDaFaixa(faixa, new Set()), capaDeRecurso(faixa), faixa.artworkUrl ?? null]
    .filter((u, i, todas): u is string => !!u && todas.indexOf(u) === i);
  for (const url of candidatas) {
    try {
      const img = await carregar(url);
      if (img.naturalWidth > LARGURA_DO_CINZENTO) return img;
    } catch { /* a seguinte */ }
  }
  return null;
}

function retanguloRedondo(ctx: CanvasRenderingContext2D, x: number, y: number, lado: number, raio: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, lado, lado, raio);
}

/**
 * O cartão desenhado num canvas de 1080x1920, com as medidas de
 * `lib/cartaoDaStory.ts` -- as mesmas do iPhone.
 */
async function desenharCartao(faixa: Track): Promise<HTMLCanvasElement> {
  const { largura: L, altura: A } = TAMANHO_DA_STORY;
  const g = geometriaDoCartao(L);
  const canvas = document.createElement('canvas');
  canvas.width = L;
  canvas.height = A;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');

  const titulo = tituloNoLeitor(faixa);
  const artista = displayArtist(faixa);
  const fonteDoTitulo = `700 ${g.titulo.tamanho}px ${FONT.display}`;
  const fonteDoArtista = `400 ${g.artista.tamanho}px ${FONT.body}`;
  const fonteDaMarca = `600 ${g.marca.tamanho}px ${FONT.body}`;
  const [fundo, logo, capa] = await Promise.all([
    carregar(Asset.fromModule(require('../../assets/login_bg.png')).uri),
    carregar(Asset.fromModule(require('../../assets/auth-logo.png')).uri).catch(() => null),
    capaDaFaixa(faixa),
    document.fonts?.load(fonteDoTitulo, titulo).catch(() => null),
    document.fonts?.load(fonteDoArtista, artista).catch(() => null),
  ]);

  // O fundo da app, desfocado, encostado em cima (é lá que está o símbolo).
  ctx.fillStyle = COR_DO_FUNDO;
  ctx.fillRect(0, 0, L, A);
  const onde = encherCaixa({ largura: fundo.naturalWidth, altura: fundo.naturalHeight }, g.fundo, 0);
  ctx.save();
  ctx.filter = `blur(${g.fundo.desfoque}px)`;
  ctx.globalAlpha = g.fundo.brilho;
  ctx.drawImage(fundo, onde.x, onde.y, onde.largura, onde.altura);
  ctx.restore();

  // O véu, que escurece para baixo.
  const veu = ctx.createLinearGradient(0, 0, 0, A);
  for (const { em, opacidade } of VEU_DO_CARTAO) veu.addColorStop(em, `rgba(${COR_DO_VEU.r},${COR_DO_VEU.g},${COR_DO_VEU.b},${opacidade})`);
  ctx.fillStyle = veu;
  ctx.fillRect(0, 0, L, A);

  // A capa, com a sombra por baixo; o recorte tira as barras das 4:3.
  const c = g.capa;
  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${c.sombraOpacidade})`;
  ctx.shadowBlur = c.sombraDesfoque;
  ctx.shadowOffsetY = c.sombraY;
  retanguloRedondo(ctx, c.x, c.y, c.lado, c.raio);
  ctx.fillStyle = '#15151a';
  ctx.fill();
  ctx.restore();
  if (capa) {
    ctx.save();
    retanguloRedondo(ctx, c.x, c.y, c.lado, c.raio);
    ctx.clip();
    const r = recorteDaCapa(capa.naturalWidth, capa.naturalHeight);
    ctx.drawImage(capa, r.x, r.y, r.lado, r.lado, c.x, c.y, c.lado, c.lado);
    ctx.restore();
  }

  // O nome (até duas linhas) e o artista.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#F5F5F7';
  ctx.font = fonteDoTitulo;
  ctx.letterSpacing = `${-0.01 * g.titulo.tamanho}px`;
  const larguraDoTexto = L - g.titulo.margem * 2;
  const linhas = partirTitulo(titulo, (s) => ctx.measureText(s).width <= larguraDoTexto, g.titulo.linhas);
  let y = g.titulo.topo;
  for (const linha of linhas) { ctx.fillText(linha, L / 2, y); y += g.titulo.alturaDaLinha; }
  ctx.font = fonteDoArtista;
  ctx.letterSpacing = '0px';
  ctx.fillStyle = `rgba(245,245,247,${g.artista.opacidade})`;
  const [artistaNaLinha] = partirTitulo(artista, (s) => ctx.measureText(s).width <= larguraDoTexto, 1);
  ctx.fillText(artistaNaLinha ?? '', L / 2, y + g.artista.espaco);

  // A marca no fundo: o símbolo e "DUOTONE", espaçado.
  const m = g.marca;
  ctx.font = fonteDaMarca;
  ctx.letterSpacing = `${m.espacamento}px`;
  const larguraDaPalavra = ctx.measureText('DUOTONE').width;
  const total = (logo ? m.logo + m.espaco : 0) + larguraDaPalavra;
  let x = (L - total) / 2;
  ctx.globalAlpha = m.opacidade;
  if (logo) { ctx.drawImage(logo, x, m.base - m.logo, m.logo, m.logo); x += m.logo + m.espaco; }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#F5F5F7';
  ctx.fillText('DUOTONE', x, m.base - m.logo / 2);
  ctx.globalAlpha = 1;
  return canvas;
}

function comoBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolver, rejeitar) => canvas.toBlob((b) => (b ? resolver(b) : rejeitar(new Error('png'))), 'image/png'));
}

/**
 * O cartão das Stories no PC (29/9): o mesmo da opção A, desenhado num canvas
 * de 1080x1920. Guarda-se como PNG ou copia-se para colar; a Story publica-se
 * a partir do telemóvel, por isso o PC entrega a imagem e mais nada.
 */
export function CartaoDaStoryPc({ notify }: { notify: (m: string) => void }) {
  const faixa = useCartaoDaStory((s) => s.faixa);
  const fechar = useCartaoDaStory((s) => s.fechar);
  const [imagem, setImagem] = useState<{ url: string; blob: Blob } | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (!faixa) return;
    let vivo = true;
    let url: string | null = null;
    setImagem(null);
    setFalhou(false);
    void desenharCartao(faixa).then(comoBlob).then((blob) => {
      if (!vivo) return;
      url = URL.createObjectURL(blob);
      setImagem({ url, blob });
    }).catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [faixa]);

  const guardar = () => {
    if (!imagem || !faixa) return;
    const a = document.createElement('a');
    a.href = imagem.url;
    a.download = nomeDoFicheiroDaStory(tituloNoLeitor(faixa));
    document.body.appendChild(a);
    a.click();
    a.remove();
    notify('Story image saved.');
  };
  const copiar = async () => {
    if (!imagem) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': imagem.blob })]);
      notify('Story image copied.');
    } catch {
      notify('Could not copy the image.');
    }
  };

  return <Dialog open={!!faixa} title="Share to Stories" onClose={fechar} width={420}>
    <View style={estilos.previa}>
      {imagem ? <Image source={{ uri: imagem.url }} style={estilos.imagem} accessibilityLabel="Story image preview" />
        : falhou ? <Text style={estilos.aviso}>Could not create the image.</Text>
        : <Loading />}
    </View>
    <View style={estilos.accoes}>
      <Button icon="download-outline" onPress={guardar} disabled={!imagem}>Save image</Button>
      <Button secondary icon="copy-outline" onPress={() => void copiar()} disabled={!imagem}>Copy image</Button>
    </View>
  </Dialog>;
}

const estilos = StyleSheet.create({
  previa: {
    alignSelf: 'center', width: 270, height: 480, borderRadius: 14, overflow: 'hidden',
    backgroundColor: COR_DO_FUNDO, alignItems: 'center', justifyContent: 'center', marginBottom: ESP.lg,
  },
  imagem: { width: 270, height: 480 },
  aviso: { ...TIPO.corpo, color: COR.textoFraco, textAlign: 'center', padding: ESP.lg },
  accoes: { flexDirection: 'row', gap: ESP.sm, justifyContent: 'center' },
});
