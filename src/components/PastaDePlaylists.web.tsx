import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { styles } from '../desktop/estilos.web';
import { marcar } from '../desktop/ui.web';
import { COR, RAIO } from '../desktop/tokens.web';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { FRASES_DAS_PASTAS } from '../lib/pastasDePlaylists';

/**
 * Uma pasta de playlists no PC (16/11): o mesmo desenho do iPhone, um quadrado
 * escuro com as quatro primeiras capas em grelha. As capas são `<img>` sem
 * Referer, como as da pasta dos álbuns. Recebe o botão direito e o largar de
 * uma playlist arrastada (`PlaylistPages.web.tsx`), por isso aceita os eventos
 * do arrastar do HTML no próprio cartão.
 */
export function PastaDePlaylists({ nome, capas, quantas, lado, onPress, onLongPress, eventos, alvo = false }: {
  nome: string;
  capas: readonly string[];
  quantas: number;
  lado: number;
  onPress: () => void;
  onLongPress?: () => void;
  /** O botão direito e o arrastar do HTML (onDragOver, onDrop...). */
  eventos?: Record<string, unknown>;
  /** Uma playlist arrastada está por cima: o cartão acende. */
  alvo?: boolean;
}) {
  const dentro = lado * 0.78;
  const espaco = Math.round(lado * 0.05);
  const mini = (dentro - espaco) / 2;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${nome}, folder, ${FRASES_DAS_PASTAS.quantas(quantas)}`}
      {...marcar('cartao')}
      {...(eventos as any)}
      style={[styles.playlistCard, { width: lado }]}
    >
      <View style={{
        width: lado, height: lado, borderRadius: RAIO.superficie, backgroundColor: COR.elevado,
        alignItems: 'center', justifyContent: 'center',
        outline: alvo ? `2px solid ${COR.texto}` : undefined, outlineOffset: 2,
      } as any}>
        <View style={{ width: dentro, height: dentro, flexDirection: 'row', flexWrap: 'wrap', gap: espaco } as any}>
          {[0, 1, 2, 3].map((i) => {
            const uri = capaParaLista(capas[i] ?? null);
            return (
              <div key={i} style={{ width: mini, height: mini, borderRadius: RAIO.cartao, overflow: 'hidden', background: '#1b1b22' }}>
                {uri ? <img src={uri} alt="" referrerPolicy="no-referrer" decoding="async" draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
              </div>
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="folder-outline" size={14} color={COR.textoMedio} style={{ marginTop: 12 }} />
        <Text numberOfLines={1} style={[styles.playlistTitle, { flex: 1 }]}>{nome}</Text>
      </View>
      <Text numberOfLines={1} style={styles.playlistMeta}>{FRASES_DAS_PASTAS.quantas(quantas)}</Text>
    </Pressable>
  );
}
