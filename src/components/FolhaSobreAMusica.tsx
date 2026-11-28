import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useSobreAMusica } from '../hooks/useSobreAMusica';
import { andamentoDaFaixa, periodoDaBatida, textoDaTonalidade } from '../lib/andamentoDaFaixa';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { avisarFeito } from '../lib/avisoDeRemocao';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { hapticSelection } from '../lib/haptics';
import { fasDoArtista } from '../lib/musicasDoArtista';
import { camelot, type Tom } from '../lib/ritmo';
import { ouvirRitmos, ritmoGuardado, versaoDosRitmos } from '../lib/ritmoGuardado';
import { haQuanto, numeroCurto, relogio, textoDeVezes } from '../lib/sobreAMusica';
import { irParaNoIphone } from '../navigation/RootNavigator';
import { useArtistasFavoritos } from '../state/artistasFavoritos';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, spacing, type } from '../theme';
import type { Track } from '../types';
import { BottomSheet, BottomSheetScrollView } from './BottomSheet';

/**
 * O About de uma música no iPhone (26/11, item 22 do plano, `#m22` da maquete): abre
 * pelas reticências (o "About this song" do menu de uma música, no leitor e nas
 * listas).
 *
 * Desde 28/11 com tudo o que o PC mostra (`desktop/SobreAMusica.web.tsx`, o João:
 * "tem muitas menos informações que no PC"), do MESMO hook (`useSobreAMusica`): a
 * música (o álbum, o ano, quantas vezes a ouviste, o refrão), o artista (a foto, os
 * fãs, ir à página dele, a estrela dos favoritos), "You and …" (as escutas dele e
 * as músicas dele na biblioteca), o último lançamento, as tuas mais ouvidas dele e
 * os parecidos. Fica o que só o iPhone tinha: o andamento e a tonalidade que o
 * AutoMix mediu. A música primeiro, porque é o "About this song" dela.
 *
 * **Quanto custa**: o que o hook diz (memória e disco; no pior caso uma leitura do
 * `yt_cache` por artista novo e por aparelho, a mesma da página do artista). Só
 * corre com a folha aberta: ela vive montada no leitor e no menu das listas, e o
 * hook a seguir a cada música era trabalho por nada. O que não se sabe não aparece.
 */
export function FolhaSobreAMusica({ visible, track, onClose }: { visible: boolean; track: Track | null; onClose: () => void }) {
  // Montado enquanto aberta e até acabar de sair (o `Modal` desvanece-se com o
  // conteúdo dentro), com a música que se abriu: o menu das listas põe-na a null.
  const [montado, setMontado] = useState(visible);
  useEffect(() => {
    if (visible) { setMontado(true); return undefined; }
    const t = setTimeout(() => setMontado(false), 450);
    return () => clearTimeout(t);
  }, [visible]);
  const aberta = useRef<Track | null>(track);
  if (visible && track) aberta.current = track;
  const faixa = visible ? track : aberta.current;
  const { height } = useWindowDimensions();
  return (
    <BottomSheet visible={visible} onClose={onClose} titulo="About this song">
      {montado && faixa ? (
        <BottomSheetScrollView style={{ maxHeight: height * 0.72 }} showsVerticalScrollIndicator={false}>
          <Conteudo track={faixa} ativo={visible} onClose={onClose} />
        </BottomSheetScrollView>
      ) : null}
    </BottomSheet>
  );
}

function Conteudo({ track, ativo, onClose }: { track: Track; ativo: boolean; onClose: () => void }) {
  const d = useSobreAMusica(track);
  const cor = useTheme((s) => s.theme.color);
  const aTocarEsta = usePlayer((s) => s.current?.source === track.source && s.current?.sourceId === track.sourceId);
  useEffect(() => { void useArtistasFavoritos.getState().carregar(); }, []);
  // O que o AutoMix mediu: chega a meio se a leitura do disco acabar depois.
  const versaoDosRitmosLidos = useSyncExternalStore(ouvirRitmos, versaoDosRitmos);
  const medida = useMemo(() => andamentoDaFaixa(ritmoGuardado(track.sourceId)), [track.sourceId, versaoDosRitmosLidos]);

  const temArtista = !!d.chave;
  /** Fecha a folha (e o leitor, se estava aberto) e abre a página do artista. */
  const irAoArtista = (nome: string) => {
    hapticSelection();
    onClose();
    if (usePlayer.getState().expanded) usePlayer.getState().setExpanded(false);
    irParaNoIphone({ tipo: 'artista', nome });
  };
  const alternarFavorito = () => {
    if (!temArtista) return;
    hapticSelection();
    useArtistasFavoritos.getState().alternar(d.chave);
    avisarFeito(d.favorito ? `${d.nome} removed from your favourite artists.` : `${d.nome} added to your favourite artists.`);
  };
  const tocar = (faixa: Track) => {
    onClose();
    void usePlayer.getState().tocarMusica(faixa, [faixa], false, undefined, temArtista ? { tipo: 'artista', nome: d.nome } : null);
  };

  const linhas: { rotulo: string; valor: string; antes?: React.ReactNode; depois?: React.ReactNode }[] = [];
  if (track.album) linhas.push({ rotulo: 'Album', valor: track.album });
  if (d.ano) linhas.push({ rotulo: 'Released', valor: String(d.ano) });
  linhas.push({ rotulo: 'You played it', valor: d.vezes > 0 && d.ultima ? `${textoDeVezes(d.vezes)} · ${haQuanto(d.ultima, Date.now()).toLowerCase()}` : textoDeVezes(d.vezes) });
  // O refrão (com "Chorus on the progress bar" ligado, como no PC). Daqui só se
  // salta na música que toca: nas outras fica o sítio.
  if (d.refraoS != null) linhas.push({
    rotulo: 'Chorus', valor: relogio(d.refraoS),
    depois: aTocarEsta ? (
      <Pressable accessibilityRole="button" accessibilityLabel={`Play from the chorus, at ${relogio(d.refraoS)}`} hitSlop={8}
        onPress={() => { hapticSelection(); void usePlayer.getState().seekTo(d.refraoS! * 1000); }}
        style={({ pressed }) => [styles.daqui, pressed && { opacity: 0.5 }]}>
        <Ionicons name="play" size={12} color={cor} />
        <Text style={[styles.daquiTexto, { color: cor }]}>Play from here</Text>
      </Pressable>
    ) : undefined,
  });
  if (medida.bpm) linhas.push({ rotulo: 'Tempo', valor: `${medida.bpm} BPM`, antes: <PontoNaBatida bpm={medida.bpm} ativo={ativo} /> });
  if (medida.tom) linhas.push({ rotulo: 'Key', valor: textoDaTonalidade(medida.tom), antes: <RodaDeCamelot tom={medida.tom} /> });

  // "You and Lil Uzi Vert": o que é teu deste artista, em números grandes.
  const numeros = [
    d.jogadas > 0 ? { valor: numeroCurto(d.jogadas), rotulo: d.jogadas === 1 ? 'play of theirs' : 'plays of theirs' } : null,
    d.naBiblioteca > 0 ? { valor: String(d.naBiblioteca), rotulo: d.naBiblioteca === 1 ? 'song in your library' : 'songs in your library' } : null,
  ].filter(Boolean) as { valor: string; rotulo: string }[];
  const fas = fasDoArtista(d.fas);
  const rotuloDaEstrela = d.favorito ? 'Remove from your favourite artists' : 'Add to your favourite artists';

  return (
    <View style={styles.raiz}>
      <View style={styles.cabeca}>
        {track.artworkUrl ? <Image source={{ uri: capaParaLista(track.artworkUrl) ?? track.artworkUrl }} style={styles.capa} contentFit="cover" />
          : <View style={[styles.capa, { backgroundColor: colors.surface }]} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.titulo}>{tituloDaFaixa(track)}</Text>
          <Text numberOfLines={1} style={styles.artista}>{displayArtist(track)}</Text>
        </View>
      </View>
      {linhas.map((l, i) => (
        <View key={l.rotulo} style={[styles.linha, i === linhas.length - 1 && { borderBottomWidth: 0 }]}>
          <Text style={styles.rotulo}>{l.rotulo}</Text>
          <View style={styles.valorComPeca}>
            {l.antes ?? null}
            <Text numberOfLines={1} style={styles.valor}>{l.valor}</Text>
            {l.depois ?? null}
          </View>
        </View>
      ))}

      {temArtista ? (
        <View style={styles.bloco}>
          <Text style={styles.micro}>Artist</Text>
          <View style={styles.artistaLinha}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Go to artist, ${d.nome}`} onPress={() => irAoArtista(d.nome)}
              style={({ pressed }) => [styles.artistaToque, pressed && { opacity: 0.6 }]}>
              {d.foto ? <Image source={{ uri: d.foto }} style={styles.foto} contentFit="cover" />
                : <View style={[styles.foto, styles.fotoVazia]}><Ionicons name="person" size={22} color={colors.textTertiary} /></View>}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={styles.nome}>{d.nome}</Text>
                <Text numberOfLines={1} style={styles.sub}>{fas ? `Artist · ${fas}` : 'Artist'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={rotuloDaEstrela} accessibilityState={{ selected: d.favorito }}
              hitSlop={8} onPress={alternarFavorito} style={({ pressed }) => [styles.estrela, pressed && { opacity: 0.5 }]}>
              <Ionicons name={d.favorito ? 'star' : 'star-outline'} size={20} color={d.favorito ? cor : colors.textSecondary} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {temArtista && numeros.length ? (
        <View style={styles.bloco}>
          <Text style={styles.micro}>{`You and ${d.nome}`}</Text>
          <View style={styles.numeros}>
            {numeros.map((n, i) => (
              <View key={n.rotulo} style={[styles.numero, i > 0 && styles.numeroComFio]}>
                <Text style={styles.numeroValor}>{n.valor}</Text>
                <Text style={styles.sub}>{n.rotulo}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {temArtista && d.lancamento ? (
        <View style={styles.bloco}>
          <Text style={styles.micro}>Latest release</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${d.lancamento.titulo}, ${d.lancamento.tipo}. Open ${d.nome}`}
            onPress={() => irAoArtista(d.nome)} style={({ pressed }) => [styles.lista, pressed && { opacity: 0.6 }]}>
            {d.lancamento.capa ? <Image source={{ uri: d.lancamento.capa }} style={styles.capaDoLancamento} contentFit="cover" />
              : <View style={[styles.capaDoLancamento, { backgroundColor: colors.surface }]} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.listaTitulo}>{d.lancamento.titulo}</Text>
              <Text numberOfLines={1} style={styles.sub}>{[d.lancamento.tipo, d.lancamento.ano].filter(Boolean).join(' · ')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>
      ) : null}

      {d.maisOuvidas.length ? (
        <View style={styles.bloco}>
          <Text style={styles.micro}>Your most played of theirs</Text>
          {d.maisOuvidas.map(({ faixa, vezes }) => (
            <Pressable key={`${faixa.source}:${faixa.sourceId}`} accessibilityRole="button" accessibilityLabel={`Play ${tituloDaFaixa(faixa)}`}
              onPress={() => tocar(faixa)} style={({ pressed }) => [styles.lista, pressed && { opacity: 0.6 }]}>
              {faixa.artworkUrl ? <Image source={{ uri: capaParaLista(faixa.artworkUrl) ?? faixa.artworkUrl }} style={styles.capaPequena} contentFit="cover" />
                : <View style={[styles.capaPequena, { backgroundColor: colors.surface }]} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={styles.listaTitulo}>{tituloDaFaixa(faixa)}</Text>
                <Text numberOfLines={1} style={styles.sub}>{displayArtist(faixa)}</Text>
              </View>
              <Text style={styles.vezes}>{vezes === 1 ? '1 play' : `${numeroCurto(vezes)} plays`}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Os parecidos em texto, como no PC: nada de pílulas (o João não as quer). */}
      {temArtista && d.parecidos.length ? (
        <View style={styles.bloco}>
          <Text style={styles.micro}>Fans also like</Text>
          <View style={styles.nomes}>
            {d.parecidos.slice(0, 6).map((nome, i) => (
              <React.Fragment key={nome}>
                {i > 0 ? <Text style={styles.pontoDosNomes}>·</Text> : null}
                <Pressable accessibilityRole="link" accessibilityLabel={`Open ${nome}`} hitSlop={6} onPress={() => irAoArtista(nome)}>
                  {({ pressed }) => <Text numberOfLines={1} style={[styles.parecido, pressed && { color: colors.text }]}>{nome}</Text>}
                </Pressable>
              </React.Fragment>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * O ponto que pulsa ao andamento (a maquete: cresce a 1,5 e acende na batida, e
 * volta em 70 % dela). Só com a folha aberta e sem Reduzir movimento; a 60 Hz chega
 * (é um ponto de 9 pt), por isso sem pedir a fluidez de 120 Hz o tempo todo.
 */
function PontoNaBatida({ bpm, ativo }: { bpm: number; ativo: boolean }) {
  const cor = useTheme((s) => s.theme.color);
  const reduzido = useReducedMotion();
  const fase = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!ativo || reduzido) { fase.setValue(1); return undefined; }
    fase.setValue(0);
    const ciclo = Animated.loop(Animated.timing(fase, {
      toValue: 1, duration: periodoDaBatida(bpm), easing: Easing.linear, useNativeDriver: true,
    }));
    ciclo.start();
    return () => ciclo.stop();
  }, [ativo, reduzido, bpm, fase]);
  return (
    <Animated.View style={[styles.ponto, { backgroundColor: cor,
      opacity: fase.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.5, 0.5] }),
      transform: [{ scale: fase.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1.5, 1, 1] }) }],
    }]} />
  );
}

/** A roda de Camelot: doze pontos à volta, o da tonalidade aceso (o "8" de 8A). */
function RodaDeCamelot({ tom }: { tom: Tom }) {
  const cor = useTheme((s) => s.theme.color);
  const aceso = camelot(tom).numero - 1;
  const LADO = 26, RAIO = 11;
  return (
    <View style={{ width: LADO, height: LADO }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6, d = i === aceso ? 6 : 4;
        return <View key={i} style={{
          position: 'absolute', width: d, height: d, borderRadius: d / 2,
          left: LADO / 2 + RAIO * Math.sin(a) - d / 2, top: LADO / 2 - RAIO * Math.cos(a) - d / 2,
          backgroundColor: i === aceso ? cor : 'rgba(255,255,255,0.25)',
        }} />;
      })}
    </View>
  );
}

/** O fio das linhas, o mesmo de antes. */
const FIO = 'rgba(255,255,255,0.07)';

const styles = StyleSheet.create({
  raiz: { paddingBottom: spacing.md },
  cabeca: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  capa: { width: 52, height: 52, borderRadius: 8 },
  titulo: { ...type.body, color: colors.text, fontWeight: '700' },
  artista: { ...type.caption, color: colors.textSecondary },
  linha: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: FIO,
  },
  rotulo: { ...type.body, color: colors.textSecondary },
  valorComPeca: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  valor: { ...type.body, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  ponto: { width: 9, height: 9, borderRadius: 4.5 },
  // "Play from here": texto com o ícone, na cor do tema, sem fundo.
  daqui: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4 },
  daquiTexto: { ...type.caption, fontWeight: '600' },
  bloco: { marginTop: spacing.xl, gap: spacing.sm },
  micro: { ...type.micro },
  artistaLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  artistaToque: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  foto: { width: 52, height: 52, borderRadius: 26 },
  fotoVazia: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  nome: { ...type.headline, color: colors.text },
  sub: { ...type.caption, color: colors.textSecondary },
  estrela: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  numeros: { flexDirection: 'row' },
  numero: { paddingRight: spacing.xl },
  numeroComFio: { paddingLeft: spacing.xl, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,0.12)' },
  numeroValor: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, color: colors.text, fontVariant: ['tabular-nums'] },
  lista: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  listaTitulo: { ...type.body, color: colors.text, fontWeight: '600' },
  capaDoLancamento: { width: 48, height: 48, borderRadius: 6 },
  capaPequena: { width: 40, height: 40, borderRadius: 6 },
  vezes: { ...type.caption, color: colors.textTertiary, fontVariant: ['tabular-nums'] },
  nomes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 4 },
  pontoDosNomes: { ...type.body, color: colors.textTertiary },
  parecido: { ...type.body, color: colors.textSecondary },
});
