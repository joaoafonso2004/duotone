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
import type { OrigemDaFila } from '../lib/origemDaFila';
import { COR, ESP, ESTADO, FONT, RAIO, TIPO } from './tokens.web';
import { Artwork, Button, comDica, marcar } from './ui.web';

/**
 * A aba "About" (31/10, maquete `docs/now-playing-maquete.html`): o artista e a música que
 * toca, no cartão do Now Playing e na barra da direita. Só mostra o que se sabe: sem bio
 * (nenhuma das nossas fontes a tem), sem créditos (o YouTube não os dá), e sem um bloco se o
 * dado não existe. O que vem de onde e quanto custa: `hooks/useSobreAMusica.ts`.
 *
 * Desde 25/11 é a proposta A da maquete do cartão ("pouco profissional", o João): à
 * esquerda o artista (a foto, o nome, os fãs, Go to artist e a estrela, e os parecidos em
 * texto), à direita os números grandes, a música em linhas com fios, o último lançamento e
 * as mais ouvidas. Eram caixas de feitios diferentes umas por cima das outras, com
 * pílulas no "ARTIST" e nos parecidos. As duas colunas só no cartão largo: a casca decide
 * pela largura do próprio About (`sobre`, uma container query), sem esperar por medir.
 */
export function SobreAMusica({ track, more, notify }: { track: Track; more?: (t: Track, contexto?: undefined, origem?: { de?: OrigemDaFila }) => void; notify?: (s: string) => void }) {
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
  // "You and GUNNR": o que é teu deste artista, em números grandes.
  const numeros = [
    d.jogadas > 0 ? { valor: numeroCurto(d.jogadas), rotulo: d.jogadas === 1 ? 'play of theirs' : 'plays of theirs' } : null,
    d.naBiblioteca > 0 ? { valor: String(d.naBiblioteca), rotulo: d.naBiblioteca === 1 ? 'song in your library' : 'songs in your library' } : null,
  ].filter(Boolean) as { valor: string; rotulo: string }[];
  const agora = Date.now();
  const dadosDaMusica = [
    track.album ? { rotulo: 'Album', valor: track.album } : null,
    d.ano ? { rotulo: 'Released', valor: String(d.ano) } : null,
    { rotulo: 'You played it', valor: d.vezes > 0 && d.ultima ? `${textoDeVezes(d.vezes)} · ${haQuanto(d.ultima, agora).toLowerCase()}` : textoDeVezes(d.vezes) },
  ].filter(Boolean) as { rotulo: string; valor: string }[];
  const rotuloDaEstrela = d.favorito ? 'Remove from your favourite artists' : 'Add to your favourite artists';

  return <View {...marcar('sobre')} style={s.raiz} accessibilityLabel={`About ${tituloDaFaixa(track)}`}>
    <View {...marcar('sobre-colunas')} style={s.colunas}>
      {temArtista ? <View {...marcar('sobre-artista')} style={s.artista}>
        <View {...marcar('sobre-retrato')} style={s.retrato}>
          {imagem ? <img src={imagem} alt="" referrerPolicy="no-referrer" decoding="async" draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 22%', display: 'block' }} /> : null}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundImage: 'linear-gradient(180deg, rgba(6,6,8,0) 55%, rgba(6,6,8,0.5))' } as any]} />
        </View>
        <Text {...marcar('sobre-nome')} numberOfLines={2} style={s.nome}>{d.nome}</Text>
        <Text style={[s.micro, { marginTop: ESP.sm }]}>{fas ? `Artist · ${fas}` : 'Artist'}</Text>
        <View style={s.botoes}>
          <Button icon="arrow-forward" onPress={abrirArtista}>Go to artist</Button>
          <Pressable {...comDica(rotuloDaEstrela, undefined, 'premir')} accessibilityRole="button" accessibilityLabel={rotuloDaEstrela}
            accessibilityState={{ selected: d.favorito }} onPress={alternarFavorito}
            style={({ hovered, focused }: any) => [s.estrela, (hovered || focused) && { backgroundColor: ESTADO.hover }]}>
            <Ionicons name={d.favorito ? 'star' : 'star-outline'} size={16} color={COR.texto} />
          </Pressable>
        </View>

        {/* Os parecidos em texto (25/11): eram pílulas, e o João não as quer como seletores. */}
        {d.parecidos.length ? <View style={s.parecidos}>
          <Text style={s.micro}>Fans also like</Text>
          <View style={s.nomes}>
            {d.parecidos.slice(0, 6).map((nome, i) => <React.Fragment key={nome}>
              {i > 0 ? <Text style={s.ponto}>·</Text> : null}
              <Pressable accessibilityRole="link" accessibilityLabel={`Open ${nome}`} onPress={() => irPara({ tipo: 'artista', nome })}>
                {({ hovered, focused }: any) => <Text numberOfLines={1} style={[s.parecido, (hovered || focused) && s.parecidoAceso]}>{nome}</Text>}
              </Pressable>
            </React.Fragment>)}
          </View>
        </View> : null}
      </View> : null}

      <View style={s.dados}>
        {temArtista && numeros.length ? <View style={s.bloco}>
          <Text style={s.micro}>{`You and ${d.nome}`}</Text>
          <View style={s.numeros}>
            {numeros.map((n, i) => <View key={n.rotulo} style={[s.numero, i > 0 && s.numeroComFio]}>
              <Text style={s.numeroValor}>{n.valor}</Text>
              <Text style={s.numeroRotulo}>{n.rotulo}</Text>
            </View>)}
          </View>
        </View> : null}

        <View style={s.bloco}>
          <Text style={s.micro}>This song</Text>
          <View style={s.ficha}>
            {dadosDaMusica.map((x) => <View key={x.rotulo} style={s.fichaLinha}>
              <Text style={s.fichaRotulo}>{x.rotulo}</Text>
              <Text numberOfLines={1} style={s.fichaValor}>{x.valor}</Text>
            </View>)}
            {d.refraoS != null ? <View style={[s.fichaLinha, s.refrao]}>
              <Text style={s.fichaRotulo}>Chorus</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm, flex: 1, minWidth: 0 }}>
                <Text style={s.numeroMono}>{relogio(d.refraoS)}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Play from the chorus, at ${relogio(d.refraoS)}`}
                  onPress={() => { void usePlayer.getState().seekTo(d.refraoS! * 1000); }}
                  style={({ hovered, focused }: any) => [s.daqui, (hovered || focused) && { backgroundColor: ESTADO.hover }]}>
                  <Ionicons name="play" size={12} color={COR.texto} />
                  <Text style={s.daquiTexto}>Play from here</Text>
                </Pressable>
              </View>
            </View> : null}
          </View>
        </View>

        {temArtista && d.lancamento ? <View style={s.bloco}>
          <Text style={s.micro}>Latest release</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${d.lancamento.titulo}, ${d.lancamento.tipo}. Open ${d.nome}`} onPress={abrirArtista}
            style={({ hovered }: any) => [s.linha, hovered && { backgroundColor: ESTADO.hover }]}>
            {d.lancamento.capa ? <img src={d.lancamento.capa} alt="" referrerPolicy="no-referrer" decoding="async" draggable={false}
              style={{ width: 56, height: 56, borderRadius: RAIO.cartao, objectFit: 'cover', flexShrink: 0 }} /> : <View style={s.capaVazia} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={s.linhaTitulo}>{d.lancamento.titulo}</Text>
              <Text numberOfLines={1} style={s.linhaSub}>{[d.lancamento.tipo, d.lancamento.ano].filter(Boolean).join(' · ')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COR.textoFraco} />
          </Pressable>
        </View> : null}

        {d.maisOuvidas.length ? <View style={s.bloco}>
          <Text style={s.micro}>Your most played of theirs</Text>
          {d.maisOuvidas.map(({ faixa, vezes }) => <Pressable key={`${faixa.source}:${faixa.sourceId}`} accessibilityRole="button"
            accessibilityLabel={`Play ${tituloDaFaixa(faixa)}`}
            onPress={() => { void usePlayer.getState().tocarMusica(faixa, [faixa], false, undefined, temArtista ? { tipo: 'artista', nome: d.nome } : null); }}
            {...({ onContextMenu: (e: any) => { if (!more) return; e.preventDefault(); more(faixa, undefined, temArtista ? { de: { tipo: 'artista', nome: d.nome } } : undefined); } } as any)}
            style={({ hovered }: any) => [s.linha, hovered && { backgroundColor: ESTADO.hover }]}>
            <Artwork track={faixa} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={s.linhaTitulo}>{tituloDaFaixa(faixa)}</Text>
              <Text numberOfLines={1} style={s.linhaSub}>{displayArtist(faixa)}</Text>
            </View>
            <Text style={s.numeroMono}>{vezes === 1 ? '1 play' : `${numeroCurto(vezes)} plays`}</Text>
          </Pressable>)}
        </View> : null}
      </View>
    </View>
  </View>;
}

/** Um fio: as linhas da ficha e o que separa os números. */
const FIO = 'rgba(233,234,238,0.055)';

const s = StyleSheet.create({
  raiz: { paddingHorizontal: ESP.md, paddingTop: ESP.sm, paddingBottom: ESP.xl },
  // Uma coluna; no cartão largo, duas (a casca, `sobre-colunas`).
  colunas: { flexDirection: 'column', gap: ESP.xl },
  artista: { minWidth: 0 },
  retrato: { width: '100%', height: 190, borderRadius: RAIO.superficie, overflow: 'hidden', backgroundColor: COR.elevado, position: 'relative' },
  nome: { fontFamily: FONT.display, fontSize: 26, fontWeight: '700', letterSpacing: -0.5, lineHeight: 30, color: COR.texto, marginTop: ESP.lg },
  micro: { ...TIPO.micro, color: COR.textoFraco },
  botoes: { flexDirection: 'row', alignItems: 'center', gap: ESP.sm, marginTop: ESP.lg },
  estrela: { width: 36, height: 36, borderRadius: RAIO.cartao, borderWidth: 1, borderColor: COR.linha, alignItems: 'center', justifyContent: 'center' },
  parecidos: { marginTop: ESP.xl, gap: ESP.sm },
  nomes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2 },
  ponto: { ...TIPO.corpo, fontSize: 13, color: COR.textoFraco },
  parecido: { ...TIPO.corpo, fontSize: 13, lineHeight: 22, color: COR.textoMedio },
  parecidoAceso: { color: COR.texto, textDecorationLine: 'underline' },
  dados: { flex: 1, minWidth: 0, gap: ESP.xxl },
  bloco: { gap: ESP.sm },
  numeros: { flexDirection: 'row', marginTop: ESP.xs },
  numero: { paddingRight: ESP.xxl },
  numeroComFio: { paddingLeft: ESP.xxl, borderLeftWidth: 1, borderLeftColor: 'rgba(233,234,238,0.07)' },
  numeroValor: { fontFamily: FONT.display, fontSize: 40, fontWeight: '600', letterSpacing: -1, lineHeight: 40, color: COR.texto },
  numeroRotulo: { ...TIPO.legenda, color: COR.textoMedio, marginTop: ESP.sm },
  // "This song": linhas com um fio, o nome à esquerda e o valor à direita dele.
  ficha: { borderBottomWidth: 1, borderBottomColor: FIO },
  fichaLinha: { flexDirection: 'row', alignItems: 'center', gap: ESP.lg, minHeight: 42, borderTopWidth: 1, borderTopColor: FIO },
  fichaRotulo: { ...TIPO.corpo, fontSize: 13, color: COR.textoFraco, width: 120, flexShrink: 0 },
  fichaValor: { ...TIPO.corpo, fontSize: 13, fontWeight: '600' as any, color: COR.texto, flex: 1, minWidth: 0 },
  refrao: { minHeight: 46 },
  daqui: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: ESP.sm, paddingVertical: 6, borderRadius: RAIO.cartao },
  daquiTexto: { ...TIPO.corpo, fontSize: 13, fontWeight: '600' as any, color: COR.texto },
  capaVazia: { width: 56, height: 56, borderRadius: RAIO.cartao, backgroundColor: COR.hover },
  linhaTitulo: { ...TIPO.corpo, color: COR.texto, fontWeight: '600' as any },
  linhaSub: { ...TIPO.legenda, color: COR.textoFraco, marginTop: 2 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: ESP.md, padding: ESP.sm, marginHorizontal: -ESP.sm, borderRadius: RAIO.cartao },
  numeroMono: { ...TIPO.numero, color: COR.textoFraco },
});
