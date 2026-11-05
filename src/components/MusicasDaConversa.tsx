import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { musicasDaConversa } from '../api/social';
import { addTracksToPlaylist, createPlaylist } from '../api/playlists';
import { usePlayer } from '../state/player';
import { avisarErro, avisarFeito, avisarInfo, contarMusicas } from '../lib/avisoDeRemocao';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { hapticSelection } from '../lib/haptics';
import {
  MINIMO_PARA_A_BARRA, nomeDaPlaylistDaConversa, origemDaConversa, type Conversa,
} from '../lib/musicasDaConversa';
import { PromptSheet } from './PromptSheet';
import { colors } from './socialTokens';
import type { Track } from '../types';

const web = Platform.OS === 'web';

/** Uma pílula como a do "Start a Jam" do cabeçalho do chat. */
function Pilula({ rotulo, icone, texto, aCarregar, desligada, onPress }: {
  rotulo: string; icone: React.ComponentProps<typeof Ionicons>['name']; texto: string;
  aCarregar: boolean; desligada: boolean; onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={rotulo} accessibilityState={{ disabled: desligada, busy: aCarregar }}
      disabled={desligada} onPress={() => { if (!web) hapticSelection(); onPress(); }}
      style={({ pressed, hovered }: any) => [{
        flexDirection: 'row', alignItems: 'center', gap: 7, height: 34, paddingHorizontal: 14, borderRadius: 17,
        borderWidth: 1, borderColor: colors.borderStrong, opacity: desligada && !aCarregar ? 0.5 : 1,
      }, hovered && { backgroundColor: colors.surface }, pressed && { opacity: 0.7 }]}>
      {aCarregar
        ? <ActivityIndicator size="small" color={colors.text} style={{ width: 15, height: 15 }} />
        : <Ionicons name={icone} size={15} color={colors.text} />}
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{texto}</Text>
    </Pressable>
  );
}

/**
 * No topo de uma conversa com duas ou mais músicas (5/11, `lib/musicasDaConversa.ts`):
 * **Play all** põe na fila todas as músicas que os dois (ou o grupo) mandaram,
 * pela ordem da conversa, e **Save as playlist** guarda-as numa playlist tua,
 * com um nome que se pode mudar. As músicas pedem-se no toque, nunca ao abrir.
 * `carregadas` são as da página que já se vê: decide se a barra aparece.
 */
export function MusicasDaConversa({ alvo, conversa, carregadas }: {
  alvo: { kind: 'friend' | 'group'; id: string };
  conversa: Conversa;
  carregadas: number;
}) {
  const [aJuntar, setAJuntar] = useState<'tocar' | 'guardar' | null>(null);
  const [paraGuardar, setParaGuardar] = useState<Track[] | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  if (carregadas < MINIMO_PARA_A_BARRA) return null;

  const juntar = async (para: 'tocar' | 'guardar') => {
    if (aJuntar) return;
    setAJuntar(para);
    try {
      const faixas = await musicasDaConversa(alvo);
      if (!faixas.length) { avisarInfo('No songs in this chat yet.'); return; }
      // A lista toca pela ordem da conversa, e com o shuffle aceso baralha-se
      // como qualquer outra (`tocarLista` com a origem, como uma playlist).
      if (para === 'tocar') await usePlayer.getState().tocarLista(faixas, false, false, origemDaConversa(conversa));
      else setParaGuardar(faixas);
    } catch (e) {
      avisarErro(mensagemDeErro(e, "Couldn't load the songs from this chat."));
    } finally {
      setAJuntar(null);
    }
  };

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Pilula rotulo="Play all the songs from this chat" icone="play" texto="Play all"
          aCarregar={aJuntar === 'tocar'} desligada={!!aJuntar} onPress={() => void juntar('tocar')} />
        <Pilula rotulo="Save the songs from this chat as a playlist" icone="add" texto="Save as playlist"
          aCarregar={aJuntar === 'guardar'} desligada={!!aJuntar} onPress={() => void juntar('guardar')} />
      </View>
      <PromptSheet
        visible={!!paraGuardar}
        title="Save chat as playlist"
        placeholder="Playlist name"
        initialValue={nomeDaPlaylistDaConversa(conversa)}
        submitLabel="Save"
        loading={aGuardar}
        onClose={() => setParaGuardar(null)}
        onSubmit={async (nome) => {
          const faixas = paraGuardar;
          if (!nome.trim() || !faixas?.length || aGuardar) return;
          setAGuardar(true);
          try {
            const nova = await createPlaylist(nome);
            await addTracksToPlaylist(nova.id, faixas);
            avisarFeito(`Saved “${nome.trim()}” · ${contarMusicas(faixas.length)}`);
            setParaGuardar(null);
          } catch (e) {
            avisarErro(mensagemDeErro(e, "Couldn't save the songs from this chat."));
          } finally {
            setAGuardar(false);
          }
        }}
      />
    </>
  );
}
