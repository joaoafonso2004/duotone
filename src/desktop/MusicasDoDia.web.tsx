import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  EscolhaDoDiaJaFeita, escolherDoDia, lerEscolhasDoDia, lerHistoricoDasEscolhas,
  subscreverEscolhasDoDia, type DiaDeEscolhas, type EscolhaDoDia,
} from '../api/escolhaDoDia';
import { FriendAvatar } from '../components/FriendAvatar';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { rotuloDoDia } from '../lib/escolhasDoDia';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import type { Track } from '../types';
import { Artwork, Button, Empty, Loading } from './ui.web';
import { COR, ESP, LINHA_LISTA, RAIO, TIPO } from './tokens.web';

const P = Pressable as any;

/**
 * As Músicas do dia no PC.
 *
 * No telemóvel escolhe-se no menu do leitor, sobre o que está a tocar. Aqui
 * esse gesto vive na própria vista: um cartão com a música que está a tocar e
 * um botão, enquanto ainda não houver escolha hoje. Continua a ser sobre o que
 * se está a OUVIR -- não há procura nem lista para escolher outra coisa.
 *
 * Hoje primeiro; os dias anteriores da semana por baixo, só os que têm alguma.
 */
export function MusicasDoDia({ play, notify }: {
  play: (track: Track, fila: Track[]) => void;
  notify: (mensagem: string) => void;
}) {
  const atual = usePlayer((s) => s.current);
  const tema = useTheme((s) => s.theme);
  const [escolhas, setEscolhas] = React.useState<EscolhaDoDia[]>([]);
  const [historico, setHistorico] = React.useState<DiaDeEscolhas[]>([]);
  const [aCarregar, setACarregar] = React.useState(true);
  const [aEscolher, setAEscolher] = React.useState(false);

  const carregar = React.useCallback(() => {
    void lerEscolhasDoDia().then(setEscolhas).finally(() => setACarregar(false));
  }, []);

  React.useEffect(() => {
    carregar();
    void lerHistoricoDasEscolhas().then(setHistorico);
    return subscreverEscolhasDoDia(carregar);
  }, [carregar]);

  const minha = escolhas.some((e) => e.souEu);
  const escolher = async () => {
    if (!atual || aEscolher) return;
    setAEscolher(true);
    try {
      await escolherDoDia(atual);
      notify('Today’s pick is set.');
    } catch (e) {
      if (e instanceof EscolhaDoDiaJaFeita) {
        notify('Your song for today is already set.');
        carregar();
      } else {
        notify('Could not pick. Please try again in a moment.');
      }
    } finally {
      setAEscolher(false);
    }
  };

  return <View>
    <View style={styles.cabecalho}>
      <Text style={styles.titulo}>Songs of the day</Text>
      <Text style={styles.subtitulo}>
        {minha
          ? 'Your pick is set for today. See what your friends chose.'
          : 'One song each, from what you are listening to. One choice, until tomorrow.'}
      </Text>
    </View>

    {!aCarregar && !minha && atual ? (
      <View style={styles.escolher}>
        <Artwork track={atual} size={48} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.micro}>Now playing</Text>
          <Text numberOfLines={1} style={styles.faixa}>{tituloDaFaixa(atual)}</Text>
          <Text numberOfLines={1} style={styles.meta}>{displayArtist(atual)}</Text>
        </View>
        <Button icon="today-outline" disabled={aEscolher} onPress={() => void escolher()}>
          {aEscolher ? 'Picking…' : 'Make it today’s pick'}
        </Button>
      </View>
    ) : null}

    {aCarregar ? <View style={{ height: 200 }}><Loading /></View>
      : escolhas.length ? <Lista escolhas={escolhas} play={play} cor={tema.color} />
      : <Empty icon="today-outline" title="No picks yet today"
          body={atual ? 'Be the first: make the song that is playing today’s pick.' : 'Play a song, then come back here to make it today’s pick.'} />}

    {!aCarregar && historico.length ? <View style={styles.historico}>
      <Text style={styles.seccao}>Earlier this week</Text>
      {historico.map(({ dia, escolhas: doDia }) => <View key={dia} style={{ gap: ESP.sm }}>
        <Text style={styles.micro}>{rotuloDoDia(dia, Date.now())}</Text>
        <Lista escolhas={doDia} play={play} cor={tema.color} />
      </View>)}
    </View> : null}
  </View>;
}

function Lista({ escolhas, play, cor }: {
  escolhas: EscolhaDoDia[]; play: (track: Track, fila: Track[]) => void; cor: string;
}) {
  const fila = escolhas.map((e) => e.track);
  return <View style={styles.lista}>
    {escolhas.map((e) => <P key={e.userId} onPress={() => play(e.track, fila)}
      accessibilityRole="button"
      accessibilityLabel={`${e.souEu ? 'Your pick' : `${e.nome || e.username}'s pick`}: ${tituloDaFaixa(e.track)}`}
      style={({ hovered }: any) => [styles.linha, hovered && styles.linhaHover]}>
      <Artwork track={e.track} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.pessoa}>
          <FriendAvatar avatarUrl={e.avatar} name={e.nome || e.username || '?'} size={18} />
          <Text numberOfLines={1} style={styles.nome}>{e.souEu ? 'You' : e.nome || e.username}</Text>
        </View>
        <Text numberOfLines={1} style={styles.faixa}>{tituloDaFaixa(e.track)}</Text>
        <Text numberOfLines={1} style={styles.meta}>{e.nota || displayArtist(e.track)}</Text>
      </View>
      <Ionicons name="play-circle" size={26} color={cor} />
    </P>)}
  </View>;
}

const styles = StyleSheet.create({
  cabecalho: { marginBottom: ESP.xl, gap: ESP.xs },
  titulo: { ...TIPO.titulo, color: COR.texto },
  subtitulo: { ...TIPO.corpo, color: COR.textoMedio, maxWidth: 520 },
  escolher: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.md, padding: ESP.md, marginBottom: ESP.xl,
    borderRadius: RAIO.superficie, backgroundColor: COR.elevado, borderWidth: 1, borderColor: COR.linha,
  },
  micro: { ...TIPO.micro, color: COR.textoFraco },
  lista: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: COR.linhaSuave },
  linha: {
    minHeight: LINHA_LISTA + 12, flexDirection: 'row', alignItems: 'center', gap: ESP.md,
    paddingVertical: ESP.sm, paddingHorizontal: ESP.sm, borderRadius: RAIO.cartao,
  },
  linhaHover: { backgroundColor: COR.linhaSuave },
  pessoa: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  nome: { ...TIPO.micro, flex: 1, color: COR.textoMedio },
  faixa: { ...TIPO.corpo, color: COR.texto, fontWeight: '600' as any },
  meta: { ...TIPO.legenda, color: COR.textoMedio, marginTop: 2 },
  historico: { marginTop: ESP.xxl, gap: ESP.lg },
  seccao: { ...TIPO.seccao, color: COR.texto },
});
