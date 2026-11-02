import { AbasDoCartao, CabecaDaFila, LinhasDaFila, type AbaDoCartao } from '../FilaDoLeitor.web';
import { SobreAMusica } from '../SobreAMusica.web';
import { LyricsView } from '../../components/LyricsView';
import { useFilaDoLeitor } from '../useFilaDoLeitor.web';
import {ArtworkLyricsCube} from '../../components/ArtworkLyricsCube';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  getGlitchMode, type GlitchMode,
  getEffectIntensity, setEffectIntensity, type EffectIntensity,
} from '../../lib/prefs';
import { ganhosEmVigor, usePlayer } from '../../state/player';
import { rotuloDaOrigem } from '../../lib/origemDaFila';
import { trackKey } from '../../lib/shuffle';
import { chaveDaFaixa } from '../../lib/equalizer';
import { PainelEqualizador } from '../PainelEqualizador.web';
import { GlitchArtwork } from '../glitch/GlitchArtwork.web';
import { styles } from '../estilos.web';
import { COR, ESP, ESTADO, TIPO } from '../tokens.web';
import { BotaoVoltar, Artwork, Dialog, Empty, IconButton, marcar, Page, ui } from '../ui.web';
import { FundoDaCapa } from '../FundoDaCapa.web';
import { preCarregarCapaGrande, useCapaGrande } from '../useCapaGrande.web';
import { useCapaQueSai } from '../Ocultacao.web';
import { DuasLuas } from '../DuasLuas.web';
import { luasNoEcra } from '../../state/passagemAVista';
import { sentidoDaOcultacao } from '../../lib/ocultacao';
import { disposicaoDoLeitor } from '../../lib/leitorDoPc';
import type { CommonPageProps, NavegarFn, ShareTarget } from '../rotas';
import type { Track } from '../../types';
import { CoracaoAnimado } from '../../components/CoracaoAnimado';
import { useCoracaoAoCarregar } from '../../hooks/useCoracaoAoCarregar';
import { displayArtist, tituloDaFaixa } from '../../lib/artistName';
import { comCatalogo, garantirCatalogo, useCatalogoDeFaixas } from '../../state/catalogoDeFaixas';


import { FRASES_DOS_ESTADOS } from '../../lib/frasesDosEstados';
/** A capa mantém o glitch; o gesto revela as letras na face adjacente. */
/**
 * Um botão da linha de ações do Now Playing: só o ícone, sem caixa. Acende ao
 * passar o rato; `ativo` acende-o de vez (o coração cheio) e `ponto` põe um
 * ponto por baixo (o som mexido). Ver a linha de ações mais abaixo.
 */
function AcaoDoLeitor({ rotulo, onPress, onPressIn, onPressOut, ativo = false, ponto = false, children }: {
  rotulo: string; onPress: () => void; ativo?: boolean; ponto?: boolean;
  /** Para quem reage ao carregar (o coração). */
  onPressIn?: () => void; onPressOut?: () => void;
  children: (cor: string) => React.ReactNode;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={rotulo} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}
      style={({ pressed }: any) => [{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 }, pressed && ui.pressed]}>
      {({ hovered, focused }: any) => (
        <>
          {children(ativo || ponto || hovered || focused ? COR.texto : COR.textoMedio)}
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

export function NowPlayingPage({
  more, notify, currentIsSaved, toggleSaveCurrent, navigate, back, aoAdicionarAPlaylist, share, fundoNaJanela = false,
}: CommonPageProps & {
  /** A casca já pinta a cor da capa na janela inteira (`pref:corNaJanela`). */
  fundoNaJanela?: boolean;
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
  const fila = useFilaDoLeitor({ more, notify });
  const { current, upNext, emJam } = fila;
  // O coração reage ao carregar (16/10, lib/coracaoAoCarregar.ts).
  const coracao = useCoracaoAoCarregar(currentIsSaved, toggleSaveCurrent);
  const eqGanhos = usePlayer(ganhosEmVigor);
  const setEqGanhos = usePlayer((s) => s.setEqGanhos);
  const playbackRate = usePlayer((s) => s.playbackRate);
  const setPlaybackRate = usePlayer((s) => s.setPlaybackRate);
  const eqAtivo = usePlayer((s) => s.eqAtivo);
  const ajustesPorFaixa = usePlayer((s) => s.ajustesPorFaixa);
  // De onde vem o que toca ("From Chill Vibes"). Ver lib/origemDaFila.ts.
  const origemDaFila = usePlayer((s) => s.origemDaFila);
  const doRadio = usePlayer((s) => s.doRadio);
  const sugeridas = usePlayer((s) => s.sugeridas);
  const [showLyrics,setShowLyrics]=useState(false);
  // Com as Duas luas à frente (C9), o cubo da capa fica escondido por baixo delas.
  const [cuboEscondido, setCuboEscondido] = useState(false);
  useEffect(()=>setShowLyrics(false),[current?.source,current?.sourceId]);
  // A capa mede-se pela ÁREA da página (a janela menos a lateral e o leitor),
  // e não pela janela: é essa que tem de caber. Ver lib/leitorDoPc.ts.
  const [area, setArea] = useState({ largura: 0, altura: 0 });
  // A preferencia e lida uma vez e depois vem por evento, como a opacidade dos
  // paineis: as Definicoes sao outro ecra e este fica montado.
  const [eqAberto, setEqAberto] = useState(false);
  const [glitch, setGlitch] = useState<GlitchMode>('reactive');
  const [effectIntensity, setEffectIntensityState] = useState<EffectIntensity>('normal');
  // O realce do nome do artista. Vive aqui e não no `style` do `Pressable`
  // porque o que muda é a cor do TEXTO, e essa tem de ser posta no `<Text>`.
  const [sobreOArtista, setSobreOArtista] = useState(false);
  const [noArtista, setNoArtista] = useState(false);
  // Estes hooks também correm sem música: fechar a barra mantém esta página montada.
  const [abaDaFila, setAbaDaFila] = useState<AbaDoCartao>('fila');
  const [letraGrande, setLetraGrande] = useState(false);
  useEffect(() => { setLetraGrande(false); }, [current?.source, current?.sourceId]);
  useEffect(() => {
    if (!letraGrande) return;
    const aoEscape = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); setLetraGrande(false); } };
    window.addEventListener('keydown', aoEscape);
    return () => window.removeEventListener('keydown', aoEscape);
  }, [letraGrande]);
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

  // O que o catálogo confirmou: nome, artista e capa QUADRADA. A versão entra
  // nas dependências para o ecrã redesenhar quando a resposta chegar.
  const versaoDoCatalogo = useCatalogoDeFaixas((s) => s.versao);
  const track = useMemo(() => (current ? comCatalogo(current) : current), [current, versaoDoCatalogo]);
  useEffect(() => { if (current) void garantirCatalogo([current]); }, [current]);
  // A capa grande (maxres) e não a miniatura das listas: esticada a 500 px via-se
  // desfocada. A seguinte é pedida já, para o skip não esperar por ela.
  const capaGrande = useCapaGrande(track ?? { source: '', sourceId: '', artworkUrl: null });
  // A Ocultação (C2, 1/11): a capa da música que saiu fica por cima da nova até a
  // sombra da que vem a tapar. Com a letra à frente não há capa para tapar.
  const faixaAtual = track ? `${track.source}:${track.sourceId}` : '';
  const caixaDaCapa = useRef<any>(null);
  const capaQueSai = useCapaQueSai(faixaAtual, track && capaGrande ? capaGrande : null, {
    caixa: caixaDaCapa, capa: track?.artworkUrl, ligada: !showLyrics && !luasNoEcra(),
    sentido: () => sentidoDaOcultacao(usePlayer.getState().saltoDaFaixa, Date.now()),
  });
  const seguinte = upNext[0]?.track;
  useEffect(() => { preCarregarCapaGrande(seguinte ? comCatalogo(seguinte) : null); }, [seguinte?.sourceId]);
  if (!track) {
    return <Page title="Now Playing" action={<BotaoVoltar onPress={back} />}><Empty icon="play-circle-outline" title={FRASES_DOS_ESTADOS.nadaATocar.titulo} body={FRASES_DOS_ESTADOS.nadaATocar.corpo} /></Page>;
  }
  const { duasColunas, lado: ladoCapa } = disposicaoDoLeitor(area.largura || 1192, area.altura || 788);
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
      {/* Mudar de música é uma passagem, não um corte (26/9, pedido do João): a
          Ocultação (C2) por cima da capa, e o título entra logo a seguir
          (`np-texto-entra`, na casca). */}
      <View style={{ width: ladoCapa, height: ladoCapa }}>
        {/* O botão direito na capa abre o menu da música (24/10), o curto do leitor. */}
        <View key={`entra:${faixaAtual}`} style={cuboEscondido ? { opacity: 0 } : undefined}
          {...({ onContextMenu: (e: any) => { e.preventDefault(); more(track, undefined, { leitor: 'capa' }); } } as any)}>
          <ArtworkLyricsCube track={track} size={ladoCapa} artwork={track.artworkUrl} showLyrics={showLyrics} onChange={setShowLyrics}
            front={<GlitchArtwork uri={capaGrande} lado={ladoCapa} modo={glitch} intensidade={effectIntensity} />} />
        </View>
        {/* Por cima da capa, numa camada que corta o disco sem cortar o cubo da letra. */}
        <View ref={caixaDaCapa} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: ladoCapa, height: ladoCapa, borderRadius: 14, overflow: 'hidden', zIndex: 3 }}>
          {capaQueSai ? (
            // Um <img> a sério e não a <Image> do RNW: essa só desenha depois de
            // voltar a carregar a imagem (mesmo em cache), e ficava um buraco.
            <img data-dt="capa-sai" src={capaQueSai} alt=""
              style={{ position: 'absolute', width: ladoCapa, height: ladoCapa, objectFit: 'cover' }} />
          ) : null}
        </View>
        <DuasLuas lado={ladoCapa} capaDaQueSai={capaGrande} ligada={!showLyrics} aoEsconderCubo={setCuboEscondido} />
      </View>
      {/* As letras: dois pontos por baixo da capa, como no iPhone (decidido
          com o João a 25/9). Arrastar a capa continua a funcionar; os pontos
          são a porta que se vê -- até aqui só havia o arrasto. */}
      <PontosDaCapa letras={showLyrics} aoMudar={setShowLyrics} />
      {/* A identidade primeiro: o nome da faixa e, por baixo, o artista.
          O artista sai do `displayArtist` e nao do campo `artist`, que no
          YouTube e o CANAL -- e abria a pagina de um canal de uploads. */}
      <View key={`texto:${faixaAtual}`} {...marcar('np-texto-entra')} style={styles.npIdentidade}>
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
        {/* As Faíscas a guardar e o Encolher a tirar, logo ao carregar (16/10). */}
        <AcaoDoLeitor rotulo={coracao.mostrada ? 'Remove from Liked Songs' : 'Add to Liked Songs'} ativo={coracao.mostrada}
          onPressIn={coracao.onPressIn} onPress={coracao.onPress} onPressOut={coracao.onPressOut}>
          {(cor) => <CoracaoAnimado guardada={coracao.mostrada} pulso={coracao.pulso} tamanho={20} cor={cor} corCheio={cor} />}
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

  const cabecaDaFila = <CabecaDaFila fila={fila} />;
  const linhas = <LinhasDaFila fila={fila} />;

  return (
    <View style={styles.npPagina} onLayout={(e) => {
      const { width: largura, height: altura } = e.nativeEvent.layout;
      setArea((a) => (Math.abs(a.largura - largura) > 1 || Math.abs(a.altura - altura) > 1 ? { largura, altura } : a));
    }}>
      {/* O fundo do iPhone: a própria capa, muito desfocada, com um véu. Com a
          cor na janela toda, quem a desenha é a casca, por baixo de tudo. */}
      {!fundoNaJanela && <FundoDaCapa uri={track.artworkUrl} />}

      {/* O topo (26/9, o João achou o "FROM" em letra técnica feio): o voltar
          num círculo discreto e a origem em duas linhas, como os leitores de
          música fazem -- "Playing from" pequeno por cima, a lista por baixo, e
          uma seta quando dá para a abrir. */}
      <View style={styles.npTopo}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back}
          style={({ hovered }: any) => [styles.npVoltar, hovered && styles.npVoltarHover]}>
          <Ionicons name="chevron-back" size={18} color={COR.texto} />
        </Pressable>
        {origem ? (
          <Pressable
            onPress={irParaOrigem}
            disabled={!irParaOrigem}
            accessibilityRole={irParaOrigem ? 'link' : undefined}
            accessibilityLabel={`${origem.antes} ${origem.nome}`}
            style={styles.npOrigem}
          >
            {({ hovered }: any) => (
              <>
                <Text style={styles.npOrigemAntes}>{origem.antes === 'From' ? 'Playing from' : origem.antes.replace(/^From/, 'Playing from')}</Text>
                <View style={styles.npOrigemLinha}>
                  <Text numberOfLines={1} style={[styles.npOrigemNome, irParaOrigem && hovered && styles.npOrigemNomeHover]}>{origem.nome}</Text>
                  {irParaOrigem ? <Ionicons name="chevron-forward" size={13} color={hovered ? COR.texto : COR.textoMedio} /> : null}
                </View>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      {letraGrande ? (
        <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', gap: ESP.xxl, paddingHorizontal: ESP.lg, paddingTop: ESP.sm }}>
          <View style={{ width: 240, gap: ESP.md }}>
            <Artwork track={track} size={240} />
            <View>
              <Text numberOfLines={2} style={styles.npTitulo}>{tituloDaFaixa(track)}</Text>
              <Text numberOfLines={1} style={styles.npArtista}>{nomeDoArtista}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Collapse the lyrics" onPress={() => setLetraGrande(false)}
              style={({ hovered }: any) => [styles.npFilaLimpar, { flexDirection: 'row', alignItems: 'center', gap: ESP.sm, alignSelf: 'flex-start', borderWidth: 1, borderColor: COR.linha, borderRadius: 999, paddingHorizontal: ESP.md, paddingVertical: ESP.sm }, hovered && { backgroundColor: ESTADO.hover }]}>
              <Ionicons name="contract-outline" size={14} color={COR.textoMedio} />
              <Text style={styles.npFilaLimparTexto}>Collapse · Esc</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}><LyricsView key={`grande:${track.source}:${track.sourceId}`} track={track} visible escala={1.5} /></View>
        </View>
      ) : duasColunas ? (
        <View style={styles.npGrelha}>
          {coluna}
          {/* A fila rola sozinha; a capa fica onde está. */}
          <View style={styles.npFila}>
            {abaDaFila === 'fila' ? <>
            <CabecaDaFila fila={fila} abas={{ aba: abaDaFila, aoMudar: setAbaDaFila }} />
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: ESP.xl }}
              scrollEventThrottle={100} onScroll={fila.aoRolar}>
              {/* A que toca, à cabeça e em destaque (30/10, da maquete). */}
              <View style={styles.npAtual} accessibilityLabel={`Now playing: ${tituloDaFaixa(track)}`}>
                <View {...marcar('eq')} aria-hidden style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12, width: 14 }}>
                  <View style={{ width: 3, height: 12, borderRadius: 2, backgroundColor: COR.texto }} /><View style={{ width: 3, height: 12, borderRadius: 2, backgroundColor: COR.texto }} /><View style={{ width: 3, height: 12, borderRadius: 2, backgroundColor: COR.texto }} />
                </View>
                <Artwork track={track} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ ...TIPO.corpo, color: COR.texto, fontWeight: '700' as any }}>{tituloDaFaixa(track)}</Text>
                  <Text numberOfLines={1} style={{ ...TIPO.legenda, color: COR.textoMedio }}>{displayArtist(track)} · playing now</Text>
                </View>
              </View>
              {linhas}
            </ScrollView>
            </> : <>
              <View style={[styles.npFilaCabeca, { alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: COR.linhaSuave, marginBottom: ESP.sm }]}>
                <AbasDoCartao fila={fila} aba={abaDaFila} aoMudar={setAbaDaFila} />
                <View style={{ flex: 1 }} />
                {/* "Expand" (31/10): a letra a toda a largura. */}
                {abaDaFila === 'letra' ? <Pressable accessibilityRole="button" accessibilityLabel="Expand the lyrics" onPress={() => setLetraGrande(true)}
                  style={({ hovered }: any) => [styles.npFilaLimpar, { flexDirection: 'row', alignItems: 'center', gap: ESP.xs }, hovered && { backgroundColor: ESTADO.hover }]}>
                  <Ionicons name="expand-outline" size={14} color={COR.textoMedio} />
                  <Text style={styles.npFilaLimparTexto}>Expand</Text>
                </Pressable> : null}
              </View>
              {abaDaFila === 'letra'
                ? <View style={{ flex: 1, minHeight: 0 }}><LyricsView key={`${track.source}:${track.sourceId}`} track={track} visible /></View>
                : <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: ESP.xl }}><SobreAMusica track={track} more={more} notify={notify} /></ScrollView>}
            </>}
          </View>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.npEstreito}
          scrollEventThrottle={100} onScroll={fila.aoRolar}>
          {coluna}
          <View style={{ marginTop: ESP.xxl }}>
            {cabecaDaFila}
            {linhas}
          </View>
          {/* Na janela estreita não há cartão com abas: o About vem por baixo da fila (31/10). */}
          <View style={{ marginTop: ESP.xxl }}>
            <Text style={styles.npFilaHeading}>About</Text>
            <SobreAMusica track={track} more={more} notify={notify} />
          </View>
        </ScrollView>
      )}
      <Dialog open={eqAberto} title="Equaliser" onClose={() => setEqAberto(false)} width={560} semVeu>
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
