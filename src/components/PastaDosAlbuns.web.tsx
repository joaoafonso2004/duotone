import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { styles } from '../desktop/estilos.web';
import { marcar } from '../desktop/ui.web';
import { RAIO } from '../desktop/tokens.web';
import {
  CAMADAS_DA_PASTA, CAMADAS_DA_PASTA_ABERTA, capasDaPasta, FRASES_DOS_ALBUNS, LADO_DA_CAPA_NA_PASTA, type AlbumGuardado,
} from '../lib/albunsGuardados';

/**
 * A pasta dos álbuns no PC (15/11): o primeiro cartão da grelha das Playlists,
 * do tamanho dos outros, com as três capas mais recentes a flutuar em camadas
 * (as mesmas CAMADAS_DA_PASTA do iPhone). As capas são `<img>` sem Referer,
 * como as do artista (os servidores das capas do YouTube Music davam 429 com ele).
 *
 * Com o rato em cima, a pasta abre-se (24/11, CAMADAS_DA_PASTA_ABERTA): cada capa leva
 * no style os dois lugares (`--rodar`, `--dx`...) e é o CSS da casca (`pasta-capa`) que
 * passa de um ao outro, só com transform e opacidade, como o mosaico das playlists.
 */
export function PastaDosAlbuns({ albuns, lado, onPress }: {
  albuns: readonly AlbumGuardado[];
  lado: number;
  onPress: () => void;
}) {
  // Sempre três camadas (16/11): os lugares que faltam são cartões vazios atrás.
  const capas = capasDaPasta(albuns);
  const camadas = CAMADAS_DA_PASTA;
  const ladoDaCapa = (lado * LADO_DA_CAPA_NA_PASTA) / 100;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${FRASES_DOS_ALBUNS.pasta}, ${FRASES_DOS_ALBUNS.guardados(albuns.length)}`}
      {...marcar('cartao')}
      style={[styles.playlistCard, { width: lado }]}
    >
      <View style={{ width: lado, height: lado }}>
        {capas.map(({ capa, vazia }, i) => {
          const c = camadas[i];
          const aberta = CAMADAS_DA_PASTA_ABERTA[i];
          return (
            <div
              key={i}
              data-dt="pasta-capa"
              style={{
                position: 'absolute', width: ladoDaCapa, height: ladoDaCapa,
                left: (lado * c.esquerda) / 100, top: (lado * c.topo) / 100,
                '--rodar': `${c.rodar}deg`, '--opacidade': c.opacidade,
                '--dx': `${((lado * aberta.direita) / 100).toFixed(1)}px`, '--dy': `${((lado * aberta.baixo) / 100).toFixed(1)}px`,
                '--rodar-aberta': `${aberta.rodar}deg`,
                borderRadius: RAIO.cartao, overflow: 'hidden', background: vazia ? '#16161b' : '#1b1b22',
                border: vazia ? '1px solid rgba(255,255,255,.06)' : undefined,
                boxShadow: '0 10px 26px rgba(0,0,0,.45)',
              } as React.CSSProperties}
            >
              {capa ? (
                <img src={capa} alt="" referrerPolicy="no-referrer" decoding="async" draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : null}
            </div>
          );
        })}
      </View>
      <Text numberOfLines={1} style={styles.playlistTitle}>{`${FRASES_DOS_ALBUNS.pasta} ›`}</Text>
      <Text numberOfLines={1} style={styles.playlistMeta}>{FRASES_DOS_ALBUNS.guardados(albuns.length)}</Text>
    </Pressable>
  );
}
