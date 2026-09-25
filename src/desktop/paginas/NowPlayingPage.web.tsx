import {ArtworkLyricsCube} from '../../components/ArtworkLyricsCube';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  getGlitchMode, type GlitchMode,
  getEffectIntensity, setEffectIntensity, type EffectIntensity,
} from '../../lib/prefs';
import { usePlayer } from '../../state/player';
import { useOuvirJuntos } from '../../state/ouvirJuntos';
import { rotuloDaOrigem } from '../../lib/origemDaFila';
import { trackKey } from '../../lib/shuffle';
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
import { Artwork, Button, desktop, Dialog, Empty, IconButton, marcar, Page, ui } from '../ui.web';
import { desfoqueLeve } from '../../lib/capaGrande';
import { disposicaoDoLeitor, fimDaFila } from '../../lib/leitorDoPc';
import { pertoDoFim } from '../../lib/grelhaQueCresce';
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
/**
 * Um botão da linha de ações do Now Playing: só o ícone, sem caixa. Acende ao
 * passar o rato; `ativo` acende-o de vez (o coração cheio) e `ponto` põe um
 * ponto por baixo (o som mexido). Ver a linha de ações mais abaixo.
 */
function AcaoDoLeitor({ rotulo, onPress, ativo = false, ponto = false, children }: {
  rotulo: string; onPress: () => void; ativo?: boolean; ponto?: boolean;
  children: (cor: string) => React.ReactNode;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={rotulo} onPress={onPress}
      style={({ pressed }: any) => [{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 }, pressed && ui.pressed]}>
      {({ hovered, focused }: any) => (
        <>
          {children(ativo || ponto || hovered || focused ? COR.texto : desktop.muted)}
          {ponto ? <View style={{ position: 'absolute', bottom: 1, width: 4, height: 4, borderRadius: 2, backgroundColor: COR.texto }} /> : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * Os dois pontos por baixo da capa: o primeiro é a capa, o segundo as letras.
 * Carregar num leva a essa face; o arrasto continua a funcionar.
 */
function PontosDaCapa({ letras, aoMudar }: { letras: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <View style={styles.npPontos} accessibilityRole="tablist">
      {[false, true].map((sao) => (
        <Pressable key={String(sao)} accessibilityRole="tab"
          accessibilityLabel={sao ? 'Lyrics' : 'Artwork'}
          accessibilityState={{ selected: letras === sao }}
          onPress={() => aoMudar(sao)}
          style={styles.npPontoAlvo}>
          <View style={[styles.npPonto, letras === sao && styles.npPontoAtivo]} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * O fundo do leitor do iPhone, no PC: a PRÓPRIA capa muito desfocada e
 * escurecida, com um véu por cima (mais forte do lado da fila e em baixo, para
 * tudo se ler com uma capa clara). Escolhido pelo João a 25/9 depois de ver uma
 * cor lisa e uma mancha à volta da capa ("uma cor estática").
 *
 * **Parte da miniatura pequena** (`desfoqueLeve`, a mesma do iPhone): desfocar
 * a capa grande era trabalho à toa. E é um `filter` numa IMAGEM parada, não um
 * `backdrop-filter` -- esse refaz-se a cada pintura e foi o que deixou a 3.7.1
 * pesada (ver o CLAUDE.md, "O movimento do PC").
 *
 * Ao mudar de faixa, a capa nova entra POR CIMA da anterior (`np-fundo`, 700
 * ms), e a de baixo só sai depois: nunca se vê o fundo vazio a meio.
 */
function FundoDaCapa({ uri }: { uri: string | null }) {
  const fonte = desfoqueLeve(uri, 64)?.uri ?? null;
  const [camadas, setCamadas] = useState<string[]>(() => (fonte ? [fonte] : []));
  useEffect(() => {
    if (!fonte) { setCamadas([]); return; }
    setCamadas((c) => (c[c.length - 1] === fonte ? c : [...c.slice(-1), fonte]));
    const t = setTimeout(() => setCamadas((c) => c.slice(-1)), 900);
    return () => clearTimeout(t);
  }, [fonte]);
  return (
    <View pointerEvents="none" style={styles.npFundo}>
      {camadas.map((c, i) => (
        <View key={c} style={[styles.npFundoCapa, { backgroundImage: `url("${c}")` } as any]}
          {...(i === camadas.length - 1 && camadas.length > 1 ? marcar('np-fundo') : {})} />
      ))}
      <View style={styles.npFundoVeu} />
    </View>
  );
}

/** Linhas da fila montadas de cada vez. */
const LINHAS_DA_FILA = 100;

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
  // De onde vem o que toca ("From Chill Vibes"). Ver lib/origemDaFila.ts.
  const origemDaFila = usePlayer((s) => s.origemDaFila);
  const doRadio = usePlayer((s) => s.doRadio);
  const sugeridas = usePlayer((s) => s.sugeridas);
  // Num jam manda a fila partilhada, e a origem pessoal não diz nada sobre ela.
  const emJam = useOuvirJuntos((s) => !!s.sessao);
  const [showLyrics,setShowLyrics]=useState(false);
  // Quantas linhas da fila estão montadas. A fila inteira podia ser a
  // biblioteca toda (um "Play all" de 2700 faixas), e cada linha é um nó
  // arrastável; montam-se às centenas, como na tabela das listas.
  const [linhasDaFila, setLinhasDaFila] = useState(LINHAS_DA_FILA);
  // O "Clear" pede um segundo clique: tirar quarenta faixas por engano não
  // tem volta atrás.
  const [aConfirmarLimpar, setAConfirmarLimpar] = useState(false);
  useEffect(() => {
    if (!aConfirmarLimpar) return;
    const t = setTimeout(() => setAConfirmarLimpar(false), 4000);
    return () => clearTimeout(t);
  }, [aConfirmarLimpar]);
  useEffect(()=>setShowLyrics(false),[current?.source,current?.sourceId]);
  // A capa mede-se pela ÁREA da página (a janela menos a lateral e o leitor),
  // e não pela janela: é essa que tem de caber. Ver lib/leitorDoPc.ts.
  const [area, setArea] = useState({ largura: 0, altura: 0 });
  const repeatMode = usePlayer((s) => s.repeatMode);
  const autoplayRadio = usePlayer((s) => s.autoplayRadio);
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
    return <Page title="Now Playing" action={<Button secondary icon="arrow-back" onPress={back}>Back</Button>}><Empty icon="play-circle-outline" title="Silent" body="Start playing a track to see it here." /></Page>;
  }
  const { duasColunas, lado: ladoCapa } = disposicaoDoLeitor(area.largura || 1192, area.altura || 788);
  const notaDoFim = fimDaFila({ emJam, repeatMode, autoplayRadio, vazia: upNext.length === 0 });
  // O artista sai do `displayArtist` e não do campo `artist`, que no YouTube é
  // o CANAL. A guarda é a mesma do iOS: sem nome não há para onde ir.
  const nomeDoArtista = displayArtist(track);
  const temArtista = !!nomeDoArtista && nomeDoArtista !== 'Unknown artist';
  // "From Chill Vibes". A chave da faixa ATUAL decide se foi a app a metê-la
  // (rádio, Smart Shuffle): essas não vieram da lista e não o podem dizer.
  const chaveAtual = trackKey(track);
  const origem = emJam ? null : rotuloDaOrigem(origemDaFila, {
    sugerida: sugeridas.includes(chaveAtual),
    doRadio: doRadio.includes(chaveAtual),
  });
  const alvo = origem?.alvo ?? null;
  const irParaOrigem = !alvo ? undefined
    : alvo.tipo === 'playlist' && alvo.id ? () => navigate({ name: 'playlist', id: alvo.id!, title: alvo.nome })
    : alvo.tipo === 'mistura' && alvo.id ? () => navigate({ name: 'mistura', id: alvo.id!, titulo: alvo.nome })
    : alvo.tipo === 'artista' ? () => navigate({ name: 'artist', value: alvo.nome })
    : alvo.tipo === 'guardadas' ? () => navigate({ name: 'songs' })
    : undefined;

  // A capa + o que vive por baixo dela. Numa janela larga fica parada à
  // esquerda enquanto a fila rola ao lado; numa estreita, tudo rola junto.
  const coluna = (
    <View style={[styles.npLado, { width: ladoCapa }]}>
      <ArtworkLyricsCube key={`${track.source}:${track.sourceId}`} track={track} size={ladoCapa} artwork={track.artworkUrl} showLyrics={showLyrics} onChange={setShowLyrics}
        front={<GlitchArtwork uri={track.artworkUrl} lado={ladoCapa} modo={glitch} intensidade={effectIntensity} />} />
      {/* As letras: dois pontos por baixo da capa, como no iPhone (decidido
          com o João a 25/9). Arrastar a capa continua a funcionar; os pontos
          são a porta que se vê -- até aqui só havia o arrasto. */}
      <PontosDaCapa letras={showLyrics} aoMudar={setShowLyrics} />
      {/* A identidade primeiro: o nome da faixa e, por baixo, o artista.
          O artista sai do `displayArtist` e nao do campo `artist`, que no
          YouTube e o CANAL -- e abria a pagina de um canal de uploads. */}
      <View style={styles.npIdentidade}>
        <Text numberOfLines={2} style={styles.npTitulo}>{tituloDaFaixa(track)}</Text>
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

      {/* Os seis ícones juntos, separados por um fio: à esquerda o que se faz
          A ESTA FAIXA, à direita o que é da reprodução (onde toca, o mini
          leitor, o som). Estavam atirados para as duas pontas da capa. */}
      <View style={styles.npIcones}>
        <AcaoDoLeitor rotulo={currentIsSaved ? 'Remove from Liked Songs' : 'Add to Liked Songs'} ativo={currentIsSaved} onPress={toggleSaveCurrent}>
          {(cor) => <Ionicons name={currentIsSaved ? 'heart' : 'heart-outline'} size={20} color={cor} />}
        </AcaoDoLeitor>
        <AcaoDoLeitor rotulo="Add to playlist" onPress={() => aoAdicionarAPlaylist(track)}>
          {(cor) => (
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
              <path d="M3 6h13M3 11h13M3 16h8M18 13.5v7M14.5 17h7" />
            </svg>
          )}
        </AcaoDoLeitor>
        <AcaoDoLeitor rotulo="Share this track" onPress={() => share({ itemType: 'track', item: track, name: track.title })}>
          {(cor) => <Ionicons name="share-social-outline" size={19} color={cor} />}
        </AcaoDoLeitor>
        <View style={styles.npIconesFio} />
        <AcaoDoLeitor rotulo="Play on another device" onPress={() => setAparelhosAberto(true)}>
          {(cor) => <Ionicons name="desktop-outline" size={19} color={cor} />}
        </AcaoDoLeitor>
        {/* O mini leitor (electron/miniLeitor.cjs): sem ícone na barra
            do leitor, que já tem que chegue -- abre-se daqui, do
            tabuleiro ou por um atalho que alguém crie. */}
        {window.duotoneDesktop?.alternarMiniLeitor ? (
          <AcaoDoLeitor rotulo="Mini player" onPress={() => window.duotoneDesktop?.alternarMiniLeitor?.()}>
            {(cor) => (
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={1.7} strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4.5" width="18" height="15" rx="2" />
                <rect x="12" y="12" width="6.5" height="5" rx="1" fill={cor} stroke="none" />
              </svg>
            )}
          </AcaoDoLeitor>
        ) : null}
        <AcaoDoLeitor rotulo="Equaliser and speed" ponto={!eqGanhos.every((g) => g === 0) || playbackRate !== 1} onPress={() => setEqAberto(true)}>
          {(cor) => <Ionicons name="options-outline" size={20} color={cor} />}
        </AcaoDoLeitor>
      </View>
    </View>
  );

  const cabecaDaFila = (
    <View style={styles.npFilaCabeca}>
      <Text style={styles.npFilaHeading}>Up next</Text>
      <Text style={styles.npFilaContagem}>{upNext.length}</Text>
      <View style={{ flex: 1 }} />
      {/* Num Jam a fila é de todos: não se limpa daqui. */}
      {!emJam && upNext.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={aConfirmarLimpar ? `Confirm: clear ${upNext.length} tracks from the queue` : 'Clear the queue'}
          onPress={() => {
            if (!aConfirmarLimpar) { setAConfirmarLimpar(true); return; }
            setAConfirmarLimpar(false);
            const sairam = usePlayer.getState().limparProximas();
            if (sairam > 0) notify(`Cleared ${sairam} ${sairam === 1 ? 'track' : 'tracks'} from the queue.`);
          }}
          style={({ hovered }: any) => [styles.npFilaLimpar, hovered && { backgroundColor: COR.hover }]}
        >
          <Text style={[styles.npFilaLimparTexto, aConfirmarLimpar && { color: COR.aviso }]}>
            {aConfirmarLimpar ? `Clear ${upNext.length}?` : 'Clear'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  /* A ordem que vai MESMO tocar: com shuffle ligado não é a ordem natural da
     fila, e esta lista mentia. Arrastar para reordenar fica desligado nesse
     caso -- mover uma lista baralhada não corresponde a nada. */
  const linhas = (
    <>
      <FilaArrastavel
        entradas={upNext.slice(0, linhasDaFila)}
        podeArrastar={!shuffle}
        aoTocar={(t) => playTrack(t, queue)}
        aoMenu={(t, indiceReal) => more(t, undefined, { fila: indiceReal })}
        aoMover={(de, para) => moveQueueItem(de, para)}
      />
      {/* O que acontece quando a fila acabar. Só com ela toda montada. */}
      {notaDoFim && upNext.length <= linhasDaFila ? (
        <Text style={styles.npFilaFim}>{notaDoFim}</Text>
      ) : null}
    </>
  );
  // Mais cem quando falta pouco para o fim: sem botão, como a grelha dos
  // Artists (lib/grelhaQueCresce.ts).
  const aoRolarAFila = (e: any) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (upNext.length > linhasDaFila && pertoDoFim(contentOffset.y, layoutMeasurement.height, contentSize.height)) {
      setLinhasDaFila((n) => n + LINHAS_DA_FILA);
    }
  };

  return (
    <View style={styles.npPagina} onLayout={(e) => {
      const { width: largura, height: altura } = e.nativeEvent.layout;
      setArea((a) => (Math.abs(a.largura - largura) > 1 || Math.abs(a.altura - altura) > 1 ? { largura, altura } : a));
    }}>
      {/* O fundo do iPhone: a própria capa, muito desfocada, com um véu. */}
      <FundoDaCapa uri={track.artworkUrl} />

      <View style={styles.npTopo}>
        <IconButton name="arrow-back" label="Back" onPress={back} />
        {origem ? (
          <View style={styles.npOrigem}>
            <Text style={ui.eyebrow}>{origem.antes}</Text>
            <Text
              onPress={irParaOrigem}
              accessibilityRole={irParaOrigem ? 'link' : undefined}
              numberOfLines={1}
              style={[styles.npOrigemNome, irParaOrigem && ({ cursor: 'pointer' } as any)]}
            >{origem.nome}</Text>
          </View>
        ) : null}
      </View>

      {duasColunas ? (
        <View style={styles.npGrelha}>
          {coluna}
          {/* A fila rola sozinha; a capa fica onde está. */}
          <View style={styles.npFila}>
            {cabecaDaFila}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: ESP.xl }}
              scrollEventThrottle={100} onScroll={aoRolarAFila}>
              {linhas}
            </ScrollView>
          </View>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.npEstreito}
          scrollEventThrottle={100} onScroll={aoRolarAFila}>
          {coluna}
          <View style={{ marginTop: ESP.xxl }}>
            {cabecaDaFila}
            {linhas}
          </View>
        </ScrollView>
      )}
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
    </View>
  );
}
