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
import { mandarComando, useAparelhos } from '../../lib/connectSync';
import { avisoDoPedido, type TipoDePedido } from '../../lib/duotoneConnect';
import { extrapolatedPositionMs } from '../../lib/handoff';
import { takeOverSession } from '../../lib/sessionSync';
import { styles } from '../estilos.web';
import { COR, ESP } from '../tokens.web';
import { Artwork, Button, ContentScroll, Dialog, Empty, IconButton, Page, ui } from '../ui.web';
import type { CommonPageProps, NavegarFn, ShareTarget } from '../rotas';
import type { Track } from '../../types';
import { displayArtist, tituloDaFaixa } from '../../lib/artistName';
import { comCatalogo, garantirCatalogo, useCatalogoDeFaixas } from '../../state/catalogoDeFaixas';

function fmtRelogio(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * O comando do outro aparelho, dentro do dialogo dos aparelhos.
 *
 * Vivia so no banner do "continuar aqui", que se dispensa -- e depois de
 * dispensado ficava 15 minutos calado, sem porta nenhuma para voltar. Daqui
 * chega-se sempre pelo mesmo caminho: "Play on another device", e o aparelho
 * que esta a tocar.
 *
 * Nao se finge nada localmente: os botoes mandam ordens, e o que se mostra vem
 * da sessao do outro lado, que chega pelo Realtime. A posicao e projetada (o
 * `tique` obriga a recontar de segundo a segundo), como no banner.
 */
function ComandoDoAparelho({ nome, sessao, tique, aoVoltar, aoOrdenar, aoTrazer }: {
  nome: string;
  sessao: ReturnType<ReturnType<typeof useAparelhos>['sessaoDe']>;
  tique: number;
  aoVoltar: () => void;
  aoOrdenar: (tipo: TipoDePedido) => void;
  aoTrazer: () => void;
}) {
  void tique;
  if (!sessao?.track) {
    return (
      <View style={{ gap: ESP.md }}>
        <Empty icon="phone-portrait-outline" title={`${nome} stopped`}
          body="It is not playing anything now. Open Duotone there and try again." />
        <Button secondary icon="arrow-back" onPress={aoVoltar}>Back to devices</Button>
      </View>
    );
  }
  const posicao = extrapolatedPositionMs(sessao);
  const duracao = (sessao.track.durationSeconds ?? 0) * 1000;
  const fracao = duracao > 0 ? Math.min(1, posicao / duracao) : 0;
  const Botao = Pressable as any;
  const botao = ({ hovered }: any) => [{
    width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    backgroundColor: hovered ? COR.hover : COR.painel, cursor: 'pointer',
  }] as any;
  return (
    <View style={{ gap: ESP.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.md }}>
        <Artwork track={sessao.track} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={ui.eyebrow}>{sessao.isPlaying ? 'PLAYING ON' : 'PAUSED ON'} {nome.toUpperCase()}</Text>
          <Text numberOfLines={1} style={[styles.destinationText, { flex: 0, marginTop: 2 }]}>
            {tituloDaFaixa(sessao.track)}
          </Text>
          <Text numberOfLines={1} style={{ color: COR.textoMedio, fontSize: 12 }}>
            {displayArtist(sessao.track)}
          </Text>
        </View>
      </View>

      <View style={{ gap: 4 }}>
        <View style={{ height: 3, borderRadius: 999, backgroundColor: COR.linha }}>
          <View style={{ height: 3, borderRadius: 999, width: `${fracao * 100}%`, backgroundColor: COR.metalClaro }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: COR.textoFraco, fontSize: 11 }}>{fmtRelogio(posicao)}</Text>
          <Text style={{ color: COR.textoFraco, fontSize: 11 }}>{duracao > 0 ? fmtRelogio(duracao) : '--:--'}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ESP.lg }}>
        <Botao accessibilityLabel={`Previous on ${nome}`} onPress={() => aoOrdenar('anterior')} style={botao}>
          <Ionicons name="play-skip-back" size={18} color={COR.texto} />
        </Botao>
        <Botao accessibilityLabel={`${sessao.isPlaying ? 'Pause' : 'Play'} on ${nome}`}
          onPress={() => aoOrdenar('tocar-pausa')} style={botao}>
          <Ionicons name={sessao.isPlaying ? 'pause' : 'play'} size={20} color={COR.texto} />
        </Botao>
        <Botao accessibilityLabel={`Next on ${nome}`} onPress={() => aoOrdenar('seguinte')} style={botao}>
          <Ionicons name="play-skip-forward" size={18} color={COR.texto} />
        </Botao>
      </View>

      <View style={{ flexDirection: 'row', gap: ESP.sm }}>
        <Button secondary icon="arrow-back" onPress={aoVoltar}>Back to devices</Button>
        <Button icon="play" onPress={aoTrazer}>Continue here</Button>
      </View>
    </View>
  );
}

/** A capa mantém o glitch; o gesto revela as letras na face adjacente. */
export function NowPlayingPage({
  more, notify, currentIsSaved, toggleSaveCurrent, navigate, back, aoAdicionarAPlaylist, share,
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
  // Duotone Connect: mandar o que toca aqui para outro aparelho da conta.
  const [aparelhosAberto, setAparelhosAberto] = useState(false);
  const [aMandar, setAMandar] = useState<string | null>(null);
  const { aparelhos, sessaoDe, aCarregar: aProcurarAparelhos } = useAparelhos(aparelhosAberto);
  // O aparelho cujo comando esta aberto. O dialogo e o mesmo: primeiro a
  // lista, depois o comando de quem esta a tocar.
  const [aComandar, setAComandar] = useState<string | null>(null);
  const [tiqueDoRemoto, setTiqueDoRemoto] = useState(0);
  const [glitch, setGlitch] = useState<GlitchMode>('reactive');
  const [effectIntensity, setEffectIntensityState] = useState<EffectIntensity>('normal');
  // O realce do nome do artista. Vive aqui e não no `style` do `Pressable`
  // porque o que muda é a cor do TEXTO, e essa tem de ser posta no `<Text>`.
  const [sobreOArtista, setSobreOArtista] = useState(false);
  const [noArtista, setNoArtista] = useState(false);
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

  useEffect(() => {
    if (!aComandar || !aparelhosAberto) return;
    const id = setInterval(() => setTiqueDoRemoto((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [aComandar, aparelhosAberto]);

  const escolherIntensidade = (intensidade: EffectIntensity) => {
    setEffectIntensityState(intensidade);
    void setEffectIntensity(intensidade);
    window.dispatchEvent(new CustomEvent('duotone:effect-intensity', { detail: intensidade }));
  };

  // O que o catálogo confirmou: nome, artista e capa QUADRADA. A versão entra
  // nas dependências para o ecrã redesenhar quando a resposta chegar.
  const versaoDoCatalogo = useCatalogoDeFaixas((s) => s.versao);
  const track = useMemo(() => (current ? comCatalogo(current) : current), [current, versaoDoCatalogo]);
  useEffect(() => { if (current) void garantirCatalogo([current]); }, [current]);
  if (!track) {
    return <Page title="Now Playing" subtitle="Nothing is playing right now." action={<Button secondary icon="arrow-back" onPress={back}>Back</Button>}><Empty icon="play-circle-outline" title="Silent" body="Start playing a track to see it here." /></Page>;
  }
  const estreito = width < 1180;
  const ladoCapa = estreito ? 300 : width >= 1420 ? 420 : 384;
  // O artista sai do `displayArtist` e não do campo `artist`, que no YouTube é
  // o CANAL. A guarda é a mesma do iOS: sem nome não há para onde ir.
  const nomeDoArtista = displayArtist(track);
  const temArtista = !!nomeDoArtista && nomeDoArtista !== 'Unknown artist';

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
              {/* O nome leva à página do artista, como no telemóvel. E TEM de
                  se ver que leva: o realce é no `<Text>` e o cursor é
                  explícito -- ver o `npArtistaAlvo`.

                  Sem artista não é botão nenhum, que é a mesma guarda do
                  `PlayerRoot.tsx` no iOS: o `displayArtist` devolve "Unknown
                  artist" quando não consegue extrair nada, e um link para
                  isso leva a uma página vazia. */}
              <Pressable
                accessibilityRole={temArtista ? 'link' : undefined}
                accessibilityLabel={temArtista ? `View ${nomeDoArtista}` : undefined}
                disabled={!temArtista}
                onHoverIn={() => setSobreOArtista(true)}
                onHoverOut={() => setSobreOArtista(false)}
                onFocus={() => setNoArtista(true)}
                onBlur={() => setNoArtista(false)}
                onPress={() => navigate({ name: 'artist', value: nomeDoArtista })}
                style={[styles.npArtistaAlvo, !temArtista && styles.npArtistaAlvoInerte]}
              >
                <Text style={[
                  styles.npArtista,
                  temArtista && (sobreOArtista || noArtista) && styles.npArtistaHover,
                ]}>
                  {nomeDoArtista}
                </Text>
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
              <IconButton
                name="desktop-outline"
                label="Play on another device"
                onPress={() => setAparelhosAberto(true)}
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
              aoMenu={(t, indiceReal) => more(t, undefined, { fila: indiceReal })}
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
      {/* Os outros aparelhos desta conta. Os que não estão à escuta aparecem
          na mesma, apagados e a dizer porquê -- a regra dos menus. */}
      <Dialog
        open={aparelhosAberto}
        title={aComandar ? `Controlling ${aparelhos.find((a) => a.deviceId === aComandar)?.nome ?? 'device'}` : 'Play on another device'}
        onClose={() => { if (!aMandar) { setAparelhosAberto(false); setAComandar(null); } }}
      >
        {aComandar ? (
          <ComandoDoAparelho
            nome={aparelhos.find((a) => a.deviceId === aComandar)?.nome ?? 'Device'}
            sessao={sessaoDe(aComandar)}
            tique={tiqueDoRemoto}
            aoVoltar={() => setAComandar(null)}
            aoOrdenar={(tipo) => {
              const alvo = aComandar;
              if (!alvo) return;
              void mandarComando(alvo, tipo).then((estado) => {
                if (estado === 'feito') return;
                notify(avisoDoPedido(estado, aparelhos.find((a) => a.deviceId === alvo)?.nome ?? 'Device', tipo));
              });
            }}
            aoTrazer={() => {
              const sessao = aComandar ? sessaoDe(aComandar) : null;
              if (!sessao) return;
              void takeOverSession(sessao);
              setAparelhosAberto(false);
              setAComandar(null);
            }}
          />
        ) : aparelhos.length ? (
          <View style={{ gap: 6 }}>
            {aparelhos.map((a) => (
              <Pressable
                key={a.deviceId}
                disabled={!a.acordado || !!aMandar}
                accessibilityState={{ disabled: !a.acordado }}
                onPress={() => {
                  // O que esta a TOCAR abre o comando; o resto recebe a
                  // musica. Mandar "assumir" a quem ja toca era passar-lhe a
                  // fila por cima -- e dali o que se quer e mexer nele.
                  if (a.aTocar) { setAComandar(a.deviceId); return; }
                  setAMandar(a.deviceId);
                  void mandarComando(a.deviceId, 'assumir').then((estado) => {
                    setAMandar(null);
                    notify(avisoDoPedido(estado, a.nome, 'assumir'));
                    if (estado === 'feito') setAparelhosAberto(false);
                  });
                }}
                style={({ hovered }: any) => [styles.destination, hovered && a.acordado && styles.settingHover, !a.acordado && ({ cursor: 'default' } as any)]}
              >
                <Ionicons
                  name={a.tipo === 'desktop' ? 'desktop-outline' : 'phone-portrait-outline'}
                  size={18}
                  color={COR.texto}
                  style={{ opacity: a.acordado ? 1 : 0.4 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.destinationText, { flex: 0 }, !a.acordado && { opacity: 0.4 }]}>{a.nome}</Text>
                  {a.motivo || a.aTocar ? (
                    <Text style={{ color: COR.textoFraco, fontSize: 11, marginTop: 2 }}>
                      {aMandar === a.deviceId ? 'Sending…' : a.motivo ?? 'Playing now · open the controls'}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <Empty
            icon="desktop-outline"
            title={aProcurarAparelhos ? 'Looking for devices…' : 'No other devices'}
            body="Open Duotone on your iPhone or another PC with the same account, and it shows up here."
          />
        )}
      </Dialog>
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
