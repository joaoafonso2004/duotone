import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FriendAvatar } from './FriendAvatar';
import { Toque } from './Toque';
import { sessoesDeAmigos } from '../api/ouvirJuntos';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { hapticSelection } from '../lib/haptics';
import { ESCALA } from '../lib/movimento';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { usePlayer } from '../state/player';
import { useSocial } from '../state/social';
import { colors, spacing, type } from '../theme';

/** O anel à volta de quem está a ouvir. */
const TAMANHO = 58;
const ANEL = 2;

/**
 * A largura do cartão, e ela sai de uma frase.
 *
 * Eram 66 -- o avatar mais oito -- porque só lá vivia um primeiro nome. Com a
 * faixa por baixo, 66 cortava-a na primeira palavra. 112 é o que leva
 * "Juice WRLD — Vibing" inteiro a 11 pt, que foi o exemplo que o João deu, e
 * ainda deixa três avatares e meio à vista num iPhone -- o suficiente para
 * isto continuar a ler-se como uma FILA de pessoas e não como uma lista.
 */
const LARGURA = 112;

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

  // O filtro é um type guard e não um `boolean`: quem sobrevive a ele TEM
  // `currentlyPlaying`, e é isso que deixa a linha da faixa lá em baixo lê-lo
  // sem um `!` a fingir que se sabe uma coisa que o compilador não sabe.
  const aOuvir = React.useMemo(
    () => amigos.filter(
      (a): a is typeof a & { currentlyPlaying: NonNullable<typeof a.currentlyPlaying> } =>
        a.status === 'accepted' && !!a.online && !!a.currentlyPlaying
    ),
    [amigos]
  );

  /**
   * Que amigos tem sessao aberta -- para se entrar nela em vez de so tocar a
   * mesma musica. Pergunta-se quando ha alguem a ouvir, e nao de contínuo: uma
   * sessao abre-se raramente e a lista morre com a fila.
   */
  const [sessoes, setSessoes] = React.useState<Map<string, string>>(new Map());
  const quantos = aOuvir.length;
  React.useEffect(() => {
    if (!quantos) { setSessoes(new Map()); return; }
    let vivo = true;
    void sessoesDeAmigos().then((m) => { if (vivo) setSessoes(m); });
    return () => { vivo = false; };
  }, [quantos]);

  /**
   * Ir ouvir com ele. Duas portas, e a segunda e a que existe sempre:
   *
   *  - se ele tem sessao aberta, ENTRA-SE nela. O servidor ja permitia isto a
   *    qualquer amigo sem convite -- o convite so servia para avisar.
   *  - se nao tem, toca-se a musica dele. Nao e sincronia, mas e a promessa
   *    cumprida na parte que interessa: estas a ouvir o que ele esta a ouvir.
   *
   * Falhar nao diz nada: quem carregou volta a carregar. O que nao se pode e
   * deixar a app num estado meio-entrado.
   */
  const ouvirCom = React.useCallback(async (friendId: string) => {
    const amigo = aOuvir.find((a) => a.friendId === friendId);
    if (!amigo) return;
    hapticSelection();
    const sessao = sessoes.get(friendId);
    if (sessao) {
      try {
        await useOuvirJuntos.getState().juntarSe(sessao);
        return;
      } catch {
        // A sessao pode ter acabado entre a leitura e o toque. Cai para a
        // musica, que e melhor do que nao acontecer nada.
      }
    }
    // A presenca traz uma faixa MAGRA (sem album -- ver o whitelist do
    // `publish_social_presence`). O leitor quer um Track inteiro, e o album
    // e a unica coisa que falta.
    const { source, sourceId, title, artist, artworkUrl, durationSeconds } = amigo.currentlyPlaying;
    void usePlayer.getState().playTrack(
      { source, sourceId, title, artist, artworkUrl, durationSeconds, album: null },
      undefined, true,
    );
  }, [aOuvir, sessoes]);

  if (aOuvir.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.fila}
      style={styles.caixa}
    >
      {aOuvir.map((amigo) => {
        const sessao = sessoes.get(amigo.friendId);
        return (
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
            {/* O botão vive EM CIMA da cara, e não ao lado: é o que o torna
                óbvio sem uma legenda. Toque na cara continua a abrir o perfil;
                toque aqui é ir ouvir com ele. */}
            <Toque
              escala={ESCALA.icone}
              hitSlop={8}
              onPress={() => void ouvirCom(amigo.friendId)}
              accessibilityRole="button"
              accessibilityLabel={sessao
                ? `Join ${amigo.name || amigo.username}'s session`
                : `Listen along with ${amigo.name || amigo.username}`}
              style={styles.entrar}
            >
              <Ionicons name={sessao ? 'people' : 'play'} size={12} color={colors.bg} />
            </Toque>
          </View>
          {/* O nome corta-se a uma linha: nomes compridos alinhavam a fila
              toda ao mais comprido de todos e abriam buracos entre avatares. */}
          <Text numberOfLines={1} style={styles.nome}>
            {amigo.name || amigo.username}
          </Text>
          {/* E o que ele está a ouvir, que é a razão de o avatar estar aqui.
              A informação já vinha no `currentlyPlaying` e já era dita ao
              leitor de ecrã, na etiqueta acima -- só nunca era MOSTRADA.

              Pelo `displayArtist` e pelo `tituloDaFaixa`, como no resto da
              app: o título cru do YouTube traz o artista à frente e o
              [Official Video] atrás, e aqui não há espaço para nenhum dos
              dois. */}
          <Text numberOfLines={1} style={styles.faixa}>
            {`${displayArtist(amigo.currentlyPlaying)} — ${tituloDaFaixa(amigo.currentlyPlaying)}`}
          </Text>
        </Toque>
      );})}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  /**
   * O espaço de cima tem de bater certo com o de baixo.
   *
   * Não havia `marginTop`: por cima vinham os 12 do `controls.marginBottom` da
   * pesquisa, por baixo os 16 daqui. Doze contra dezasseis lê-se logo como
   * "está encostado ao de cima", que foi exactamente a queixa. Os 4 daqui
   * fecham a conta em 16/16.
   *
   * Corrige-se DENTRO do componente e não no `SearchScreen`: mexer lá mudava
   * também o espaço do histórico de pesquisas, que não tem nada a ver.
   */
  caixa: { marginTop: spacing.xs, marginBottom: spacing.lg },
  fila: { paddingHorizontal: spacing.xl, gap: spacing.md },
  pessoa: { width: LARGURA, alignItems: 'center', gap: 6 },
  entrar: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.online,
    borderWidth: 2,
    borderColor: colors.bg,
  },
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
  /**
   * A faixa NÃO herda o `type.micro` do nome.
   *
   * Aquele é maiúsculas com `letterSpacing` -- é uma etiqueta, e é o que o
   * nome de uma pessoa aqui é. Um título de música em maiúsculas espaçadas
   * lê-se como um aviso, e o espaçamento ainda roubava dois ou três
   * caracteres a uma linha que já é curta.
   *
   * Mais apagada do que o nome de propósito: são duas linhas no mesmo cartão e
   * a pessoa é que manda. Com o mesmo peso, competiam.
   */
  faixa: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
