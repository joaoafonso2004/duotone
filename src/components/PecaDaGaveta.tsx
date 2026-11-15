import React, { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Toque } from './Toque';
import { ESCALA } from '../lib/movimento';
import { usePlayer } from '../state/player';
import { useOutroAparelho } from '../state/outroAparelho';
import { useSocial } from '../state/social';
import { definirPrivacidade, garantirPrivacidade, usePrivacidade } from '../state/privacidade';
import { comecarRadioDaMusica } from '../state/radioDaFaixa';
import { abrirFolhaDoAmigo } from '../state/folhaDoAmigo';
import { continuarAqui } from '../lib/sessionSync';
import { deviceLabel } from '../lib/handoff';
import { destinoDoRecente } from '../lib/destinos';
import { rotuloDoTemporizador } from '../lib/aparencia';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { avisarInfo } from '../lib/avisoDeRemocao';
import { hapticSelection } from '../lib/haptics';
import {
  proximaVelocidade, proximoTemporizador, resumoDaCena, rotuloDaVelocidade, TAMANHOS,
  type Atalho, type Cena, type IconeDaCena, type Peca,
} from '../lib/gaveta';
import { alternarCena, useCenas } from '../state/cenas';
import { avisarFeito } from '../lib/avisoDeRemocao';
import type { Destino } from '../lib/destinos';
import { colors, radii } from '../theme';

/** O que a gaveta dá a cada peça. */
export type ContextoDaPeca = {
  largura: number;
  altura: number;
  editar: boolean;
  escolhida: boolean;
  /** Fecha a gaveta e vai lá. */
  irPara: (d: Destino) => void;
  /** Fecha a gaveta e abre o leitor. */
  abrirLeitor: () => void;
  /** Fecha a gaveta (para o que abre por cima dela, como a folha de um amigo). */
  fechar: () => void;
  aoEscolher: (id: string) => void;
  aoTirar: (id: string) => void;
  aoRedimensionar: (id: string) => void;
  /** O toque longo fora da edição: entra nela. */
  aoSegurar: () => void;
  /** O ✎ de uma cena, a editar: abre o editor com ela. */
  aoEditarCena: (pecaId: string, cena: Cena) => void;
};

type Props = ContextoDaPeca & { peca: Peca };

/** O fundo das peças e o aço das que estão ligadas (a maquete de 15/11). */
const FUNDO = 'rgba(21,21,26,0.78)';
const LIGADA = '#E9EAEE';
const TINTA_LIGADA = '#060608';

/**
 * Uma peça da gaveta: a moldura comum (o toque, o toque longo que entra na
 * edição, e a editar o × e o ⤢) e o conteúdo do tipo dela. Cada tipo é um
 * atalho para o que a app já faz -- ver `lib/gaveta.ts`.
 */
export const PecaDaGaveta = memo(function PecaDaGaveta(p: Props) {
  const { peca } = p;
  switch (peca.tipo) {
    case 'agora': return <PecaAgora {...p} />;
    case 'pc': return <PecaPc {...p} />;
    case 'origem': return <PecaOrigem {...p} peca={peca} />;
    case 'amigo': return <PecaAmigo {...p} peca={peca} />;
    case 'atalho': return <PecaAtalho {...p} peca={peca} />;
    case 'cena': return <PecaCena {...p} peca={peca} />;
    case 'controlo':
      switch (peca.controlo) {
        case 'temporizador': return <PecaTemporizador {...p} />;
        case 'privado': return <PecaPrivado {...p} />;
        case 'velocidade': return <PecaVelocidade {...p} />;
        case 'shuffle': return <PecaShuffle {...p} />;
        case 'radio': return <PecaRadio {...p} />;
      }
  }
  return null;
});

function Moldura({ peca, rotulo, ligada = false, aoTocar, aoEditar, children, ...c }: Props & {
  rotulo: string; ligada?: boolean; aoTocar: () => void; children: React.ReactNode;
  /** Um ✎ no canto de cima, a editar (as cenas). */
  aoEditar?: () => void;
}) {
  const podeMudar = TAMANHOS[peca.tipo].length > 1;
  return (
    <View style={{ width: c.largura, height: c.altura }}>
      <Toque
        escala={ESCALA.cartao}
        raio={18}
        onPress={() => {
          if (c.editar) { hapticSelection(); c.aoEscolher(peca.id); return; }
          aoTocar();
        }}
        onLongPress={c.editar ? undefined : () => { hapticSelection(); c.aoSegurar(); }}
        delayLongPress={380}
        accessibilityRole="button"
        accessibilityLabel={c.editar ? `Move ${rotulo}` : rotulo}
        accessibilityState={{ selected: c.escolhida }}
        style={[
          styles.peca,
          ligada && styles.ligada,
          c.editar && styles.aEditar,
          c.escolhida && styles.escolhida,
        ]}
      >
        {children}
      </Toque>
      {c.editar ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${rotulo}`} hitSlop={8}
            onPress={() => { hapticSelection(); c.aoTirar(peca.id); }} style={[styles.botaoDaEdicao, styles.tirar]}>
            <Ionicons name="close" size={15} color={TINTA_LIGADA} />
          </Pressable>
          {aoEditar ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${rotulo}`} hitSlop={8}
              onPress={() => { hapticSelection(); aoEditar(); }} style={[styles.botaoDaEdicao, styles.editarCena]}>
              <Ionicons name="pencil" size={13} color={colors.text} />
            </Pressable>
          ) : null}
          {podeMudar ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Resize ${rotulo}`} hitSlop={8}
              onPress={() => { hapticSelection(); c.aoRedimensionar(peca.id); }} style={[styles.botaoDaEdicao, styles.tamanho]}>
              <Ionicons name="resize" size={14} color={colors.text} />
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** Ícone, nome e o estado por baixo: o desenho dos controlos e dos atalhos. */
function Rotulos({ icone, nome, sub, ligada, largo }: {
  icone: React.ComponentProps<typeof Ionicons>['name']; nome: string; sub?: string; ligada?: boolean; largo: boolean;
}) {
  const tinta = ligada ? TINTA_LIGADA : colors.text;
  if (!largo) {
    return (
      <View style={styles.pequena}>
        <Ionicons name={icone} size={20} color={tinta} />
        <Text numberOfLines={1} style={[styles.nomePequeno, { color: tinta }]}>{sub && ligada ? sub : nome}</Text>
      </View>
    );
  }
  return (
    <View style={styles.larga}>
      <Ionicons name={icone} size={21} color={tinta} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.nome, { color: tinta }]}>{nome}</Text>
        {sub ? <Text numberOfLines={1} style={[styles.sub, ligada && { color: 'rgba(6,6,8,0.64)' }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const larga = (p: Props) => p.peca.tamanho !== '1x1';

// ---------------------------------------------------------------------------
// O que está a tocar e o PC
// ---------------------------------------------------------------------------

function PecaAgora(p: Props) {
  const current = usePlayer((s) => s.current);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const grande = p.peca.tamanho === '4x2';
  if (!current) {
    return (
      <Moldura {...p} rotulo="Now playing" aoTocar={() => avisarInfo('Nothing is playing', 'Play a song and it shows up here.')}>
        <View style={styles.larga}>
          <Ionicons name="musical-notes-outline" size={21} color={colors.textSecondary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={styles.nome}>Nothing playing</Text>
            <Text numberOfLines={2} style={styles.sub}>Play a song and it shows up here</Text>
          </View>
        </View>
      </Moldura>
    );
  }
  const titulo = tituloDaFaixa(current);
  const artista = displayArtist(current);
  const lado = p.altura - 20;
  const botao = (
    <Pressable accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Play'} hitSlop={10}
      onPress={() => { hapticSelection(); void togglePlay(); }} style={styles.play}>
      <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color={TINTA_LIGADA} style={isPlaying ? undefined : { marginLeft: 2 }} />
    </Pressable>
  );
  return (
    <Moldura {...p} rotulo={`Now playing: ${titulo}`} aoTocar={p.abrirLeitor}>
      {grande ? (
        <View style={[styles.agora, { padding: 10 }]}>
          <Image source={current.artworkUrl ? { uri: current.artworkUrl } : null} style={[styles.capaDoAgora, { width: lado, height: lado }]} contentFit="cover" transition={200} />
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', gap: 2 }}>
            <Text style={styles.micro}>NOW PLAYING</Text>
            <Text numberOfLines={2} style={[styles.nome, { fontSize: 15 }]}>{titulo}</Text>
            <Text numberOfLines={1} style={styles.sub}>{artista}</Text>
          </View>
          <View style={{ alignSelf: 'flex-end' }}>{botao}</View>
        </View>
      ) : (
        <View style={StyleSheet.absoluteFill}>
          <Image source={current.artworkUrl ? { uri: current.artworkUrl } : null} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          <LinearGradient colors={['rgba(6,6,8,0)', 'rgba(6,6,8,0.82)']} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
          <View style={styles.rodape}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.nome}>{titulo}</Text>
              <Text numberOfLines={1} style={styles.sub}>{artista}</Text>
            </View>
            {botao}
          </View>
        </View>
      )}
    </Moldura>
  );
}

function PecaPc(p: Props) {
  const oferta = useOutroAparelho((s) => s.oferta);
  const doPc = oferta?.deviceKind === 'desktop' ? oferta : null;
  const nome = doPc ? deviceLabel(doPc) : 'Your PC';
  const sub = doPc
    ? `${tituloDaFaixa(doPc.track)} · ${doPc.isPlaying ? 'Continue here' : 'Paused'}`
    : 'Nothing playing there';
  return (
    <Moldura {...p} rotulo={nome}
      aoTocar={() => {
        if (!doPc) { avisarInfo('Nothing is playing on your PC'); return; }
        hapticSelection();
        p.fechar();
        void continuarAqui();
      }}>
      <Rotulos icone="desktop-outline" nome={nome} sub={sub} largo={larga(p)} />
    </Moldura>
  );
}

// ---------------------------------------------------------------------------
// Música e amigos
// ---------------------------------------------------------------------------

const NOME_DA_ORIGEM: Record<string, string> = {
  playlist: 'Playlist', guardadas: 'Liked Songs', artista: 'Artist', album: 'Album', mistura: 'Mix', prateleira: 'Mix',
};

function PecaOrigem(p: Props & { peca: Extract<Peca, { tipo: 'origem' }> }) {
  const { origem } = p.peca;
  const capa = origem.capas[0] ?? null;
  const tipo = NOME_DA_ORIGEM[origem.tipo] ?? '';
  const artista = origem.tipo === 'artista';
  const ir = () => {
    const d = destinoDoRecente(origem);
    if (d) { hapticSelection(); p.irPara(d); }
  };
  const semCapa = (
    <View style={[StyleSheet.absoluteFill, styles.semCapa, origem.tipo === 'guardadas' && { backgroundColor: '#2B2D3A' }]}>
      <Ionicons name={origem.tipo === 'guardadas' ? 'heart' : artista ? 'person' : 'musical-notes'} size={p.peca.tamanho === '1x1' ? 20 : 30} color={colors.textSecondary} />
    </View>
  );
  if (artista && p.peca.tamanho !== '2x1') {
    const lado = p.peca.tamanho === '1x1' ? p.altura - 26 : Math.min(p.largura, p.altura) * 0.56;
    return (
      <Moldura {...p} rotulo={origem.nome} aoTocar={ir}>
        <View style={styles.artista}>
          <View style={{ width: lado, height: lado, borderRadius: lado / 2, overflow: 'hidden', backgroundColor: '#2B2D33' }}>
            {capa ? <Image source={{ uri: capa }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : semCapa}
          </View>
          <Text numberOfLines={1} style={[styles.nome, p.peca.tamanho === '1x1' && styles.nomePequeno]}>{origem.nome}</Text>
          {p.peca.tamanho === '2x2' ? <Text numberOfLines={1} style={styles.sub}>{tipo}</Text> : null}
        </View>
      </Moldura>
    );
  }
  if (p.peca.tamanho === '2x1') {
    const lado = p.altura - 16;
    return (
      <Moldura {...p} rotulo={origem.nome} aoTocar={ir}>
        <View style={[styles.larga, { paddingLeft: 8 }]}>
          <View style={{ width: lado, height: lado, borderRadius: artista ? lado / 2 : 8, overflow: 'hidden', backgroundColor: '#2B2D33' }}>
            {capa ? <Image source={{ uri: capa }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : semCapa}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={styles.nome}>{origem.nome}</Text>
            <Text numberOfLines={1} style={styles.sub}>{tipo}</Text>
          </View>
        </View>
      </Moldura>
    );
  }
  return (
    <Moldura {...p} rotulo={origem.nome} aoTocar={ir}>
      <View style={StyleSheet.absoluteFill}>
        {capa ? <Image source={{ uri: capa }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : semCapa}
        <LinearGradient colors={['rgba(6,6,8,0)', 'rgba(6,6,8,0.78)']} locations={[0.4, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.rodape}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.nome, p.peca.tamanho === '1x1' && styles.nomePequeno]}>{origem.nome}</Text>
            {p.peca.tamanho === '2x2' ? <Text numberOfLines={1} style={styles.sub}>{tipo}</Text> : null}
          </View>
        </View>
      </View>
    </Moldura>
  );
}

function PecaAmigo(p: Props & { peca: Extract<Peca, { tipo: 'amigo' }> }) {
  const amigo = useSocial((s) => s.friends.find((f) => f.friendId === p.peca.amigoId) ?? null);
  const nome = amigo?.name || amigo?.username || p.peca.nome;
  const avatar = amigo?.avatarUrl ?? p.peca.avatar;
  const faixa = amigo?.musicActivity?.track ?? null;
  const ouvir = !!amigo?.musicActivity?.listening;
  const sub = faixa ? `${tituloDaFaixa(faixa)} · ${displayArtist(faixa)}` : amigo?.online ? 'Online' : 'Not listening';
  const grande = p.peca.tamanho === '2x2';
  const lado = grande ? 52 : 34;
  const cara = (
    <View style={{ width: lado, height: lado }}>
      <View style={[styles.cara, { width: lado, height: lado, borderRadius: lado / 2 }]}>
        {avatar ? <Image source={{ uri: avatar }} style={StyleSheet.absoluteFill} contentFit="cover" />
          : <Text style={[styles.nome, { fontSize: grande ? 20 : 14 }]}>{nome.charAt(0).toUpperCase()}</Text>}
      </View>
      {ouvir || amigo?.online ? <View style={[styles.ponto, grande && { width: 12, height: 12, borderRadius: 6 }]} /> : null}
    </View>
  );
  return (
    <Moldura {...p} rotulo={nome} aoTocar={() => { hapticSelection(); p.fechar(); abrirFolhaDoAmigo(p.peca.amigoId); }}>
      {grande ? (
        <View style={styles.artista}>
          {cara}
          <Text numberOfLines={1} style={styles.nome}>{nome}</Text>
          <Text numberOfLines={1} style={styles.sub}>{sub}</Text>
        </View>
      ) : (
        <View style={[styles.larga, { paddingLeft: 10 }]}>
          {cara}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={styles.nome}>{nome}</Text>
            <Text numberOfLines={1} style={styles.sub}>{sub}</Text>
          </View>
        </View>
      )}
    </Moldura>
  );
}

// ---------------------------------------------------------------------------
// Controlos
// ---------------------------------------------------------------------------

function PecaTemporizador(p: Props) {
  const restanteS = usePlayer((s) => s.sleepTimerTimeLeft);
  const noFim = usePlayer((s) => s.pararNoFimDaFaixa);
  const ligada = noFim || restanteS > 0;
  const sub = ligada ? (noFim ? 'End of song' : rotuloDoTemporizador(restanteS, false)) : 'Off';
  return (
    <Moldura {...p} rotulo={`Sleep timer, ${sub}`} ligada={ligada}
      aoTocar={() => {
        hapticSelection();
        const st = usePlayer.getState();
        const passo = proximoTemporizador(st.sleepTimerTimeLeft, st.pararNoFimDaFaixa);
        if ('minutos' in passo) st.setSleepTimer(passo.minutos);
        else if ('fimDaFaixa' in passo) st.setSleepTimerNoFimDaFaixa();
        else st.setSleepTimer(0);
      }}>
      <Rotulos icone={ligada ? 'moon' : 'moon-outline'} nome="Sleep" sub={sub} ligada={ligada} largo={larga(p)} />
    </Moldura>
  );
}

function PecaPrivado(p: Props) {
  const privada = usePrivacidade((s) => s.privada);
  useEffect(() => { void garantirPrivacidade(); }, []);
  return (
    <Moldura {...p} rotulo={`Private listening, ${privada ? 'on' : 'off'}`} ligada={privada}
      aoTocar={() => { hapticSelection(); void definirPrivacidade(!usePrivacidade.getState().privada); }}>
      <Rotulos icone="eye-off-outline" nome="Private" sub={privada ? 'On' : 'Off'} ligada={privada} largo={larga(p)} />
    </Moldura>
  );
}

function PecaVelocidade(p: Props) {
  const rate = usePlayer((s) => s.playbackRate);
  const ligada = Math.abs(rate - 1) > 0.005;
  const sub = rotuloDaVelocidade(rate);
  return (
    <Moldura {...p} rotulo={`Speed, ${sub}`} ligada={ligada}
      aoTocar={() => {
        hapticSelection();
        const st = usePlayer.getState();
        st.setPlaybackRate(proximaVelocidade(st.playbackRate));
      }}>
      <Rotulos icone="speedometer-outline" nome="Speed" sub={sub} ligada={ligada} largo={larga(p)} />
    </Moldura>
  );
}

function PecaShuffle(p: Props) {
  const shuffle = usePlayer((s) => s.shuffle);
  const inteligente = usePlayer((s) => s.shuffleInteligente);
  const sub = !shuffle ? 'Off' : inteligente ? 'Smart' : 'On';
  return (
    <Moldura {...p} rotulo={`Shuffle, ${sub}`} ligada={shuffle}
      aoTocar={() => { hapticSelection(); usePlayer.getState().toggleShuffle(); }}>
      <Rotulos icone="shuffle" nome="Shuffle" sub={sub} ligada={shuffle} largo={larga(p)} />
    </Moldura>
  );
}

function PecaRadio(p: Props) {
  const modo = usePlayer((s) => s.radioMode);
  const ligada = modo !== 'off';
  const sub = modo === 'on' ? 'On' : modo === 'preparing' ? 'Starting…' : 'Songs like this one';
  return (
    <Moldura {...p} rotulo={`Radio, ${ligada ? 'on' : 'off'}`} ligada={ligada}
      aoTocar={() => {
        hapticSelection();
        const st = usePlayer.getState();
        if (st.radioMode !== 'off') { st.stopRadio(); return; }
        if (!st.current) { avisarInfo('Play a song first', 'The radio starts from what is playing.'); return; }
        void comecarRadioDaMusica(st.current);
      }}>
      <Rotulos icone="radio-outline" nome="Radio" sub={sub} ligada={ligada} largo={larga(p)} />
    </Moldura>
  );
}

// ---------------------------------------------------------------------------
// Atalhos
// ---------------------------------------------------------------------------

export const ATALHO: Record<Atalho, { nome: string; icone: React.ComponentProps<typeof Ionicons>['name']; destino: Destino }> = {
  downloads: { nome: 'Downloads', icone: 'download-outline', destino: { tipo: 'downloads' } },
  'library-check': { nome: 'Library check', icone: 'checkmark-done-outline', destino: { tipo: 'library-check' } },
  estatisticas: { nome: 'Your stats', icone: 'stats-chart-outline', destino: { tipo: 'estatisticas' } },
  definicoes: { nome: 'Settings', icone: 'settings-outline', destino: { tipo: 'definicoes' } },
  importar: { nome: 'Import playlists', icone: 'cloud-download-outline', destino: { tipo: 'importar' } },
};

function PecaAtalho(p: Props & { peca: Extract<Peca, { tipo: 'atalho' }> }) {
  const a = ATALHO[p.peca.atalho];
  return (
    <Moldura {...p} rotulo={a.nome} aoTocar={() => { hapticSelection(); p.irPara(a.destino); }}>
      <Rotulos icone={a.icone} nome={a.nome} largo={larga(p)} />
    </Moldura>
  );
}

// ---------------------------------------------------------------------------
// Cenas
// ---------------------------------------------------------------------------

export const ICONE_DA_CENA: Record<IconeDaCena, React.ComponentProps<typeof Ionicons>['name']> = {
  lua: 'moon-outline', faisca: 'sparkles-outline', carro: 'car-outline', velocimetro: 'speedometer-outline', onda: 'pulse-outline',
};

function PecaCena(p: Props & { peca: Extract<Peca, { tipo: 'cena' }> }) {
  const { cena } = p.peca;
  const ligada = useCenas((s) => s.ligada === cena.id);
  const resumo = resumoDaCena(cena.definicoes).join(' · ');
  return (
    <Moldura {...p} rotulo={cena.nome} ligada={ligada}
      aoEditar={() => p.aoEditarCena(p.peca.id, cena)}
      aoTocar={() => {
        hapticSelection();
        void alternarCena(cena).then((ligou) => {
          if (ligou) avisarFeito(`${cena.nome} is on`, resumo || undefined);
          else avisarInfo(`${cena.nome} is off`, 'Everything is back as it was.');
        });
      }}>
      <Rotulos icone={ICONE_DA_CENA[cena.icone]} nome={cena.nome} sub={resumo || 'Nothing to change yet'} ligada={ligada} largo={larga(p)} />
    </Moldura>
  );
}

const styles = StyleSheet.create({
  peca: {
    flex: 1,
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: FUNDO,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(233,234,238,0.1)',
  },
  ligada: { backgroundColor: LIGADA, borderColor: LIGADA },
  aEditar: { transform: [{ scale: 0.965 }], borderColor: 'rgba(201,205,214,0.45)', borderWidth: 1 },
  escolhida: { transform: [{ scale: 1.035 }], borderColor: LIGADA, borderWidth: 2, zIndex: 3 },
  pequena: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4 },
  larga: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  nome: { color: colors.text, fontSize: 13, fontWeight: '700' },
  nomePequeno: { fontSize: 11, fontWeight: '600' },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  micro: { color: colors.textTertiary, fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },
  agora: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  capaDoAgora: { borderRadius: radii.sm, backgroundColor: '#2B2D33' },
  rodape: { position: 'absolute', left: 10, right: 10, bottom: 9, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  play: { width: 36, height: 36, borderRadius: 18, backgroundColor: LIGADA, alignItems: 'center', justifyContent: 'center' },
  semCapa: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#22232A' },
  artista: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6 },
  cara: { overflow: 'hidden', backgroundColor: '#34303A', alignItems: 'center', justifyContent: 'center' },
  ponto: {
    position: 'absolute', right: 0, bottom: 0, width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.online, borderWidth: 2, borderColor: FUNDO,
  },
  botaoDaEdicao: {
    position: 'absolute', width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  tirar: { top: -4, left: -4, backgroundColor: LIGADA },
  editarCena: { top: -4, right: -4, backgroundColor: '#2B2D33', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,234,238,0.2)' },
  tamanho: { bottom: -4, right: -4, backgroundColor: '#2B2D33', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,234,238,0.2)' },
});
