import { useOfflineMode } from '../hooks/useOfflineMode';
import { RecommendationPreferences } from './RecommendationPreferences';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { useWindowDimensions } from 'react-native';
import { hapticNotification } from '../lib/haptics';
import type { Track } from '../types';
import { contextoParaAnalytics, type DiscoveryContext } from '../lib/contextoDaDescoberta';
import { registar } from '../lib/eventos';
import { menuDaFaixa, type AcaoDoMenu, type IdDaAcao } from '../lib/menuDaFaixa';
import { alternarDownload, downloadNoMenuDe, podeDescarregar, tocaSemRede, useRevisaoDosDownloads } from '../lib/descarregarFaixa';
import { alternarGuardada, garantirGuardadas } from '../lib/guardarFaixa';
import { savedKey, useSaved } from '../state/saved';
import { usePlayer } from '../state/player';
import { irParaNoIphone } from '../navigation/RootNavigator';
import { MenuFlutuante, type Ancora } from './MenuFlutuante';
import type { PlayerAction } from './PlayerActionsSheet';
import { ancoraDoUltimoToque } from '../lib/ultimoToque';
import { ShareFriendSheet } from './ShareFriendSheet';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { avisarErro } from '../lib/avisoDeRemocao';
import { mensagemDeErro } from '../lib/mensagemDeErro';

/** Uma linha de um menu que NÃO é de uma faixa -- as opções de uma playlist. */
export interface SheetAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  track: Track | null;
  onClose: () => void;
  /**
   * Só com `track` nulo: um menu que não é de uma faixa (as opções de uma
   * playlist). Os de uma faixa não recebem linhas -- saem todos do
   * `menuDaFaixa`, iguais aos do leitor, da fila e do PC.
   */
  actions?: SheetAction[];
  /**
   * Só com `track` nulo: A QUEM é o menu (28/9). Com doze cartões de playlist
   * iguais é fácil tocar no errado, e o menu não dizia de qual era.
   */
  cabecalho?: { titulo: string; subtitulo?: string; capas: string[] } | null;
  discoveryContext?: DiscoveryContext | null;
  /** Aberto dentro de uma playlist: acrescenta "Remove from this playlist". */
  playlist?: { podeEditar: boolean; aoTirar: (track: Track) => void } | null;
  /** Depois de guardar ou tirar da biblioteca, para a lista que o abriu reler. */
  aoMudarBiblioteca?: () => void;
}

/**
 * O menu de uma faixa nas listas do iPhone (toque longo e "…").
 *
 * Desde 5/10 é o MENU junto ao dedo (`MenuFlutuante`), como o "⋯" do leitor e
 * as escolhas das Definições (auditoria de consistência M1): o mesmo gesto
 * abria uma folha de baixo numa lista e um menu no leitor. As folhas ficam
 * para as tarefas que vêm a seguir (Add to playlist, Share, Recommendations).
 *
 * As linhas, a ordem e os nomes vêm de lib/menuDaFaixa.ts. Cada ecrã tinha a
 * sua lista -- a Pesquisa sem "Remove", as Songs sem "Save", a playlist sem
 * "Add to playlist" e com um "Remover da playlist" em português -- e agora
 * todos pedem este e passam só o que é deles: a playlist onde está, e o que
 * reler depois de guardar.
 */
export function TrackActionsSheet({ visible, track, onClose, actions = [], cabecalho, discoveryContext, playlist, aoMudarBiblioteca }: Props) {
  const offline = useOfflineMode();
  const { width, height } = useWindowDimensions();
  const [recommendationTrack, setRecommendationTrack] = React.useState<Track | null>(null);
  const [paraPartilhar, setParaPartilhar] = React.useState<Track | null>(null);
  const [paraPlaylist, setParaPlaylist] = React.useState<Track | null>(null);
  const lida = useSaved((s) => s.loaded);
  const naLoja = useSaved((s) => (track ? s.keys.has(savedKey(track)) : false));
  useRevisaoDosDownloads();

  React.useEffect(() => { if (visible && track) garantirGuardadas(); }, [visible, track]);

  const nomeDoArtista = track ? displayArtist(track) : '';
  const menu: AcaoDoMenu[] = track ? menuDaFaixa({
    plataforma: 'ios',
    onde: 'lista',
    semRede: offline,
    tocaSemRede: tocaSemRede(track),
    guardada: lida ? naLoja : null,
    podeDescarregar: podeDescarregar(track),
    download: downloadNoMenuDe(track),
    temArtista: !!nomeDoArtista && nomeDoArtista !== 'Unknown artist',
    playlist: playlist ? { podeEditar: playlist.podeEditar } : null,
  }) : [];

  const fazer = (id: IdDaAcao) => {
    const t = track;
    if (!t) return;
    onClose();
    const player = usePlayer.getState();
    switch (id) {
      case 'tocar-agora': void player.tocarMusica(t, [t], true, discoveryContext ?? undefined); return;
      case 'tocar-a-seguir': player.playNext(t); return;
      case 'por-na-fila': player.addToQueue(t); return;
      case 'guardar':
        void alternarGuardada(t).then((ficou) => {
          // Tirar já vibra com o aviso do "Undo" (3/10).
          if (ficou) hapticNotification();
          if (ficou && discoveryContext) registar('recomendacao_guardada', contextoParaAnalytics(discoveryContext));
          aoMudarBiblioteca?.();
        }).catch((e: any) => avisarErro(mensagemDeErro(e, 'Could not update your library.')));
        return;
      case 'por-em-playlist': setParaPlaylist(t); return;
      case 'ver-artista':
        irParaNoIphone({ tipo: 'artista', nome: nomeDoArtista });
        return;
      case 'partilhar': setParaPartilhar(t); return;
      case 'descarregar': void alternarDownload(t); return;
      case 'recomendacoes': setRecommendationTrack(t); return;
      case 'tirar-da-playlist': playlist?.aoTirar(t); return;
      case 'tirar-da-fila': return;
    }
  };

  // A ação corre DEPOIS de o menu sair do ecrã (o `aoFechado` do
  // MenuFlutuante): abrir uma folha enquanto a janela do menu ainda fecha
  // deixava uma janela órfã a engolir os toques. A função guardada é a deste
  // desenho, com a faixa de quando se escolheu -- o pai pode já a ter largado.
  const pendente = React.useRef<(() => void) | null>(null);
  const escolher = (f: () => void) => { pendente.current = f; onClose(); };
  const accoes: PlayerAction[] = track
    ? menu.map((a) => ({ label: a.rotulo, icon: a.icone as any, destructive: a.destrutiva, motivo: a.indisponivel, onPress: () => escolher(() => fazer(a.id)) }))
    : actions.map((a) => ({ label: a.label, icon: a.icon, destructive: a.destructive, onPress: () => escolher(a.onPress) }));
  const titulo = track
    ? `${tituloDaFaixa(track)}${track.artist ? ` · ${nomeDoArtista}` : ''}`
    : cabecalho ? `${cabecalho.titulo}${cabecalho.subtitulo ? ` · ${cabecalho.subtitulo}` : ''}` : null;
  // Nasce junto ao dedo que o pediu (5/10, lib/ultimoToque.ts), como o "⋯" do leitor.
  const ancora = React.useMemo<Ancora | null>(
    () => (visible ? ancoraDoUltimoToque({ largura: width, altura: height }) : null),
    // Só ao abrir: rodar o ecrã com o menu aberto não o muda de sítio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible],
  );

  return (
    <>
      <MenuFlutuante
        visivel={visible}
        ancora={ancora}
        accoes={accoes}
        titulo={titulo}
        aoFechar={onClose}
        aoFechado={() => { const f = pendente.current; pendente.current = null; f?.(); }}
      />

      <RecommendationPreferences visible={!!recommendationTrack} track={recommendationTrack} reason={discoveryContext?.reason} onClose={()=>setRecommendationTrack(null)}/>
      <AddToPlaylistSheet visible={!!paraPlaylist} track={paraPlaylist} onClose={() => setParaPlaylist(null)} />
      <ShareFriendSheet
        visible={!!paraPartilhar}
        itemType="track"
        item={paraPartilhar}
        onClose={() => setParaPartilhar(null)}
      />
    </>
  );
}
