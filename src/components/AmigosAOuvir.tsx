import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FriendAvatar } from './FriendAvatar';
import { Toque } from './Toque';
import { ESCALA } from '../lib/movimento';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useSocial } from '../state/social';
import { colors, spacing, type } from '../theme';

/** O anel à volta de quem está a ouvir. */
const TAMANHO = 58;
const ANEL = 2;

/**
 * Quem dos teus amigos está a ouvir alguma coisa AGORA.
 *
 * ## Aparece e desaparece, e é essa a regra toda
 *
 * Sem ninguém a ouvir, isto não existe -- nem título, nem espaço, nem uma
 * linha a dizer que não há ninguém. Uma fila de avatares apagados a dizer
 * "ninguém está online" ocupa o topo da página com uma ausência, e o topo da
 * página é o sítio mais caro que há.
 *
 * É também o que torna isto seguro de pôr aqui e não numa página inicial: numa
 * Home, um bloco que desaparece deixa um buraco onde estava o tom do ecrã; à
 * cabeça da pesquisa, some-se e a pesquisa começa onde sempre começou.
 *
 * ## O anel não é o do Instagram
 *
 * A ideia é de lá, o desenho não: aquele anel é um gradiente, e esta app não
 * tem gradientes em lado nenhum. Usa-se o mesmo verde que já significa
 * "online" no resto da app -- nos chats, na folha da sessão -- para que a cor
 * queira dizer a mesma coisa em todo o lado.
 */
export function AmigosAOuvir() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // O selector devolve o que está na store, sem construir nada: um array novo
  // a cada leitura punha o `useSyncExternalStore` num ciclo -- já aconteceu
  // nesta app e a versão não arrancava.
  const amigos = useSocial((s) => s.friends);

  const aOuvir = React.useMemo(
    () => amigos.filter((a) => a.status === 'accepted' && a.online && a.currentlyPlaying),
    [amigos]
  );

  if (aOuvir.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.fila}
      style={styles.caixa}
    >
      {aOuvir.map((amigo) => (
        <Toque
          key={amigo.friendId}
          escala={ESCALA.cartao}
          onPress={() => navigation.navigate('FriendProfile', { userId: amigo.friendId })}
          accessibilityLabel={`${amigo.name || amigo.username}, listening to ${amigo.currentlyPlaying?.title ?? 'music'}`}
          style={styles.pessoa}
        >
          <View style={styles.anel}>
            <FriendAvatar
              avatarUrl={amigo.avatarUrl}
              name={amigo.name || amigo.username}
              size={TAMANHO - ANEL * 4}
            />
          </View>
          {/* O nome corta-se a uma linha: nomes compridos alinhavam a fila
              toda ao mais comprido de todos e abriam buracos entre avatares. */}
          <Text numberOfLines={1} style={styles.nome}>
            {amigo.name || amigo.username}
          </Text>
        </Toque>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  caixa: { marginBottom: spacing.lg },
  fila: { paddingHorizontal: spacing.xl, gap: spacing.md },
  pessoa: { width: TAMANHO + 8, alignItems: 'center', gap: 6 },
  anel: {
    width: TAMANHO,
    height: TAMANHO,
    borderRadius: TAMANHO / 2,
    borderWidth: ANEL,
    borderColor: colors.online,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: { ...type.micro, color: colors.textSecondary, textAlign: 'center' },
});
