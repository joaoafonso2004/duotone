import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { lerEscolhasDoDia, type EscolhaDoDia } from '../api/escolhaDoDia';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { ESCALA } from '../lib/movimento';
import { usePlayer } from '../state/player';
import { useSocial } from '../state/social';
import { colors, radii, spacing, type } from '../theme';
import { FriendAvatar } from './FriendAvatar';
import { Toque } from './Toque';

const LARGURA = 132;

/**
 * Uma música por dia — a tua e a dos teus amigos.
 *
 * ## A escassez é a funcionalidade
 *
 * Uma por dia obriga a escolher, e é por isso que se leem todas. Vinte por dia
 * é um feed, e um feed lê-se na diagonal.
 *
 * ## E NÃO é uma obrigação
 *
 * Não há sequências, não há lembretes, não há dias falhados. Quem não põe não
 * aparece na lista e mais nada acontece — **nem um espaço vazio com o nome
 * dele**, que é a forma educada de uma app dizer "falhaste".
 *
 * A única coisa que se mostra a quem ainda não escolheu é um convite, e só
 * quando há uma música a tocar para escolher. Sem música, nem isso: um botão
 * que não se pode carregar é pior do que botão nenhum.
 *
 * ## Some-se quando não há nada
 *
 * Como a fila de amigos a ouvir, esta secção não existe num dia vazio — nem
 * título, nem espaço. Uma linha a dizer "ninguém escolheu hoje" ocupa o topo
 * da página com uma ausência.
 */
export function EscolhasDoDia() {
  const [escolhas, setEscolhas] = React.useState<EscolhaDoDia[]>([]);
  const amigos = useSocial((s) => s.friends);
  const actual = usePlayer((s) => s.current);
  const playTrack = usePlayer((s) => s.playTrack);
  // Recarrega quando a lista de amigos muda: entrar uma amizade nova traz
  // escolhas novas, e é o sinal mais barato que há de que alguma coisa mudou.
  const quantosAmigos = amigos.length;

  React.useEffect(() => {
    let vivo = true;
    void lerEscolhasDoDia().then((e) => { if (vivo) setEscolhas(e); });
    return () => { vivo = false; };
  }, [quantosAmigos]);

  const minha = escolhas.find((e) => e.souEu);
  const convite = !minha && !!actual;
  if (!escolhas.length && !convite) return null;

  const tocar = (e: EscolhaDoDia) =>
    void playTrack(e.track, escolhas.map((x) => x.track), true);

  return (
    <View style={styles.caixa}>
      <Text style={styles.titulo}>Today</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila}>
        {/* O convite vem primeiro e só existe com música a tocar: escolher é
            um gesto sobre o que se está a ouvir, não um formulário. */}
        {convite && <ConviteParaEscolher track={actual!} aoEscolher={() => {
          void lerEscolhasDoDia().then(setEscolhas);
        }} />}

        {escolhas.map((e) => (
          <Toque
            key={e.userId}
            escala={ESCALA.cartao}
            onPress={() => tocar(e)}
            accessibilityRole="button"
            accessibilityLabel={`${e.souEu ? 'Your pick' : `${e.nome || e.username}'s pick`}: ${tituloDaFaixa(e.track)}`}
            style={styles.cartao}
          >
            {e.track.artworkUrl ? (
              <Image source={{ uri: e.track.artworkUrl }} style={styles.capa} contentFit="cover" transition={150} />
            ) : (
              <View style={[styles.capa, styles.capaVazia]}>
                <Ionicons name="musical-note" size={22} color={colors.textTertiary} />
              </View>
            )}
            <View style={styles.quem}>
              <FriendAvatar avatarUrl={e.avatar} name={e.nome || e.username || '?'} size={18} />
              <Text numberOfLines={1} style={styles.nome}>
                {e.souEu ? 'You' : e.nome || e.username}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.faixa}>{tituloDaFaixa(e.track)}</Text>
            <Text numberOfLines={1} style={styles.artista}>
              {e.nota || displayArtist(e.track)}
            </Text>
          </Toque>
        ))}
      </ScrollView>
    </View>
  );
}

function ConviteParaEscolher({ track, aoEscolher }: { track: any; aoEscolher: () => void }) {
  const [aGuardar, setAGuardar] = React.useState(false);
  const escolher = async () => {
    if (aGuardar) return;
    setAGuardar(true);
    try {
      const { escolherDoDia } = await import('../api/escolhaDoDia');
      const { hapticNotification } = await import('../lib/haptics');
      await escolherDoDia(track);
      hapticNotification();
      aoEscolher();
    } catch {
      // Fica como estava; tocar outra vez tenta de novo.
    } finally {
      setAGuardar(false);
    }
  };
  return (
    <Toque
      escala={ESCALA.cartao}
      onPress={() => void escolher()}
      accessibilityRole="button"
      accessibilityLabel={`Make ${tituloDaFaixa(track)} today's pick`}
      style={[styles.cartao, styles.convite]}
    >
      <Ionicons name="add-circle-outline" size={26} color={colors.text} />
      <Text numberOfLines={2} style={styles.conviteTexto}>
        {aGuardar ? 'Picking…' : 'Make this today’s pick'}
      </Text>
      <Text numberOfLines={1} style={styles.artista}>{tituloDaFaixa(track)}</Text>
    </Toque>
  );
}

const styles = StyleSheet.create({
  caixa: { marginBottom: spacing.xl, gap: spacing.md },
  titulo: { ...type.title, fontSize: 18, paddingHorizontal: spacing.xl },
  fila: { paddingHorizontal: spacing.xl, gap: spacing.md },
  cartao: { width: LARGURA, gap: 5 },
  convite: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    padding: spacing.md,
    justifyContent: 'center',
    minHeight: LARGURA,
  },
  conviteTexto: { ...type.body, fontSize: 13, fontWeight: '600' },
  capa: { width: LARGURA, height: LARGURA, borderRadius: radii.md, backgroundColor: colors.surfaceHigh },
  capaVazia: { alignItems: 'center', justifyContent: 'center' },
  quem: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  nome: { ...type.caption, fontSize: 11, color: colors.textSecondary, flex: 1 },
  faixa: { ...type.body, fontSize: 13, fontWeight: '600' },
  artista: { ...type.caption, fontSize: 11 },
});
