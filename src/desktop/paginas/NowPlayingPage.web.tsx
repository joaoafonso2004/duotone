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
  getArtworkEffect, setArtworkEffect, type ArtworkEffect,
  getEffectIntensity, setEffectIntensity, type EffectIntensity,
} from '../../lib/prefs';
import { usePlayer } from '../../state/player';
import { GlitchArtwork } from '../glitch/GlitchArtwork.web';
import { styles } from '../estilos.web';
import { COR, ESP } from '../tokens.web';
import { Artwork, ContentScroll, Empty, IconButton, Page, ui } from '../ui.web';
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
  const [glitch, setGlitch] = useState<GlitchMode>('reactive');
  const [artworkEffect, setArtworkEffectState] = useState<ArtworkEffect>('glitch');
  const [effectIntensity, setEffectIntensityState] = useState<EffectIntensity>('normal');
  useEffect(() => {
    Promise.all([getGlitchMode(), getArtworkEffect(), getEffectIntensity()]).then(([modo, efeito, intensidade]) => {
      setGlitch(modo);
      setArtworkEffectState(efeito);
      setEffectIntensityState(intensidade);
    });
    const ouvirModo = (e: any) => setGlitch(e.detail as GlitchMode);
    const ouvirEfeito = (e: any) => setArtworkEffectState(e.detail as ArtworkEffect);
    const ouvirIntensidade = (e: any) => setEffectIntensityState(e.detail as EffectIntensity);
    window.addEventListener('duotone:glitch-mode', ouvirModo);
    window.addEventListener('duotone:artwork-effect', ouvirEfeito);
    window.addEventListener('duotone:effect-intensity', ouvirIntensidade);
    return () => {
      window.removeEventListener('duotone:glitch-mode', ouvirModo);
      window.removeEventListener('duotone:artwork-effect', ouvirEfeito);
      window.removeEventListener('duotone:effect-intensity', ouvirIntensidade);
    };
  }, []);

  const escolherEfeito = (efeito: ArtworkEffect) => {
    setArtworkEffectState(efeito);
    void setArtworkEffect(efeito);
    window.dispatchEvent(new CustomEvent('duotone:artwork-effect', { detail: efeito }));
  };
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
              <GlitchArtwork uri={track.artworkUrl} lado={ladoCapa} modo={glitch} efeito={artworkEffect} intensidade={effectIntensity} />
            </View>
            <View style={styles.npVisualControls}>
              <View style={styles.npVisualGroup}>
                {(['glitch', 'waves'] as ArtworkEffect[]).map((efeito) => <Pressable key={efeito} onPress={() => escolherEfeito(efeito)} style={[styles.npVisualOption, artworkEffect === efeito && styles.npVisualOptionActive]}><Text style={[styles.npVisualOptionText, artworkEffect === efeito && styles.npVisualOptionTextActive]}>{efeito === 'glitch' ? 'Glitch' : 'Waves'}</Text></Pressable>)}
              </View>
              <View style={styles.npVisualDivider} />
              <View style={styles.npVisualGroup}>
                {(['subtle', 'normal', 'strong'] as EffectIntensity[]).map((intensidade) => <Pressable key={intensidade} onPress={() => escolherIntensidade(intensidade)} style={[styles.npVisualOption, effectIntensity === intensidade && styles.npVisualOptionActive]}><Text style={[styles.npVisualOptionText, effectIntensity === intensidade && styles.npVisualOptionTextActive]}>{intensidade[0].toUpperCase() + intensidade.slice(1)}</Text></Pressable>)}
              </View>
            </View>
            <View style={styles.npTitleRow}>
              <Text numberOfLines={2} style={styles.npTitulo}>{track.title}</Text>
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
            {upNext.slice(0, 8).map((entry, visibleIndex) => {
              const item = entry.track;
              const originalIndex = entry.index;
              return (
                <div
                  key={`${item.source}:${item.sourceId}:${originalIndex}`}
                  className="np-fila-linha"
                  draggable={!p.shuffle}
                  onDragStart={(e: any) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(originalIndex));
                    e.currentTarget.style.opacity = '0.5';
                  }}
                  onDragEnd={(e: any) => { e.currentTarget.style.opacity = '1'; }}
                  onDragOver={(e: any) => { e.preventDefault(); }}
                  onDrop={(e: any) => {
                    e.preventDefault();
                    const fromIdx = Number(e.dataTransfer.getData('text/plain'));
                    if (!isNaN(fromIdx) && fromIdx !== originalIndex) {
                      p.moveQueueItem(fromIdx, originalIndex);
                    }
                  }}
                  onClick={() => p.playTrack(item, p.queue)}
                  onContextMenu={(e: any) => { e.preventDefault(); more(item); }}
                  style={{
                    minHeight: 64,
                    padding: `0 ${ESP.sm}px`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${ESP.md}px`,
                    cursor: p.shuffle ? 'pointer' : 'grab',
                    userSelect: 'none',
                    borderLeft: visibleIndex === 0 ? `2px solid ${COR.texto}` : '2px solid transparent',
                    background: visibleIndex === 0 ? COR.metalSuave : 'transparent',
                  } as any}
                >
                  <Artwork track={item} size={44} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={styles.npFilaTitulo}>{item.title}</Text>
                  </View>
                  {!p.shuffle && <Ionicons name="reorder-two-outline" size={16} color={COR.textoFraco} />}
                </div>
              );
            })}
            {upNext.length === 0 && (
              <Text style={styles.npFilaVazia}>Queue ends after this track.</Text>
            )}
            {upNext.length > 8 && (
              <Text style={styles.npFilaVazia}>{`View ${upNext.length - 8} more tracks in the queue`}</Text>
            )}
          </View>
        </View>
      </ContentScroll>
    </Page>
  );
}
