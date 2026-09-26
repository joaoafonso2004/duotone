import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { useBoasVindas } from '../state/boasVindas';
import { usePassosDasBoasVindas } from '../state/passosDasBoasVindas';
import { COR, ESP, FONT } from './tokens.web';
import { Artwork, Button, Field } from './ui.web';

/**
 * O questionário da primeira vez, no PC (26/9): um cartão por cima da app. A
 * lógica é a mesma do iPhone (state/passosDasBoasVindas.ts).
 */
export function BoasVindasPc() {
  const { aberto, fechar } = useBoasVindas();
  if (!aberto) return null;
  return <Conteudo aoFechar={fechar} />;
}

export function Conteudo({ aoFechar }: { aoFechar: () => void }) {
  const p = usePassosDasBoasVindas(aoFechar);
  const [link, setLink] = useState('');
  const colar = () => { if (p.colar(link)) setLink(''); };

  let corpo: React.ReactNode = null;
  if (p.passo === 'fonte') {
    corpo = (
      <>
        <Text style={s.titulo}>Where did you listen before?</Text>
        <Text style={s.sub}>Bring your playlists with you. It takes a minute.</Text>
        <View style={{ gap: 10 }}>
          {([
            ['spotify', 'Spotify', 'Paste a playlist link', '#1DB954', 'musical-notes'],
            ['youtube', 'YouTube or YouTube Music', 'Paste a playlist link', '#FF3B30', 'logo-youtube'],
            ['nada', "I'm starting fresh", 'Pick a few artists and songs instead', COR.elevado, 'add'],
          ] as const).map(([id, nome, dica, cor, icone]) => (
            <Pressable key={id} onPress={() => p.escolherFonte(id)}
              style={({ hovered }: any) => [s.fonte, hovered && { backgroundColor: COR.hover }]}>
              <View style={[s.logo, { backgroundColor: cor }]}><Ionicons name={icone} size={16} color={COR.texto} /></View>
              <View style={{ flex: 1 }}><Text style={s.fonteNome}>{nome}</Text><Text style={s.fonteDica}>{dica}</Text></View>
              <Ionicons name="chevron-forward" size={16} color={COR.textoFraco} />
            </Pressable>
          ))}
        </View>
      </>
    );
  } else if (p.passo === 'colar') {
    const spotify = p.fonte === 'spotify';
    corpo = (
      <>
        <Text style={s.titulo}>{`Paste your ${spotify ? 'Spotify' : 'YouTube'} playlists`}</Text>
        <Text style={s.sub}>One link at a time. Add as many as you want.</Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Field icon="link-outline" placeholder={spotify ? 'open.spotify.com/playlist/…' : 'youtube.com/playlist?list=…'} value={link} onChangeText={setLink} onSubmitEditing={colar} />
          </View>
          <Button secondary onPress={colar} disabled={!link.trim()}>Add</Button>
        </View>
        {p.erroDoLink ? <Text style={s.erro}>{p.erroDoLink}</Text> : null}
        {p.links.map((id) => (
          <View key={id} style={s.achada}>
            <Ionicons name="checkmark-circle" size={16} color={COR.ok} />
            <Text style={s.achadaTexto}>Added. It will come in in the background.</Text>
          </View>
        ))}
        {spotify ? <Text style={s.dica}>Up to 100 songs per playlist, public playlists only. Your Liked Songs are private in Spotify: select them all (Ctrl+A), add them to a new playlist, and paste that link.</Text> : null}
      </>
    );
  } else if (p.passo === 'artistas') {
    const lista = p.resultadosA ?? p.sugeridos;
    corpo = (
      <>
        <Text style={s.titulo}>{`Pick ${p.PEDIDOS} artists you love`}</Text>
        <Text style={s.sub}>Your recommendations start from them.</Text>
        <Field icon="search" placeholder="Search artists" value={p.procuraA} onChangeText={p.setProcuraA} />
        <View style={s.grelha}>
          {lista.map((a) => {
            const sel = p.artistas.some((x) => x.nome === a.nome);
            return (
              <Pressable key={a.nome} onPress={() => p.alternarArtista(a)} style={s.artista} accessibilityRole="checkbox" accessibilityState={{ checked: sel }}>
                <View style={[s.cara, sel && { borderColor: COR.texto }]}>
                  {a.capa ? <Image source={{ uri: a.capa }} style={s.caraImg} /> : <Ionicons name="person" size={28} color={COR.textoFraco} />}
                  {sel ? <View style={s.visto}><Ionicons name="checkmark" size={13} color={COR.fundo} /></View> : null}
                </View>
                <Text numberOfLines={1} style={s.artistaNome}>{a.nome}</Text>
              </Pressable>
            );
          })}
          {!lista.length && p.aCarregarArtistas ? <ActivityIndicator color={COR.texto} style={{ margin: 24 }} /> : null}
        </View>
      </>
    );
  } else if (p.passo === 'musicas') {
    const lista = p.resultadosM ?? p.musicasSugeridas;
    corpo = (
      <>
        <Text style={s.titulo}>{`And ${p.PEDIDOS} songs`}</Text>
        <Text style={s.sub}>They go straight to your Liked Songs.</Text>
        <Field icon="search" placeholder="Search songs" value={p.procuraM} onChangeText={p.setProcuraM} />
        {p.aCarregar && !lista.length ? <ActivityIndicator color={COR.texto} style={{ margin: 24 }} /> : null}
        <View>
          {lista.map((t) => {
            const sel = p.musicas.some((x) => x.sourceId === t.sourceId);
            return (
              <Pressable key={t.sourceId} onPress={() => p.alternarMusica(t)} accessibilityRole="checkbox" accessibilityState={{ checked: sel }}
                style={({ hovered }: any) => [s.musica, hovered && { backgroundColor: COR.hover }]}>
                <Artwork track={t} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={s.musicaTitulo}>{tituloDaFaixa(t)}</Text>
                  <Text numberOfLines={1} style={s.musicaArtista}>{displayArtist(t)}</Text>
                </View>
                <View style={[s.caixa, sel && { backgroundColor: COR.texto, borderColor: COR.texto }]}>
                  {sel ? <Ionicons name="checkmark" size={13} color={COR.fundo} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </>
    );
  } else {
    corpo = (
      <View style={{ alignItems: 'center', paddingVertical: 48 }}>
        <Text style={[s.titulo, { textAlign: 'center' }]}>You're all set</Text>
        <Text style={[s.sub, { textAlign: 'center' }]}>
          {p.links.length ? "Your playlists are coming in. You'll see them on the left while they do." : 'Your Daily mix and recommendations are being made from your picks.'}
        </Text>
      </View>
    );
  }

  const conta = p.passo === 'artistas' ? p.artistas.length : p.passo === 'musicas' ? p.musicas.length : 0;
  const acao =
    p.passo === 'colar' ? <Button onPress={p.acabarImportacao} disabled={!p.links.length}>Import and continue</Button>
    : p.passo === 'artistas' ? <Button onPress={p.seguirParaMusicas} disabled={!p.podeSeguirArtistas}>Next</Button>
    : p.passo === 'musicas' ? <Button onPress={() => void p.terminar()} disabled={!p.podeTerminar || p.aGuardar}>{p.aGuardar ? 'Saving…' : 'Done'}</Button>
    : p.passo === 'fim' ? <Button onPress={p.fechar}>Start listening</Button>
    : null;

  return (
    <View style={s.fundo}>
      <View style={s.cartao}>
        <View style={s.topo}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[0, 1, 2].map((i) => <View key={i} style={[s.passo, i <= p.etapa && { backgroundColor: COR.texto }]} />)}
          </View>
          {p.passo !== 'fim' ? (
            <Pressable onPress={p.saltar} style={({ hovered }: any) => [s.saltar, hovered && { backgroundColor: COR.hover }]}>
              <Text style={s.saltarTexto}>Skip</Text>
            </Pressable>
          ) : null}
        </View>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>{corpo}</ScrollView>
        {acao ? (
          <View style={s.rodape}>
            <Text style={s.conta}>{conta ? `${Math.min(conta, p.PEDIDOS)} of ${p.PEDIDOS}` : ''}</Text>
            {acao}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fundo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, backgroundColor: 'rgba(6,6,8,0.78)', alignItems: 'center', justifyContent: 'center', padding: ESP.xl },
  cartao: { width: '100%', maxWidth: 680, maxHeight: '100%', backgroundColor: COR.painel, borderWidth: 1, borderColor: COR.linha, borderRadius: 18, padding: 28, gap: 16 },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  passo: { width: 22, height: 4, borderRadius: 2, backgroundColor: 'rgba(233,234,238,0.15)' },
  saltar: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  saltarTexto: { fontFamily: FONT.body, fontSize: 13, fontWeight: '600', color: COR.textoMedio },
  titulo: { fontFamily: FONT.display, fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: COR.texto },
  sub: { fontFamily: FONT.body, fontSize: 14, color: COR.textoMedio, marginBottom: 4 },
  fonte: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 64, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: COR.linha, cursor: 'pointer' } as any,
  logo: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  fonteNome: { fontFamily: FONT.body, fontSize: 15, fontWeight: '600', color: COR.texto },
  fonteDica: { fontFamily: FONT.body, fontSize: 12, color: COR.textoMedio, marginTop: 2 },
  erro: { fontFamily: FONT.body, fontSize: 13, color: COR.erro },
  achada: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: COR.linha },
  achadaTexto: { fontFamily: FONT.body, fontSize: 13, color: COR.texto },
  dica: { fontFamily: FONT.body, fontSize: 12.5, lineHeight: 19, color: COR.textoFraco },
  grelha: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 },
  artista: { width: 104, alignItems: 'center', gap: 7, cursor: 'pointer' } as any,
  cara: { width: 92, height: 92, borderRadius: 46, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', backgroundColor: COR.elevado },
  caraImg: { width: 84, height: 84, borderRadius: 42 },
  visto: { position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: COR.texto, alignItems: 'center', justifyContent: 'center' },
  artistaNome: { fontFamily: FONT.body, fontSize: 12, fontWeight: '600', color: COR.texto, maxWidth: 104 },
  musica: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 54, paddingHorizontal: 10, borderRadius: 8, cursor: 'pointer' } as any,
  musicaTitulo: { fontFamily: FONT.body, fontSize: 14, fontWeight: '600', color: COR.texto },
  musicaArtista: { fontFamily: FONT.body, fontSize: 12, color: COR.textoMedio, marginTop: 2 },
  caixa: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: COR.textoFraco, alignItems: 'center', justifyContent: 'center' },
  rodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  conta: { fontFamily: FONT.body, fontSize: 13, color: COR.textoMedio },
});
