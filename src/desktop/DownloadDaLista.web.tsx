import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
  cancelarDownloadDaLista, descarregarLista, podeDescarregar, situacaoDoDownloadDe, tirarDownloadsDaLista, useDownloadDaLista,
  useRevisaoDosDownloads,
} from '../lib/descarregarFaixa';
import { contarDaLista, downloadDaLista, TEXTO_DO_LOTE_PARADO, textoDoDescarregado, textoDoProgresso } from '../lib/downloadDaLista';
import { useConnectivity } from '../state/connectivity';
import type { Track } from '../types';
import { styles } from './estilos.web';
import { Button, Dialog, IconButton } from './ui.web';

/**
 * O download de uma playlist inteira no PC (25/11, "ouvir sem rede"): um botão
 * na fila do Play, como o do Spotify do PC, e não no "⋯" (que só aparece nas
 * playlists que se podem editar). As decisões são as do iPhone
 * (`lib/downloadDaLista.ts`, `lib/loteDeDownloads.ts`): uma música de cada vez,
 * com pausa, e o que já está no disco só se marca.
 *
 * Só existe com a casca em Tauri (`podeDescarregar`).
 */
function useDownloadDaPlaylist(chave: string, faixas: readonly Track[]) {
  useRevisaoDosDownloads();
  const lote = useDownloadDaLista(chave);
  const offline = useConnectivity((s) => s.offline);
  const descarregaveis = useMemo(() => faixas.filter(podeDescarregar), [faixas]);
  const conta = contarDaLista(descarregaveis.map(situacaoDoDownloadDe));
  const estado = lote.aCorrer ? 'a-descarregar' as const : downloadDaLista(conta);
  const linha = !descarregaveis.length ? null
    : lote.aCorrer ? textoDoProgresso(conta, lote.espera)
      : lote.parouPorFalhas ? TEXTO_DO_LOTE_PARADO
        : estado !== 'nenhum' && !offline ? textoDoDescarregado(conta) : null;
  return { tem: descarregaveis.length > 0, estado, linha, offline };
}

export function BotaoDoDownloadDaLista({ chave, nome, faixas }: { chave: string; nome: string; faixas: readonly Track[] }) {
  const { tem, estado } = useDownloadDaPlaylist(chave, faixas);
  const [tirar, setTirar] = useState(false);
  if (!tem) return null;
  const [icone, rotulo] = estado === 'a-descarregar' ? ['close-circle-outline', 'Cancel download'] as const
    : estado === 'completo' ? ['arrow-down-circle', 'Remove download'] as const
      : estado === 'parcial' ? ['arrow-down-circle-outline', 'Download the rest'] as const
        : ['arrow-down-circle-outline', 'Download'] as const;
  const carregar = () => {
    if (estado === 'a-descarregar') void cancelarDownloadDaLista(chave);
    else if (estado === 'completo') setTirar(true);
    // Sem rede o lote espera por ela sozinho; o botão não precisa de se calar.
    else descarregarLista(chave, faixas);
  };
  return <>
    <IconButton name={icone} label={rotulo} active={estado === 'completo' || estado === 'a-descarregar'} onPress={carregar} />
    <Dialog open={tirar} title="Remove download?" onClose={() => setTirar(false)}>
      <Text style={styles.dialogBody}>{`The songs stay in "${nome}", but they won't play without internet. A song downloaded from another playlist also leaves this PC.`}</Text>
      <View style={styles.dialogActions}>
        <Button secondary onPress={() => setTirar(false)}>Cancel</Button>
        <Button danger onPress={() => { setTirar(false); void cancelarDownloadDaLista(chave).then(() => tirarDownloadsDaLista(faixas)); }}>Remove</Button>
      </View>
    </Dialog>
  </>;
}

/** A linha por baixo da meta: a descarregar, o que já está no PC, ou que parou. */
export function LinhaDoDownloadDaLista({ chave, faixas }: { chave: string; faixas: readonly Track[] }) {
  const { linha } = useDownloadDaPlaylist(chave, faixas);
  if (!linha) return null;
  return <Text style={[styles.detailHeroMeta, { marginTop: 2 }]}>{linha}</Text>;
}
