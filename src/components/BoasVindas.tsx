import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { hapticSelection } from '../lib/haptics';
import { useBoasVindas } from '../state/boasVindas';
import { usePassosDasBoasVindas } from '../state/passosDasBoasVindas';
import { useTheme } from '../state/theme';
import { colors } from '../theme';
import { Input } from './Input';
import { PillButton } from './PillButton';

/**
 * O questionário da primeira vez, no iPhone (26/9). A lógica é partilhada com
 * o PC (state/passosDasBoasVindas.ts); aqui só se desenha. Um ecrã inteiro,
 * com "Skip" sempre no canto.
 */
export function BoasVindas() {
  const { aberto, fechar } = useBoasVindas();
  if (!aberto) return null;
  return <Conteudo aoFechar={fechar} />;
}

function Conteudo({ aoFechar }: { aoFechar: () => void }) {
  const p = usePassosDasBoasVindas(aoFechar);
  const insets = useSafeAreaInsets();
  const acento = useTheme((s) => s.theme.color);
  const [link, setLink] = useState('');

  const topo = (
    <View style={styles.topo}>
      <View style={styles.passos}>
        {[0, 1, 2].map((i) => <View key={i} style={[styles.passo, i <= p.etapa && { backgroundColor: colors.text }]} />)}
      </View>
      {p.passo !== 'fim' ? (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={p.saltar}><Text style={styles.saltar}>Skip</Text></Pressable>
      ) : null}
    </View>
  );

  let corpo: React.ReactNode = null;
  if (p.passo === 'fonte') {
    corpo = (
      <>
        <Text style={styles.titulo}>Where did you listen before?</Text>
        <Text style={styles.sub}>Bring your playlists with you. It takes a minute.</Text>
        {([
          ['spotify', 'Spotify', 'Paste a playlist link', colors.spotify],
          ['youtube', 'YouTube or YouTube Music', 'Paste a playlist link', colors.youtube],
          ['nada', "I'm starting fresh", 'Pick a few artists and songs instead', colors.surfacePressed],
        ] as const).map(([id, nome, dica, cor]) => (
          <Pressable key={id} onPress={() => { hapticSelection(); p.escolherFonte(id); }}
            style={({ pressed }) => [styles.fonte, pressed && { opacity: 0.7 }]}>
            <View style={[styles.logo, { backgroundColor: cor }]}>
              <Ionicons name={id === 'spotify' ? 'musical-notes' : id === 'youtube' ? 'logo-youtube' : 'add'} size={16} color={id === 'nada' ? colors.text : '#fff'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fonteNome}>{nome}</Text>
              <Text style={styles.fonteDica}>{dica}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        ))}
      </>
    );
  } else if (p.passo === 'colar') {
    const spotify = p.fonte === 'spotify';
    corpo = (
      <>
        <Text style={styles.titulo}>{`Paste your ${spotify ? 'Spotify' : 'YouTube'} playlists`}</Text>
        <Text style={styles.sub}>One link at a time. Add as many as you want.</Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Input icon="link-outline" placeholder={spotify ? 'open.spotify.com/playlist/…' : 'youtube.com/playlist?list=…'}
            value={link} onChangeText={setLink} onClear={() => setLink('')} autoCapitalize="none" autoCorrect={false}
            containerStyle={{ flex: 1 }} returnKeyType="done" onSubmitEditing={() => { if (p.colar(link)) setLink(''); }} />
          <PillButton label="Add" small onPress={() => { if (p.colar(link)) setLink(''); }} disabled={!link.trim()} />
        </View>
        {p.erroDoLink ? <Text style={styles.erro}>{p.erroDoLink}</Text> : null}
        {p.links.map((id) => (
          <View key={id} style={styles.achada}>
            <Ionicons name="checkmark-circle" size={18} color={acento} />
            <Text style={styles.achadaTexto} numberOfLines={1}>Added. It will come in in the background.</Text>
          </View>
        ))}
        {spotify ? (
          <Text style={styles.dica}>Up to 100 songs per playlist, public playlists only. Your Liked Songs are private in Spotify: add them to a new playlist first and paste that link.</Text>
        ) : null}
      </>
    );
  } else if (p.passo === 'artistas') {
    const lista = p.resultadosA ?? p.sugeridos;
    corpo = (
      <>
        <Text style={styles.titulo}>{`Pick ${p.PEDIDOS} artists you love`}</Text>
        <Text style={styles.sub}>Your recommendations start from them.</Text>
        <Input icon="search" placeholder="Search artists" value={p.procuraA} onChangeText={p.setProcuraA} onClear={() => p.setProcuraA('')} autoCorrect={false} />
        <View style={styles.grelha}>
          {lista.map((a) => {
            const sel = p.artistas.some((x) => x.nome === a.nome);
            return (
              <Pressable key={a.nome} onPress={() => { hapticSelection(); p.alternarArtista(a); }} style={styles.artista}
                accessibilityRole="checkbox" accessibilityState={{ checked: sel }}>
                <View style={[styles.cara, sel && { borderColor: colors.text }]}>
                  {a.capa ? <Image source={{ uri: a.capa }} style={styles.caraImg} /> : <Ionicons name="person" size={28} color={colors.textTertiary} />}
                  {sel ? <View style={styles.visto}><Ionicons name="checkmark" size={14} color={colors.bg} /></View> : null}
                </View>
                <Text style={styles.artistaNome} numberOfLines={1}>{a.nome}</Text>
              </Pressable>
            );
          })}
          {!lista.length && p.aCarregarArtistas ? <ActivityIndicator color={acento} style={{ marginTop: 24, width: '100%' }} /> : null}
        </View>
      </>
    );
  } else if (p.passo === 'musicas') {
    const lista = p.resultadosM ?? p.musicasSugeridas;
    corpo = (
      <>
        <Text style={styles.titulo}>{`And ${p.PEDIDOS} songs`}</Text>
        <Text style={styles.sub}>They go straight to your Liked Songs.</Text>
        <Input icon="search" placeholder="Search songs" value={p.procuraM} onChangeText={p.setProcuraM} onClear={() => p.setProcuraM('')} autoCorrect={false} />
        {p.aCarregar && !lista.length ? <ActivityIndicator color={acento} style={{ marginTop: 24 }} /> : null}
        {lista.map((t) => {
          const sel = p.musicas.some((x) => x.sourceId === t.sourceId);
          return (
            <Pressable key={t.sourceId} onPress={() => { hapticSelection(); p.alternarMusica(t); }} style={styles.musica}
              accessibilityRole="checkbox" accessibilityState={{ checked: sel }}>
              <Image source={{ uri: capaParaLista(t.artworkUrl ?? `https://i.ytimg.com/vi/${t.sourceId}/mqdefault.jpg`) ?? undefined }} style={styles.capa} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.musicaTitulo} numberOfLines={1}>{tituloDaFaixa(t)}</Text>
                <Text style={styles.musicaArtista} numberOfLines={1}>{displayArtist(t)}</Text>
              </View>
              <View style={[styles.caixa, sel && { backgroundColor: colors.text, borderColor: colors.text }]}>
                {sel ? <Ionicons name="checkmark" size={14} color={colors.bg} /> : null}
              </View>
            </Pressable>
          );
        })}
      </>
    );
  } else {
    corpo = (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 }}>
        <Text style={[styles.titulo, { textAlign: 'center' }]}>You're all set</Text>
        <Text style={[styles.sub, { textAlign: 'center' }]}>
          {p.links.length ? "Your playlists are coming in. We'll let you know when they're done." : 'Your Daily mix and recommendations are being made from your picks.'}
        </Text>
      </View>
    );
  }

  const conta = p.passo === 'artistas' ? p.artistas.length : p.passo === 'musicas' ? p.musicas.length : 0;
  const rodape =
    p.passo === 'colar' ? <PillButton label="Import and continue" onPress={p.acabarImportacao} disabled={!p.links.length} />
    : p.passo === 'artistas' ? <PillButton label="Next" onPress={p.seguirParaMusicas} disabled={!p.podeSeguirArtistas} />
    : p.passo === 'musicas' ? <PillButton label="Done" onPress={() => void p.terminar()} loading={p.aGuardar} disabled={!p.podeTerminar} />
    : p.passo === 'fim' ? <PillButton label="Start listening" onPress={p.fechar} />
    : null;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={p.saltar}>
      <KeyboardAvoidingView behavior="padding" style={[styles.ecra, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        {topo}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
          {corpo}
        </ScrollView>
        {rodape ? (
          <View style={styles.rodape}>
            {conta ? <Text style={styles.conta}>{`${Math.min(conta, p.PEDIDOS)} of ${p.PEDIDOS}`}</Text> : null}
            {rodape}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ecra: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, minHeight: 28 },
  passos: { flexDirection: 'row', gap: 6 },
  passo: { width: 22, height: 4, borderRadius: 2, backgroundColor: colors.surfacePressed },
  saltar: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  titulo: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  sub: { color: colors.textSecondary, fontSize: 15, marginBottom: 8 },
  fonte: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  logo: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  fonteNome: { color: colors.text, fontSize: 16, fontWeight: '700' },
  fonteDica: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  erro: { color: colors.danger, fontSize: 13 },
  achada: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  achadaTexto: { flex: 1, color: colors.text, fontSize: 14 },
  dica: { color: colors.textTertiary, fontSize: 13, lineHeight: 19 },
  grelha: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16, marginTop: 8 },
  artista: { width: '31%', alignItems: 'center', gap: 8 },
  cara: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  caraImg: { width: 80, height: 80, borderRadius: 40 },
  visto: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  artistaNome: { color: colors.text, fontSize: 13, fontWeight: '600', maxWidth: '100%' },
  musica: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58 },
  capa: { width: 44, height: 44, borderRadius: 6, backgroundColor: colors.surface },
  musicaTitulo: { color: colors.text, fontSize: 15, fontWeight: '600' },
  musicaArtista: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  caixa: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.textTertiary, alignItems: 'center', justifyContent: 'center' },
  rodape: { gap: 8, paddingTop: 8 },
  conta: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
});
