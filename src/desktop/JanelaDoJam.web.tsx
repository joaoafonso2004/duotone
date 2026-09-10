import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { presentes } from '../lib/sessaoViva';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSocial } from '../state/social';
import { FriendAvatar } from '../components/FriendAvatar';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { Button, Dialog, Artwork, desktop } from './ui.web';
import { COR, ESP, FONT, RAIO, TIPO } from './tokens.web';

/**
 * O Jam do Windows.
 *
 * A sincronização já era partilhada com o iPhone; faltava uma porta no
 * desktop. Esta janela dá acesso às funções que tornam a sessão utilizável e
 * deixa explícito o caminho novo do Discord.
 */
export function JanelaDoJam({ open, onClose, notify }: {
  open: boolean;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const sessao = useOuvirJuntos((s) => s.sessao);
  const todos = useOuvirJuntos((s) => s.membros);
  const fila = useOuvirJuntos((s) => s.fila);
  const euId = useOuvirJuntos((s) => s.euId);
  const souAnfitriao = useOuvirJuntos((s) => s.souAnfitriao);
  const darControlo = useOuvirJuntos((s) => s.darControlo);
  const rodarAux = useOuvirJuntos((s) => s.rodarAux);
  const convidarMais = useOuvirJuntos((s) => s.convidarMais);
  const retirarSugestao = useOuvirJuntos((s) => s.retirarSugestao);
  const abandonar = useOuvirJuntos((s) => s.abandonar);
  const amigos = useSocial((s) => s.friends);
  const [convidados, setConvidados] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { if (!open) setConvidados([]); }, [open]);
  React.useEffect(() => { if (open && !sessao) onClose(); }, [open, sessao, onClose]);

  const membros = presentes(todos, Date.now());
  const anfitriao = souAnfitriao();
  const podeAlternarAux = !!sessao?.auxDe || membros.some((m) => m.userId !== euId);
  const nomeDe = (id: string) => id === euId
    ? 'You'
    : amigos.find((amigo) => amigo.friendId === id)?.name ?? 'Someone';
  const porConvidar = amigos.filter((amigo) =>
    amigo.status === 'accepted' && !membros.some((membro) => membro.userId === amigo.friendId));

  const sair = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await abandonar();
      onClose();
    } catch {
      notify(anfitriao ? 'Could not end the Jam.' : 'Could not leave the Jam.');
    } finally {
      setBusy(false);
    }
  };

  return <Dialog open={open && !!sessao} title="Jam" onClose={onClose} width={620}>
    <View style={styles.discordNote}>
      <Ionicons name="logo-discord" size={20} color={COR.texto} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.noteTitle}>Open on Discord</Text>
        <Text style={styles.noteBody}>Friends with Duotone can click Join on your profile and enter this Jam in sync.</Text>
      </View>
      <View style={styles.live}><View style={styles.dot} /><Text style={styles.liveText}>JOINABLE</Text></View>
    </View>

    <ScrollView style={{ maxHeight: 510 }} contentContainerStyle={{ paddingRight: 4 }}>
      <Text style={styles.section}>IN THE JAM</Text>
      <View style={styles.list}>
        {membros.map((membro) => {
          const amigo = amigos.find((item) => item.friendId === membro.userId);
          return <View key={membro.userId} style={styles.row}>
            <FriendAvatar avatarUrl={amigo?.avatarUrl ?? null} name={nomeDe(membro.userId)} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.title}>{nomeDe(membro.userId)}{sessao?.hostId === membro.userId ? ' · host' : ''}</Text>
              <Text style={styles.meta}>{membro.pronta ? 'Ready' : `Loading · ${membro.percentagem}%`}</Text>
            </View>
            <Ionicons name={membro.pronta ? 'checkmark-circle' : 'ellipsis-horizontal'} size={18}
              color={membro.pronta ? COR.ok : COR.textoFraco} />
          </View>;
        })}
      </View>

      {anfitriao ? <>
        <Text style={styles.section}>CONTROL</Text>
        <View style={styles.setting}>
          <View style={{ flex: 1 }}><Text style={styles.title}>Guests can control</Text><Text style={styles.meta}>Play, pause and skip. Everyone can always add songs.</Text></View>
          <Switch value={!!sessao?.convidadosControlam} onValueChange={(value) => void darControlo(value).catch(() => notify('Could not change Jam control.'))} />
        </View>
        <View style={[styles.setting, !podeAlternarAux && { opacity: .55 }]}>
          <View style={{ flex: 1 }}><Text style={styles.title}>Pass the aux</Text><Text style={styles.meta}>{podeAlternarAux ? 'One song each, in turn.' : 'Another person needs to join first.'}</Text></View>
          <Switch value={!!sessao?.auxDe} disabled={!podeAlternarAux} onValueChange={(value) => void rodarAux(value).catch(() => notify('Could not pass the aux.'))} />
        </View>
      </> : null}

      {anfitriao && porConvidar.length ? <>
        <Text style={styles.section}>INVITE IN DUOTONE</Text>
        <View style={styles.list}>
          {porConvidar.map((amigo) => {
            const enviado = convidados.includes(amigo.friendId);
            return <View key={amigo.friendId} style={styles.row}>
              <FriendAvatar avatarUrl={amigo.avatarUrl} name={amigo.name} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.title}>{amigo.name}</Text><Text style={styles.meta}>{enviado ? 'Invited' : amigo.online ? 'Online' : 'Offline'}</Text></View>
              <Button secondary disabled={enviado} onPress={() => {
                setConvidados((actual) => [...actual, amigo.friendId]);
                void convidarMais([amigo.friendId]).catch(() => {
                  setConvidados((actual) => actual.filter((id) => id !== amigo.friendId));
                  notify(`Could not invite ${amigo.name}.`);
                });
              }}>{enviado ? 'Sent' : 'Invite'}</Button>
            </View>;
          })}
        </View>
      </> : null}

      <Text style={styles.section}>UP NEXT</Text>
      {fila.length ? <View style={styles.list}>{fila.map((item) => <View key={item.id} style={styles.row}>
        <Artwork track={item.track} size={38} />
        <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.title}>{tituloDaFaixa(item.track)}</Text><Text numberOfLines={1} style={styles.meta}>{displayArtist(item.track)} · {nomeDe(item.postoPor)}</Text></View>
        {(anfitriao || item.postoPor === euId) ? <Button secondary onPress={() => void retirarSugestao(item.id).catch(() => notify('Could not remove this song.'))}>Remove</Button> : null}
      </View>)}</View> : <Text style={styles.empty}>Choose any song in Duotone to add it to the shared queue.</Text>}
    </ScrollView>

    <View style={styles.actions}>
      <Button secondary onPress={onClose}>Keep listening</Button>
      <Button danger disabled={busy} onPress={() => void sair()}>{busy ? 'Please wait…' : anfitriao ? 'End Jam' : 'Leave Jam'}</Button>
    </View>
  </Dialog>;
}

const styles = StyleSheet.create({
  discordNote: { flexDirection: 'row', alignItems: 'center', gap: ESP.md, padding: ESP.lg, borderWidth: 1, borderColor: COR.linha, borderRadius: RAIO.cartao, backgroundColor: COR.elevado, marginBottom: ESP.md },
  noteTitle: { ...TIPO.corpo, color: COR.texto, fontWeight: '650' as any },
  noteBody: { ...TIPO.legenda, color: COR.textoMedio, lineHeight: 17, marginTop: 2 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COR.ok },
  liveText: { fontFamily: FONT.mono, fontSize: 9, letterSpacing: 1, color: COR.ok },
  section: { ...TIPO.micro, color: COR.textoFraco, marginTop: ESP.lg, marginBottom: ESP.sm },
  list: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: COR.linhaSuave },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: ESP.md, paddingVertical: ESP.sm },
  title: { ...TIPO.corpo, color: COR.texto, fontWeight: '550' as any },
  meta: { ...TIPO.legenda, color: COR.textoMedio, marginTop: 3 },
  setting: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: ESP.lg, paddingVertical: ESP.sm, borderBottomWidth: 1, borderBottomColor: COR.linhaSuave },
  empty: { ...TIPO.legenda, color: desktop.dim, paddingVertical: ESP.lg },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: ESP.sm, marginTop: ESP.xl },
});
