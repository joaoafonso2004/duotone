import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSobreAMusica } from '../hooks/useSobreAMusica';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { fasDoArtista } from '../lib/musicasDoArtista';
import { haQuanto, numeroCurto, relogio, textoDeVezes } from '../lib/sobreAMusica';
import { useDestinos } from '../navigation/destinos';
import { useArtistasFavoritos } from '../state/artistasFavoritos';
import { usePlayer } from '../state/player';
import type { Track } from '../types';
import { COR, ESP, ESTADO, FONT, RAIO, TIPO } from './tokens.web';
import { Artwork, Button } from './ui.web';

/**
 * A aba "About" (31/10, maquete `docs/now-playing-maquete.html`): o artista e a música que
 * toca, no cartão do Now Playing e na barra da direita. Só mostra o que se sabe: sem bio
 * (nenhuma das nossas fontes a tem), sem créditos (o YouTube não os dá), e sem um bloco se o
 * dado não existe. O que vem de onde e quanto custa: `hooks/useSobreAMusica.ts`.
 */
export function SobreAMusica({ track, more, notify }: { track: Track; more?: (t: Track) => void; notify?: (s: string) => void }) {
  const d = useSobreAMusica(track);
  const { irPara } = useDestinos();
  useEffect(() => { void useArtistasFavoritos.getState().carregar(); }, []);
  const temArtista = !!d.chave;
  const abrirArtista = () => { if (temArtista) irPara({ tipo: 'artista', nome: d.nome }); };
  const alternarFavorito = () => {
    if (!temArtista) return;
    useArtistasFavoritos.getState().alternar(d.chave);
    notify?.(d.favorito ? `${d.nome} removed from your favourite artists.` : `${d.nome} added to your favourite artists.`);
  };
  const imagem = d.foto ?? track.artworkUrl ?? null;
  const fas = fasDoArtista(d.fas);
  const numeros = [
    fas ? { valor: fas.replace(' fans', ''), rotulo: 'Fans' } : null,
    d.naBiblioteca > 0 ? { valor: String(d.naBiblioteca), rotulo: 'In library' } : null,
    d.jogadas > 0 ? { valor: numeroCurto(d.jogadas), rotulo: 'Your plays' } : null,
  ].filter(Boolean) as { valor: string; rotulo: string }[];
  const agora = Date.now();
  const dadosDaMusica = [
    track.album ? { rotulo: 'Album', valor: track.album } : null,
    d.ano ? { rotulo: 'Released', valor: String(d.ano) } : null,
    { rotulo: 'You played it', valor: textoDeVezes(d.vezes) },
    d.vezes > 0 ? { rotulo: 'Last played', valor: haQuanto(d.ultima, agora) } : null,
  ].filter(Boolean) as { rotulo: string; valor: string }[];

  return <View style={s.raiz} accessibilityLabel={`About ${tituloDaFaixa(track)}`}>
    {temArtista ? <>
      <View style={s.heroi}>
        {imagem ? <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as React.CSSProperties}>
          <img src={imagem} alt="" referrerPolicy="no-referrer" decoding="async" draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 22%', display: 'block' }} />
        </div> : null}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundImage: 'linear-gradient(180deg, rgba(6,6,8,0) 30%, rgba(6,6,8,0.88))' } as any]} />
        <View style={s.heroiBaixo}>
          <Text numberOfLines={2} style={s.nome}>{d.nome}</Text>
          <Text style={s.etiqueta}>ARTIST</Text>
        </View>
      </View>

      {numeros.length ? <View style={s.numeros}>
        {numeros.map((n, i) => <View key={n.rotulo} style={[s.numero, i > 0 && s.numeroComFio]}>
          <Text style={s.numeroValor}>{n.valor}</Text>
          <Text style={s.micro}>{n.rotulo}</Text>
        </View>)}
      </View> : null}

      <View style={s.botoes}>
        <Button icon="chevron-forward" onPress={abrirArtista}>Go to artist</Button>
        <Button secondary marcado={d.favorito} icon={d.favorito ? 'star' : 'star-outline'} onPress={alternarFavorito}>{d.favorito ? 'Favourited' : 'Favourite'}</Button>
      </View>

      {d.parecidos.length ? <View style={s.bloco}>
        <Text style={s.micro}>Fans also like</Text>
        <View style={s.pilulas}>
          {d.parecidos.slice(0, 6).map((nome) => <Pressable key={nome} accessibilityRole="button" accessibilityLabel={`Open ${nome}`}
            onPress={() => irPara({ tipo: 'artista', nome })}
            style={({ hovered, focused }: any) => [s.pilula, (hovered || focused) && { backgroundColor: ESTADO.hover }]}>
            <Text numberOfLines={1} style={s.pilulaTexto}>{nome}</Text>
          </Pressable>)}
        </View>
      </View> : null}

      {d.lancamento ? <View style={s.bloco}>
        <Text style={s.micro}>Latest release</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${d.lancamento.titulo}, ${d.lancamento.tipo}. Open ${d.nome}`} onPress={abrirArtista}
          style={({ hovered }: any) => [s.lancamento, hovered && { backgroundColor: COR.hover }]}>
          {d.lancamento.capa ? <img src={d.lancamento.capa} alt="" referrerPolicy="no-referrer" decoding="async" draggable={false}
            style={{ width: 48, height: 48, borderRadius: RAIO.cartao, objectFit: 'cover', flexShrink: 0 }} /> : <View style={s.capaVazia} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={s.linhaTitulo}>{d.lancamento.titulo}</Text>
            <Text numberOfLines={1} style={s.linhaSub}>{[d.lancamento.ano, d.lancamento.tipo].filter(Boolean).join(' · ')}</Text>
          </View>
        </Pressable>
      </View> : null}
    </> : null}

    <View style={s.bloco}>
      <Text style={s.micro}>This song</Text>
      <View style={s.grelha}>
        {dadosDaMusica.map((x) => <View key={x.rotulo} style={s.celula}>
          <Text style={s.micro}>{x.rotulo}</Text>
          <Text numberOfLines={1} style={s.celulaValor}>{x.valor}</Text>
        </View>)}
      </View>
      {d.refraoS != null ? <View style={s.refrao}>
        <Text style={s.linhaSub}>The chorus starts at {relogio(d.refraoS)}</Text>
        <Button secondary icon="play" onPress={() => { void usePlayer.getState().seekTo(d.refraoS! * 1000); }}>Play from the chorus</Button>
      </View> : null}
    </View>

    {d.maisOuvidas.length ? <View style={s.bloco}>
      <Text style={s.micro}>Your most played of theirs</Text>
      {d.maisOuvidas.map(({ faixa, vezes }) => <Pressable key={`${faixa.source}:${faixa.sourceId}`} accessibilityRole="button"
        accessibilityLabel={`Play ${tituloDaFaixa(faixa)}`}
        onPress={() => { void usePlayer.getState().tocarMusica(faixa, [faixa], false, undefined, null); }}
        {...({ onContextMenu: (e: any) => { if (!more) return; e.preventDefault(); more(faixa); } } as any)}
        style={({ hovered }: any) => [s.linha, hovered && { backgroundColor: COR.hover }]}>
        <Artwork track={faixa} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={s.linhaTitulo}>{tituloDaFaixa(faixa)}</Text>
          <Text numberOfLines={1} style={s.linhaSub}>{displayArtist(faixa)}</Text>
        </View>
        <Text style={s.numeroMono}>{vezes === 1 ? '1 play' : `${numeroCurto(vezes)} plays`}</Text>
      </Pressable>)}
    </View> : null}
  </View>;
}

const s = StyleSheet.create({
  raiz: { paddingHorizontal: ESP.md, paddingBottom: ESP.xl, gap: ESP.lg },
  heroi: { height: 168, borderRadius: RAIO.superficie, overflow: 'hidden', backgroundColor: COR.elevado, justifyContent: 'flex-end' },
  heroiBaixo: { padding: ESP.lg, gap: ESP.xs, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  nome: { ...TIPO.titulo, color: COR.texto, flex: 1, minWidth: 0 },
  etiqueta: { ...TIPO.micro, color: COR.texto, backgroundColor: 'rgba(233,234,238,0.16)', paddingHorizontal: ESP.sm, paddingVertical: ESP.xs, borderRadius: RAIO.pilula, overflow: 'hidden' },
  numeros: { flexDirection: 'row' },
  numero: { flex: 1, paddingLeft: ESP.md, gap: 2 },
  numeroComFio: { borderLeftWidth: 1, borderLeftColor: COR.linhaSuave },
  numeroValor: { ...TIPO.seccao, color: COR.texto },
  micro: { ...TIPO.micro, color: COR.textoFraco },
  botoes: { flexDirection: 'row', gap: ESP.sm, flexWrap: 'wrap' },
  bloco: { gap: ESP.sm },
  pilulas: { flexDirection: 'row', flexWrap: 'wrap', gap: ESP.sm },
  pilula: { height: 32, maxWidth: '100%', paddingHorizontal: ESP.md, borderRadius: RAIO.pilula, borderWidth: 1, borderColor: COR.linha, justifyContent: 'center' },
  pilulaTexto: { fontFamily: FONT.body, fontSize: 12, fontWeight: '600', color: COR.texto },
  lancamento: { flexDirection: 'row', alignItems: 'center', gap: ESP.md, padding: ESP.sm, borderRadius: RAIO.superficie, backgroundColor: COR.elevado },
  capaVazia: { width: 48, height: 48, borderRadius: RAIO.cartao, backgroundColor: COR.hover },
  linhaTitulo: { ...TIPO.corpo, color: COR.texto, fontWeight: '600' as any },
  linhaSub: { ...TIPO.legenda, color: COR.textoFraco },
  grelha: { flexDirection: 'row', flexWrap: 'wrap', gap: 1, borderRadius: RAIO.superficie, overflow: 'hidden', backgroundColor: COR.linhaSuave },
  celula: { flexGrow: 1, flexBasis: '48%', minWidth: 120, padding: ESP.md, gap: ESP.xs, backgroundColor: COR.painel },
  celulaValor: { ...TIPO.corpo, color: COR.texto, fontWeight: '600' as any },
  refrao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: ESP.sm, padding: ESP.md, borderRadius: RAIO.superficie, backgroundColor: COR.elevado },
  linha: { flexDirection: 'row', alignItems: 'center', gap: ESP.md, padding: ESP.sm, borderRadius: RAIO.cartao },
  numeroMono: { ...TIPO.numero, color: COR.textoFraco },
});
