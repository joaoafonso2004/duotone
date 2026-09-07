import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  getFriendships, getGrupos, shareComGrupo, shareItem,
  type ChatGroup, type Friendship,
} from '../api/social';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { useTheme } from '../state/theme';
import { colors, radii, spacing, type } from '../theme';
import { BottomSheet } from './BottomSheet';
import { FriendAvatar } from './FriendAvatar';
import { GroupAvatar } from './GroupChat';
import { Input } from './Input';
import { Toque } from './Toque';
import { ESCALA } from '../lib/movimento';
import { useOuvirJuntos } from '../state/ouvirJuntos';

type Destino =
  | { kind: 'group'; id: string; nome: string; sub: string; grupo: ChatGroup }
  | { kind: 'friend'; id: string; nome: string; sub: string; amigo: Friendship };

interface ShareFriendSheetProps {
  visible: boolean;
  itemType: 'playlist' | 'track';
  item: any; // Track ou Playlist
  onClose: () => void;
}

/**
 * Mandar uma faixa ou uma playlist a alguém.
 *
 * Construída sobre o mesmo `BottomSheet` do "Adicionar a playlist", e não
 * sobre um modal próprio: eram duas folhas com o mesmo trabalho e desenhos
 * diferentes -- cantos, pega, título, tipos de letra, e até a forma de fechar.
 * Partilhadas as fundações, herda também o arrastar para baixo.
 *
 * A linha inteira é o botão, como nas playlists. Antes havia um "Share"
 * pequeno à direita e o resto da linha não fazia nada.
 */
export function ShareFriendSheet({ visible, itemType, item, onClose }: ShareFriendSheetProps) {
  const tema = useTheme((s) => s.theme);
  const abrirSessao = useOuvirJuntos((s) => s.abrir);
  const sessaoActual = useOuvirJuntos((s) => s.sessao);
  const sugerir = useOuvirJuntos((s) => s.sugerir);
  const [sugerida, setSugerida] = useState(false);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [aAbrir, setAAbrir] = useState(false);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [sendingStates, setSendingStates] = useState<Record<string, 'idle' | 'sending' | 'sent'>>({});

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setComment('');
      setSendingStates({});
      // Os grupos faltavam aqui: dava para os criar e falar neles, mas não
      // para lhes mandar uma música ou uma playlist -- o único caminho era
      // abrir a conversa do grupo. Vão os dois, e um falhar não leva o outro.
      Promise.allSettled([getFriendships(), getGrupos()])
        .then(([a, g]) => {
          if (a.status === 'fulfilled') setFriends(a.value.filter((f) => f.status === 'accepted'));
          if (g.status === 'fulfilled') setGroups(g.value);
        })
        .finally(() => setLoading(false));
    }
  }, [visible]);

  const chaveDe = (alvo: Destino) => (alvo.kind === 'group' ? `g:${alvo.id}` : alvo.id);

  /**
   * A folha faz duas coisas, e a segunda só existe para faixas.
   *
   * Partilhar é mandar e acabou; ouvir juntos é escolher COM QUEM e depois
   * abrir. Por isso o modo entra quando se toca no botão de baixo: as linhas
   * passam de "enviar a cada um" para "marcar quem vem", que é uma pergunta
   * diferente e não podia ficar com o mesmo gesto.
   */
  const [modoSessao, setModoSessao] = useState(false);
  const podeOuvirJuntos = itemType === 'track' && !!item?.sourceId;

  const comecarSessao = async () => {
    if (!escolhidos.length || aAbrir) return;
    setAAbrir(true);
    try {
      hapticSelection();
      await abrirSessao(item, escolhidos, comment.trim() || undefined);
      hapticNotification();
      onClose();
    } catch {
      // Falhou: fica-se na folha, com as escolhas de pé, para tentar outra vez.
    } finally {
      setAAbrir(false);
    }
  };

  useEffect(() => {
    if (!visible) { setModoSessao(false); setEscolhidos([]); setSugerida(false); }
  }, [visible]);

  /**
   * Já numa sessão, o botão muda de trabalho: em vez de abrir outra, junta
   * esta música à fila de quem já está a ouvir contigo.
   *
   * Não precisa de permissão nenhuma -- sugerir não interrompe ninguém, e é
   * essa a diferença entre ouvir COM alguém e assistir a alguém.
   */
  const juntarAFilaDaSessao = async () => {
    if (!sessaoActual || sugerida) return;
    try {
      hapticSelection();
      await sugerir(item);
      setSugerida(true);
      hapticNotification();
    } catch {
      // Fica como estava; tocar outra vez tenta de novo.
    }
  };

  const handleShare = async (alvo: Destino) => {
    const chave = chaveDe(alvo);
    if (sendingStates[chave] === 'sending' || sendingStates[chave] === 'sent') return;

    hapticSelection();
    setSendingStates((prev) => ({ ...prev, [chave]: 'sending' }));

    try {
      if (alvo.kind === 'group') await shareComGrupo(alvo.id, itemType, item, comment);
      else await shareItem(alvo.id, itemType, item, comment);
      hapticNotification();
      setSendingStates((prev) => ({ ...prev, [chave]: 'sent' }));
    } catch {
      setSendingStates((prev) => ({ ...prev, [chave]: 'idle' }));
    }
  };

  // Grupos primeiro: são menos, e é para eles que se partilha quando se quer
  // que mais do que uma pessoa oiça.
  const destinos: Destino[] = [
    ...groups.map((g) => ({
      kind: 'group' as const, id: g.id, nome: g.name,
      sub: `${g.membros.length} ${g.membros.length === 1 ? 'member' : 'members'}`, grupo: g,
    })),
    ...friends.map((f) => ({
      kind: 'friend' as const, id: f.friendId, nome: f.name, sub: `@${f.username}`, amigo: f,
    })),
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.md }]}>
        {modoSessao ? 'Listen together' : `Share ${itemType === 'track' ? 'track' : 'playlist'}`}
      </Text>

      <View style={{ marginBottom: spacing.md }}>
        <Input
          icon="chatbubble-outline"
          placeholder="Say something about it…"
          value={comment}
          onChangeText={setComment}
          onClear={() => setComment('')}
          autoCorrect={false}
          returnKeyType="done"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={{ marginVertical: 24 }} />
      ) : destinos.length === 0 ? (
        <View style={styles.vazio}>
          <Ionicons name="people-outline" size={24} color={colors.textTertiary} />
          <Text style={[type.caption, { textAlign: 'center' }]}>
            You need a friend or a group before you can share music.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
          {destinos.map((alvo) => {
            const estado = sendingStates[chaveDe(alvo)] ?? 'idle';
            const enviado = estado === 'sent';
            return (
              <Pressable
                key={`${alvo.kind}:${alvo.id}`}
                onPress={() =>
                  modoSessao
                    ? setEscolhidos((e) =>
                        e.includes(alvo.id) ? e.filter((x) => x !== alvo.id) : [...e, alvo.id]
                      )
                    : handleShare(alvo)
                }
                disabled={modoSessao ? alvo.kind === 'group' : estado !== 'idle'}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.surfacePressed },
                ]}
              >
                {alvo.kind === 'group' ? (
                  <GroupAvatar group={alvo.grupo} size={44} />
                ) : (
                  <FriendAvatar avatarUrl={alvo.amigo.avatarUrl} name={alvo.nome} size={44} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>
                    {alvo.nome}
                  </Text>
                  <Text numberOfLines={1} style={type.caption}>{alvo.sub}</Text>
                </View>
                {/* O mesmo vocabulário da folha das playlists: um visto quando
                    está feito, uma seta quando ainda há alguma coisa a fazer. */}
                {modoSessao ? (
                  <Ionicons
                    name={escolhidos.includes(alvo.id) ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={escolhidos.includes(alvo.id) ? tema.color : colors.textTertiary}
                  />
                ) : estado === 'sending' ? (
                  <ActivityIndicator size="small" color={tema.color} />
                ) : (
                  <Ionicons
                    name={enviado ? 'checkmark-circle' : 'paper-plane-outline'}
                    size={enviado ? 20 : 16}
                    color={enviado ? colors.text : colors.textTertiary}
                  />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Não é um ícone a mais na linha de acções do leitor -- essa já tem três
          e não devia crescer. Vive aqui porque esta folha já sabe quem são os
          amigos, e escolher com quem ouvir é a mesma pergunta que escolher a
          quem mandar. */}
      {podeOuvirJuntos && destinos.length > 0 && !loading ? (
        <View style={styles.rodape}>
          {modoSessao ? (
            <>
              <Toque
                escala={ESCALA.botao}
                onPress={comecarSessao}
                disabled={!escolhidos.length || aAbrir}
                accessibilityLabel="Start listening together"
                style={[
                  styles.botaoSessao,
                  { backgroundColor: tema.color },
                  (!escolhidos.length || aAbrir) && { opacity: 0.45 },
                ]}
              >
                {aAbrir ? (
                  <ActivityIndicator size="small" color={colors.bg} />
                ) : (
                  <Text style={[type.body, { color: colors.bg, fontWeight: '700' }]}>
                    {escolhidos.length
                      ? `Listen together · ${escolhidos.length}`
                      : 'Choose who comes'}
                  </Text>
                )}
              </Toque>
              <Toque
                escala={ESCALA.botao}
                onPress={() => { setModoSessao(false); setEscolhidos([]); }}
                style={styles.botaoQuieto}
              >
                <Text style={type.caption}>Cancel</Text>
              </Toque>
            </>
          ) : (
            <Toque
              escala={ESCALA.botao}
              onPress={() => {
                if (sessaoActual) void juntarAFilaDaSessao();
                else { hapticSelection(); setModoSessao(true); }
              }}
              disabled={sugerida}
              accessibilityLabel={sessaoActual ? 'Add to the session queue' : 'Listen together'}
              style={[styles.botaoQuieto, sugerida && { opacity: 0.6 }]}
            >
              <Ionicons
                name={sugerida ? 'checkmark-circle' : sessaoActual ? 'add-circle-outline' : 'headset-outline'}
                size={17}
                color={tema.color}
              />
              <Text style={[type.body, { color: tema.color, fontWeight: '600' }]}>
                {sugerida
                  ? 'Added to the queue'
                  : sessaoActual
                    ? 'Add to the session queue'
                    : 'Listen together'}
              </Text>
            </Toque>
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
  },
  rodape: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  botaoSessao: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: radii.lg,
  },
  botaoQuieto: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  vazio: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 32,
    paddingHorizontal: spacing.lg,
  },
});
