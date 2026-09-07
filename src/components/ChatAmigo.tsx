import React from 'react';
import { Image as RNImage, StyleSheet, Text, View } from 'react-native';
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
  nome, avatarUrl, estado, aOuvir, onVoltar, onPerfil,
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
        <FriendAvatar avatarUrl={avatarUrl} name={nome} size={34} />
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
 * O símbolo do Duotone por trás das mensagens.
 *
 * Fixo, não rola com a lista: uma marca que anda com o conteúdo lê-se como
 * conteúdo. A opacidade vive numa constante única porque é a única coisa aqui
 * que se afina a olho -- entre invisível e a estorvar a leitura o intervalo é
 * estreito, e a diferença entre as duas são dois pontos percentuais.
 */
const OPACIDADE_DA_MARCA = 0.04;

export function MarcaDeAgua() {
  return (
    <View pointerEvents="none" style={styles.marca}>
      <RNImage
        source={require('../../assets/auth-logo.png')}
        style={styles.simbolo}
        resizeMode="contain"
        blurRadius={3}
      />
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
  estado: { ...type.micro, color: colors.textSecondary },

  marca: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simbolo: {
    width: '78%',
    height: '46%',
    opacity: OPACIDADE_DA_MARCA,
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
