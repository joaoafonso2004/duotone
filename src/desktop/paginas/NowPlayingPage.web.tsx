/**
 * Now Playing — UMA ideia visual, não quatro.
 *
 * O que estava aqui a competir pelo mesmo ecrã: Flow Focus com cronómetro
 * próprio, aura ambiente a pulsar, a capa desfocada por cima da página
 * inteira, a capa rodada em 3D, e barras de equalizador em CSS a bater a um
 * ritmo que não era o da música. Fica só a capa com o glitch equalizer.
 */
import { Ionicons } from '@expo/vector-icons';
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
import { Artwork, ContentScroll, Dialog, Empty, IconButton, Page, ui } from '../ui.web';
import type { CommonPageProps } from '../rotas';

/**
 * Now Playing — UMA ideia visual, nao quatro.
 *
 * O que estava aqui a competir pelo mesmo ecra: o modo Flow Focus (com
 * cronometro proprio a substituir a fila), a aura ambiente a pulsar por tras,
 * o brilho da capa desfocado a 90 px por cima da pagina inteira, a capa rodada
 * em 3D com `perspective` e quatro barras de equalizador em CSS a bater a um
 * ritmo que nao era o da musica. Quatro ideias, nenhuma a ganhar — era isso
 * que fazia o ecra parecer indeciso, e nao faltar-lhe nada.
 *
 * Fica uma so: a capa com o GLITCH EQUALIZER por cima, que reage ao som a
 * serio (src/desktop/glitch/). O resto e tipografia e a fila.
 *
 * As barras de equalizador eram o caso mais claro: uma animacao CSS de duracao
 * fixa, a fingir que reagia. O glitch ou reage mesmo ou nao esta la.
 */
export function NowPlayingPage({ more, currentIsSaved, toggleSaveCurrent }: CommonPageProps & { currentIsSaved: boolean; toggleSaveCurrent: () => void }) {
  const p = usePlayer();
  const { width } = useWindowDimensions();
  // Uma vez por render: este ecrã redesenha a cada segundo (posição) e a
  // lista percorre a fila toda.
  const upNext = useMemo(
    () => p.upcomingQueue(),
    [p.queue, p.queueIndex, p.shuffle, p.shuffleOrder]
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

  if (!p.current) {
    return <Page title="Now Playing" subtitle="Nothing is playing right now."><Empty icon="play-circle-outline" title="Silent" body="Start playing a track to see it here." /></Page>;
  }
  const track = p.current;
  const estreito = width < 1180;
  const ladoCapa = estreito ? 300 : width >= 1420 ? 420 : 384;

  return (
    <Page title="Now Playing">
      <ContentScroll>
        <View style={[styles.npGrelha, estreito && { flexDirection: 'column' }]}>
          <View style={[styles.npLado, { width: ladoCapa }]}>
            <View style={styles.npArtworkFrame}>
              <GlitchArtwork uri={track.artworkUrl} lado={ladoCapa} modo={glitch} intensidade={effectIntensity} />
            </View>
            <View style={styles.npVisualControls}>
              <View style={styles.npVisualGroup}>
                {(['subtle', 'normal', 'strong'] as EffectIntensity[]).map((intensidade) => <Pressable key={intensidade} onPress={() => escolherIntensidade(intensidade)} style={[styles.npVisualOption, effectIntensity === intensidade && styles.npVisualOptionActive]}><Text style={[styles.npVisualOptionText, effectIntensity === intensidade && styles.npVisualOptionTextActive]}>{intensidade[0].toUpperCase() + intensidade.slice(1)}</Text></Pressable>)}
              </View>
            </View>
            <View style={styles.npTitleRow}>
              <Text style={styles.npTitulo}>{track.title}</Text>
              <IconButton
                name="options-outline"
                label="Equaliser and speed"
                onPress={() => setEqAberto(true)}
                active={!p.eqGanhos.every((g) => g === 0) || p.playbackRate !== 1}
              />
              <IconButton
                name={currentIsSaved ? 'heart' : 'heart-outline'}
                label={currentIsSaved ? 'Remove from Saved Songs' : 'Save to Saved Songs'}
                onPress={toggleSaveCurrent}
                active={currentIsSaved}
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
              podeArrastar={!p.shuffle}
              aoTocar={(t) => p.playTrack(t, p.queue)}
              aoMenu={more}
              aoMover={(de, para) => p.moveQueueItem(de, para)}
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
          ganhos={p.eqGanhos}
          aoMudarGanhos={p.setEqGanhos}
          rate={p.playbackRate}
          aoMudarRate={p.setPlaybackRate}
          activo={p.eqAtivo}
          lembrado={!!p.ajustesPorFaixa[chaveDaFaixa(track)]}
        />
      </Dialog>
    </Page>
  );
}
