import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
  cancelarDownloadDaLista, descarregarLista, limparTodosOsDownloads, podeDescarregar, situacaoDoDownloadDe, tirarDownloadsDaLista, useDownloadDaLista,
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

/** "1.1 GB", "312 MB": o espaço como as Definições o dizem. */
export function textoDoEspaco(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.max(mb > 0 ? 1 : 0, Math.round(mb))} MB`;
}

/**
 * Os downloads nas Definições › Library (25/11): quantas músicas estão no PC, o
 * espaço que ocupam, e "Remove all downloads". Lê a casca ao abrir e depois de
 * tirar tudo (um `read_dir` local). Sem a casca em Tauri, não aparece.
 */
export function DownloadsNasDefinicoes() {
  const ponte = typeof window !== 'undefined' ? (window as any).duotoneDesktop : undefined;
  const [disco, setDisco] = useState<{ musicas: number; bytes: number } | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const ler = React.useCallback(() => {
    void Promise.resolve(ponte?.audioNoDisco?.()).then((r: any) => {
      if (r) setDisco({ musicas: Array.isArray(r.descarregadas) ? r.descarregadas.length : 0, bytes: Number(r.bytesDescarregadas) || 0 });
    }).catch(() => {});
  }, [ponte]);
  React.useEffect(() => { ler(); }, [ler]);
  if (typeof ponte?.descarregarAudio !== 'function') return null;
  const musicas = disco?.musicas ?? 0;
  return <View style={styles.settingLine}>
    <View style={{ flex: 1, paddingRight: 16 }}>
      <Text style={styles.settingLabel}>Downloads</Text>
      <Text style={styles.settingDescription}>{musicas
        ? `${musicas} ${musicas === 1 ? 'song' : 'songs'} · ${textoDoEspaco(disco?.bytes ?? 0)} on this PC`
        : 'No songs downloaded on this PC yet.'}</Text>
    </View>
    {musicas ? <Button secondary onPress={() => setConfirmar(true)}>Remove all downloads</Button> : null}
    <Dialog open={confirmar} title="Remove all downloads?" onClose={() => setConfirmar(false)}>
      <Text style={styles.dialogBody}>The songs stay in your library and playlists, but they won't play without internet.</Text>
      <View style={styles.dialogActions}>
        <Button secondary onPress={() => setConfirmar(false)}>Cancel</Button>
        <Button danger onPress={() => { setConfirmar(false); void limparTodosOsDownloads().then(() => setTimeout(ler, 400)); }}>Remove all</Button>
      </View>
    </Dialog>
  </View>;
}

/** A linha por baixo da meta: a descarregar, o que já está no PC, ou que parou. */
export function LinhaDoDownloadDaLista({ chave, faixas }: { chave: string; faixas: readonly Track[] }) {
  const { linha } = useDownloadDaPlaylist(chave, faixas);
  if (!linha) return null;
  return <Text style={[styles.detailHeroMeta, { marginTop: 2 }]}>{linha}</Text>;
}
