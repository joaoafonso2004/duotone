import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSocial } from '../state/social';
import { FriendAvatar } from './FriendAvatar';
import { Toque } from './Toque';
import { ESCALA } from '../lib/movimento';
import { estadoDaSessao, presentes } from '../lib/sessaoViva';
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
  // NUNCA chamar uma funcao dentro do selector: devolveria um array novo a
  // cada leitura, e o zustand le a store pelo `useSyncExternalStore`, que
  // exige um valor ESTAVEL. Com um valor novo de cada vez o React 18 atira
  // "The result of getSnapshot should be cached to avoid an infinite loop"
  // -- erro fatal, na montagem, antes de haver ecra. Filtra-se aqui fora.
  const todos = useOuvirJuntos((s) => s.membros);
  const membros = presentes(todos, Date.now());
  const euId = useOuvirJuntos((s) => s.euId);
  const amigos = useSocial((s) => s.friends);
  const acabouSemAviso = useOuvirJuntos((s) => s.acabouSemAviso);
  const limparAviso = useOuvirJuntos((s) => s.limparAviso);

  // A sessão fechou por baixo -- normalmente o anfitrião a sair. A barra some,
  // e sem uma palavra isso lê-se como a app ter estoirado. Fica um aviso que
  // se apaga sozinho.
  React.useEffect(() => {
    if (!acabouSemAviso) return;
    const t = setTimeout(limparAviso, 6000);
    return () => clearTimeout(t);
  }, [acabouSemAviso, limparAviso]);

  if (!sessao) {
    if (!acabouSemAviso) return null;
    return (
      <Toque
        escala={ESCALA.cartao}
        onPress={limparAviso}
        accessibilityLabel="A sessão acabou"
        style={[styles.barra, styles.acabou]}
      >
        <Ionicons name="headset-outline" size={15} color={colors.textSecondary} />
        <Text style={[styles.titulo, { color: colors.textSecondary }]}>
          A sessão acabou
        </Text>
      </Toque>
    );
  }

  const nomeDe = (id: string) => {
    if (id === euId) return 'tu';
    return amigos.find((f) => f.friendId === id)?.name ?? 'alguém';
  };
  const avatarDe = (id: string) =>
    amigos.find((f) => f.friendId === id)?.avatarUrl ?? null;

  // A frase vive no `lib/sessaoViva.ts`: qual das verdades mostrar quando há
  // várias é uma decisão, e as decisões testam-se.
  const estado = estadoDaSessao({
    outros: membros
      .filter((m) => m.userId !== euId)
      .map((m) => ({ ...m, nome: nomeDe(m.userId) })),
    agora: Date.now(),
  });

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
  acabou: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
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
