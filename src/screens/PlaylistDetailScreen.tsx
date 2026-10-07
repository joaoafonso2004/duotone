import { useNotificationOverlay } from '../hooks/useNotificationOverlay';
import { menuDaPlaylist } from '../lib/menuDaPlaylist';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { avisarRemocao, avisarErro, avisarFeito } from '../lib/avisoDeRemocao';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLibrary } from '../api/library';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import {
  addTracksToPlaylist,
  deletePlaylist,
  getPlaylistTracks,
  getPlaylistDetails,
  listPlaylists,
  mergePlaylists,
  removeTrackFromPlaylist,
  reporNaPlaylist,
  tirarDaPlaylist as tirarLinhaDaPlaylist,
  renamePlaylist,
  setPlaylistOrder,
  copiasGuardadas,
  savePlaylistCopy,
  lerPessoasDaPlaylist,
  quemPosNaPlaylist,
  relerPlaylist,
  sairDaPlaylist,
} from '../api/playlists';
import { usePlaylistAoVivo } from '../hooks/usePlaylistAoVivo';
import { usePessoasComCaras } from '../hooks/usePessoasComCaras';
import { usePuxarParaAtualizar } from '../components/PuxarParaAtualizar';
import { eColaborativa, papelNaPlaylist, podeMexerNasFaixas, quemPos, type PessoaDaPlaylist } from '../lib/playlistColaborativa';
import { CarasDaPlaylist, PessoasDaPlaylist } from '../components/PessoasDaPlaylist';
import { usePlaylists } from '../state/playlists';
import { estadoDoGuardar, mensagemDeFalhaAoGuardar } from '../lib/guardarPlaylist';
import { BottomSheet } from '../components/BottomSheet';
import { CabecalhoDaPlaylist } from '../components/CabecalhoDaPlaylist';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, useCabecalhoQueEncolhe } from '../components/Screen';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { YtPlaylistShareSheet } from '../components/YtPlaylistShareSheet';
import { ShareFriendSheet } from '../components/ShareFriendSheet';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { correspondeAPesquisa } from '../lib/searchText';
import { useTheme } from '../state/theme';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { usePlayer } from '../state/player';
import { useAuth } from '../state/auth';
import { BrilhoDoEcra } from '../components/BrilhoDoEcra';
import { colors, MINI_PLAYER_HEIGHT, spacing, type, radii } from '../theme';
import { getOrdemDaPlaylist, setOrdemDaPlaylist, type OrdemDaPlaylist } from '../lib/prefs';
import type { Playlist, PlaylistTrack, Track } from '../types';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { ArtworkCollage } from '../components/ArtworkCollage';
import { LinhaArrastavel } from '../components/LinhaArrastavel';
import { DeslizarParaTirar } from '../components/DeslizarParaTirar';
import { useArrastarLista } from '../hooks/useArrastarLista';
import {
  comecarRascunho, desfazerTirada, haAlgoParaGravar, moverNoRascunho, planoDeGravacao, tirarDoRascunho,
  type Rascunho,
} from '../lib/edicaoDaPlaylist';
import { useAlturaDosSeparadores } from '../state/doca';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { DentroDeUmModal, useModalDoRNAberto } from '../components/dentroDeUmModal';

type Props = NativeStackScreenProps<RootStackParamList, 'PlaylistDetail'>;

export function PlaylistDetailScreen({ route, navigation }: Props) {
  // A barra de cima flutua sobre a capa e mostra o nome pequeno quando o
  // grande passa por baixo dela (3/10, o modo herói do Screen).
  const cab = useCabecalhoQueEncolhe();
  const [fimDoNome, setFimDoNome] = useState(260);
  const { id } = route.params;
  const userId=useAuth(s=>s.session?.user.id);
  const [details,setDetails]=useState<{id:string;name:string;ownerId:string}|null>(null);
  // Playlists colaborativas (7/10): quem lá está, e quem pôs cada música.
  const [pessoas,setPessoas]=useState<PessoaDaPlaylist[]>([]);
  const [quemPosMapa,setQuemPosMapa]=useState<Map<string,string>>(()=>new Map());
  const [pessoasAbertas,setPessoasAbertas]=useState(!!route.params.pessoas);
  const [sairAberto,setSairAberto]=useState(false);
  const papel=details?.id===id?papelNaPlaylist({donoId:details.ownerId,eu:userId,pessoas}):'leitor';
  // Pôr, tirar e reordenar: o dono e quem colabora. O nome e apagar só o dono.
  const canEdit=podeMexerNasFaixas(papel);
  const souDono=papel==='dono';
  // O que se MOSTRA: as fotografias atuais (o servidor dá a coluna antiga).
  const pessoasVistas=usePessoasComCaras(pessoas);
  const [loadError,setLoadError]=useState('');
  const detailRequest=useRef(0);
  const insets = useSafeAreaInsets();
  // A barra dos separadores MEDIDA (auditoria 1.3), não um 49 à mão.
  const separadores = useAlturaDosSeparadores();
  // Tocar numa música: com "Start Radio from a song" é o Radio (ver `tocarMusica`).
  const tocarMusica = usePlayer((s) => s.tocarMusica);
  const tocarLista = usePlayer((s) => s.tocarLista);
  const inteligente = usePlayer((s) => s.shuffleInteligente);
  const ligado = usePlayer((s) => s.shuffle);
  const alternarShuffle = usePlayer((s) => s.toggleShuffle);

  const [name, setName] = useState(route.params.name);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * A edição (28/9): o nome, a ordem e o que sai, num rascunho até ao Save.
   * `null` = não se está a editar. Ver lib/edicaoDaPlaylist.ts.
   */
  const [rascunho, setRascunho] = useState<Rascunho<PlaylistTrack> | null>(null);
  const editMode = rascunho !== null;
  // Vindo do "Edit playlist" do toque longo nas Playlists: abre já a editar.
  const pedidoDeEdicao = useRef(!!route.params.editar);
  // A pesquisa vive numa lupa na barra de cima (28/9): sempre à mão numa
  // playlist longa, sem empurrar a capa para baixo.
  const [procurarAberto, setProcurarAberto] = useState(false);
  const [partilharAberto, setPartilharAberto] = useState(false);
  const [busy, setBusy] = useState(false);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareFriendOpen, setShareFriendOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeItems, setMergeItems] = useState<Playlist[]>([]);
  const theme = useTheme((s) => s.theme);

  // States for Add Tracks Modal
  const [addTracksOpen, setAddTracksOpen] = useState(false);
  useModalDoRNAberto(addTracksOpen);
  const notificationDismiss = useNotificationOverlay(addTracksOpen,() => setAddTracksOpen(false));
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [playlistSearchQuery, setPlaylistSearchQuery] = useState('');

  // States for Sorting
  const [sortOpen, setSortOpen] = useState(false);
  const [sortMode, setSortModeLocal] = useState<OrdemDaPlaylist>('default');
  // A ordem guardada chega depois do primeiro render -- vem do disco. Até lá
  // mostra-se a de origem, que é a da playlist e não uma invenção.
  useEffect(() => { void getOrdemDaPlaylist().then(setSortModeLocal); }, []);
  const setSortMode = (v: OrdemDaPlaylist) => {
    setSortModeLocal(v);
    void setOrdemDaPlaylist(v);
  };
  const [playCounts, setPlayCounts] = useState<Record<string, { count: number; lastPlayed: number }>>({});

  // State for specific track actions (...)
  const [actionTrack, setActionTrack] = useState<Track | null>(null);

  // Load play counts on mount for sorting
  useEffect(() => {
    AsyncStorage.getItem('playCounts:v1').then((raw: string | null) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            setPlayCounts(parsed);
          }
        } catch {
          // ignore
        }
      }
    });
  }, []);

  // Load library tracks when add modal opens
  useEffect(() => {
    if (addTracksOpen) {
      setLoadingLibrary(true);
      lerFaixas(getLibrary)
        .then((res) => {
          setLibraryTracks(res);
          const currentIds = new Set(tracks.map((t) => t.sourceId));
          setSelectedIds(currentIds);
        })
        .catch(() => {})
        .finally(() => setLoadingLibrary(false));
    }
  }, [addTracksOpen, tracks]);

  const toggleSelectTrack = (sourceId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
    hapticSelection();
  };

  const saveSelectedTracks = async () => {
    setBusy(true);
    try {
      const toAdd = libraryTracks.filter(
        (t) => selectedIds.has(t.sourceId) && !tracks.some((pt) => pt.sourceId === t.sourceId)
      );
      const toRemove = tracks.filter((pt) => !selectedIds.has(pt.sourceId));

      if (toAdd.length > 0) {
        await addTracksToPlaylist(id, toAdd);
      }
      for (const pt of toRemove) {
        await removeTrackFromPlaylist(id, pt.id);
      }

      hapticNotification();
      load();
      setAddTracksOpen(false);
    } catch (e: any) {
      avisarErro(mensagemDeErro(e, 'Could not update playlist tracks.'));
    } finally {
      setBusy(false);
    }
  };

  const filteredLibrary = useMemo(() => {
    return libraryTracks.filter((t) => correspondeAPesquisa(addSearchQuery, t.title, displayArtist(t)));
  }, [libraryTracks, addSearchQuery]);

  const sortedTracks = useMemo(() => {
    const getPlayKey = (t: Track) => `${t.source}:${t.sourceId}`;
    switch (sortMode) {
      case 'title':
        return [...tracks].sort((a, b) => a.title.localeCompare(b.title));
      case 'recent':
        return [...tracks].sort((a, b) => b.position - a.position);
      case 'played_recent':
        return [...tracks].sort((a, b) => {
          const aTime = playCounts[getPlayKey(a)]?.lastPlayed ?? 0;
          const bTime = playCounts[getPlayKey(b)]?.lastPlayed ?? 0;
          return bTime - aTime;
        });
      case 'played_most':
        return [...tracks].sort((a, b) => {
          const aCount = playCounts[getPlayKey(a)]?.count ?? 0;
          const bCount = playCounts[getPlayKey(b)]?.count ?? 0;
          return bCount - aCount;
        });
      case 'duration':
        return [...tracks].sort((a, b) => (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0));
      default:
        return [...tracks].sort((a, b) => a.position - b.position);
    }
  }, [tracks, sortMode, playCounts]);

  const visibleTracks = useMemo(
    () => sortedTracks.filter((t) => correspondeAPesquisa(playlistSearchQuery, t.title, displayArtist(t))),
    [sortedTracks, playlistSearchQuery],
  );

  // Estável (27/9): a linha recebe a faixa, e o `React.memo` do TrackRow deixa
  // de se desfazer a cada render. Quem acende a que toca é a própria linha.
  // De onde vem a lista: o "Jump back in" da Home volta aqui (lib/recentes.ts).
  const origem = useMemo(() => ({ tipo: 'playlist' as const, nome: name, id }), [name, id]);
  const aoTocarNaLinha = useCallback((item: Track) => {
    tocarMusica(item, visibleTracks, true, undefined, origem);
  }, [tocarMusica, visibleTracks, origem]);

  /**
   * O "Remove from this playlist" do menu: tira logo, sem pergunta, e o aviso
   * deixa desfazer (3/10) -- a música volta à mesma posição e à mesma data.
   */
  const tirarDaPlaylist = useCallback((track: Track) => {
    const indice = tracks.findIndex((t) => t.source === track.source && t.sourceId === track.sourceId);
    const linha = tracks[indice];
    if (!linha) return;
    setTracks((atual) => atual.filter((t) => t.id !== linha.id));
    void tirarLinhaDaPlaylist(id, linha.id).then((tirada) => {
      avisarRemocao({
        texto: 'Removed from playlist',
        detalhe: tituloDaFaixa(linha),
        desfazer: tirada ? async () => {
          await reporNaPlaylist(tirada);
          setTracks((atual) => atual.some((t) => t.id === linha.id)
            ? atual : [...atual.slice(0, indice), linha, ...atual.slice(indice)]);
        } : undefined,
      });
    }).catch((e: any) => {
      // Não saiu: volta à lista.
      setTracks((atual) => atual.some((t) => t.id === linha.id)
        ? atual : [...atual.slice(0, indice), linha, ...atual.slice(indice)]);
      avisarErro(mensagemDeErro(e, 'Could not remove the track.'));
    });
  }, [tracks, id]);

  // `silencioso` (7/10): reler por baixo do que está à vista -- um aviso de
  // que alguém mexeu, ou o puxar para atualizar. Sem esqueleto, e uma falha
  // deixa a lista onde estava.
  const load = useCallback(async (opcoes?: { silencioso?: boolean }) => {
    const silencioso=!!opcoes?.silencioso;
    const token=++detailRequest.current;
    if(!silencioso){setLoading(true);setLoadError('');}
    try {
      const [info,rows,quem]=await Promise.all([getPlaylistDetails(id),silencioso?relerPlaylist(id):getPlaylistTracks(id),lerPessoasDaPlaylist(id).catch(()=>[] as PessoaDaPlaylist[])]);
      if(token!==detailRequest.current)return;
      setDetails(info);setName(info.name);setTracks(rows);setPessoas(quem);
      // As caras de quem pôs só numa playlist com colaboradores: uma ida a mais, e só aí.
      if(eColaborativa(quem))void quemPosNaPlaylist(id).then(m=>{if(token===detailRequest.current)setQuemPosMapa(m);});
      else setQuemPosMapa(new Map());
    } catch(e:any) {
      if(token!==detailRequest.current||silencioso)return;
      setDetails(null);setTracks([]);setLoadError(e?.message || 'Could not load playlist.');
    } finally {
      if(token===detailRequest.current&&!silencioso)setLoading(false);
    }
  }, [id]);

  // Alguém mexeu (7/10): relê-se por baixo. A editar não -- o rascunho é teu, e
  // o Save ou o Cancel releem a seguir.
  const aEditar=useRef(false);
  const releituraPendente=useRef(false);
  usePlaylistAoVivo(id,eColaborativa(pessoas),userId,()=>{
    if(aEditar.current){releituraPendente.current=true;return;}
    void load({silencioso:true});
  });

  /**
   * Guardar a playlist de outra pessoa (a que chegou pelo chat, 14/9): fica uma
   * cópia tua. Ver lib/guardarPlaylist.ts -- a mesma regra do PC.
   */
  const [copias,setCopias]=useState<Set<string>|null>(null);
  const [aGuardar,setAGuardar]=useState(false);
  const donoCarregado=details?.id===id?details.ownerId:null;
  useEffect(()=>{
    if(!donoCarregado||!userId||donoCarregado===userId){setCopias(null);return;}
    let vivo=true;
    void copiasGuardadas().then(c=>{if(vivo)setCopias(c);}).catch(()=>{if(vivo)setCopias(new Set());});
    return()=>{vivo=false;};
  },[id,donoCarregado,userId]);
  // Quem colabora já a tem nas Playlists: guardar uma cópia não faz sentido.
  const estadoGuardar=papel==='colaborador'?'escondido':estadoDoGuardar({id,donoId:donoCarregado,eu:userId,copias});
  const guardar=async()=>{
    if(aGuardar)return;
    setAGuardar(true);
    try{
      // Guardar outra vez devolve a cópia que já existe: é assim que o "Open
      // copy" sabe para onde ir.
      const copia=await savePlaylistCopy(id);
      const jaTinha=estadoGuardar==='abrir-copia';
      setCopias(c=>new Set([...(c??[]),id]));
      void usePlaylists.getState().carregar(true);
      if(jaTinha)navigation.push('PlaylistDetail',{id:copia,name:`${name} (Shared)`});
      else hapticNotification();
    }catch(e:any){avisarErro(mensagemDeFalhaAoGuardar(e));}
    finally{setAGuardar(false);}
  };

  useFocusEffect(
    useCallback(() => {
      if (!editMode) load();
      return()=>{detailRequest.current++;};
    }, [load, editMode])
  );

  // ---- Editar (28/9): o nome e a ordem num só sítio, com o gesto da fila ----

  const abrirEdicao = () => {
    if (!canEdit) return;
    hapticSelection();
    // A ordem que se edita é a da playlist: com outra ordenação à vista, o que
    // se arrasta não seria o que se grava.
    setSortMode('default');
    setPlaylistSearchQuery('');
    setProcurarAberto(false);
    setRascunho(comecarRascunho(name, tracks));
  };

  // Vindo do toque longo nas Playlists: abre na edição quando a playlist chega.
  useEffect(() => {
    if (!pedidoDeEdicao.current || loading || details?.id !== id) return;
    pedidoDeEdicao.current = false;
    if (canEdit) abrirEdicao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, details, id, canEdit]);

  aEditar.current = rascunho !== null;
  const depoisDeEditar = () => {
    if (!releituraPendente.current) return;
    releituraPendente.current = false;
    void load({ silencioso: true });
  };
  const cancelarEdicao = () => { hapticSelection(); setRascunho(null); depoisDeEditar(); };

  const recarregarPessoas = useCallback(() => {
    void lerPessoasDaPlaylist(id).then((quem) => {
      setPessoas(quem);
      void usePlaylists.getState().carregar(true);
      if (eColaborativa(quem)) void quemPosNaPlaylist(id).then(setQuemPosMapa);
    }).catch(() => {});
  }, [id]);
  /** Saí: a playlist deixa de ser minha de ver. */
  const depoisDeSair = useCallback(() => {
    usePlaylists.getState().aplicar((items) => items.filter((p) => p.id !== id));
    void usePlaylists.getState().carregar(true);
    navigation.goBack();
    avisarFeito('You left the playlist', name);
  }, [id, name, navigation]);
  const sair = async () => {
    setBusy(true);
    try { await sairDaPlaylist(id); setSairAberto(false); depoisDeSair(); }
    catch (e: any) { avisarErro(mensagemDeErro(e, 'Could not leave this playlist.')); }
    finally { setBusy(false); }
  };

  const planoDaEdicao = rascunho ? planoDeGravacao(rascunho, name, tracks, (t) => t.id) : null;
  const podeGravar = !!planoDaEdicao && haAlgoParaGravar(planoDaEdicao) && !busy;

  /** Grava só o que mudou: o nome, as que saem e a ordem das que ficam. */
  const gravarEdicao = async () => {
    if (!rascunho || !planoDaEdicao) return;
    if (!haAlgoParaGravar(planoDaEdicao)) { setRascunho(null); return; }
    const plano = planoDaEdicao;
    setBusy(true);
    try {
      if (plano.nome) { await renamePlaylist(id, plano.nome); setName(plano.nome); }
      for (const idDaLinha of plano.tirar) await removeTrackFromPlaylist(id, idDaLinha);
      if (plano.ordem) await setPlaylistOrder(id, plano.ordem);
      hapticNotification();
      setTracks(rascunho.faixas);
      setRascunho(null);
      depoisDeEditar();
      // A grelha das Playlists mostra o nome, a contagem e as capas.
      void usePlaylists.getState().carregar(true);
    } catch (e: any) {
      avisarErro(mensagemDeErro(e, 'Could not save the playlist.'));
      setRascunho(null);
      void load();
    } finally {
      setBusy(false);
    }
  };

  // O arrasto é o da fila (hooks/useArrastarLista): a pega ≡, o toque longo e
  // o deslize nas bordas. As chaves são as linhas da playlist, que são únicas.
  const chavesDaEdicao = useMemo(() => (rascunho ? rascunho.faixas.map((t) => t.id) : []), [rascunho]);
  const arrasto = useArrastarLista({
    chaves: chavesDaEdicao,
    aoReordenar: (de, para) => setRascunho((r) => (r ? moverNoRascunho(r, de, para) : r)),
  });
  const semAcao = useCallback(() => {}, []);

  const doDelete = async () => {
    setBusy(true);
    try {
      await deletePlaylist(id);
      setDeleteOpen(false);
      navigation.goBack();
      // Apagar não tem volta: já se confirmou, e o aviso só informa (3/10).
      avisarRemocao({ texto: 'Playlist deleted', detalhe: name });
    } catch (e: any) {
      avisarErro(mensagemDeErro(e, 'Could not delete.'));
    } finally {
      setBusy(false);
    }
  };

  const abrirMerge = async () => {
    setOptionsOpen(false);
    setMergeOpen(true);
    try { setMergeItems((await listPlaylists()).filter((playlist) => playlist.id !== id)); }
    catch (e: any) { setMergeOpen(false); avisarErro(mensagemDeErro(e, 'Could not load your playlists.')); }
  };

  const fazerMerge = async (source: Playlist) => {
    setBusy(true);
    try {
      const resultado = await mergePlaylists(id, source.id);
      setMergeOpen(false);
      await load();
      hapticNotification();
      avisarFeito('Playlists merged', `${resultado.adicionadas} added · ${resultado.repetidas} already there. “${source.name}” was not changed.`);
    } catch (e: any) {
      avisarErro(mensagemDeErro(e, 'Could not merge the playlists.'));
    } finally { setBusy(false); }
  };

  const bottomPad = separadores + insets.bottom + MINI_PLAYER_HEIGHT + 32;
  // Puxar para atualizar (7/10): numa playlist colaborativa o que os outros
  // puseram vem já, sem sair e voltar.
  const puxar = usePuxarParaAtualizar(() => load({ silencioso: true }), cab.espaco);

  /** As quatro primeiras capas, para o mosaico -- como na grelha. */
  const capasDaPlaylist = React.useMemo(
    () => tracks.map((t) => t.artworkUrl).filter((u): u is string => !!u).slice(0, 4),
    [tracks],
  );
  /**
   * A soma das durações, e só quando se sabem TODAS.
   *
   * Uma soma feita com metade das faixas sem duração daria um número errado
   * com ar de exacto -- e o cabeçalho prefere não dizer nada a mentir.
   */
  const duracaoTotal = React.useMemo(() => {
    if (tracks.length === 0) return null;
    let total = 0;
    for (const t of tracks) {
      if (!t.durationSeconds || t.durationSeconds <= 0) return null;
      total += t.durationSeconds;
    }
    return total;
  }, [tracks]);

  /**
   * O topo da pagina passa a ANDAR COM A LISTA.
   *
   * Estava fixo por cima dela: a capa, o play, a barra de ferramentas e a
   * pesquisa ocupavam quase o ecra todo e sobrava uma janela de quatro
   * musicas, que rolava dentro desse resto. Numa playlist de 1927 faixas isso
   * e uma frincha.
   *
   * Entra como ELEMENTO e nao como funcao. `ListHeaderComponent={() => ...}`
   * cria um tipo de componente novo a cada render, o que faz o FlatList
   * REMONTAR o cabecalho -- e um `TextInput` la dentro perderia o foco a cada
   * tecla. Com um elemento, o React reconcilia e nada remonta.
   *
   * A caixa de pesquisa fica de fora, encostada ao topo: procurar dentro de
   * uma playlist longa e o caso em que MENOS se quer ter de rolar ate acima
   * para chegar ao campo.
   */
  const cabecalhoDaLista = tracks.length > 0 && !editMode ? (
        <>
          <CabecalhoDaPlaylist
            aoMedirNome={setFimDoNome}
            nome={name}
            artworks={capasDaPlaylist}
            faixas={tracks.length}
            duracaoSegundos={duracaoTotal}
          />
          {eColaborativa(pessoas) ? (
            <View style={{ alignItems: 'center', paddingHorizontal: spacing.lg, marginTop: -spacing.sm, marginBottom: spacing.sm }}>
              <CarasDaPlaylist pessoas={pessoasVistas} onPress={() => setPessoasAbertas(true)} />
            </View>
          ) : null}
          <View style={styles.actionRow}>
            <Pressable
              style={styles.playButton}
              onPress={() => void tocarLista(visibleTracks, ligado, inteligente, origem)}
            >
              <LinearGradient
                colors={theme.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.buttonGradient}
              >
                {/* Sem rotulo: um triangulo num circulo cheio nao precisa de
                    dizer "Play". O `marginLeft` acerta o centro optico -- um
                    triangulo centrado a matematica parece sempre a esquerda. */}
                <Ionicons name="play" size={26} color={theme.textColorOnGradient} style={{ marginLeft: 3 }} />
              </LinearGradient>
            </Pressable>

            <Pressable
              style={[
                styles.shuffleButton,
                // Ligado tem de se ver: so o modo inteligente e que se notava.
                ligado && !inteligente && {
                  borderColor: theme.color,
                  backgroundColor: theme.soft,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: ligado }}
              accessibilityLabel={
                inteligente ? 'Smart shuffle on'
                  : ligado ? 'Shuffle on' : 'Shuffle off'
              }
              onPress={() => { hapticSelection(); alternarShuffle(); }}
            >
              {/* O MODO vem do leitor — ver o comentario gemeo no PC. */}
              {inteligente && <BrilhoDoEcra />}
              <Ionicons
                name="shuffle"
                size={20}
                color={ligado && !inteligente ? theme.color : colors.text}
              />
            </Pressable>
          </View>

          <View style={styles.playlistToolbar}>
            {canEdit&&<Pressable
              style={styles.toolbarItem}
              onPress={() => {
                hapticSelection();
                setAddTracksOpen(true);
              }}
            >
              <Ionicons name="add" size={22} color={theme.color} />
              <Text style={[styles.toolbarLabel, { color: theme.color }]}>Add tracks</Text>
            </Pressable>}

            {estadoGuardar!=='escondido'&&<Pressable
              style={styles.toolbarItem}
              disabled={aGuardar}
              accessibilityRole="button"
              accessibilityLabel={estadoGuardar==='abrir-copia'?'Open your copy of this playlist':'Save this playlist to your playlists'}
              onPress={() => {
                hapticSelection();
                void guardar();
              }}
            >
              <Ionicons name={estadoGuardar==='abrir-copia'?'checkmark-circle':'add-circle-outline'} size={20} color={theme.color} />
              <Text style={[styles.toolbarLabel, { color: theme.color }]}>
                {estadoGuardar==='abrir-copia'?'Open copy':aGuardar?'Saving…':'Save'}
              </Text>
            </Pressable>}

            {/* Partilhar é o que mais se faz a uma playlist, e estava escondido no
                More (28/9). O More passou para o ••• da barra de cima. */}
            <Pressable
              style={styles.toolbarItem}
              accessibilityRole="button"
              onPress={() => {
                hapticSelection();
                setPartilharAberto(true);
              }}
            >
              <Ionicons name="share-social-outline" size={19} color={colors.text} />
              <Text style={styles.toolbarLabel}>Share</Text>
            </Pressable>

            <Pressable
              style={styles.toolbarItem}
              onPress={() => {
                hapticSelection();
                setSortOpen(true);
              }}
            >
              <Ionicons name="swap-vertical" size={18} color={colors.text} />
              <Text style={styles.toolbarLabel}>Sort</Text>
            </Pressable>

            {canEdit&&<Pressable
              style={styles.toolbarItem}
              accessibilityRole="button"
              onPress={abrirEdicao}
            >
              <Ionicons name="pencil" size={16} color={colors.text} />
              <Text style={styles.toolbarLabel}>Edit</Text>
            </Pressable>}
          </View>
        </>
  ) : null;

  /** A quem são os menus da playlist: as capas, o nome e quantas tem. */
  const cabecalhoDoMenu = {
    titulo: name,
    subtitulo: `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}`,
    capas: capasDaPlaylist,
  };

  const alternarPesquisa = () => {
    hapticSelection();
    if (procurarAberto) { setProcurarAberto(false); setPlaylistSearchQuery(''); }
    else setProcurarAberto(true);
  };

  /** O nome, editável, em cima da lista da edição. Elemento e não função: ver `cabecalhoDaLista`. */
  const cabecalhoDaEdicao = rascunho ? (
    <>
      <View style={styles.cartaoDoNome}>
        <ArtworkCollage artworks={capasDaPlaylist} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rotuloDoNome}>NAME</Text>
          <TextInput
            value={rascunho.nome}
            // O nome é do dono; quem colabora mexe na ordem e no que sai.
            editable={souDono}
            onChangeText={(nome) => setRascunho((r) => (r ? { ...r, nome } : r))}
            placeholder="Playlist name"
            placeholderTextColor={colors.textTertiary}
            style={styles.campoDoNome}
            returnKeyType="done"
            accessibilityLabel="Playlist name"
          />
        </View>
      </View>
      <Text style={styles.dicaDaEdicao}>Drag ≡ to reorder · Swipe left to remove</Text>
    </>
  ) : null;

  return (
    <Screen
      encolhe={cab}
      tituloCompacto={!editMode && tracks.length > 0 ? { texto: name, aparecerEm: fimDoNome } : undefined}
      fundoSempre={editMode}
      fixo={procurarAberto && !editMode && tracks.length > 0 ? (
        <View style={styles.playlistSearchBox}>
          <Input
            icon="search"
            placeholder="Search this playlist"
            value={playlistSearchQuery}
            onChangeText={setPlaylistSearchQuery}
            onClear={() => setPlaylistSearchQuery('')}
            autoFocus
          />
        </View>
      ) : undefined}
      /* O nome saiu do cabecalho generico e passou para o `CabecalhoDaPlaylist`,
         que e onde ele pode ser grande e ter a capa por cima. Aqui em cima fica
         a moldura: voltar, a lupa e o ••• (28/9) -- e, a editar, Cancel e Save. */
      topLeft={
        editMode ? (
          <View style={styles.molduraDeCima}>
            <Pressable hitSlop={10} onPress={cancelarEdicao} disabled={busy} accessibilityRole="button">
              <Text style={[type.body, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Text style={[type.body, { fontWeight: '700' }]}>Edit playlist</Text>
            <Pressable
              hitSlop={10}
              onPress={() => void gravarEdicao()}
              disabled={!podeGravar}
              accessibilityRole="button"
              accessibilityState={{ disabled: !podeGravar }}
            >
              {busy ? <ActivityIndicator size="small" color={theme.color} /> : (
                <Text style={[type.body, { fontWeight: '700', color: podeGravar ? theme.color : colors.textTertiary }]}>Save</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.molduraDeCima}>
            <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={{ marginLeft: -8 }} accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </Pressable>
            <View style={styles.acoesDeCima}>
              {tracks.length > 0 ? (
                <Pressable
                  hitSlop={8}
                  onPress={alternarPesquisa}
                  accessibilityRole="button"
                  accessibilityLabel={procurarAberto ? 'Close search' : 'Search this playlist'}
                  style={styles.botaoDeCima}
                >
                  <Ionicons name={procurarAberto ? 'close' : 'search'} size={21} color={colors.text} />
                </Pressable>
              ) : null}
              <Pressable
                hitSlop={8}
                onPress={() => { hapticSelection(); setOptionsOpen(true); }}
                accessibilityRole="button"
                accessibilityLabel="More options"
                style={styles.botaoDeCima}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
              </Pressable>
            </View>
          </View>
        )
      }
    >

      {loadError ? <View style={{padding:24,paddingTop:24+cab.espaco,gap:12}}><Text style={{color:colors.danger}}>{loadError}</Text><Pressable onPress={()=>void load()}><Text style={{color:theme.color}}>Try again</Text></Pressable></View> : loading ? (
        <ActivityIndicator color={theme.color} style={{ marginTop: cab.espaco + 48 }} />
      ) : rascunho ? (
        // A edição (28/9): arrasta-se pela pega ou com meio segundo de dedo
        // parado, como na fila, e desliza-se para tirar. Nada vai ao servidor
        // antes do Save. A moldura mede-se no ecrã para o deslize nas bordas.
        <View ref={arrasto.molduraRef} collapsable={false} style={{ flex: 1 }}>
          <FlatList
            ref={arrasto.listaRef}
            data={rascunho.faixas}
            keyExtractor={(t) => t.id}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={arrasto.arrastar === null}
            scrollEventThrottle={16}
            onScroll={arrasto.aoRolar}
            onContentSizeChange={arrasto.aoMudarTamanho}
            ListHeaderComponent={cabecalhoDaEdicao}
            contentContainerStyle={{ paddingTop: cab.espaco, paddingBottom: bottomPad }}
            renderItem={({ item, index }) => (
              <LinhaArrastavel {...arrasto.propsDaLinha(index)} podeArrastar>
                {(envolverPega) => (
                  <DeslizarParaTirar
                    ativo={arrasto.arrastar === null}
                    aoTirar={() => {
                      hapticSelection();
                      setRascunho((r) => (r ? tirarDoRascunho(r, index) : r));
                    }}
                  >
                    <View
                      style={styles.linhaDeEdicao}
                      onLayout={index === 0 ? (e) => arrasto.medirLinha(e.nativeEvent.layout.height) : undefined}
                    >
                      <View style={{ flex: 1 }}>
                        {/* O toque longo que pega na linha é da própria
                            LinhaArrastavel (Gesture Handler, 3/10). */}
                        <TrackRow
                          track={item}
                          onPress={semAcao}
                        />
                      </View>
                      {(() => {
                        const pega = (
                          <View accessibilityLabel={`Reorder ${tituloDaFaixa(item)}`} style={styles.pega}>
                            <Ionicons
                              name="reorder-three-outline"
                              size={22}
                              color={arrasto.arrastar === index ? colors.text : colors.textTertiary}
                            />
                          </View>
                        );
                        return envolverPega ? envolverPega(pega) : pega;
                      })()}
                    </View>
                  </DeslizarParaTirar>
                )}
              </LinhaArrastavel>
            )}
          />
        </View>
      ) : tracks.length === 0 ? (
        <View style={{ flex: 1, paddingTop: cab.espaco }}>
        <EmptyState
          icon="musical-notes-outline"
          title="This playlist is empty"
          subtitle={canEdit?"Add tracks from Search or your Library using the ••• menu on any track.":"The owner has not added any tracks yet."}
        />
        </View>
      ) : playlistSearchQuery.trim() && visibleTracks.length === 0 ? (
        <View style={{ flex: 1, paddingTop: cab.espaco }}>
        <EmptyState icon="search-outline" title="No songs found" subtitle={`No track matches "${playlistSearchQuery}".`} />
        </View>
      ) : (
        <Animated.FlatList
          onScroll={cab.onScroll}
          scrollEventThrottle={cab.scrollEventThrottle}
          scrollIndicatorInsets={{ top: cab.espaco }}
          data={visibleTracks}
          keyExtractor={(t) => t.id}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews
          /**
           * Sem `getItemLayout`, e de proposito.
           *
           * Ele diz que a faixa `i` comeca em `i * altura` -- verdade sem
           * cabecalho, mentira com ele: os deslocamentos passavam todos a
           * faltar a altura do heroi, que depende da largura do ecra e nao se
           * sabe de antemao. Era so uma optimizacao (nao ha `scrollToIndex`
           * neste ecra), e uma optimizacao que mente sobre posicoes paga-se em
           * espacos em branco a rolar depressa.
           */
          ListHeaderComponent={cabecalhoDaLista}
          refreshControl={puxar}
          contentContainerStyle={{ paddingTop: cab.espaco, paddingBottom: bottomPad }}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              acompanharATocar
              onPress={aoTocarNaLinha}
              onAction={setActionTrack}
              quemPos={quemPos(quemPosMapa.get(item.id), pessoasVistas)}
            />
          )}
        />
      )}

      {/* O aviso de que há músicas para sair, e o Undo (28/9). Nada sai antes do Save. */}
      {rascunho && rascunho.tiradas.length > 0 ? (
        <View style={[styles.desfazer, { bottom: separadores + insets.bottom + MINI_PLAYER_HEIGHT + 12 }]}>
          <Text style={[type.body, { flex: 1 }]}>
            {rascunho.tiradas.length === 1 ? '1 song will be removed' : `${rascunho.tiradas.length} songs will be removed`}
          </Text>
          <Pressable
            hitSlop={10}
            accessibilityRole="button"
            onPress={() => { hapticSelection(); setRascunho((r) => (r ? desfazerTirada(r) : r)); }}
          >
            <Text style={[type.body, { fontWeight: '700', color: theme.color }]}>Undo</Text>
          </Pressable>
        </View>
      ) : null}

      {/* O Share da barra (28/9): as duas maneiras de partilhar. */}
      <TrackActionsSheet
        visible={partilharAberto}
        track={null}
        cabecalho={cabecalhoDoMenu}
        onClose={() => setPartilharAberto(false)}
        actions={[
          { icon: 'people-outline', label: 'Share with a friend…', onPress: () => { setPartilharAberto(false); setShareFriendOpen(true); } },
          { icon: 'share-social-outline', label: 'QR code / Copy link', onPress: () => { setPartilharAberto(false); setShareOpen(true); } },
        ]}
      />

      {/* O ••• de cima: o mesmo menu do toque longo nas Playlists, menos o tocar.
          O Rename saiu (28/9): o nome edita-se no Edit, com a ordem. */}
      <TrackActionsSheet
        visible={optionsOpen}
        track={null}
        cabecalho={cabecalhoDoMenu}
        onClose={() => setOptionsOpen(false)}
        // O mesmo menu do PC e do cartão (5/10, lib/menuDaPlaylist.ts).
        actions={menuDaPlaylist({ plataforma: 'ios', onde: 'pagina', temFaixas: tracks.length > 0, minha: souDono, colaboro: papel === 'colaborador' })
          .map((a) => ({ icon: a.icone as any, label: a.rotulo, destructive: a.destrutiva, onPress: () => {
            if (a.id === 'juntar') { void abrirMerge(); return; }
            setOptionsOpen(false);
            if (a.id === 'partilhar') setShareFriendOpen(true);
            else if (a.id === 'partilhar-link') setShareOpen(true);
            else if (a.id === 'editar') abrirEdicao();
            else if (a.id === 'apagar') setDeleteOpen(true);
            else if (a.id === 'colaboradores') setPessoasAbertas(true);
            else if (a.id === 'sair') setSairAberto(true);
          } }))}
      />

      <PessoasDaPlaylist
        visible={pessoasAbertas && details?.id === id}
        onClose={() => setPessoasAbertas(false)}
        playlistId={id}
        papel={papel}
        pessoas={pessoasVistas}
        aoMudar={recarregarPessoas}
        aoSair={depoisDeSair}
      />

      <ConfirmSheet
        visible={sairAberto}
        title="Leave playlist"
        message={`You will stop seeing "${name}". The owner can add you again.`}
        confirmLabel="Leave playlist"
        destructive
        loading={busy}
        onClose={() => setSairAberto(false)}
        onConfirm={sair}
      />

      <BottomSheet visible={mergeOpen} onClose={() => !busy && setMergeOpen(false)}>
        <Text style={[type.title, { marginBottom: spacing.sm }]}>Merge into {name}</Text>
        <Text style={[type.caption, { marginBottom: spacing.md }]}>Only missing tracks are copied. The other playlist stays unchanged.</Text>
        {!mergeItems.length ? <Text style={type.caption}>You need another playlist to merge.</Text> : mergeItems.map((playlist) => (
          <Pressable key={playlist.id} disabled={busy} onPress={() => void fazerMerge(playlist)}
            style={({ pressed }) => [styles.menuOption, pressed && { backgroundColor: colors.surfacePressed }]}>
            <Ionicons name="albums-outline" size={20} color={theme.color} />
            <View style={{ flex: 1, marginLeft: 8 }}><Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{playlist.name}</Text><Text style={type.caption}>{playlist.trackCount} tracks</Text></View>
            {busy ? <ActivityIndicator size="small" color={theme.color} /> : <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
          </Pressable>
        ))}
      </BottomSheet>

      <ShareFriendSheet
        visible={shareFriendOpen}
        itemType="playlist"
        item={{ id }}
        onClose={() => setShareFriendOpen(false)}
      />

      <YtPlaylistShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        playlistId={id}
        playlistName={name}
      />


      <ConfirmSheet
        visible={deleteOpen}
        title="Delete playlist"
        message={`"${name}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete playlist"
        destructive
        loading={busy}
        onClose={() => setDeleteOpen(false)}
        onConfirm={doDelete}
      />

      {/* Sort options bottom sheet */}
      <BottomSheet visible={sortOpen} onClose={() => setSortOpen(false)}>
        <Text style={[type.title, { marginBottom: spacing.md }]}>
          Sort tracks
        </Text>
        {(
          [
            { label: 'Default order', value: 'default', icon: 'list-outline' },
            { label: 'Title', value: 'title', icon: 'text-outline' },
            { label: 'Recently added', value: 'recent', icon: 'time-outline' },
            { label: 'Recently played', value: 'played_recent', icon: 'play-outline' },
            { label: 'Most played', value: 'played_most', icon: 'stats-chart-outline' },
            { label: 'Duration', value: 'duration', icon: 'hourglass-outline' },
          ] as const
        ).map((opt) => {
          const isActive = sortMode === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => {
                hapticSelection();
                setSortMode(opt.value);
                setSortOpen(false);
              }}
              style={({ pressed }) => [
                styles.menuOption,
                pressed && { backgroundColor: colors.surfacePressed },
                isActive && { backgroundColor: theme.soft },
              ]}
            >
              <Ionicons
                name={opt.icon}
                size={20}
                color={isActive ? theme.color : colors.text}
              />
              <Text
                style={[
                  type.body,
                  { fontWeight: '600', marginLeft: 8, flex: 1 },
                  isActive && { color: theme.color },
                ]}
              >
                {opt.label}
              </Text>
              {isActive && (
                <Ionicons name="checkmark" size={18} color={theme.color} />
              )}
            </Pressable>
          );
        })}
      </BottomSheet>

      {/* O menu de todas as listas, com o "Remove from this playlist" no fim.
          Numa playlist que não é tua fica à vista a dizer que só o dono pode. */}
      <TrackActionsSheet
        visible={!!actionTrack}
        track={actionTrack}
        onClose={() => setActionTrack(null)}
        playlist={{ podeEditar: canEdit, aoTirar: tirarDaPlaylist }}
      />

      {/* Add Tracks modal */}
      <Modal onDismiss={notificationDismiss} visible={addTracksOpen} animationType="slide"><DentroDeUmModal.Provider value>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: colors.bg }}
        >
          <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setAddTracksOpen(false)} hitSlop={12}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Text style={styles.modalTitle} numberOfLines={1}>
                Add to {name}
              </Text>
              <Pressable onPress={saveSelectedTracks} disabled={busy} hitSlop={12}>
                {busy ? (
                  <ActivityIndicator size="small" color={theme.color} />
                ) : (
                  <Text style={[styles.modalDoneText, { color: theme.color }]}>Done</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.modalSearchBox}>
              <Input
                icon="search"
                placeholder="Search library songs"
                value={addSearchQuery}
                onChangeText={setAddSearchQuery}
                onClear={() => setAddSearchQuery('')}
              />
            </View>

            {loadingLibrary ? (
              <ActivityIndicator color={theme.color} style={{ marginTop: 48 }} />
            ) : filteredLibrary.length === 0 ? (
              <EmptyState
                icon="musical-notes-outline"
                title="No songs found"
                subtitle="Add songs to your Library first to add them here."
              />
            ) : (
              <FlatList
                data={filteredLibrary}
                keyExtractor={(item) => item.sourceId}
                initialNumToRender={12}
                maxToRenderPerBatch={10}
                updateCellsBatchingPeriod={50}
                windowSize={7}
                removeClippedSubviews
                contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                renderItem={({ item }) => {
                  const isSelected = selectedIds.has(item.sourceId);
                  return (
                    <Pressable
                      onPress={() => toggleSelectTrack(item.sourceId)}
                      style={({ pressed }) => [
                        styles.modalItemRow,
                        pressed && { backgroundColor: colors.surfacePressed },
                      ]}
                    >
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={isSelected ? theme.color : colors.textTertiary}
                      />
                      {item.artworkUrl ? (
                        <Image
                          source={{ uri: capaParaLista(item.artworkUrl)! }}
                          style={styles.modalItemArt}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={[styles.modalItemArt, { alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="musical-notes" size={18} color={colors.textTertiary} />
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>
                          {tituloDaFaixa(item)}
                        </Text>
                        <Text numberOfLines={1} style={type.caption}>
                          {displayArtist(item)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </DentroDeUmModal.Provider></Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Voltar (e o Done, a editar) por cima do cabecalho da playlist. */
  molduraDeCima: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 30,
  },
  /**
   * Um botao manda, os outros acompanham.
   *
   * Eram duas pilulas do mesmo tamanho, lado a lado, cada uma com icone e
   * texto -- e nada dizia qual era a principal. Numa playlist ha uma accao
   * obvia, que e por a tocar; o resto sao variantes dela. Agora o play e um
   * circulo cheio com o gradiente do tema e o shuffle e um icone ao lado,
   * que e a hierarquia que qualquer app de musica usa.
   *
   * Ao centro e nao a esquerda: o cabecalho por cima e centrado, e um botao
   * encostado a margem partia esse eixo.
   */
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  playlistToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderCurve: 'continuous',
    marginHorizontal: spacing.xl,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  playlistSearchBox: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  toolbarItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flex: 1,
  },
  toolbarLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    marginVertical: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalCancelText: {
    ...type.body,
    color: colors.textSecondary,
  },
  modalTitle: {
    ...type.headline,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.md,
  },
  modalDoneText: {
    ...type.body,
    fontWeight: '700',
  },
  modalSearchBox: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  modalItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  modalItemArt: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceHigh,
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
  },
  buttonGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shuffleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    // O brilho estica-se por este botao; e o raio daqui que lhe da a forma.
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonTextPlay: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.bg,
  },
  buttonTextShuffle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  /** A barra de cima fora da edição: a lupa e o •••, com alvos de dedo a sério. */
  acoesDeCima: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: -8,
  },
  botaoDeCima: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A edição (28/9): o nome em cima, num cartão como o da maqueta.
  cartaoDoNome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    marginTop: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rotuloDoNome: {
    ...type.micro,
    color: colors.textTertiary,
    letterSpacing: 0.8,
  },
  campoDoNome: {
    ...type.title,
    color: colors.text,
    paddingVertical: 2,
  },
  dicaDaEdicao: {
    ...type.caption,
    color: colors.textTertiary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  // As linhas da edição são as da fila: a faixa, e a pega à direita.
  linhaDeEdicao: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    paddingRight: spacing.lg,
  },
  // Um alvo de dedo e nao so um desenho, como a pega da fila.
  pega: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desfazer: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
});
