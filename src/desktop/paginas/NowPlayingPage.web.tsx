import {ArtworkLyricsCube} from '../../components/ArtworkLyricsCube';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import {
  getGlitchMode, type GlitchMode,
  getEffectIntensity, setEffectIntensity, type EffectIntensity,
} from '../../lib/prefs';
import { usePlayer } from '../../state/player';
import { chaveDaFaixa } from '../../lib/equalizer';
import { FilaArrastavel } from '../FilaArrastavel.web';
import { PainelEqualizador } from '../PainelEqualizador.web';
import { GlitchArtwork } from '../glitch/GlitchArtwork.web';
import { styles } from '../estilos.web';
import { COR, ESP } from '../tokens.web';
import { Artwork, Button, ContentScroll, Dialog, Empty, IconButton, Page, ui } from '../ui.web';
import type { CommonPageProps, NavegarFn, ShareTarget } from '../rotas';
import type { Track } from '../../types';
import { displayArtist, tituloDaFaixa } from '../../lib/artistName';
import { comCatalogo, garantirCatalogo, useCatalogoDeFaixas } from '../../state/catalogoDeFaixas';

/** A capa mantém o glitch; o gesto revela as letras na face adjacente. */
export function NowPlayingPage({
  more, currentIsSaved, toggleSaveCurrent, navigate, back, aoAdicionarAPlaylist, share,
}: CommonPageProps & {
  currentIsSaved: boolean;
  toggleSaveCurrent: () => void;
  navigate: NavegarFn;
  /** Devolve ao ecrã de onde se veio, como nas outras páginas. */
  back: () => void;
  aoAdicionarAPlaylist: (t: Track) => void;
  share: (target: ShareTarget) => void;
}) {
  // Esta página não usa a posição. Subscrever o store inteiro fazia a capa,
  // letras, fila e WebGL voltarem a renderizar a cada atualização da barra.
  const current = usePlayer((s) => s.current);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const shuffle = usePlayer((s) => s.shuffle);
  const shuffleOrder = usePlayer((s) => s.shuffleOrder);
  const upcomingQueue = usePlayer((s) => s.upcomingQueue);
  const playTrack = usePlayer((s) => s.playTrack);
  const moveQueueItem = usePlayer((s) => s.moveQueueItem);
  const eqGanhos = usePlayer((s) => s.eqGanhos);
  const setEqGanhos = usePlayer((s) => s.setEqGanhos);
  const playbackRate = usePlayer((s) => s.playbackRate);
  const setPlaybackRate = usePlayer((s) => s.setPlaybackRate);
  const eqAtivo = usePlayer((s) => s.eqAtivo);
  const ajustesPorFaixa = usePlayer((s) => s.ajustesPorFaixa);
  const [showLyrics,setShowLyrics]=useState(false);
  useEffect(()=>setShowLyrics(false),[current?.source,current?.sourceId]);
  const { width } = useWindowDimensions();
  // Uma vez por render: este ecrã redesenha a cada segundo (posição) e a
  // lista percorre a fila toda.
  const upNext = useMemo(
    () => upcomingQueue(),
    [queue, queueIndex, shuffle, shuffleOrder, upcomingQueue]
  );

  // A preferencia e lida uma vez e depois vem por evento, como a opacidade dos
  // paineis: as Definicoes sao outro ecra e este fica montado.
  const [eqAberto, setEqAberto] = useState(false);
  const [glitch, setGlitch] = useState<GlitchMode>('reactive');
  const [effectIntensity, setEffectIntensityState] = useState<EffectIntensity>('normal');
  useEffect(() => {
    Promise.all([getGlitchMode(), getEffectIntensity()]).then(([modo, intensidade]) => {
      setGlitch(modo);
      setEffectIntensityState(intensidade);
    });
    const ouvirModo = (e: any) => setGlitch(e.detail as GlitchMode);
    const ouvirIntensidade = (e: any) => setEffectIntensityState(e.detail as EffectIntensity);
    window.addEventListener('duotone:glitch-mode', ouvirModo);
    window.addEventListener('duotone:effect-intensity', ouvirIntensidade);
    return () => {
      window.removeEventListener('duotone:glitch-mode', ouvirModo);
      window.removeEventListener('duotone:effect-intensity', ouvirIntensidade);
    };
  }, []);

  const escolherIntensidade = (intensidade: EffectIntensity) => {
    setEffectIntensityState(intensidade);
    void setEffectIntensity(intensidade);
    window.dispatchEvent(new CustomEvent('duotone:effect-intensity', { detail: intensidade }));
  };

  if (!current) {
    return <Page title="Now Playing" subtitle="Nothing is playing right now." action={<Button secondary icon="arrow-back" onPress={back}>Back</Button>}><Empty icon="play-circle-outline" title="Silent" body="Start playing a track to see it here." /></Page>;
  }
  // O que o catálogo confirmou: nome, artista e capa QUADRADA. A versão entra
  // nas dependências para o ecrã redesenhar quando a resposta chegar.
  const versaoDoCatalogo = useCatalogoDeFaixas((s) => s.versao);
  const track = useMemo(() => (current ? comCatalogo(current) : current), [current, versaoDoCatalogo]);
  useEffect(() => { if (current) void garantirCatalogo([current]); }, [current?.sourceId]);
  const estreito = width < 1180;
  const ladoCapa = estreito ? 300 : width >= 1420 ? 420 : 384;

  return (
    <Page title="Now Playing" action={<Button secondary icon="arrow-back" onPress={back}>Back</Button>}>
      <ContentScroll>
        <View style={[styles.npGrelha, estreito && { flexDirection: 'column' }]}>
          <View style={[styles.npLado, { width: ladoCapa }]}>
            <ArtworkLyricsCube key={`${track.source}:${track.sourceId}`} track={track} size={ladoCapa} artwork={track.artworkUrl} showLyrics={showLyrics} onChange={setShowLyrics}
              front={<GlitchArtwork uri={track.artworkUrl} lado={ladoCapa} modo={glitch} intensidade={effectIntensity} />} />
            {/* A identidade primeiro: o nome da faixa e, por baixo, o artista.
                O artista sai do `displayArtist` e nao do campo `artist`, que no
                YouTube e o CANAL -- e abria a pagina de um canal de uploads. */}
            <View style={styles.npIdentidade}>
              <Text style={styles.npTitulo}>{tituloDaFaixa(track)}</Text>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`View ${displayArtist(track)}`}
                onPress={() => navigate({ name: 'artist', value: displayArtist(track) })}
                style={({ hovered, focused }: any) => [styles.npArtista, (hovered || focused) && styles.npArtistaHover]}
              >
                <Text style={styles.npArtista}>{displayArtist(track)}</Text>
              </Pressable>
            </View>

            {/* Primeiro o que se faz A ESTA FAIXA; depois da linha, o que e uma
                definicao de reproducao e vale para todas. */}
            <View style={styles.npAccoes}>
              <IconButton
                name={currentIsSaved ? 'heart' : 'heart-outline'}
                label={currentIsSaved ? 'Remove from Saved Songs' : 'Save to Saved Songs'}
                onPress={toggleSaveCurrent}
                active={currentIsSaved}
              />
              <IconButton
                name="albums-outline"
                label="Add to playlist"
                onPress={() => aoAdicionarAPlaylist(track)}
              />
              <IconButton
                name="share-social-outline"
                label="Share this track"
                onPress={() => share({ itemType: 'track', item: track, name: track.title })}
              />
              <View style={styles.npAccoesDivisor} />
              <IconButton
                name="options-outline"
                label="Equaliser and speed"
                onPress={() => setEqAberto(true)}
                active={!eqGanhos.every((g) => g === 0) || playbackRate !== 1}
              />
            </View>
          </View>

          <View style={styles.npFila}>
            <View style={styles.npFilaCabeca}>
              <View>
                <Text style={ui.eyebrow}>QUEUE</Text>
                <Text style={styles.npFilaHeading}>Up next</Text>
              </View>
              <Text style={styles.npFilaContagem}>{upNext.length} tracks</Text>
            </View>
            {/* A ordem que vai MESMO tocar: com shuffle ligado não é a ordem
                natural da fila, e esta lista mentia. Arrastar para
                reordenar fica desligado nesse caso — mover uma lista
                baralhada não corresponde a nada. */}
            <FilaArrastavel
              entradas={upNext.slice(0, 8)}
              podeArrastar={!shuffle}
              aoTocar={(t) => playTrack(t, queue)}
              aoMenu={more}
              aoMover={(de, para) => moveQueueItem(de, para)}
            />
            {upNext.length === 0 && (
              <Text style={styles.npFilaVazia}>Queue ends after this track.</Text>
            )}
            {upNext.length > 8 && (
              <Text style={styles.npFilaVazia}>{`View ${upNext.length - 8} more tracks in the queue`}</Text>
            )}
          </View>
        </View>
      </ContentScroll>
      <Dialog open={eqAberto} title="Equaliser" onClose={() => setEqAberto(false)} width={560}>
        <PainelEqualizador
          ganhos={eqGanhos}
          aoMudarGanhos={setEqGanhos}
          rate={playbackRate}
          aoMudarRate={setPlaybackRate}
          activo={eqAtivo}
          lembrado={!!ajustesPorFaixa[chaveDaFaixa(track)]}
        />
      </Dialog>
    </Page>
  );
}
