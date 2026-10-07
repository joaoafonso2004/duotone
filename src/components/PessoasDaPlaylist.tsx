import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { getFriendships, shareItem, type Friendship } from '../api/social';
import { convidarParaPlaylist, sairDaPlaylist, tirarColaborador } from '../api/playlists';
import {
  amigosParaConvidar, colaboradoresDe, MAXIMO_DE_COLABORADORES, MENSAGEM_DO_CONVITE, nomeDaPessoa,
  resumoDasPessoas, vagasParaColaboradores, type PapelNaPlaylist, type PessoaDaPlaylist,
} from '../lib/playlistColaborativa';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { ESCALA } from '../lib/movimento';
import { useAuth } from '../state/auth';
import { useTheme } from '../state/theme';
import { colors, radii, spacing, type } from '../theme';
import { BottomSheet, BottomSheetScrollView } from './BottomSheet';
import { FriendAvatar } from './FriendAvatar';
import { Toque } from './Toque';

type Props = {
  visible: boolean;
  onClose: () => void;
  playlistId: string;
  papel: PapelNaPlaylist;
  pessoas: readonly PessoaDaPlaylist[];
  /** As pessoas mudaram (entrou ou saiu alguém): a página relê-as. */
  aoMudar: () => void;
  /** Saí da playlist: a página fecha-se e a lista esquece-a. */
  aoSair: () => void;
};

/**
 * Quem está numa playlist colaborativa (7/10), nos dois lados: no iPhone uma
 * folha, no PC o diálogo do `BottomSheet.web.tsx`. O dono junta amigos e tira
 * colaboradores; um colaborador vê quem lá está e pode sair. Tirar e sair
 * pedem um segundo toque no mesmo sítio, em vez de outra janela por cima.
 */
export function PessoasDaPlaylist({ visible, onClose, playlistId, papel, pessoas, aoMudar, aoSair }: Props) {
  const tema = useTheme((s) => s.theme);
  const eu = useAuth((s) => s.session?.user.id);
  const [modo, setModo] = useState<'lista' | 'convidar'>('lista');
  const [amigos, setAmigos] = useState<Friendship[] | null>(null);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [aConfirmar, setAConfirmar] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState('');
  const dono = papel === 'dono';

  useEffect(() => {
    if (!visible) { setModo('lista'); setEscolhidos([]); setAConfirmar(null); setErro(''); setFeito(''); return; }
    if (!dono) return;
    let vivo = true;
    void getFriendships().then((f) => { if (vivo) setAmigos(f); }).catch(() => { if (vivo) setAmigos([]); });
    return () => { vivo = false; };
  }, [visible, dono]);

  const paraConvidar = useMemo(() => amigosParaConvidar(amigos ?? [], pessoas), [amigos, pessoas]);
  const vagas = vagasParaColaboradores(pessoas);
  const ordem = useMemo(() => [...pessoas.filter((p) => p.papel === 'dono'), ...colaboradoresDe(pessoas)], [pessoas]);

  const convidar = async () => {
    if (!escolhidos.length || ocupado) return;
    setOcupado(true); setErro('');
    try {
      const entraram = await convidarParaPlaylist(playlistId, escolhidos);
      // Cada um fica a saber pelo chat, com a playlist na mensagem. Se isto
      // falhar o convite fica feito na mesma: a playlist já está nas Playlists dele.
      void shareItem(escolhidos, 'playlist', { id: playlistId }, MENSAGEM_DO_CONVITE).catch(() => {});
      hapticNotification();
      setFeito(entraram === 1 ? '1 collaborator added' : `${entraram} collaborators added`);
      setEscolhidos([]);
      setModo('lista');
      aoMudar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Could not add collaborators.'));
    } finally { setOcupado(false); }
  };

  const tirar = async (p: PessoaDaPlaylist) => {
    if (ocupado) return;
    if (aConfirmar !== p.id) { hapticSelection(); setAConfirmar(p.id); return; }
    setOcupado(true); setErro('');
    try {
      await tirarColaborador(playlistId, p.id);
      setAConfirmar(null);
      setFeito(`${nomeDaPessoa(p)} removed`);
      aoMudar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Could not remove this collaborator.'));
    } finally { setOcupado(false); }
  };

  const sair = async () => {
    if (ocupado) return;
    if (aConfirmar !== 'sair') { hapticSelection(); setAConfirmar('sair'); return; }
    setOcupado(true); setErro('');
    try {
      await sairDaPlaylist(playlistId);
      hapticNotification();
      onClose();
      aoSair();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Could not leave this playlist.'));
    } finally { setOcupado(false); }
  };

  const titulo = modo === 'convidar' ? 'Add collaborators' : dono ? 'Collaborators' : 'People in this playlist';

  return (
    <BottomSheet visible={visible} onClose={onClose} titulo={titulo}>
      <Text style={[type.caption, { marginBottom: spacing.md }]}>
        {modo === 'convidar'
          ? `Friends you add can add, remove and reorder songs. Up to ${MAXIMO_DE_COLABORADORES}.`
          : dono
            ? 'Collaborators can add, remove and reorder songs. Only you can rename or delete it.'
            : 'Everyone here can add, remove and reorder songs.'}
      </Text>

      {modo === 'lista' ? (
        <>
          <BottomSheetScrollView style={{ maxHeight: 340 }}>
            {ordem.length === 0 ? (
              <Text style={[type.caption, { textAlign: 'center', marginVertical: spacing.lg }]}>No collaborators yet.</Text>
            ) : ordem.map((p) => {
              const confirmar = aConfirmar === p.id;
              return (
                <View key={p.id} style={styles.linha}>
                  <FriendAvatar avatarUrl={p.avatarUrl} name={nomeDaPessoa(p)} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>
                      {nomeDaPessoa(p)}{p.id === eu ? ' (you)' : ''}
                    </Text>
                    <Text numberOfLines={1} style={type.caption}>
                      {p.papel === 'dono' ? 'Owner' : p.username ? `@${p.username}` : 'Collaborator'}
                    </Text>
                  </View>
                  {dono && p.papel === 'colaborador' ? (
                    <Pressable
                      onPress={() => void tirar(p)}
                      disabled={ocupado}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={confirmar ? `Confirm removing ${nomeDaPessoa(p)}` : `Remove ${nomeDaPessoa(p)}`}
                      style={[styles.tirar, confirmar && { backgroundColor: colors.danger }]}
                    >
                      {confirmar
                        ? <Text style={[type.caption, { color: '#fff', fontWeight: '700' }]}>Remove</Text>
                        : <Ionicons name="close" size={18} color={colors.textSecondary} />}
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </BottomSheetScrollView>

          {feito ? <Text style={[type.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>{feito}</Text> : null}
          {erro ? <Text style={[type.caption, { color: colors.danger, marginTop: spacing.sm }]}>{erro}</Text> : null}

          <View style={styles.rodape}>
            {dono ? (
              <Toque
                escala={ESCALA.botao}
                onPress={() => { hapticSelection(); setFeito(''); setErro(''); setModo('convidar'); }}
                disabled={vagas === 0}
                accessibilityLabel="Add collaborators"
                style={[styles.botao, { backgroundColor: tema.color }, vagas === 0 && { opacity: 0.45 }]}
              >
                <Ionicons name="person-add-outline" size={17} color={colors.bg} />
                <Text style={[type.body, { color: colors.bg, fontWeight: '700' }]}>
                  {vagas === 0 ? `Up to ${MAXIMO_DE_COLABORADORES} collaborators` : 'Add collaborators'}
                </Text>
              </Toque>
            ) : papel === 'colaborador' ? (
              <Toque
                escala={ESCALA.botao}
                onPress={() => void sair()}
                disabled={ocupado}
                accessibilityLabel={aConfirmar === 'sair' ? 'Confirm leaving this playlist' : 'Leave playlist'}
                style={[styles.botaoQuieto, aConfirmar === 'sair' && { backgroundColor: colors.danger }]}
              >
                {ocupado ? <ActivityIndicator size="small" color={colors.text} /> : (
                  <>
                    <Ionicons name="exit-outline" size={17} color={aConfirmar === 'sair' ? '#fff' : colors.danger} />
                    <Text style={[type.body, { fontWeight: '600', color: aConfirmar === 'sair' ? '#fff' : colors.danger }]}>
                      {aConfirmar === 'sair' ? 'Tap again to leave' : 'Leave playlist'}
                    </Text>
                  </>
                )}
              </Toque>
            ) : null}
          </View>
        </>
      ) : (
        <>
          {amigos === null ? (
            <ActivityIndicator color={colors.text} style={{ marginVertical: 24 }} />
          ) : paraConvidar.length === 0 ? (
            <View style={styles.vazio}>
              <Ionicons name="people-outline" size={24} color={colors.textTertiary} />
              <Text style={[type.caption, { textAlign: 'center' }]}>
                {(amigos ?? []).some((a) => a.status === 'accepted')
                  ? 'All your friends are already in this playlist.'
                  : 'Add friends in Social first, then bring them here.'}
              </Text>
            </View>
          ) : (
            <BottomSheetScrollView style={{ maxHeight: 340 }}>
              {paraConvidar.map((a) => {
                const marcado = escolhidos.includes(a.friendId);
                const cheio = !marcado && escolhidos.length >= vagas;
                return (
                  <Pressable
                    key={a.friendId}
                    disabled={cheio || ocupado}
                    onPress={() => { hapticSelection(); setEscolhidos((e) => (marcado ? e.filter((x) => x !== a.friendId) : [...e, a.friendId])); }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: marcado, disabled: cheio }}
                    style={({ pressed }) => [styles.linha, pressed && { backgroundColor: colors.surfacePressed }, cheio && { opacity: 0.45 }]}
                  >
                    <FriendAvatar avatarUrl={a.avatarUrl} name={a.name} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{a.name || `@${a.username}`}</Text>
                      <Text numberOfLines={1} style={type.caption}>@{a.username}</Text>
                    </View>
                    <Ionicons
                      name={marcado ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={marcado ? tema.color : colors.textTertiary}
                    />
                  </Pressable>
                );
              })}
            </BottomSheetScrollView>
          )}
          {erro ? <Text style={[type.caption, { color: colors.danger, marginTop: spacing.sm }]}>{erro}</Text> : null}
          <View style={styles.rodape}>
            <Toque
              escala={ESCALA.botao}
              onPress={() => void convidar()}
              disabled={!escolhidos.length || ocupado}
              accessibilityLabel="Add the chosen friends"
              style={[styles.botao, { backgroundColor: tema.color }, (!escolhidos.length || ocupado) && { opacity: 0.45 }]}
            >
              {ocupado ? <ActivityIndicator size="small" color={colors.bg} /> : (
                <Text style={[type.body, { color: colors.bg, fontWeight: '700' }]}>
                  {escolhidos.length ? `Add ${escolhidos.length}` : 'Choose friends'}
                </Text>
              )}
            </Toque>
            <Toque escala={ESCALA.botao} onPress={() => { setModo('lista'); setEscolhidos([]); setErro(''); }} style={styles.botaoQuieto}>
              <Text style={type.caption}>Back</Text>
            </Toque>
          </View>
        </>
      )}
    </BottomSheet>
  );
}

/**
 * As caras por baixo do título de uma playlist colaborativa: até três, umas
 * por cima das outras, e "Ana and 2 others". Tocar abre a folha das pessoas.
 * Sem colaboradores não desenha nada.
 */
export function CarasDaPlaylist({ pessoas, onPress, alinhar = 'center' }: {
  pessoas: readonly PessoaDaPlaylist[];
  onPress: () => void;
  /** Centradas por baixo do título no iPhone; encostadas ao texto no PC. */
  alinhar?: 'center' | 'flex-start';
}) {
  const resumo = resumoDasPessoas(pessoas);
  if (!resumo) return null;
  return (
    <Pressable
      onPress={() => { hapticSelection(); onPress(); }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Collaborative playlist with ${resumo.texto}`}
      style={({ pressed }) => [styles.caras, { alignSelf: alinhar }, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flexDirection: 'row' }}>
        {resumo.caras.map((p, i) => (
          <View key={p.id} style={[styles.cara, i > 0 && { marginLeft: -7 }]}>
            <FriendAvatar avatarUrl={p.avatarUrl} name={nomeDaPessoa(p)} size={22} />
          </View>
        ))}
      </View>
      <Text numberOfLines={1} style={[type.caption, { flexShrink: 1, color: colors.textSecondary }]}>{resumo.texto}</Text>
      <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // O alinhamento vem de quem a põe: estava preso à esquerda, e no iPhone
  // ficava colada à borda por baixo de um título centrado (7/10).
  caras: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4, maxWidth: '100%' },
  cara: { borderRadius: 13, borderWidth: 2, borderColor: colors.bg },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
    borderCurve: 'continuous',
  },
  tirar: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rodape: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 13,
    borderRadius: radii.lg,
    borderCurve: 'continuous',
  },
  botaoQuieto: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderRadius: radii.lg,
    borderCurve: 'continuous',
  },
  vazio: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
});
