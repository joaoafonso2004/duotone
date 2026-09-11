import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { BottomSheet, BottomSheetScrollView } from './BottomSheet';
import { FriendAvatar } from './FriendAvatar';
import { Toque } from './Toque';
import { ESCALA } from '../lib/movimento';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSocial } from '../state/social';
import { usePessoasDaSessao } from '../hooks/usePessoasDaSessao';
import { useTheme } from '../state/theme';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { hapticSelection } from '../lib/haptics';
import { presentes } from '../lib/sessaoViva';
import { colors, radii, spacing, type } from '../theme';

/**
 * Quem está, o que vem a seguir, e quem manda.
 *
 * Abre-se da barra da sessão. É o único sítio onde se vê a fila partilhada e
 * onde o anfitrião entrega ou retira o controlo -- duas coisas que não cabiam
 * numa faixa de trinta píxeis e que ninguém precisa de ter à frente o tempo
 * todo.
 */
export function FolhaDaSessao({ visivel, aoFechar }: { visivel: boolean; aoFechar: () => void }) {
  const tema = useTheme((s) => s.theme);
  const sessao = useOuvirJuntos((s) => s.sessao);
  // NUNCA chamar uma funcao dentro do selector: devolveria um array novo a
  // cada leitura, e o zustand le a store pelo `useSyncExternalStore`, que
  // exige um valor ESTAVEL. Com um valor novo de cada vez o React 18 atira
  // "The result of getSnapshot should be cached to avoid an infinite loop"
  // -- erro fatal, na montagem, antes de haver ecra. Filtra-se aqui fora.
  const todos = useOuvirJuntos((s) => s.membros);
  const membros = presentes(todos, Date.now());
  const convidarMais = useOuvirJuntos((s) => s.convidarMais);
  const [convidados, setConvidados] = React.useState<string[]>([]);
  const fila = useOuvirJuntos((s) => s.fila);
  const euId = useOuvirJuntos((s) => s.euId);
  const souAnfitriao = useOuvirJuntos((s) => s.souAnfitriao);
  const darControlo = useOuvirJuntos((s) => s.darControlo);
  const rodarAux = useOuvirJuntos((s) => s.rodarAux);
  const retirarSugestao = useOuvirJuntos((s) => s.retirarSugestao);
  const abandonar = useOuvirJuntos((s) => s.abandonar);
  const amigos = useSocial((s) => s.friends);

  const anfitriao = souAnfitriao();
  // Sozinho não há uma roda para passar. O interruptor aparecia activo mas o
  // resultado era indistinguível de uma falha; mantém-se a opção à vista para
  // explicar quando fica disponível. Se já estava ligada e a outra pessoa
  // saiu, continua a ser possível desligá-la.
  const podeAlternarAux = !!sessao?.auxDe || membros.some((m) => m.userId !== euId);
  const porConvidar = amigos.filter(
    (f) => !membros.some((m) => m.userId === f.friendId)
  );

  // O perfil de cada pessoa, a própria incluída -- ver `usePessoasDaSessao`.
  const { nomeDe, avatarDe, rotuloDe } = usePessoasDaSessao();

  React.useEffect(() => { if (!visivel) setConvidados([]); }, [visivel]);

  return (
    <BottomSheet visible={visivel && !!sessao} onClose={aoFechar}>
      <Text style={[type.title, { marginBottom: spacing.md }]}>Listen together</Text>

      <BottomSheetScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.seccao}>IN THE SESSION</Text>
        {membros.map((m) => (
          <View key={m.userId} style={styles.linha}>
            <FriendAvatar avatarUrl={avatarDe(m.userId)} name={nomeDe(m.userId)} size={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.nome}>{rotuloDe(m.userId)}</Text>
              {/* A espera tem de ser visível. No Duotone tocar uma faixa é
                  descarregá-la primeiro, e um amigo em silêncio há trinta
                  segundos parece avaria quando é só a rede dele. */}
              <Text numberOfLines={1} style={styles.estado}>
                {m.pronta ? 'Ready' : `Loading · ${m.percentagem}%`}
              </Text>
            </View>
            <Ionicons
              name={m.pronta ? 'checkmark-circle' : 'ellipsis-horizontal'}
              size={18}
              color={m.pronta ? colors.online : colors.textTertiary}
            />
          </View>
        ))}

        {anfitriao ? (
          <View style={styles.permissao}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.nome}>Guests can control</Text>
              {/* O defeito é NÃO. Quatro pessoas com o dedo no pause é uma
                  sessão que não toca nada -- e juntar à fila, que é o que
                  quase toda a gente quer fazer, nunca precisou disto. */}
              <Text style={styles.estado}>Play songs, skip and pause. Anyone can add to queue.</Text>
            </View>
            <Switch
              value={!!sessao?.convidadosControlam}
              onValueChange={(v) => { hapticSelection(); void darControlo(v).catch(() => useOuvirJuntos.setState({ aviso: 'Could not change control. Please try again.' })); }}
              trackColor={{ true: tema.color, false: colors.surfaceHigh }}
            />
          </View>
        ) : null}

        {/* PASSA O AUX. Ao lado do controlo dos convidados porque e a mesma
            pergunta -- quem manda no que se ouve -- e a resposta oposta: em vez
            de abrir a toda a gente, da a vez a um de cada vez.

            Repara no que ele NAO prende: o play, a pausa e o saltar. Prender o
            controlo a quem tem a vez deixava a sala parada quando essa pessoa
            metia o telemovel no bolso. Ver `supabase/passa-o-aux.sql`. */}
        {anfitriao ? (
          <View style={[styles.permissao, !podeAlternarAux && styles.permissaoDesactivada]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.nome}>Pass the aux</Text>
              <Text style={styles.estado}>
                {podeAlternarAux
                  ? 'One song each, in turn. Whoever has the aux picks what goes in the queue.'
                  : 'Invite someone to the Jam to start passing the aux.'}
              </Text>
            </View>
            <Switch
              value={!!sessao?.auxDe}
              disabled={!podeAlternarAux}
              onValueChange={(v) => { hapticSelection(); void rodarAux(v).catch(() => useOuvirJuntos.setState({ aviso: 'Could not change the aux. Please try again.' })); }}
              trackColor={{ true: tema.color, false: colors.surfaceHigh }}
            />
          </View>
        ) : null}

        {/* De quem e a vez, para toda a gente e nao so para o anfitriao: numa
            roda, saber quando chega a tua e metade da graca. */}
        {sessao?.auxDe ? (
          <View style={styles.permissao}>
            <Ionicons name="headset-outline" size={18} color={tema.color} />
            <Text style={[styles.estado, { flex: 1 }]}>
              {sessao.auxDe === euId
                ? 'Your turn — add a song to the queue.'
                : `${nomeDe(sessao.auxDe)} has the aux.`}
            </Text>
          </View>
        ) : null}

        {/* Convidar a meio. Sem isto, uma sessão de grupo só existia se
            tivesses convidado toda a gente no primeiro toque -- e as sessões
            crescem, não nascem feitas. Só o anfitrião: o servidor recusa os
            outros, e um botão que dá erro é pior do que não haver botão. */}
        {anfitriao && porConvidar.length > 0 ? (
          <>
            <Text style={styles.seccao}>INVITE</Text>
            {porConvidar.map((f) => {
              const jaFoi = convidados.includes(f.friendId);
              return (
                <View key={f.friendId} style={styles.linha}>
                  <FriendAvatar avatarUrl={f.avatarUrl} name={f.name} size={38} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={styles.nome}>{f.name}</Text>
                    {/* Uma linha em branco em vez de "recebe no chat" repetido em
                        cada pessoa: e sempre verdade, logo nao informa nada. */}
                    {jaFoi || f.online ? (
                      <Text numberOfLines={1} style={styles.estado}>
                        {jaFoi ? 'Invited' : 'Online'}
                      </Text>
                    ) : null}
                  </View>
                  <Toque
                    escala={ESCALA.icone}
                    hitSlop={10}
                    disabled={jaFoi}
                    onPress={() => {
                      hapticSelection();
                      setConvidados((c) => [...c, f.friendId]);
                      void convidarMais([f.friendId]);
                    }}
                    accessibilityLabel={`Invite ${f.name}`}
                    style={{ padding: 4 }}
                  >
                    <Ionicons
                      name={jaFoi ? 'checkmark-circle' : 'person-add-outline'}
                      size={19}
                      color={jaFoi ? colors.online : tema.color}
                    />
                  </Toque>
                </View>
              );
            })}
          </>
        ) : null}

        <Text style={styles.seccao}>UP NEXT</Text>
        {fila.length === 0 ? (
          <Text style={[styles.estado, { paddingHorizontal: spacing.xs, paddingBottom: spacing.sm }]}>
            Tap any song to add it here.
          </Text>
        ) : (
          fila.map((item) => {
            const capa = item.track.artworkUrl ? capaParaLista(item.track.artworkUrl) : null;
            const meu = item.postoPor === euId;
            return (
              <View key={item.id} style={styles.linha}>
                {capa ? (
                  <Image source={{ uri: capa }} style={styles.capa} contentFit="cover" />
                ) : (
                  <View style={[styles.capa, styles.semCapa]}>
                    <Ionicons name="musical-notes" size={14} color={colors.textTertiary} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={styles.nome}>{tituloDaFaixa(item.track)}</Text>
                  {/* Quem sugeriu o quê fica à vista: metade da graça de uma
                      fila partilhada é saber de quem foi a ideia. */}
                  <Text numberOfLines={1} style={styles.estado}>
                    {displayArtist(item.track)} · {nomeDe(item.postoPor)}
                  </Text>
                </View>
                {meu || anfitriao ? (
                  <Toque
                    escala={ESCALA.icone}
                    hitSlop={10}
                    onPress={() => { hapticSelection(); void retirarSugestao(item.id).catch(() => useOuvirJuntos.setState({ aviso: 'Could not remove song. Please try again.' })); }}
                    accessibilityLabel={`Remove ${tituloDaFaixa(item.track)}`}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="close" size={17} color={colors.textSecondary} />
                  </Toque>
                ) : null}
              </View>
            );
          })
        )}
      </BottomSheetScrollView>

      <Toque
        escala={ESCALA.botao}
        onPress={() => { void abandonar().then(aoFechar).catch(() => useOuvirJuntos.setState({ aviso: 'Could not leave Jam. Please try again.' })); }}
        accessibilityLabel={anfitriao ? 'End session' : 'Leave session'}
        style={styles.sair}
      >
        <Ionicons name="exit-outline" size={17} color={colors.danger} />
        <Text style={[type.body, { color: colors.danger, fontWeight: '600' }]}>
          {anfitriao ? 'End session' : 'Leave'}
        </Text>
      </Toque>

    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  seccao: {
    ...type.micro,
    letterSpacing: 1.4,
    color: colors.textTertiary,
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  nome: { ...type.body, fontWeight: '600' },
  estado: { ...type.micro, color: colors.textSecondary },
  capa: { width: 38, height: 38, borderRadius: radii.sm },
  semCapa: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  permissao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  permissaoDesactivada: { opacity: 0.58 },
  sair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
});
