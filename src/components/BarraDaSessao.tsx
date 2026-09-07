import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSocial } from '../state/social';
import { FriendAvatar } from './FriendAvatar';
import { Toque } from './Toque';
import { ESCALA } from '../lib/movimento';
import { colors, radii, spacing, type } from '../theme';

/**
 * A faixa que diz que não estás a ouvir sozinho.
 *
 * Vive por cima do leitor pequeno e só existe enquanto a sessão existir. Duas
 * coisas, e a segunda é a que ninguém se lembra de pôr:
 *
 *  - quem está;
 *  - **quem ainda não consegue ouvir**.
 *
 * No Duotone tocar uma faixa é descarregá-la primeiro, e um amigo em 3G mau
 * pode ficar meio minuto em silêncio enquanto os outros já vão a meio. Sem esta
 * linha, isso lê-se como avaria -- a app dele parece partida e ninguém percebe
 * porquê. Com ela, é só espera, e a espera vê-se.
 */
export function BarraDaSessao({ aoAbrir }: { aoAbrir?: () => void }) {
  const sessao = useOuvirJuntos((s) => s.sessao);
  const membros = useOuvirJuntos((s) => s.membros);
  const euId = useOuvirJuntos((s) => s.euId);
  const amigos = useSocial((s) => s.friends);

  if (!sessao) return null;

  const nomeDe = (id: string) => {
    if (id === euId) return 'tu';
    return amigos.find((f) => f.friendId === id)?.name ?? 'alguém';
  };
  const avatarDe = (id: string) =>
    amigos.find((f) => f.friendId === id)?.avatarUrl ?? null;

  const outros = membros.filter((m) => m.userId !== euId);
  const aEsperar = outros.filter((m) => !m.pronta);

  // Uma frase e não duas: quem está, ou quem falta. Enquanto alguém não tem a
  // faixa, é isso que interessa saber -- a lista de presentes pode esperar.
  const estado = aEsperar.length
    ? aEsperar.length === 1
      ? `${nomeDe(aEsperar[0].userId)} a descarregar · ${aEsperar[0].percentagem}%`
      : `${aEsperar.length} pessoas a descarregar`
    : outros.length === 0
      ? 'À espera de quem convidaste'
      : outros.length === 1
        ? `A ouvir com ${nomeDe(outros[0].userId)}`
        : `A ouvir com ${outros.length} amigos`;

  return (
    <Toque
      escala={ESCALA.cartao}
      onPress={aoAbrir}
      disabled={!aoAbrir}
      accessibilityLabel={estado}
      style={styles.barra}
    >
      <View style={styles.pilha}>
        {membros.slice(0, 3).map((m, i) => (
          <View key={m.userId} style={[styles.naPilha, i > 0 && { marginLeft: -9 }]}>
            <FriendAvatar avatarUrl={avatarDe(m.userId)} name={nomeDe(m.userId)} size={22} />
          </View>
        ))}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={styles.titulo}>{estado}</Text>
        {!!sessao.track?.title && (
          <Text numberOfLines={1} style={styles.faixa}>{sessao.track.title}</Text>
        )}
      </View>
      {aoAbrir ? (
        <Ionicons name="chevron-up" size={16} color={colors.textSecondary} />
      ) : null}
    </Toque>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.36)',
  },
  pilha: { flexDirection: 'row' },
  // A borda da cor do fundo é o que separa os avatares quando se sobrepõem --
  // sem ela ficam colados e lê-se como uma mancha só.
  naPilha: {
    borderWidth: 2,
    borderColor: colors.bg,
    borderRadius: 999,
  },
  titulo: { ...type.caption, color: colors.text, fontWeight: '600' },
  faixa: { ...type.micro, color: colors.textSecondary },
});
