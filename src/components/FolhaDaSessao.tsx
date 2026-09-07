import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { BottomSheet } from './BottomSheet';
import { FriendAvatar } from './FriendAvatar';
import { Toque } from './Toque';
import { ESCALA } from '../lib/movimento';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSocial } from '../state/social';
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
  const retirarSugestao = useOuvirJuntos((s) => s.retirarSugestao);
  const abandonar = useOuvirJuntos((s) => s.abandonar);
  const amigos = useSocial((s) => s.friends);

  const anfitriao = souAnfitriao();
  const porConvidar = amigos.filter(
    (f) => !membros.some((m) => m.userId === f.friendId)
  );

  const nomeDe = (id: string) =>
    id === euId ? 'Tu' : amigos.find((f) => f.friendId === id)?.name ?? 'Alguém';
  const avatarDe = (id: string) =>
    amigos.find((f) => f.friendId === id)?.avatarUrl ?? null;

  React.useEffect(() => { if (!visivel) setConvidados([]); }, [visivel]);

  return (
    <BottomSheet visible={visivel && !!sessao} onClose={aoFechar}>
      <Text style={[type.title, { marginBottom: spacing.md }]}>Ouvir juntos</Text>

      <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.seccao}>QUEM ESTÁ</Text>
        {membros.map((m) => (
          <View key={m.userId} style={styles.linha}>
            <FriendAvatar avatarUrl={avatarDe(m.userId)} name={nomeDe(m.userId)} size={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.nome}>
                {nomeDe(m.userId)}
                {sessao?.hostId === m.userId ? ' · anfitrião' : ''}
              </Text>
              {/* A espera tem de ser visível. No Duotone tocar uma faixa é
                  descarregá-la primeiro, e um amigo em silêncio há trinta
                  segundos parece avaria quando é só a rede dele. */}
              <Text numberOfLines={1} style={styles.estado}>
                {m.pronta ? 'Pronto' : `A descarregar · ${m.percentagem}%`}
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
              <Text style={styles.nome}>Deixar os outros controlar</Text>
              {/* O defeito é NÃO. Quatro pessoas com o dedo no pause é uma
                  sessão que não toca nada -- e juntar à fila, que é o que
                  quase toda a gente quer fazer, nunca precisou disto. */}
              <Text style={styles.estado}>
                Mudar de música e pôr em pausa. Sugerir já podem sempre.
              </Text>
            </View>
            <Switch
              value={!!sessao?.convidadosControlam}
              onValueChange={(v) => { hapticSelection(); void darControlo(v); }}
              trackColor={{ true: tema.color, false: colors.surfaceHigh }}
            />
          </View>
        ) : null}

        {/* Convidar a meio. Sem isto, uma sessão de grupo só existia se
            tivesses convidado toda a gente no primeiro toque -- e as sessões
            crescem, não nascem feitas. Só o anfitrião: o servidor recusa os
            outros, e um botão que dá erro é pior do que não haver botão. */}
        {anfitriao && porConvidar.length > 0 ? (
          <>
            <Text style={styles.seccao}>CHAMAR MAIS ALGUÉM</Text>
            {porConvidar.map((f) => {
              const jaFoi = convidados.includes(f.friendId);
              return (
                <View key={f.friendId} style={styles.linha}>
                  <FriendAvatar avatarUrl={f.avatarUrl} name={f.name} size={38} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={styles.nome}>{f.name}</Text>
                    <Text numberOfLines={1} style={styles.estado}>
                      {jaFoi ? 'Convite enviado' : f.online ? 'Online now' : 'Recebe no chat'}
                    </Text>
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
                    accessibilityLabel={`Convidar ${f.name}`}
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

        <Text style={styles.seccao}>A SEGUIR</Text>
        {fila.length === 0 ? (
          <Text style={[styles.estado, { paddingHorizontal: spacing.xs, paddingBottom: spacing.sm }]}>
            Ninguém sugeriu nada ainda. Qualquer pessoa pode — partilha uma música e
            escolhe "juntar à fila".
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
                    onPress={() => { hapticSelection(); void retirarSugestao(item.id); }}
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
      </ScrollView>

      <Toque
        escala={ESCALA.botao}
        onPress={() => { void abandonar(); aoFechar(); }}
        accessibilityLabel="Sair da sessão"
        style={styles.sair}
      >
        <Ionicons name="exit-outline" size={17} color={colors.danger} />
        <Text style={[type.body, { color: colors.danger, fontWeight: '600' }]}>
          {anfitriao ? 'Terminar a sessão' : 'Sair da sessão'}
        </Text>
      </Toque>
      {anfitriao ? (
        <Text style={[styles.estado, { textAlign: 'center', marginTop: 6 }]}>
          Terminar fecha-a para toda a gente.
        </Text>
      ) : null}
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
