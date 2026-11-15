import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useShallow } from 'zustand/react/shallow';
import { BottomSheet, BottomSheetScrollView } from './BottomSheet';
import { ATALHO } from './PecaDaGaveta';
import { mudarGaveta, useGaveta } from '../state/gaveta';
import { useRecentes } from '../state/recentes';
import { useSocial } from '../state/social';
import { usePlaylists } from '../state/playlists';
import {
  ATALHOS, CONTROLOS, espacoAtivo, juntar, temPeca, type Controlo, type PecaNova,
} from '../lib/gaveta';
import { chaveDoRecente, type TipoDeRecente } from '../lib/recentes';
import { avisarInfo } from '../lib/avisoDeRemocao';
import { hapticSelection } from '../lib/haptics';
import { colors, radii } from '../theme';

type Nova = PecaNova;
type Item = {
  chave: string;
  nome: string;
  sub: string;
  peca: Nova;
  icone?: React.ComponentProps<typeof Ionicons>['name'];
  capa?: string | null;
  redonda?: boolean;
};

const CATEGORIAS = ['Live', 'Music', 'Friends', 'Controls', 'Places'] as const;
type Categoria = typeof CATEGORIAS[number];

const CONTROLO: Record<Controlo, { nome: string; sub: string; icone: React.ComponentProps<typeof Ionicons>['name'] }> = {
  temporizador: { nome: 'Sleep timer', sub: 'Tap to set 15 min, 30 min, 1 h or the end of the song', icone: 'moon-outline' },
  privado: { nome: 'Private listening', sub: 'Friends don’t see what you play', icone: 'eye-off-outline' },
  velocidade: { nome: 'Speed', sub: 'Tap to go through 1×, 1.1×, 1.25×, 1.5× and 0.9×', icone: 'speedometer-outline' },
  shuffle: { nome: 'Shuffle', sub: 'Off, on or smart', icone: 'shuffle' },
  radio: { nome: 'Radio', sub: 'Songs like the one playing', icone: 'radio-outline' },
};

const NOME_DA_ORIGEM: Record<string, string> = {
  playlist: 'Playlist', guardadas: 'Playlist', artista: 'Artist', album: 'Album', mistura: 'Mix', prateleira: 'Mix',
};

/**
 * O que se pode pôr na gaveta (6.0.4): o que está a tocar e o PC, a música que
 * se reabre (o "Jump back in" e as playlists), os amigos, os controlos e os
 * sítios da app. Fica aberta para se acrescentar várias de seguida, e marca o
 * que já está no espaço.
 */
export function FolhaDaGaveta() {
  const { aberta, gaveta } = useGaveta(useShallow((s) => ({ aberta: s.acrescentar, gaveta: s.gaveta })));
  const [categoria, setCategoria] = useState<Categoria>('Music');
  const recentes = useRecentes((s) => s.lista);
  const playlists = usePlaylists((s) => s.items);
  const amigos = useSocial((s) => s.friends);
  const espaco = gaveta ? espacoAtivo(gaveta) : null;

  const itens = useMemo<Item[]>(() => {
    switch (categoria) {
      case 'Live': return [
        { chave: 'agora', nome: 'Now playing', sub: 'Cover and play/pause', icone: 'musical-notes-outline', peca: { tipo: 'agora' } },
        { chave: 'pc', nome: 'Your PC', sub: 'Continue here what it plays', icone: 'desktop-outline', peca: { tipo: 'pc' } },
      ];
      case 'Music': {
        const vistos = new Set<string>();
        const lista: Item[] = [];
        const juntarOrigem = (o: { tipo: TipoDeRecente; nome: string; id?: string; capas: readonly string[] }) => {
          const chave = chaveDoRecente(o);
          if (vistos.has(chave)) return;
          vistos.add(chave);
          lista.push({
            chave, nome: o.nome, sub: NOME_DA_ORIGEM[o.tipo] ?? '', capa: o.capas[0] ?? null, redonda: o.tipo === 'artista',
            icone: o.tipo === 'guardadas' ? 'heart' : o.tipo === 'artista' ? 'person' : 'musical-notes',
            peca: { tipo: 'origem', origem: { tipo: o.tipo, nome: o.nome, ...(o.id ? { id: o.id } : {}), capas: o.capas.slice(0, 4) } },
          });
        };
        juntarOrigem({ tipo: 'guardadas', nome: 'Liked Songs', capas: [] });
        juntarOrigem({ tipo: 'prateleira', nome: 'Daily mix', id: 'doDia', capas: [] });
        for (const r of recentes) juntarOrigem(r);
        for (const p of playlists) juntarOrigem({ tipo: 'playlist', nome: p.name, id: p.id, capas: p.artworks ?? [] });
        return lista;
      }
      case 'Friends': return amigos
        .filter((f) => f.status === 'accepted')
        .map((f) => ({
          chave: `amigo:${f.friendId}`, nome: f.name || f.username, sub: f.online ? 'Online' : `@${f.username}`,
          capa: f.avatarUrl, redonda: true, icone: 'person' as const,
          peca: { tipo: 'amigo' as const, amigoId: f.friendId, nome: f.name || f.username, avatar: f.avatarUrl },
        }));
      case 'Controls': return CONTROLOS.map((c) => ({
        chave: c, nome: CONTROLO[c].nome, sub: CONTROLO[c].sub, icone: CONTROLO[c].icone, peca: { tipo: 'controlo' as const, controlo: c },
      }));
      case 'Places': return ATALHOS.map((a) => ({
        chave: a, nome: ATALHO[a].nome, sub: '', icone: ATALHO[a].icone, peca: { tipo: 'atalho' as const, atalho: a },
      }));
    }
  }, [categoria, recentes, playlists, amigos]);

  const acrescentar = (item: Item) => {
    const g = useGaveta.getState().gaveta;
    if (!g) return;
    const r = juntar(g, g.ativo, item.peca);
    if (r.motivo === 'cheia') { avisarInfo('This space is full', 'Remove a tile to make room.'); return; }
    if (r.motivo === 'repetida') return;
    hapticSelection();
    mudarGaveta(() => r.gaveta);
  };

  return (
    <BottomSheet visible={aberta} onClose={() => useGaveta.setState({ acrescentar: false })}
      titulo={espaco ? `Add to ${espaco.nome}` : 'Add'} detentes={[0.7, 1]}>
      <View accessibilityRole="tablist" style={styles.categorias}>
        {CATEGORIAS.map((c) => (
          <Pressable key={c} accessibilityRole="tab" accessibilityState={{ selected: c === categoria }} hitSlop={6}
            onPress={() => { hapticSelection(); setCategoria(c); }} style={styles.categoria}>
            <Text style={[styles.categoriaTexto, c === categoria && { color: colors.text }]}>{c}</Text>
            <View style={[styles.luz, c !== categoria && { opacity: 0 }]} />
          </Pressable>
        ))}
      </View>
      <BottomSheetScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {itens.length === 0 ? (
          <Text style={styles.nada}>{categoria === 'Friends' ? 'Add friends in Social and they show up here.' : 'Nothing here yet.'}</Text>
        ) : itens.map((item) => {
          const ja = espaco ? temPeca(espaco, item.peca) : false;
          return (
            <Pressable key={item.chave} accessibilityRole="button" disabled={ja}
              accessibilityLabel={ja ? `${item.nome}, added` : `Add ${item.nome}`}
              onPress={() => acrescentar(item)} style={({ pressed }) => [styles.linha, pressed && { opacity: 0.7 }]}>
              <View style={[styles.miniatura, item.redonda && { borderRadius: 20 }]}>
                {item.capa ? <Image source={{ uri: item.capa }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  : item.icone ? <Ionicons name={item.icone} size={19} color={colors.text} /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={styles.nome}>{item.nome}</Text>
                {item.sub ? <Text numberOfLines={1} style={styles.sub}>{item.sub}</Text> : null}
              </View>
              <View style={[styles.botao, ja && styles.botaoFeito]}>
                <Ionicons name={ja ? 'checkmark' : 'add'} size={18} color={ja ? colors.textSecondary : '#060608'} />
              </View>
            </Pressable>
          );
        })}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  categorias: {
    flexDirection: 'row', gap: 16, marginBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(233,234,238,0.12)',
  },
  categoria: { height: 34, justifyContent: 'center' },
  categoriaTexto: { color: '#A5A6AB', fontSize: 14, fontWeight: '700' },
  luz: {
    position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, borderRadius: 1, backgroundColor: '#E9EAEE',
    shadowColor: '#E9EAEE', shadowOpacity: 0.6, shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
  },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  miniatura: {
    width: 40, height: 40, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: '#22232A',
    alignItems: 'center', justifyContent: 'center',
  },
  nome: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  botao: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E9EAEE', alignItems: 'center', justifyContent: 'center' },
  botaoFeito: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,234,238,0.25)' },
  nada: { color: colors.textSecondary, fontSize: 14, paddingVertical: 20, textAlign: 'center' },
});
