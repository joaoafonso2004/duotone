import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { FriendAvatar } from './FriendAvatar';
import { SocialIconButton } from './socialUI';
import { Toque } from './Toque';
import { ESCALA } from '../lib/movimento';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { colors, radii, spacing, type } from '../theme';
import type { Track } from '../types';

/**
 * O cabeçalho de uma conversa a dois.
 *
 * Substitui DUAS coisas: a barra que só tinha o nome, e a linha de perfil que
 * vinha logo por baixo com o nome outra vez. Com o nome também dentro de cada
 * mensagem recebida, o mesmo nome aparecia três vezes no mesmo ecrã.
 *
 * Numa conversa a dois só há duas pessoas, e o lado do balão já diz quem falou.
 * Aqui fica uma vez: com a cara, o estado, e a ligação para o perfil -- que era
 * o que a linha do meio fazia e passa a caber aqui.
 */
export function CabecalhoDoAmigo({
  nome, avatarUrl, estado, online, aOuvir, onVoltar, onPerfil,
}: {
  nome: string;
  avatarUrl: string | null;
  estado: string;
  online?: boolean;
  aOuvir?: string | null;
  onVoltar: () => void;
  onPerfil: () => void;
}) {
  return (
    <View style={styles.cabecalho}>
      <SocialIconButton label="Back to chats" icon="chevron-back" onPress={onVoltar} />
      <Toque
        escala={ESCALA.cartao}
        onPress={onPerfil}
        accessibilityLabel={`View ${nome}`}
        style={styles.identidade}
      >
        {/* A bolinha no canto do avatar, e nao uma palavra na linha de baixo:
            e onde toda a gente a procura, e deixa a linha livre para o que ele
            esta a ouvir. */}
        <View>
          <FriendAvatar avatarUrl={avatarUrl} name={nome} size={34} />
          {online ? <View style={styles.online} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.nome}>{nome}</Text>
          <Text numberOfLines={1} style={styles.estado}>
            {aOuvir ? `♫ ${aOuvir}` : estado}
          </Text>
        </View>
      </Toque>
    </View>
  );
}

/**
 * O mesmo fundo que a app inteira tem.
 *
 * O `RootNavigator` desenha o `login_bg.png` desfocado por trás de tudo, e é
 * ele que dá o ambiente ao resto da app. O chat abre num `Modal`, e um modal no
 * iOS desenha na sua própria hierarquia nativa -- por isso esse fundo não passa
 * por baixo e o ecrã ficava preto liso.
 *
 * Eu tinha resolvido isso a inventar um logótipo à parte, e era a resposta
 * errada à pergunta certa: o chat não devia ter uma marca PRÓPRIA, devia ter a
 * MESMA. Repete-se aqui a mesma imagem, o mesmo desfoque e a mesma camada de
 * contraste, para o chat não se parecer com outra aplicação.
 */
export function FundoDaApp() {
  return (
    <View pointerEvents="none" style={styles.marca}>
      <Image
        source={require('../../assets/login_bg.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={300}
      />
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10, 10, 15, 0.88)' }]} />
    </View>
  );
}

/**
 * Uma música partilhada, como cartão.
 *
 * Estava como `♫ {título}` -- um carácter tipográfico a fazer de ícone, com o
 * título cru do YouTube e o `(Lyrics)` atrás. Numa app de música, a coisa mais
 * partilhada da conversa era a pior tratada.
 *
 * O título passa pelo `tituloDaFaixa` e o artista pelo `displayArtist`, os
 * mesmos que as listas usam: a mesma faixa deixa de se ler de duas maneiras
 * conforme o sítio da app onde aparece.
 */
export function FaixaPartilhada({
  faixa, minha, onPress,
}: { faixa: Track; minha: boolean; onPress: () => void }) {
  const capa = faixa.artworkUrl ? capaParaLista(faixa.artworkUrl) : null;
  return (
    <Toque
      escala={ESCALA.cartao}
      onPress={onPress}
      accessibilityLabel={`Play ${tituloDaFaixa(faixa)}`}
      style={[styles.faixa, minha && styles.faixaMinha]}
    >
      {capa ? (
        <Image source={{ uri: capa }} style={styles.capa} contentFit="cover" />
      ) : (
        <View style={[styles.capa, styles.semCapa]}>
          <Ionicons name="musical-notes" size={15} color={colors.textTertiary} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={styles.faixaTitulo}>{tituloDaFaixa(faixa)}</Text>
        <Text numberOfLines={1} style={styles.faixaArtista}>{displayArtist(faixa)}</Text>
      </View>
      <View style={styles.tocar}>
        <Ionicons name="play" size={11} color={colors.text} style={{ marginLeft: 1 }} />
      </View>
    </Toque>
  );
}

const styles = StyleSheet.create({
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  identidade: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  nome: { ...type.body, fontWeight: '700', fontSize: 17 },
  online: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.online,
    // A borda da cor do fundo e o que separa o ponto do avatar -- sem ela
    // desaparece contra uma fotografia clara.
    borderWidth: 2,
    borderColor: colors.bg,
  },
  estado: { ...type.micro, color: colors.textSecondary },

  marca: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: 7,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  // Dentro de um balão com fundo de cor, o cartão precisa de contraste do
  // outro lado: escurece em vez de clarear.
  faixaMinha: { backgroundColor: 'rgba(0,0,0,0.18)' },
  capa: { width: 42, height: 42, borderRadius: radii.sm },
  semCapa: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  faixaTitulo: { ...type.caption, color: colors.text, fontWeight: '600' },
  faixaArtista: { ...type.micro, color: colors.textSecondary },
  tocar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
